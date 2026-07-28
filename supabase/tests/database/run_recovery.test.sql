begin;

create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000021',
    'authenticated', 'authenticated', 'recovery-admin@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000022',
    'authenticated', 'authenticated', 'recovery-editor@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organization_members (organization_id, user_id, role)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000021',
    'administrator'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000022',
    'viewer'
  );
insert into public.brand_members (brand_id, user_id, role)
values (
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000022',
  'editor'
);

create temporary table recovery_test_payloads (
  name text primary key,
  payload jsonb not null
);
create temporary table recovery_claims (
  recovery_id uuid,
  generation_run_id uuid,
  execution_id text,
  stop_before_retry boolean,
  attempt_count integer
);
grant select, insert, update, delete, truncate
  on recovery_test_payloads, recovery_claims to service_role, authenticated;
insert into recovery_test_payloads (name, payload)
values (
  'registration',
  jsonb_build_object(
    'actorId', '40000000-0000-4000-8000-000000000021',
    'brandId', '20000000-0000-4000-8000-000000000001',
    'correlationId', '83000000-0000-4000-8000-000000000021',
    'idempotencyKey', 'recovery-database-request-0001',
    'requestDigest', repeat('a', 64),
    'requestPayload', jsonb_build_object(
      'opportunityId', '82000000-0000-4000-8000-000000000021'
    ),
    'target', 'research',
    'workflowExecutionId', 'recovery-execution-initial-21',
    'workflowName', 'WF-05 Research'
  )
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (public.register_workflow_execution(
    (select payload from recovery_test_payloads where name = 'registration')
  ) ->> 'duplicate')::boolean,
  false,
  'first execution registration creates a recovery context'
);
select is(
  (public.register_workflow_execution(
    (select payload from recovery_test_payloads where name = 'registration')
  ) ->> 'duplicate')::boolean,
  true,
  'identical execution registration is idempotent'
);
select is(
  (
    select count(*)
    from public.run_recoveries
    where initial_execution_id = 'recovery-execution-initial-21'
  ),
  1::bigint,
  'idempotent registration creates one recovery record'
);
select is(
  (
    select count(*)
    from public.pipeline_events
    where event_type = 'recovery.registered'
      and correlation_id = '83000000-0000-4000-8000-000000000021'
  ),
  1::bigint,
  'idempotent registration creates one registration event'
);
select throws_ok(
  $$
    select public.register_workflow_execution(
      jsonb_set(
        (select payload from recovery_test_payloads where name = 'registration'),
        '{requestDigest}',
        to_jsonb(repeat('b', 64))
      )
    )
  $$,
  '23505',
  'Workflow execution was reused with a different request',
  'an execution ID cannot be replayed with a different body digest'
);

select is(
  public.record_workflow_failure(jsonb_build_object(
    'workflowExecutionId', 'recovery-execution-initial-21',
    'retryOfExecutionId', '',
    'category', 'provider',
    'errorCode', 'provider_timeout',
    'retryable', true
  )) ->> 'status',
  'scheduled',
  'retryable provider failure is scheduled'
);
select ok(
  (
    select next_retry_at >= now() + interval '55 seconds'
      and next_retry_at <= now() + interval '65 seconds'
    from public.run_recoveries
    where initial_execution_id = 'recovery-execution-initial-21'
  ),
  'first retry uses deterministic one-minute backoff'
);

update public.run_recoveries
set next_retry_at = now() + interval '1 day'
where initial_execution_id <> 'recovery-execution-initial-21'
  and status = 'scheduled';
update public.run_recoveries
set next_retry_at = now()
where initial_execution_id = 'recovery-execution-initial-21';
insert into recovery_claims select * from public.claim_due_recoveries(1);
select results_eq(
  $$ select attempt_count from recovery_claims $$,
  array[1],
  'claiming atomically reserves retry attempt one'
);
select is(
  (
    select attempt
    from public.generation_runs
    where id = (select generation_run_id from recovery_claims)
  ),
  2,
  'retry attempt receives a distinct generation run'
);
select is(
  public.mark_recovery_dispatched(jsonb_build_object(
    'recoveryId', (select recovery_id from recovery_claims),
    'generationRunId', (select generation_run_id from recovery_claims),
    'workflowExecutionId', 'recovery-execution-retry-21'
  )) ->> 'status',
  'retrying',
  'successful n8n dispatch links the new execution'
);
select is(
  public.record_workflow_failure(jsonb_build_object(
    'workflowExecutionId', 'recovery-execution-retry-21',
    'retryOfExecutionId', 'recovery-execution-initial-21',
    'category', 'provider',
    'errorCode', 'provider_timeout',
    'retryable', true
  )) ->> 'status',
  'scheduled',
  'a failed retry is rescheduled while under the cap'
);

truncate recovery_claims;
update public.run_recoveries
set next_retry_at = now()
where initial_execution_id = 'recovery-execution-initial-21';
insert into recovery_claims select * from public.claim_due_recoveries(1);
select is(
  public.fail_recovery_dispatch(jsonb_build_object(
    'recoveryId', (select recovery_id from recovery_claims),
    'generationRunId', (select generation_run_id from recovery_claims),
    'errorCode', 'n8n_retry_failed'
  )) ->> 'status',
  'scheduled',
  'dispatch failure backs off while an automatic attempt remains'
);

truncate recovery_claims;
update public.run_recoveries
set next_retry_at = now()
where initial_execution_id = 'recovery-execution-initial-21';
insert into recovery_claims select * from public.claim_due_recoveries(1);
select is(
  public.fail_recovery_dispatch(jsonb_build_object(
    'recoveryId', (select recovery_id from recovery_claims),
    'generationRunId', (select generation_run_id from recovery_claims),
    'errorCode', 'n8n_retry_failed'
  )) ->> 'status',
  'dead_letter',
  'automatic recovery moves to dead letter at the three-attempt cap'
);
select is(
  (
    select attempt_count
    from public.run_recoveries
    where initial_execution_id = 'recovery-execution-initial-21'
  ),
  3,
  'automatic retry count never exceeds the configured cap'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000022', true);
select is(
  (
    select count(*)
    from public.run_recoveries
    where initial_execution_id = 'recovery-execution-initial-21'
  ),
  0::bigint,
  'brand editors cannot inspect administrator-only recovery records'
);
select throws_ok(
  $$
    select public.request_run_recovery(jsonb_build_object(
      'generationRunId', (
        select id from public.generation_runs
        where workflow_execution_id = 'recovery-execution-initial-21'
      ),
      'actorId', '40000000-0000-4000-8000-000000000022',
      'reason', 'Editor attempts a manual recovery outside their authority.',
      'idempotencyKey', 'editor-manual-recovery-request-0001'
    ))
  $$,
  '42501',
  'Only an organization administrator can recover this run',
  'non-administrators cannot request manual recovery'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000021', true);
select is(
  (
    select count(*)
    from public.run_recoveries
    where initial_execution_id = 'recovery-execution-initial-21'
  ),
  1::bigint,
  'organization administrator can inspect recovery records'
);
select is(
  public.request_run_recovery(jsonb_build_object(
    'generationRunId', (
      select id from public.generation_runs
      where workflow_execution_id = 'recovery-execution-initial-21'
    ),
    'actorId', '40000000-0000-4000-8000-000000000021',
    'reason', 'Administrator authorizes one bounded retry after dead letter.',
    'idempotencyKey', 'admin-manual-recovery-request-0001'
  )) ->> 'status',
  'scheduled',
  'administrator can queue one audited manual recovery'
);
select ok(
  (
    select manual_requested and attempt_count = 0
    from public.run_recoveries
    where initial_execution_id = 'recovery-execution-initial-21'
  ),
  'manual recovery opens one bounded attempt without erasing generation-run history'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', '', true);
select set_config('request.jwt.claims', '{}', true);
select lives_ok(
  $$select count(*) from public.claim_due_recovery_replays(1)$$,
  'opaque service-role requests can claim recovery replays without legacy JWT claims'
);

select * from finish();
rollback;
