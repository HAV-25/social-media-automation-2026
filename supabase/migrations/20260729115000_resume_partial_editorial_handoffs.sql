-- Reconcile parent recovery bookkeeping when bounded research succeeded but a
-- downstream child failed after the research response had already committed.
update public.generation_runs active_run
set status = 'succeeded',
    completed_at = coalesce(active_run.completed_at, research.completed_at, now()),
    error = null
from public.run_recoveries recovery,
     public.generation_runs root,
     public.research_runs research
where recovery.active_generation_run_id = active_run.id
  and recovery.root_generation_run_id = root.id
  and recovery.target = 'research'
  and active_run.status = 'queued'
  and research.opportunity_id = root.entity_id
  and research.status = 'succeeded'
  and research.completed_at >= active_run.created_at;

update public.run_recoveries recovery
set status = 'completed',
    category = null,
    error_code = null,
    retryable = false,
    next_retry_at = null,
    lease_expires_at = null,
    recovered_at = coalesce(recovery.recovered_at, now()),
    updated_at = now()
from public.generation_runs root
where recovery.root_generation_run_id = root.id
  and recovery.target = 'research'
  and recovery.status <> 'completed'
  and exists (
    select 1
    from public.research_runs research
    where research.opportunity_id = root.entity_id
      and research.status = 'succeeded'
      and research.completed_at >= recovery.created_at
  );

-- Retry only recent editorial attempts that failed the now-corrected redundant
-- provider-field consistency gate.
update public.run_recoveries recovery
set status = 'scheduled',
    category = 'provider',
    error_code = 'invalid_output',
    retryable = true,
    next_retry_at = now(),
    lease_expires_at = null,
    updated_at = now()
from public.generation_runs active_run
where recovery.active_generation_run_id = active_run.id
  and recovery.target = 'editorial_generation'
  and recovery.status = 'dead_letter'
  and active_run.error ->> 'code' = 'invalid_output'
  and recovery.attempt_count < recovery.max_attempts
  and recovery.created_at >= now() - interval '48 hours';

-- A style that succeeded before the stage-owned handoff was deployed has no
-- verification run. Replay its immutable editorial request once; draft reuse
-- prevents a second paid writing call and the updated WF-06 performs the
-- verification handoff.
update public.run_recoveries recovery
set status = 'scheduled',
    category = 'transient',
    error_code = 'verification_handoff_missing',
    retryable = true,
    next_retry_at = now(),
    lease_expires_at = null,
    updated_at = now()
from public.generation_runs root
where recovery.root_generation_run_id = root.id
  and recovery.target = 'editorial_generation'
  and recovery.status = 'completed'
  and root.status = 'succeeded'
  and recovery.attempt_count < recovery.max_attempts
  and recovery.created_at >= now() - interval '48 hours'
  and exists (
    select 1
    from public.post_drafts draft
    where draft.opportunity_id = root.entity_id
      and draft.created_at >= root.created_at
      and not exists (
        select 1
        from public.generation_runs verification
        where verification.entity_id = draft.id
          and verification.run_type = 'post_verification'
      )
  );
