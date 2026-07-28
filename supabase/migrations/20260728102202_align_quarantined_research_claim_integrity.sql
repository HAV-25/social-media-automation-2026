-- Keep the database integrity boundary aligned with the versioned application
-- contract: a quarantined do_not_use claim must remain in the immutable ledger,
-- but it does not veto a separately usable core claim.
do $migration$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef('private.persist_research_evidence(jsonb)'::regprocedure)
  into definition;

  corrected := pg_catalog.regexp_replace(
    definition,
    $pattern$(claim\.value[[:space:]]*->>[[:space:]]*'importance'[[:space:]]*=[[:space:]]*'core'[[:space:]]+and[[:space:]]+)(claim\.value[[:space:]]*->>[[:space:]]*'verificationState'[[:space:]]+in[[:space:]]*\([[:space:]]*'unsupported'[[:space:]]*,[[:space:]]*'disputed'[[:space:]]*\))$pattern$,
    E'\\1claim.value ->> ''usageGuidance'' <> ''do_not_use''\n        and \\2'
  );

  if corrected <> definition then
    execute corrected;
  elsif definition !~ $pattern$claim\.value[[:space:]]*->>[[:space:]]*'importance'[[:space:]]*=[[:space:]]*'core'[[:space:]]+and[[:space:]]+claim\.value[[:space:]]*->>[[:space:]]*'usageGuidance'[[:space:]]*<>[[:space:]]*'do_not_use'[[:space:]]+and[[:space:]]+claim\.value[[:space:]]*->>[[:space:]]*'verificationState'[[:space:]]+in[[:space:]]*\([[:space:]]*'unsupported'[[:space:]]*,[[:space:]]*'disputed'[[:space:]]*\)$pattern$ then
    raise exception 'Research readiness blocker could not be aligned safely';
  end if;
end
$migration$;

-- Earlier WF-05 executions could only see the application-level 500 and were
-- therefore dead-lettered as permanent. Requeue only recoveries whose exact
-- opportunity also has the corrected PostgreSQL 23514 persistence failure.
with corrected_recoveries as (
  select
    recovery.id,
    recovery.organization_id,
    recovery.brand_id,
    recovery.requested_by,
    recovery.status::text as previous_status,
    root.id as generation_run_id,
    root.entity_id,
    root.correlation_id
  from public.run_recoveries recovery
  join public.generation_runs root
    on root.id = recovery.root_generation_run_id
  where recovery.target = 'research'
    and recovery.status = 'dead_letter'
    and recovery.attempt_count < recovery.max_attempts
    and exists (
      select 1
      from public.generation_runs persistence
      where persistence.organization_id = root.organization_id
        and persistence.brand_id = root.brand_id
        and persistence.entity_id = root.entity_id
        and persistence.run_type = 'research'
        and persistence.workflow_name = 'wf-05-research'
        and persistence.status = 'failed'
        and persistence.error ->> 'code' = '23514'
        and persistence.created_at >= recovery.created_at - interval '1 minute'
    )
),
requeued as (
  update public.run_recoveries recovery
  set status = 'scheduled',
      category = 'transient',
      error_code = 'research_integrity_corrected',
      retryable = true,
      next_retry_at = now(),
      lease_expires_at = null
  from corrected_recoveries corrected
  where recovery.id = corrected.id
  returning recovery.id
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
  corrected.organization_id,
  corrected.brand_id,
  corrected.generation_run_id,
  'opportunity',
  corrected.entity_id,
  'recovery.requeued_after_integrity_fix',
  corrected.previous_status,
  'scheduled',
  corrected.correlation_id,
  corrected.requested_by,
  jsonb_build_object(
    'recoveryId', corrected.id,
    'correctedErrorCode', '23514'
  )
from corrected_recoveries corrected
join requeued on requeued.id = corrected.id;
