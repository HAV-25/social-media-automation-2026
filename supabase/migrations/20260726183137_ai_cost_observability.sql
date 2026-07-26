-- Normalize historical research provenance and expose an RLS-respecting,
-- brand-scoped cost summary. The function is SECURITY INVOKER so the
-- generation_runs and related-table policies remain authoritative.

update public.generation_runs as run
set model_usage = run.model_usage || jsonb_strip_nulls(
  jsonb_build_object(
    'model', research.model,
    'promptVersion', research.prompt_version,
    'responseId', research.provider_response_id
  )
)
from public.research_runs as research
where research.generation_run_id = run.id
  and run.run_type = 'research'
  and (
    not run.model_usage ? 'model'
    or not run.model_usage ? 'promptVersion'
    or not run.model_usage ? 'responseId'
  );

create or replace function public.get_brand_ai_cost_observability(
  p_brand_id uuid,
  p_since timestamptz default null
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  result jsonb;
begin
  if not public.can_read_brand(p_brand_id) then
    raise exception 'Brand access denied' using errcode = '42501';
  end if;

  with normalized_runs as (
    select
      run.id,
      run.run_type,
      run.entity_type,
      run.entity_id,
      run.status,
      run.created_at,
      coalesce(
        nullif(run.model_usage ->> 'model', ''),
        nullif(research.model, ''),
        nullif(image.model, ''),
        case
          when run.run_type in (
            'post_verification',
            'rss_analysis',
            'rss_opportunity_reservation',
            'source_extraction'
          ) then 'Deterministic / none'
          else null
        end
      ) as model,
      greatest(
        0::numeric,
        case
          when jsonb_typeof(run.model_usage -> 'costUsd') = 'number'
            then (run.model_usage ->> 'costUsd')::numeric
          when jsonb_typeof(run.model_usage -> 'estimatedCostUsd') = 'number'
            then (run.model_usage ->> 'estimatedCostUsd')::numeric
          when jsonb_typeof(run.model_usage #> '{usage,estimatedCostUsd}') = 'number'
            then (run.model_usage #>> '{usage,estimatedCostUsd}')::numeric
          when jsonb_typeof(run.model_usage -> 'reservedCostUsd') = 'number'
            then (run.model_usage ->> 'reservedCostUsd')::numeric
          else 0::numeric
        end
      ) as cost_usd,
      greatest(
        0,
        coalesce(
          case
            when jsonb_typeof(run.model_usage #> '{usage,inputTokens}') = 'number'
              then (run.model_usage #>> '{usage,inputTokens}')::integer
          end,
          case
            when jsonb_typeof(run.model_usage -> 'inputTokens') = 'number'
              then (run.model_usage ->> 'inputTokens')::integer
          end,
          0
        )
      ) as input_tokens,
      greatest(
        0,
        coalesce(
          case
            when jsonb_typeof(run.model_usage #> '{usage,outputTokens}') = 'number'
              then (run.model_usage #>> '{usage,outputTokens}')::integer
          end,
          case
            when jsonb_typeof(run.model_usage -> 'outputTokens') = 'number'
              then (run.model_usage ->> 'outputTokens')::integer
          end,
          0
        )
      ) as output_tokens,
      greatest(
        0,
        coalesce(
          case
            when jsonb_typeof(run.model_usage #> '{usage,webSearchCalls}') = 'number'
              then (run.model_usage #>> '{usage,webSearchCalls}')::integer
          end,
          case
            when jsonb_typeof(run.model_usage -> 'webSearchCalls') = 'number'
              then (run.model_usage ->> 'webSearchCalls')::integer
          end,
          0
        )
      ) as web_search_calls,
      coalesce(
        direct_opportunity.id,
        draft_opportunity.id,
        image_opportunity.id
      ) as opportunity_id,
      coalesce(
        direct_source.source_type::text,
        opportunity_source.source_type::text,
        draft_source.source_type::text,
        image_source.source_type::text,
        'unattributed'
      ) as source_type,
      coalesce(
        opportunity_source.title,
        draft_source.title,
        image_source.title,
        direct_source.title,
        'Untitled content package'
      ) as source_title
    from public.generation_runs as run
    left join public.research_runs as research
      on research.generation_run_id = run.id
    left join public.image_assets as image
      on run.entity_type = 'image_asset'
      and image.id = run.entity_id
    left join public.opportunities as direct_opportunity
      on run.entity_type = 'opportunity'
      and direct_opportunity.id = run.entity_id
    left join public.post_drafts as direct_draft
      on run.entity_type = 'post_draft'
      and direct_draft.id = run.entity_id
    left join public.opportunities as draft_opportunity
      on draft_opportunity.id = direct_draft.opportunity_id
    left join public.post_drafts as image_draft
      on image_draft.id = image.post_draft_id
    left join public.opportunities as image_opportunity
      on image_opportunity.id = image_draft.opportunity_id
    left join public.source_documents as direct_source
      on run.entity_type = 'source_document'
      and direct_source.id = run.entity_id
    left join public.source_documents as opportunity_source
      on opportunity_source.id = direct_opportunity.source_document_id
    left join public.source_documents as draft_source
      on draft_source.id = draft_opportunity.source_document_id
    left join public.source_documents as image_source
      on image_source.id = image_opportunity.source_document_id
    where run.brand_id = p_brand_id
      and (p_since is null or run.created_at >= p_since)
  ),
  ai_runs as (
    select *
    from normalized_runs
    where model is not null
      or cost_usd > 0
      or run_type in (
        'research',
        'post_generation',
        'editorial_generation',
        'post_regeneration',
        'image_generation'
      )
  ),
  stage_breakdown as (
    select
      run_type as key,
      count(*)::integer as run_count,
      count(*) filter (where cost_usd > 0)::integer as paid_run_count,
      coalesce(sum(cost_usd), 0::numeric) as cost_usd,
      coalesce(sum(input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(output_tokens), 0)::bigint as output_tokens,
      coalesce(sum(web_search_calls), 0)::bigint as web_search_calls
    from ai_runs
    group by run_type
  ),
  model_breakdown as (
    select
      coalesce(model, 'Unrecorded model') as key,
      count(*)::integer as run_count,
      count(*) filter (where cost_usd > 0)::integer as paid_run_count,
      coalesce(sum(cost_usd), 0::numeric) as cost_usd,
      coalesce(sum(input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(output_tokens), 0)::bigint as output_tokens
    from ai_runs
    group by coalesce(model, 'Unrecorded model')
  ),
  source_breakdown as (
    select
      source_type as key,
      count(*)::integer as run_count,
      count(*) filter (where cost_usd > 0)::integer as paid_run_count,
      coalesce(sum(cost_usd), 0::numeric) as cost_usd
    from ai_runs
    group by source_type
  ),
  package_breakdown as (
    select
      run.opportunity_id,
      max(run.source_title) as source_title,
      max(run.source_type) as source_type,
      count(*)::integer as run_count,
      count(*) filter (where run.cost_usd > 0)::integer as paid_run_count,
      coalesce(sum(run.cost_usd), 0::numeric) as cost_usd,
      coalesce(sum(run.input_tokens), 0)::bigint as input_tokens,
      coalesce(sum(run.output_tokens), 0)::bigint as output_tokens,
      (
        select count(*)::integer
        from public.post_drafts as draft
        where draft.opportunity_id = run.opportunity_id
      ) as draft_count,
      (
        select count(*)::integer
        from public.post_drafts as draft
        where draft.opportunity_id = run.opportunity_id
          and draft.status in ('ready_for_review', 'approved')
      ) as review_ready_count,
      (
        select count(*)::integer
        from public.post_drafts as draft
        where draft.opportunity_id = run.opportunity_id
          and draft.status = 'approved'
      ) as approved_count
    from ai_runs as run
    where run.opportunity_id is not null
    group by run.opportunity_id
  )
  select jsonb_build_object(
    'brandId', p_brand_id,
    'windowStart', p_since,
    'totalCostUsd', coalesce((select sum(cost_usd) from ai_runs), 0::numeric),
    'aiRunCount', (select count(*) from ai_runs),
    'paidRunCount', (select count(*) from ai_runs where cost_usd > 0),
    'inputTokens', coalesce((select sum(input_tokens) from ai_runs), 0),
    'outputTokens', coalesce((select sum(output_tokens) from ai_runs), 0),
    'webSearchCalls', coalesce((select sum(web_search_calls) from ai_runs), 0),
    'generatedImages', (
      select count(*)
      from ai_runs
      where run_type = 'image_generation'
        and status = 'succeeded'
        and model is not null
    ),
    'byStage', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', key,
          'runCount', run_count,
          'paidRunCount', paid_run_count,
          'costUsd', cost_usd,
          'inputTokens', input_tokens,
          'outputTokens', output_tokens,
          'webSearchCalls', web_search_calls
        )
        order by cost_usd desc, key
      )
      from stage_breakdown
    ), '[]'::jsonb),
    'byModel', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', key,
          'runCount', run_count,
          'paidRunCount', paid_run_count,
          'costUsd', cost_usd,
          'inputTokens', input_tokens,
          'outputTokens', output_tokens
        )
        order by cost_usd desc, key
      )
      from model_breakdown
    ), '[]'::jsonb),
    'bySourceType', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'key', key,
          'runCount', run_count,
          'paidRunCount', paid_run_count,
          'costUsd', cost_usd
        )
        order by cost_usd desc, key
      )
      from source_breakdown
    ), '[]'::jsonb),
    'byPackage', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'opportunityId', opportunity_id,
          'sourceTitle', source_title,
          'sourceType', source_type,
          'runCount', run_count,
          'paidRunCount', paid_run_count,
          'costUsd', cost_usd,
          'inputTokens', input_tokens,
          'outputTokens', output_tokens,
          'draftCount', draft_count,
          'reviewReadyCount', review_ready_count,
          'approvedCount', approved_count
        )
        order by cost_usd desc, source_title
      )
      from package_breakdown
    ), '[]'::jsonb)
  )
  into result;

  return result;
end;
$$;

revoke all on function public.get_brand_ai_cost_observability(uuid, timestamptz)
  from public, anon;
grant execute on function public.get_brand_ai_cost_observability(uuid, timestamptz)
  to authenticated;
