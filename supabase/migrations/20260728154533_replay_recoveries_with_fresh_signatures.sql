-- A failed n8n execution contains time-bounded HMAC request material. Retrying
-- that execution from its failed node reuses an expired signature. Claim the
-- immutable typed request instead so the application can start the workflow
-- from its webhook with a fresh timestamp and nonce.
create or replace function private.activate_replayed_workflow_execution()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  recovery_record public.run_recoveries%rowtype;
begin
  select recovery.*
  into recovery_record
  from public.run_recoveries recovery
  where recovery.id = new.recovery_id
  for update;

  if recovery_record.status = 'dispatching' then
    update public.generation_runs
    set workflow_execution_id = new.workflow_execution_id,
        status = 'running',
        started_at = coalesce(started_at, now())
    where id = recovery_record.active_generation_run_id
      and status = 'queued';

    update public.run_recoveries
    set active_execution_id = new.workflow_execution_id,
        status = 'retrying',
        lease_expires_at = null
    where id = recovery_record.id;

    insert into public.pipeline_events (
      organization_id,
      brand_id,
      generation_run_id,
      entity_type,
      entity_id,
      event_type,
      from_status,
      to_status,
      correlation_id,
      actor_id,
      metadata
    )
    select
      run.organization_id,
      run.brand_id,
      run.id,
      run.entity_type,
      run.entity_id,
      'recovery.fresh_replay_started',
      'dispatching',
      'retrying',
      run.correlation_id,
      recovery_record.requested_by,
      jsonb_build_object(
        'recoveryId', recovery_record.id,
        'attemptCount', recovery_record.attempt_count
      )
    from public.generation_runs run
    where run.id = recovery_record.active_generation_run_id;
  end if;

  return new;
end;
$$;

revoke all on function private.activate_replayed_workflow_execution() from public;

drop trigger if exists workflow_execution_contexts_activate_replay
on private.workflow_execution_contexts;
create trigger workflow_execution_contexts_activate_replay
after insert on private.workflow_execution_contexts
for each row execute function private.activate_replayed_workflow_execution();

create or replace function private.claim_due_recovery_replays(requested_limit integer)
returns table (
  recovery_id uuid,
  generation_run_id uuid,
  target public.recovery_target,
  request_payload jsonb,
  attempt_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  recovery_record public.run_recoveries%rowtype;
  retry_run_id uuid;
  replay_payload jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Recovery claiming requires a service request';
  end if;
  if requested_limit not between 1 and 10 then
    raise exception using errcode = '22023', message = 'Recovery claim limit must be between 1 and 10';
  end if;

  update public.run_recoveries recovery
  set status = 'scheduled',
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
  set status = case
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

  update public.run_recoveries recovery
  set status = 'dead_letter',
      category = 'permanent',
      error_code = 'replay_context_missing',
      retryable = false,
      next_retry_at = null,
      lease_expires_at = null
  where recovery.status = 'scheduled'
    and recovery.next_retry_at <= now()
    and not exists (
      select 1
      from private.workflow_execution_contexts context
      where context.recovery_id = recovery.id
    );

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
    select context.request_payload
    into replay_payload
    from private.workflow_execution_contexts context
    where context.recovery_id = recovery_record.id
    order by context.created_at desc, context.workflow_execution_id desc
    limit 1;

    update public.run_recoveries recovery
    set status = 'dispatching',
        attempt_count = recovery.attempt_count + 1,
        last_attempt_at = now(),
        next_retry_at = null,
        lease_expires_at = now() + interval '5 minutes'
    where recovery.id = recovery_record.id
    returning recovery.* into recovery_record;

    insert into public.generation_runs (
      organization_id,
      brand_id,
      run_type,
      entity_type,
      entity_id,
      workflow_name,
      correlation_id,
      idempotency_key,
      attempt,
      status,
      model_usage
    )
    select
      root.organization_id,
      root.brand_id,
      root.run_type,
      root.entity_type,
      root.entity_id,
      root.workflow_name,
      root.correlation_id,
      root.idempotency_key,
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

    update public.run_recoveries
    set active_generation_run_id = retry_run_id
    where id = recovery_record.id;

    recovery_id := recovery_record.id;
    generation_run_id := retry_run_id;
    target := recovery_record.target;
    request_payload := replay_payload;
    attempt_count := recovery_record.attempt_count;
    return next;
  end loop;
end;
$$;

create or replace function public.claim_due_recovery_replays(requested_limit integer)
returns table (
  recovery_id uuid,
  generation_run_id uuid,
  target public.recovery_target,
  request_payload jsonb,
  attempt_count integer
)
language sql
set search_path = ''
as $$
  select *
  from private.claim_due_recovery_replays(requested_limit);
$$;

revoke all on function private.claim_due_recovery_replays(integer) from public;
revoke all on function public.claim_due_recovery_replays(integer) from public;
grant execute on function private.claim_due_recovery_replays(integer) to service_role;
grant execute on function public.claim_due_recovery_replays(integer) to service_role;
