-- Some stale replay leases reached the retry cap before the accepted-replay
-- acknowledgement release was deployed. Close only dead letters whose same
-- entity and stage have a separate durable succeeded run. Provider failures
-- and dead letters without proof of success remain immutable.
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
  where recovery.status = 'dead_letter'
    and recovery.error_code in (
      'dispatch_lease_expired',
      'n8n_replay_rejected'
    )
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
    root.organization_id,
    root.brand_id,
    root.entity_type,
    root.entity_id,
    root.correlation_id,
    recovery.requested_by,
    recovery.attempt_count,
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
  where recovery.status = 'dead_letter'
    and recovery.error_code in (
      'dispatch_lease_expired',
      'n8n_replay_rejected'
    )
    and recovery.created_at >= now() - interval '48 hours'
)
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
  proven.organization_id,
  proven.brand_id,
  proven.evidence_run_id,
  proven.entity_type,
  proven.entity_id,
  'recovery.dead_letter_reconciled',
  'dead_letter',
  'completed',
  proven.correlation_id,
  proven.requested_by,
  jsonb_build_object(
    'recoveryId', proven.recovery_id,
    'attemptCount', proven.attempt_count,
    'reason', 'durable_stage_success'
  )
from proven;

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
  where recovery.status = 'dead_letter'
    and recovery.error_code in (
      'dispatch_lease_expired',
      'n8n_replay_rejected'
    )
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
