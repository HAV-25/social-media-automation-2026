-- A recovery webhook call is synchronous: a 2xx response means the recovered
-- stage completed. Persist that acknowledgement atomically so WF-10 does not
-- leave the claimed retry run queued until its dispatch lease expires.
create or replace function public.complete_recovery_replay(payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  target_recovery_id uuid := nullif(payload ->> 'recoveryId', '')::uuid;
  target_generation_run_id uuid := nullif(payload ->> 'generationRunId', '')::uuid;
  recovery_record public.run_recoveries%rowtype;
  run_record public.generation_runs%rowtype;
begin
  if current_user <> 'service_role' then
    raise exception 'Recovery completion requires a service request'
      using errcode = '42501';
  end if;
  if target_recovery_id is null or target_generation_run_id is null then
    raise exception 'Invalid recovery completion payload'
      using errcode = '22023';
  end if;

  select *
  into recovery_record
  from public.run_recoveries
  where id = target_recovery_id
  for update;

  if recovery_record.id is null then
    raise exception 'Recovery record not found' using errcode = 'P0002';
  end if;
  if recovery_record.status = 'completed'
    and recovery_record.active_generation_run_id = target_generation_run_id
  then
    return jsonb_build_object(
      'recoveryId', target_recovery_id,
      'generationRunId', target_generation_run_id,
      'status', 'completed',
      'duplicate', true
    );
  end if;
  if recovery_record.status <> 'dispatching' then
    raise exception 'Recovery completion is stale' using errcode = '40001';
  end if;

  select *
  into run_record
  from public.generation_runs
  where id = target_generation_run_id
  for update;

  if run_record.id is null
    or run_record.organization_id <> recovery_record.organization_id
    or run_record.brand_id <> recovery_record.brand_id
    or run_record.workflow_name <> recovery_record.workflow_name
    or run_record.status <> 'queued'
  then
    raise exception 'Recovery generation run is stale or invalid'
      using errcode = '40001';
  end if;

  update public.generation_runs
  set status = 'succeeded',
      started_at = coalesce(started_at, now()),
      completed_at = now(),
      error = null,
      model_usage = model_usage || jsonb_build_object(
        'recoveryReplayAccepted', true,
        'recoveryAttempt', recovery_record.attempt_count
      )
  where id = target_generation_run_id;

  update public.run_recoveries
  set active_generation_run_id = target_generation_run_id,
      status = 'completed',
      category = null,
      error_code = null,
      retryable = false,
      next_retry_at = null,
      lease_expires_at = null,
      recovered_at = coalesce(recovered_at, now()),
      updated_at = now()
  where id = target_recovery_id;

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
  values (
    run_record.organization_id,
    run_record.brand_id,
    target_generation_run_id,
    run_record.entity_type,
    run_record.entity_id,
    'recovery.replay_completed',
    'queued',
    'succeeded',
    run_record.correlation_id,
    recovery_record.requested_by,
    jsonb_build_object(
      'recoveryId', target_recovery_id,
      'attemptCount', recovery_record.attempt_count
    )
  );

  insert into public.audit_logs (
    organization_id,
    brand_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    run_record.organization_id,
    run_record.brand_id,
    recovery_record.requested_by,
    'recovery.replay_completed',
    run_record.entity_type,
    run_record.entity_id,
    jsonb_build_object(
      'recoveryId', target_recovery_id,
      'generationRunId', target_generation_run_id,
      'attemptCount', recovery_record.attempt_count
    )
  );

  return jsonb_build_object(
    'recoveryId', target_recovery_id,
    'generationRunId', target_generation_run_id,
    'status', 'completed',
    'duplicate', false
  );
end;
$$;

revoke all on function public.complete_recovery_replay(jsonb)
  from public, anon, authenticated;
grant execute on function public.complete_recovery_replay(jsonb)
  to service_role;

-- Reconcile recent stale claims only when another durable generation run
-- proves the same entity and stage already succeeded. This repairs historical
-- queue noise without replaying any provider work.
with proven as (
  select
    recovery.id as recovery_id,
    root.organization_id,
    root.workflow_name,
    root.idempotency_key,
    evidence.id as evidence_run_id
  from public.run_recoveries recovery
  join public.generation_runs root
    on root.id = recovery.root_generation_run_id
  join lateral (
    select succeeded.id
    from public.generation_runs succeeded
    where succeeded.organization_id = root.organization_id
      and succeeded.brand_id = root.brand_id
      and succeeded.entity_id = root.entity_id
      and succeeded.run_type = root.run_type
      and succeeded.status = 'succeeded'
      and succeeded.created_at >= recovery.created_at
    order by succeeded.completed_at desc nulls last, succeeded.created_at desc
    limit 1
  ) evidence on true
  where recovery.status in ('scheduled', 'dispatching', 'retrying')
    and recovery.created_at >= now() - interval '48 hours'
)
update public.generation_runs queued
set status = 'succeeded',
    started_at = coalesce(queued.started_at, now()),
    completed_at = coalesce(queued.completed_at, now()),
    error = null,
    model_usage = queued.model_usage
      || '{"reconciledFromDurableStageSuccess":true}'::jsonb
from proven
where queued.organization_id = proven.organization_id
  and queued.workflow_name = proven.workflow_name
  and queued.idempotency_key = proven.idempotency_key
  and queued.status = 'queued';

with proven as (
  select
    recovery.id as recovery_id,
    evidence.id as evidence_run_id
  from public.run_recoveries recovery
  join public.generation_runs root
    on root.id = recovery.root_generation_run_id
  join lateral (
    select succeeded.id
    from public.generation_runs succeeded
    where succeeded.organization_id = root.organization_id
      and succeeded.brand_id = root.brand_id
      and succeeded.entity_id = root.entity_id
      and succeeded.run_type = root.run_type
      and succeeded.status = 'succeeded'
      and succeeded.created_at >= recovery.created_at
    order by succeeded.completed_at desc nulls last, succeeded.created_at desc
    limit 1
  ) evidence on true
  where recovery.status in ('scheduled', 'dispatching', 'retrying')
    and recovery.created_at >= now() - interval '48 hours'
)
update public.run_recoveries recovery
set active_generation_run_id = proven.evidence_run_id,
    status = 'completed',
    category = null,
    error_code = null,
    retryable = false,
    next_retry_at = null,
    lease_expires_at = null,
    recovered_at = coalesce(recovery.recovered_at, now()),
    updated_at = now()
from proven
where recovery.id = proven.recovery_id;
