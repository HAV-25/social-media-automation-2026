-- Recompute rows that were held only because a quarantined do_not_use claim
-- was counted as a writing blocker despite separately verified core evidence.
create temporary table readiness_repairs on commit drop as
select
  research.id as research_run_id,
  research.opportunity_id,
  research.generation_run_id,
  opportunity.organization_id,
  opportunity.brand_id,
  opportunity.status::text as previous_opportunity_status,
  generation.correlation_id
from public.research_runs research
join public.opportunities opportunity
  on opportunity.id = research.opportunity_id
join public.generation_runs generation
  on generation.id = research.generation_run_id
where research.status = 'succeeded'
  and not research.ready_for_writing
  and exists (
    select 1
    from public.claims claim
    where claim.research_run_id = research.id
      and claim.importance::text = 'core'
      and claim.usage_guidance::text <> 'do_not_use'
      and claim.verification_state::text not in ('unsupported', 'disputed')
  )
  and not exists (
    select 1
    from public.claims claim
    where claim.research_run_id = research.id
      and claim.importance::text = 'core'
      and claim.usage_guidance::text <> 'do_not_use'
      and claim.verification_state::text in ('unsupported', 'disputed')
  );

update public.research_runs research
set ready_for_writing = true,
    evidence_package = jsonb_set(
      research.evidence_package,
      '{readyForWriting}',
      'true'::jsonb,
      true
    )
from readiness_repairs repair
where research.id = repair.research_run_id;

update public.opportunities opportunity
set status = 'ready_to_generate',
    updated_at = now()
from readiness_repairs repair
where opportunity.id = repair.opportunity_id
  and opportunity.status::text in (
    'research_pending',
    'researching'
  );

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
  repair.organization_id,
  repair.brand_id,
  repair.generation_run_id,
  'opportunity',
  repair.opportunity_id,
  'research.readiness_recomputed',
  repair.previous_opportunity_status,
  'ready_to_generate',
  repair.correlation_id,
  null,
  jsonb_build_object(
    'reason',
    'Quarantined do_not_use claims no longer veto separately usable core evidence.',
    'researchRunId',
    repair.research_run_id
  )
from readiness_repairs repair;
