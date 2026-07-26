-- Re-analysis can replace an RSS summary with safely extracted full-article
-- text. Refresh the deterministic opportunity intelligence while preserving
-- its human/workflow status and identity.
do $migration$
declare
  original_definition text;
  updated_definition text;
begin
  select pg_get_functiondef('private.ingest_manual_input(jsonb)'::regprocedure)
  into original_definition;

  updated_definition := replace(
    original_definition,
    E'    do update set\n      updated_at = public.opportunities.updated_at,\n      cluster_id = coalesce(excluded.cluster_id, public.opportunities.cluster_id)',
    E'    do update set\n      updated_at = now(),\n      cluster_id = coalesce(excluded.cluster_id, public.opportunities.cluster_id),\n      value_nucleus = excluded.value_nucleus,\n      recommended_style = excluded.recommended_style,\n      opportunity_score = excluded.opportunity_score,\n      risk_penalty = excluded.risk_penalty,\n      score_breakdown = excluded.score_breakdown'
  );

  if updated_definition = original_definition then
    updated_definition := replace(
      original_definition,
      E'    do update set\r\n      updated_at = public.opportunities.updated_at,\r\n      cluster_id = coalesce(excluded.cluster_id, public.opportunities.cluster_id)',
      E'    do update set\r\n      updated_at = now(),\r\n      cluster_id = coalesce(excluded.cluster_id, public.opportunities.cluster_id),\r\n      value_nucleus = excluded.value_nucleus,\r\n      recommended_style = excluded.recommended_style,\r\n      opportunity_score = excluded.opportunity_score,\r\n      risk_penalty = excluded.risk_penalty,\r\n      score_breakdown = excluded.score_breakdown'
    );
  end if;

  if updated_definition = original_definition
    or updated_definition not like '%opportunity_score = excluded.opportunity_score%'
    or updated_definition not like '%score_breakdown = excluded.score_breakdown%'
  then
    raise exception 'RSS opportunity re-scoring semantics were not updated';
  end if;

  execute updated_definition;
end;
$migration$;

revoke all on function private.ingest_manual_input(jsonb)
  from public, anon, authenticated;
grant execute on function private.ingest_manual_input(jsonb)
  to service_role;
