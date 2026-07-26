-- An opportunity reservation is an instantaneous deterministic decision, not
-- a long-running workflow. Record it as completed so operational counters do
-- not report a permanent in-progress run.
do $migration$
declare
  original_definition text;
  updated_definition text;
begin
  select pg_get_functiondef('private.reserve_rss_generation(jsonb)'::regprocedure)
  into original_definition;

  updated_definition := replace(
    original_definition,
    E'      status,\n      model_usage',
    E'      status,\n      completed_at,\n      model_usage'
  );
  updated_definition := replace(
    updated_definition,
    E'      ''queued'',\n      jsonb_build_object(',
    E'      ''succeeded'',\n      now(),\n      jsonb_build_object('
  );

  if updated_definition = original_definition
    or updated_definition not like '%completed_at%'
    or updated_definition not like '%''succeeded''%'
  then
    raise exception 'RSS reservation completion semantics were not updated';
  end if;

  execute updated_definition;
end;
$migration$;

update public.generation_runs
set status = 'succeeded',
    completed_at = coalesce(completed_at, started_at, created_at)
where run_type = 'rss_opportunity_reservation'
  and workflow_name = 'WF-04 Cluster and Score'
  and status in ('queued', 'running');

revoke all on function private.reserve_rss_generation(jsonb)
  from public, anon, authenticated;
grant execute on function private.reserve_rss_generation(jsonb)
  to service_role;

revoke all on function public.reserve_rss_generation(jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_rss_generation(jsonb)
  to service_role;
