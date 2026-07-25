create or replace function public.get_brand_dashboard_metrics(
  p_brand_id uuid,
  p_since timestamptz
)
returns table (
  sources_today bigint,
  normalized_today bigint,
  active_opportunities bigint,
  research_spend_usd numeric,
  deduplicated_today bigint,
  processing_today bigint,
  completed_today bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_since is null or p_since > now() then
    raise exception 'Invalid dashboard window' using errcode = '22023';
  end if;

  if not public.can_read_brand(p_brand_id) then
    raise exception 'Brand access required' using errcode = '42501';
  end if;

  return query
  with brand_sources as (
    select source.status
    from public.source_brand_links brand_link
    join public.source_documents source
      on source.id = brand_link.source_document_id
     and source.organization_id = brand_link.organization_id
    where brand_link.brand_id = p_brand_id
      and source.created_at >= p_since
  ),
  research_costs as (
    select
      case
        when coalesce(run.model_usage ->> 'costUsd', '') ~ '^[0-9]+([.][0-9]+)?$'
          then (run.model_usage ->> 'costUsd')::numeric
        when coalesce(run.model_usage ->> 'estimatedCostUsd', '') ~ '^[0-9]+([.][0-9]+)?$'
          then (run.model_usage ->> 'estimatedCostUsd')::numeric
        when coalesce(run.model_usage ->> 'reservedCostUsd', '') ~ '^[0-9]+([.][0-9]+)?$'
          then (run.model_usage ->> 'reservedCostUsd')::numeric
        else 0::numeric
      end as recorded_cost_usd
    from public.generation_runs run
    where run.brand_id = p_brand_id
      and run.run_type = 'research'
      and run.created_at >= p_since
  )
  select
    (select count(*) from brand_sources),
    (
      select count(*)
      from brand_sources
      where status in ('normalized', 'clustered', 'analyzed', 'completed', 'duplicate')
    ),
    (
      select count(*)
      from public.opportunities opportunity
      where opportunity.brand_id = p_brand_id
        and opportunity.status in (
          'candidate',
          'research_pending',
          'researching',
          'ready_to_generate'
        )
    ),
    coalesce((select sum(recorded_cost_usd) from research_costs), 0::numeric),
    (select count(*) from brand_sources where status = 'duplicate'),
    (
      select count(*)
      from brand_sources
      where status in ('received', 'extracting', 'normalized', 'clustered', 'analyzed')
    ),
    (select count(*) from brand_sources where status = 'completed');
end;
$$;

revoke all on function public.get_brand_dashboard_metrics(uuid, timestamptz)
  from public, anon;
grant execute on function public.get_brand_dashboard_metrics(uuid, timestamptz)
  to authenticated;

comment on function public.get_brand_dashboard_metrics(uuid, timestamptz) is
  'Returns exact RLS-authorized brand dashboard aggregates for a caller-supplied UTC window.';
