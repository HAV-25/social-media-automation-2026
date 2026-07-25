-- PostgreSQL does not implicitly assign a text CASE expression to an enum.
do $migration$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef('private.persist_research_evidence(jsonb)'::regprocedure)
  into definition;

  corrected := replace(
    definition,
    'set status = case when is_ready then ''ready_to_generate'' else ''research_pending'' end',
    E'set status = case\n    when is_ready then ''ready_to_generate''::public.opportunity_status\n    else ''research_pending''::public.opportunity_status\n  end'
  );
  if corrected = definition then
    raise exception 'Expected untyped opportunity status CASE was not found';
  end if;

  execute corrected;
end
$migration$;
