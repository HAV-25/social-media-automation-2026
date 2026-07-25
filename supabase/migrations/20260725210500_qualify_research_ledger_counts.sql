-- Qualify research ledger count predicates that otherwise conflict with the
-- RETURNS TABLE output parameter named research_run_id.
do $migration$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef('private.persist_research_evidence(jsonb)'::regprocedure)
  into definition;

  corrected := replace(
    definition,
    'from public.research_sources where research_run_id = research_id;',
    E'from public.research_sources counted_source\n  where counted_source.research_run_id = research_id;'
  );
  if corrected = definition then
    raise exception 'Expected unqualified research source count was not found';
  end if;
  definition := corrected;

  corrected := replace(
    definition,
    'from public.claims where research_run_id = research_id;',
    E'from public.claims counted_claim\n  where counted_claim.research_run_id = research_id;'
  );
  if corrected = definition then
    raise exception 'Expected unqualified claim count was not found';
  end if;

  execute corrected;
end
$migration$;
