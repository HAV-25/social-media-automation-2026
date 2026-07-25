create type public.recovery_status as enum (
  'registered',
  'scheduled',
  'dispatching',
  'retrying',
  'completed',
  'recovered',
  'dead_letter',
  'cancelled'
);

create type public.recovery_target as enum (
  'research',
  'editorial_generation',
  'post_verification',
  'image_generation',
  'content_action'
);

create table public.run_recoveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  root_generation_run_id uuid not null references public.generation_runs(id) on delete cascade,
  active_generation_run_id uuid not null references public.generation_runs(id) on delete cascade,
  initial_execution_id text not null,
  active_execution_id text not null,
  workflow_name text not null,
  target public.recovery_target not null,
  status public.recovery_status not null default 'registered',
  category text check (
    category is null
    or category in ('transient', 'permanent', 'validation', 'security', 'budget', 'provider', 'unknown')
  ),
  error_code text check (
    error_code is null
    or error_code ~ '^[a-z0-9_.:-]{1,120}$'
  ),
  retryable boolean not null default false,
  attempt_count integer not null default 0 check (attempt_count between 0 and 3),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  next_retry_at timestamptz,
  lease_expires_at timestamptz,
  manual_requested boolean not null default false,
  manual_reason text check (
    manual_reason is null
    or char_length(manual_reason) between 10 and 1000
  ),
  requested_by uuid not null references auth.users(id) on delete restrict,
  last_attempt_at timestamptz,
  recovered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, initial_execution_id),
  unique (root_generation_run_id),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade
);

create index run_recoveries_brand_created_idx
  on public.run_recoveries (brand_id, created_at desc, id desc);
create index run_recoveries_due_idx
  on public.run_recoveries (next_retry_at, id)
  where status = 'scheduled';
create index run_recoveries_active_execution_idx
  on public.run_recoveries (active_execution_id)
  where status in ('dispatching', 'retrying');

create table private.workflow_execution_contexts (
  workflow_execution_id text primary key,
  recovery_id uuid not null references public.run_recoveries(id) on delete cascade,
  request_payload jsonb not null,
  request_digest text not null check (request_digest ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  check (octet_length(request_payload::text) <= 65536)
);
create index workflow_execution_contexts_recovery_idx
  on private.workflow_execution_contexts (recovery_id);

alter table public.run_recoveries enable row level security;
alter table private.workflow_execution_contexts enable row level security;

create policy run_recoveries_select
on public.run_recoveries
for select
to authenticated
using ((select public.can_manage_organization(organization_id)));

grant select on public.run_recoveries to authenticated;
grant select, insert, update, delete on public.run_recoveries to service_role;
revoke all on private.workflow_execution_contexts from public, anon, authenticated;
grant select, insert, update, delete on private.workflow_execution_contexts to service_role;

create trigger run_recoveries_set_updated_at
before update on public.run_recoveries
for each row execute function public.set_updated_at();

create or replace function private.run_type_for_recovery(target public.recovery_target)
returns text
language sql
immutable
set search_path = ''
as $$
  select case target
    when 'research' then 'research'
    when 'editorial_generation' then 'editorial_generation'
    when 'post_verification' then 'post_verification'
    when 'image_generation' then 'image_generation'
    when 'content_action' then 'content_action'
  end;
$$;

create or replace function private.entity_type_for_recovery(target public.recovery_target)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when target in ('research', 'editorial_generation') then 'opportunity'
    else 'post_draft'
  end;
$$;

create or replace function private.retry_delay(attempt_count integer)
returns interval
language sql
immutable
set search_path = ''
as $$
  select make_interval(secs => least(900, 60 * power(2, greatest(0, attempt_count))::integer));
$$;

create or replace function private.register_workflow_execution(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_brand_id uuid := (payload ->> 'brandId')::uuid;
  target_actor_id uuid := (payload ->> 'actorId')::uuid;
  target_organization_id uuid;
  target_value public.recovery_target := (payload ->> 'target')::public.recovery_target;
  target_entity_id uuid;
  requested_execution_id text := payload ->> 'workflowExecutionId';
  requested_workflow_name text := payload ->> 'workflowName';
  requested_idempotency_key text := payload ->> 'idempotencyKey';
  requested_correlation_id uuid := (payload ->> 'correlationId')::uuid;
  request_digest_value text := payload ->> 'requestDigest';
  request_payload_value jsonb := payload -> 'requestPayload';
  run_record public.generation_runs%rowtype;
  recovery_record public.run_recoveries%rowtype;
  existing_context private.workflow_execution_contexts%rowtype;
  was_duplicate boolean := false;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Workflow recovery registration requires a service request';
  end if;
  if requested_execution_id is null
    or char_length(requested_execution_id) not between 1 and 200
    or requested_workflow_name !~ '^WF-0[5-9] [A-Za-z0-9 &-]{3,120}$'
    or requested_idempotency_key is null
    or char_length(requested_idempotency_key) not between 16 and 200
    or request_digest_value !~ '^[a-f0-9]{64}$'
    or request_payload_value is null
    or octet_length(request_payload_value::text) > 65536 then
    raise exception using errcode = '22023', message = 'Invalid workflow recovery registration';
  end if;

  select *
  into existing_context
  from private.workflow_execution_contexts
  where workflow_execution_id = requested_execution_id;
  if existing_context.workflow_execution_id is not null
    and existing_context.request_digest <> request_digest_value then
    raise exception using errcode = '23505', message = 'Workflow execution was reused with a different request';
  end if;

  select brand.organization_id
  into target_organization_id
  from public.brands brand
  where brand.id = target_brand_id
    and brand.status = 'active';
  if target_organization_id is null or not exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = target_actor_id
  ) then
    raise exception using errcode = '42501', message = 'Recovery actor is not assigned to the organization';
  end if;

  target_entity_id := case
    when target_value in ('research', 'editorial_generation')
      then (request_payload_value ->> 'opportunityId')::uuid
    else (request_payload_value ->> 'postDraftId')::uuid
  end;

  select recovery.*
  into recovery_record
  from public.run_recoveries recovery
  where recovery.active_execution_id = requested_execution_id
     or recovery.initial_execution_id = requested_execution_id
  order by recovery.created_at desc
  limit 1;

  if recovery_record.id is null then
    insert into public.generation_runs (
      organization_id,
      brand_id,
      run_type,
      entity_type,
      entity_id,
      workflow_name,
      workflow_execution_id,
      correlation_id,
      idempotency_key,
      attempt,
      status,
      started_at,
      model_usage
    )
    values (
      target_organization_id,
      target_brand_id,
      private.run_type_for_recovery(target_value),
      private.entity_type_for_recovery(target_value),
      target_entity_id,
      requested_workflow_name || ' orchestration',
      requested_execution_id,
      requested_correlation_id,
      'orchestration:' || requested_idempotency_key,
      1,
      'running',
      now(),
      '{}'::jsonb
    )
    on conflict (organization_id, workflow_name, idempotency_key, attempt)
    do update set workflow_execution_id = excluded.workflow_execution_id
    returning * into run_record;

    insert into public.run_recoveries (
      organization_id,
      brand_id,
      root_generation_run_id,
      active_generation_run_id,
      initial_execution_id,
      active_execution_id,
      workflow_name,
      target,
      requested_by
    )
    values (
      target_organization_id,
      target_brand_id,
      run_record.id,
      run_record.id,
      requested_execution_id,
      requested_execution_id,
      requested_workflow_name,
      target_value,
      target_actor_id
    )
    on conflict (root_generation_run_id)
    do update set active_execution_id = excluded.active_execution_id
    returning * into recovery_record;
  else
    was_duplicate := true;
    if recovery_record.organization_id <> target_organization_id
      or recovery_record.brand_id <> target_brand_id
      or recovery_record.target <> target_value then
      raise exception using errcode = '42501', message = 'Recovery execution context does not match its tenant';
    end if;
    run_record.id := recovery_record.active_generation_run_id;
  end if;

  insert into private.workflow_execution_contexts (
    workflow_execution_id,
    recovery_id,
    request_payload,
    request_digest
  )
  values (
    requested_execution_id,
    recovery_record.id,
    request_payload_value,
    request_digest_value
  )
  on conflict (workflow_execution_id)
  do update set
    recovery_id = excluded.recovery_id,
    request_payload = excluded.request_payload,
    request_digest = excluded.request_digest;

  if not was_duplicate then
    insert into public.pipeline_events (
      organization_id,
      brand_id,
      generation_run_id,
      entity_type,
      entity_id,
      event_type,
      to_status,
      correlation_id,
      actor_id,
      metadata
    )
    values (
      target_organization_id,
      target_brand_id,
      recovery_record.active_generation_run_id,
      private.entity_type_for_recovery(target_value),
      target_entity_id,
      'recovery.registered',
      'running',
      requested_correlation_id,
      target_actor_id,
      jsonb_build_object('recoveryId', recovery_record.id, 'target', target_value)
    );
  end if;

  return jsonb_build_object(
    'recoveryId', recovery_record.id,
    'generationRunId', recovery_record.active_generation_run_id,
    'duplicate', was_duplicate
  );
end;
$$;

create or replace function private.complete_workflow_execution(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_execution_id text := payload ->> 'workflowExecutionId';
  recovery_record public.run_recoveries%rowtype;
  final_status public.recovery_status;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Workflow recovery completion requires a service request';
  end if;
  select recovery.*
  into recovery_record
  from public.run_recoveries recovery
  where recovery.active_execution_id = requested_execution_id
     or recovery.initial_execution_id = requested_execution_id
  order by recovery.created_at desc
  limit 1
  for update;
  if recovery_record.id is null then
    raise exception using errcode = 'P0002', message = 'Recovery execution was not registered';
  end if;
  if recovery_record.status in ('completed', 'recovered') then
    return jsonb_build_object('recoveryId', recovery_record.id, 'status', recovery_record.status, 'duplicate', true);
  end if;
  final_status := case when recovery_record.attempt_count > 0 then 'recovered' else 'completed' end;
  update public.generation_runs
  set status = 'succeeded', completed_at = now(), error = null
  where id = recovery_record.active_generation_run_id
    and status in ('queued', 'running');
  update public.run_recoveries
  set status = final_status,
      next_retry_at = null,
      lease_expires_at = null,
      recovered_at = now()
  where id = recovery_record.id;
  insert into public.pipeline_events (
    organization_id, brand_id, generation_run_id, entity_type, entity_id,
    event_type, from_status, to_status, correlation_id, actor_id, metadata
  )
  select
    run.organization_id, run.brand_id, run.id, run.entity_type, run.entity_id,
    'recovery.completed', recovery_record.status::text, final_status::text,
    run.correlation_id, recovery_record.requested_by,
    jsonb_build_object('recoveryId', recovery_record.id, 'attemptCount', recovery_record.attempt_count)
  from public.generation_runs run
  where run.id = recovery_record.active_generation_run_id;
  return jsonb_build_object('recoveryId', recovery_record.id, 'status', final_status, 'duplicate', false);
end;
$$;

create or replace function private.record_workflow_failure(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_execution_id text := payload ->> 'workflowExecutionId';
  retry_of_execution_id text := nullif(payload ->> 'retryOfExecutionId', '');
  category_value text := payload ->> 'category';
  code_value text := payload ->> 'errorCode';
  retryable_value boolean := coalesce((payload ->> 'retryable')::boolean, false);
  recovery_record public.run_recoveries%rowtype;
  next_status public.recovery_status;
  next_retry timestamptz;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Workflow failure recording requires a service request';
  end if;
  if category_value not in ('transient', 'permanent', 'validation', 'security', 'budget', 'provider', 'unknown')
    or code_value !~ '^[a-z0-9_.:-]{1,120}$' then
    raise exception using errcode = '22023', message = 'Invalid redacted workflow failure';
  end if;
  select recovery.*
  into recovery_record
  from public.run_recoveries recovery
  left join private.workflow_execution_contexts context on context.recovery_id = recovery.id
  where recovery.active_execution_id = requested_execution_id
     or recovery.initial_execution_id = requested_execution_id
     or context.workflow_execution_id = requested_execution_id
     or (retry_of_execution_id is not null and (
       recovery.active_execution_id = retry_of_execution_id
       or recovery.initial_execution_id = retry_of_execution_id
     ))
  order by recovery.created_at desc
  limit 1
  for update of recovery;
  if recovery_record.id is null then
    raise exception using errcode = 'P0002', message = 'Recovery execution was not registered';
  end if;
  if recovery_record.status = 'dead_letter'
    and recovery_record.error_code = code_value
    and recovery_record.active_execution_id = requested_execution_id then
    return jsonb_build_object('recoveryId', recovery_record.id, 'status', 'dead_letter', 'duplicate', true);
  end if;

  update public.generation_runs
  set
    status = 'failed',
    completed_at = now(),
    error = jsonb_build_object(
      'code', code_value,
      'category', category_value,
      'retryable', retryable_value
    )
  where id = recovery_record.active_generation_run_id
    and status in ('queued', 'running');

  if retryable_value
    and category_value in ('transient', 'provider')
    and recovery_record.attempt_count < recovery_record.max_attempts
    and not recovery_record.manual_requested then
    next_status := 'scheduled';
    next_retry := now() + private.retry_delay(recovery_record.attempt_count);
  else
    next_status := 'dead_letter';
    next_retry := null;
  end if;

  update public.run_recoveries
  set
    active_execution_id = requested_execution_id,
    status = next_status,
    category = category_value,
    error_code = code_value,
    retryable = retryable_value,
    next_retry_at = next_retry,
    lease_expires_at = null
  where id = recovery_record.id;

  insert into public.pipeline_events (
    organization_id, brand_id, generation_run_id, entity_type, entity_id,
    event_type, from_status, to_status, correlation_id, actor_id, metadata
  )
  select
    run.organization_id, run.brand_id, run.id, run.entity_type, run.entity_id,
    case when next_status = 'scheduled' then 'recovery.scheduled' else 'recovery.dead_lettered' end,
    recovery_record.status::text, next_status::text, run.correlation_id,
    recovery_record.requested_by,
    jsonb_build_object(
      'recoveryId', recovery_record.id,
      'category', category_value,
      'errorCode', code_value,
      'attemptCount', recovery_record.attempt_count,
      'nextRetryAt', next_retry
    )
  from public.generation_runs run
  where run.id = recovery_record.active_generation_run_id;

  return jsonb_build_object(
    'recoveryId', recovery_record.id,
    'status', next_status,
    'nextRetryAt', next_retry,
    'attemptCount', recovery_record.attempt_count,
    'maxAttempts', recovery_record.max_attempts,
    'critical', next_status = 'dead_letter' or category_value = 'security',
    'duplicate', false
  );
end;
$$;

create or replace function private.claim_due_recoveries(requested_limit integer)
returns table (
  recovery_id uuid,
  generation_run_id uuid,
  execution_id text,
  stop_before_retry boolean,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovery_record public.run_recoveries%rowtype;
  retry_run_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Recovery claiming requires a service request';
  end if;
  if requested_limit not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Recovery claim limit must be between 1 and 10';
  end if;

  update public.run_recoveries recovery
  set
    status = 'scheduled',
    category = 'transient',
    error_code = 'stalled_run',
    retryable = true,
    next_retry_at = now()
  from public.generation_runs run
  where recovery.status = 'registered'
    and recovery.active_generation_run_id = run.id
    and run.status = 'running'
    and run.started_at < now() - interval '15 minutes';

  update public.run_recoveries recovery
  set
    status = case
      when recovery.attempt_count < recovery.max_attempts then 'scheduled'::public.recovery_status
      else 'dead_letter'::public.recovery_status
    end,
    category = 'transient',
    error_code = 'dispatch_lease_expired',
    retryable = true,
    next_retry_at = case
      when recovery.attempt_count < recovery.max_attempts then now()
      else null
    end,
    lease_expires_at = null
  where recovery.status = 'dispatching'
    and recovery.lease_expires_at <= now();

  for recovery_record in
    select recovery.*
    from public.run_recoveries recovery
    where recovery.status = 'scheduled'
      and recovery.next_retry_at <= now()
      and recovery.attempt_count < recovery.max_attempts
    order by recovery.next_retry_at, recovery.id
    for update skip locked
    limit requested_limit
  loop
    update public.run_recoveries recovery
    set
      status = 'dispatching',
      attempt_count = recovery.attempt_count + 1,
      last_attempt_at = now(),
      next_retry_at = null,
      lease_expires_at = now() + interval '5 minutes'
    where recovery.id = recovery_record.id
    returning recovery.* into recovery_record;

    insert into public.generation_runs (
      organization_id, brand_id, run_type, entity_type, entity_id,
      workflow_name, correlation_id, idempotency_key, attempt, status, model_usage
    )
    select
      root.organization_id, root.brand_id, root.run_type, root.entity_type, root.entity_id,
      root.workflow_name, root.correlation_id, root.idempotency_key,
      coalesce((
        select max(previous.attempt)
        from public.generation_runs previous
        where previous.organization_id = root.organization_id
          and previous.workflow_name = root.workflow_name
          and previous.idempotency_key = root.idempotency_key
      ), root.attempt) + 1,
      'queued',
      '{}'::jsonb
    from public.generation_runs root
    where root.id = recovery_record.root_generation_run_id
    on conflict (organization_id, workflow_name, idempotency_key, attempt)
    do update set status = public.generation_runs.status
    returning id into retry_run_id;

    recovery_id := recovery_record.id;
    generation_run_id := retry_run_id;
    execution_id := recovery_record.active_execution_id;
    stop_before_retry := recovery_record.error_code = 'stalled_run';
    attempt_count := recovery_record.attempt_count;
    return next;
  end loop;
end;
$$;

create or replace function private.mark_recovery_dispatched(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_recovery_id uuid := (payload ->> 'recoveryId')::uuid;
  target_generation_run_id uuid := (payload ->> 'generationRunId')::uuid;
  new_execution_id text := payload ->> 'workflowExecutionId';
  recovery_record public.run_recoveries%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Recovery dispatch completion requires a service request';
  end if;
  select * into recovery_record
  from public.run_recoveries
  where id = target_recovery_id
  for update;
  if recovery_record.id is null or recovery_record.status <> 'dispatching'
    or new_execution_id is null or char_length(new_execution_id) not between 1 and 200 then
    raise exception using errcode = '40001', message = 'Recovery dispatch is stale or invalid';
  end if;
  update public.generation_runs
  set status = 'running', started_at = now(), workflow_execution_id = new_execution_id
  where id = target_generation_run_id and status = 'queued';
  if not found then
    raise exception using errcode = '40001', message = 'Recovery generation run is stale';
  end if;
  update public.run_recoveries
  set
    active_generation_run_id = target_generation_run_id,
    active_execution_id = new_execution_id,
    status = 'retrying',
    lease_expires_at = null
  where id = target_recovery_id;
  return jsonb_build_object(
    'recoveryId', target_recovery_id,
    'generationRunId', target_generation_run_id,
    'workflowExecutionId', new_execution_id,
    'status', 'retrying'
  );
end;
$$;

create or replace function private.fail_recovery_dispatch(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_recovery_id uuid := (payload ->> 'recoveryId')::uuid;
  target_generation_run_id uuid := (payload ->> 'generationRunId')::uuid;
  code_value text := payload ->> 'errorCode';
  recovery_record public.run_recoveries%rowtype;
  next_status public.recovery_status;
  next_retry timestamptz;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Recovery dispatch failure requires a service request';
  end if;
  if code_value !~ '^[a-z0-9_.:-]{1,120}$' then
    raise exception using errcode = '22023', message = 'Invalid recovery dispatch error';
  end if;
  select * into recovery_record from public.run_recoveries where id = target_recovery_id for update;
  if recovery_record.id is null or recovery_record.status <> 'dispatching' then
    raise exception using errcode = '40001', message = 'Recovery dispatch is stale';
  end if;
  if recovery_record.attempt_count < recovery_record.max_attempts
    and not recovery_record.manual_requested then
    next_status := 'scheduled';
    next_retry := now() + private.retry_delay(recovery_record.attempt_count);
  else
    next_status := 'dead_letter';
    next_retry := null;
  end if;
  update public.generation_runs
  set
    status = 'failed',
    completed_at = now(),
    error = jsonb_build_object('code', code_value, 'category', 'transient', 'retryable', true)
  where id = target_generation_run_id and status = 'queued';
  update public.run_recoveries
  set
    status = next_status,
    error_code = code_value,
    category = 'transient',
    retryable = true,
    next_retry_at = next_retry,
    lease_expires_at = null
  where id = target_recovery_id;
  return jsonb_build_object(
    'recoveryId', target_recovery_id,
    'status', next_status,
    'nextRetryAt', next_retry
  );
end;
$$;

create or replace function private.request_run_recovery(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_run_id uuid := (payload ->> 'generationRunId')::uuid;
  requested_actor_id uuid := (payload ->> 'actorId')::uuid;
  requested_reason text := btrim(payload ->> 'reason');
  requested_idempotency_key text := payload ->> 'idempotencyKey';
  request_hash_value text := encode(sha256(convert_to(payload::text, 'UTF8')), 'hex');
  recovery_record public.run_recoveries%rowtype;
  existing_key private.idempotency_keys%rowtype;
  response_value jsonb;
begin
  if requested_reason is null or char_length(requested_reason) not between 10 and 1000
    or requested_idempotency_key is null
    or char_length(requested_idempotency_key) not between 16 and 200 then
    raise exception using errcode = '22023', message = 'Invalid manual recovery request';
  end if;
  select recovery.*
  into recovery_record
  from public.run_recoveries recovery
  where recovery.root_generation_run_id = requested_run_id
     or recovery.active_generation_run_id = requested_run_id
  order by recovery.created_at desc
  limit 1
  for update;
  if recovery_record.id is null then
    raise exception using errcode = 'P0002', message = 'This run has no replayable execution context';
  end if;
  if not exists (
    select 1 from public.organization_members member
    where member.organization_id = recovery_record.organization_id
      and member.user_id = requested_actor_id
      and member.role = 'administrator'
  ) or requested_actor_id is distinct from (select auth.uid()) then
    raise exception using errcode = '42501', message = 'Only an organization administrator can recover this run';
  end if;

  select * into existing_key
  from private.idempotency_keys key
  where key.organization_id = recovery_record.organization_id
    and key.scope = 'manual_run_recovery'
    and key.idempotency_key = requested_idempotency_key
  for update;
  if existing_key.idempotency_key is not null then
    if existing_key.request_hash <> request_hash_value then
      raise exception using errcode = '23505', message = 'Idempotency key was reused with a different recovery request';
    end if;
    return existing_key.response_body;
  end if;
  if recovery_record.status in ('completed', 'recovered', 'cancelled') then
    raise exception using errcode = '22023', message = 'Completed or cancelled work cannot be recovered';
  end if;

  update public.run_recoveries
  set
    status = 'scheduled',
    attempt_count = case
      when attempt_count >= max_attempts then 0
      else attempt_count
    end,
    next_retry_at = now(),
    lease_expires_at = null,
    manual_requested = true,
    manual_reason = requested_reason
  where id = recovery_record.id;

  insert into public.audit_logs (
    organization_id, brand_id, actor_id, action, entity_type, entity_id, metadata
  )
  values (
    recovery_record.organization_id,
    recovery_record.brand_id,
    requested_actor_id,
    'run.manual_recovery_requested',
    'generation_run',
    requested_run_id,
    jsonb_build_object('recoveryId', recovery_record.id, 'reason', requested_reason)
  );

  response_value := jsonb_build_object(
    'recoveryId', recovery_record.id,
    'generationRunId', requested_run_id,
    'status', 'scheduled',
    'duplicate', false
  );
  insert into private.idempotency_keys (
    organization_id, scope, idempotency_key, request_hash,
    response_status, response_body, expires_at
  )
  values (
    recovery_record.organization_id,
    'manual_run_recovery',
    requested_idempotency_key,
    request_hash_value,
    200,
    response_value,
    now() + interval '30 days'
  );
  return response_value;
end;
$$;

create or replace function public.register_workflow_execution(payload jsonb)
returns jsonb language sql set search_path = ''
as $$ select private.register_workflow_execution(payload); $$;
create or replace function public.complete_workflow_execution(payload jsonb)
returns jsonb language sql set search_path = ''
as $$ select private.complete_workflow_execution(payload); $$;
create or replace function public.record_workflow_failure(payload jsonb)
returns jsonb language sql set search_path = ''
as $$ select private.record_workflow_failure(payload); $$;
create or replace function public.claim_due_recoveries(requested_limit integer)
returns table (
  recovery_id uuid,
  generation_run_id uuid,
  execution_id text,
  stop_before_retry boolean,
  attempt_count integer
) language sql set search_path = ''
as $$ select * from private.claim_due_recoveries(requested_limit); $$;
create or replace function public.mark_recovery_dispatched(payload jsonb)
returns jsonb language sql set search_path = ''
as $$ select private.mark_recovery_dispatched(payload); $$;
create or replace function public.fail_recovery_dispatch(payload jsonb)
returns jsonb language sql set search_path = ''
as $$ select private.fail_recovery_dispatch(payload); $$;
create or replace function public.request_run_recovery(payload jsonb)
returns jsonb language sql set search_path = ''
as $$ select private.request_run_recovery(payload); $$;

revoke all on function private.run_type_for_recovery(public.recovery_target) from public;
revoke all on function private.entity_type_for_recovery(public.recovery_target) from public;
revoke all on function private.retry_delay(integer) from public;
revoke all on function private.register_workflow_execution(jsonb) from public;
revoke all on function private.complete_workflow_execution(jsonb) from public;
revoke all on function private.record_workflow_failure(jsonb) from public;
revoke all on function private.claim_due_recoveries(integer) from public;
revoke all on function private.mark_recovery_dispatched(jsonb) from public;
revoke all on function private.fail_recovery_dispatch(jsonb) from public;
revoke all on function private.request_run_recovery(jsonb) from public;

revoke all on function public.register_workflow_execution(jsonb) from public;
revoke all on function public.complete_workflow_execution(jsonb) from public;
revoke all on function public.record_workflow_failure(jsonb) from public;
revoke all on function public.claim_due_recoveries(integer) from public;
revoke all on function public.mark_recovery_dispatched(jsonb) from public;
revoke all on function public.fail_recovery_dispatch(jsonb) from public;
revoke all on function public.request_run_recovery(jsonb) from public;

grant execute on function private.register_workflow_execution(jsonb) to service_role;
grant execute on function private.complete_workflow_execution(jsonb) to service_role;
grant execute on function private.record_workflow_failure(jsonb) to service_role;
grant execute on function private.claim_due_recoveries(integer) to service_role;
grant execute on function private.mark_recovery_dispatched(jsonb) to service_role;
grant execute on function private.fail_recovery_dispatch(jsonb) to service_role;
grant execute on function private.request_run_recovery(jsonb) to authenticated;

grant execute on function public.register_workflow_execution(jsonb) to service_role;
grant execute on function public.complete_workflow_execution(jsonb) to service_role;
grant execute on function public.record_workflow_failure(jsonb) to service_role;
grant execute on function public.claim_due_recoveries(integer) to service_role;
grant execute on function public.mark_recovery_dispatched(jsonb) to service_role;
grant execute on function public.fail_recovery_dispatch(jsonb) to service_role;
grant execute on function public.request_run_recovery(jsonb) to authenticated;
