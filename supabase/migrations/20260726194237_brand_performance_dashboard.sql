-- Brand-scoped operational reporting for Feature 8.4. The function remains
-- SECURITY INVOKER so the existing brand and organization RLS policies are
-- authoritative for every aggregate.

create index if not exists feedback_events_brand_created_idx
  on public.feedback_events (brand_id, created_at desc);

create index if not exists post_drafts_brand_created_idx
  on public.post_drafts (brand_id, created_at desc);

create or replace function public.get_brand_performance_dashboard(
  p_brand_id uuid,
  p_since timestamptz,
  p_until timestamptz default now()
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_feed_health jsonb;
  v_decisions jsonb;
  v_volume jsonb;
begin
  if p_brand_id is null
    or p_since is null
    or p_until is null
    or p_since >= p_until
    or p_until - p_since > interval '366 days'
  then
    raise exception 'Invalid performance dashboard window' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.brands as brand
    where brand.id = p_brand_id
      and brand.status = 'active'
  ) then
    raise exception 'Brand access denied' using errcode = '42501';
  end if;

  with routed_feeds as (
    select
      feed.id,
      feed.name,
      feed.active,
      feed.last_polled_at,
      feed.last_success_at,
      feed.consecutive_failures,
      case
        when not feed.active then 'paused'
        when feed.consecutive_failures > 0 then 'failing'
        when feed.last_polled_at is null then 'never_polled'
        when feed.last_polled_at < p_until - interval '30 minutes' then 'stale'
        else 'healthy'
      end as health_status
    from public.rss_feed_brand_links as route
    join public.rss_feeds as feed
      on feed.id = route.rss_feed_id
      and feed.organization_id = route.organization_id
    where route.brand_id = p_brand_id
  )
  select jsonb_build_object(
    'totalCount', count(*)::integer,
    'activeCount', count(*) filter (where active)::integer,
    'healthyCount', count(*) filter (where health_status = 'healthy')::integer,
    'attentionCount', count(*) filter (
      where health_status in ('failing', 'never_polled', 'stale')
    )::integer,
    'pausedCount', count(*) filter (where health_status = 'paused')::integer,
    'feeds', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'id', id,
          'name', name,
          'active', active,
          'lastPolledAt', last_polled_at,
          'lastSuccessAt', last_success_at,
          'consecutiveFailures', consecutive_failures,
          'status', health_status
        )
        order by
          case health_status
            when 'failing' then 1
            when 'never_polled' then 2
            when 'stale' then 3
            when 'healthy' then 4
            else 5
          end,
          name
      ),
      '[]'::jsonb
    )
  )
  into v_feed_health
  from routed_feeds;

  with decision_events as (
    select event_type, nullif(trim(reason), '') as reason
    from public.feedback_events
    where brand_id = p_brand_id
      and created_at >= p_since
      and created_at < p_until
      and event_type in ('approve', 'reject', 'request_changes')
  ),
  decision_counts as (
    select
      count(*) filter (where event_type = 'approve')::integer as approved_count,
      count(*) filter (where event_type = 'reject')::integer as rejected_count,
      count(*) filter (where event_type = 'request_changes')::integer as changes_requested_count
    from decision_events
  ),
  rejection_reasons as (
    select
      min(reason) as reason,
      count(*)::integer as reason_count
    from decision_events
    where event_type = 'reject'
      and reason is not null
    group by lower(reason)
    order by count(*) desc, min(reason)
    limit 10
  )
  select jsonb_build_object(
    'approvedCount', approved_count,
    'rejectedCount', rejected_count,
    'changesRequestedCount', changes_requested_count,
    'approvalRate', case
      when approved_count + rejected_count = 0 then null
      else round(approved_count * 100.0 / (approved_count + rejected_count), 1)
    end,
    'pendingReviewCount', (
      select count(*)::integer
      from public.post_drafts
      where brand_id = p_brand_id
        and status = 'ready_for_review'
    ),
    'rejectionReasons', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('reason', reason, 'count', reason_count)
          order by reason_count desc, reason
        )
        from rejection_reasons
      ),
      '[]'::jsonb
    )
  )
  into v_decisions
  from decision_counts;

  with drafts as (
    select id, opportunity_id, content_style::text as content_style, status::text
    from public.post_drafts
    where brand_id = p_brand_id
      and created_at >= p_since
      and created_at < p_until
  ),
  styles as (
    select content_style, count(*)::integer as draft_count
    from drafts
    group by content_style
  ),
  successful_runs as (
    select run_type, count(*)::integer as run_count
    from public.generation_runs
    where brand_id = p_brand_id
      and created_at >= p_since
      and created_at < p_until
      and status = 'succeeded'
    group by run_type
  )
  select jsonb_build_object(
    'opportunityCount', (select count(distinct opportunity_id)::integer from drafts),
    'draftCount', (select count(*)::integer from drafts),
    'reviewReadyCount', (
      select count(*)::integer
      from drafts
      where status in ('ready_for_review', 'approved', 'rejected')
    ),
    'imageReadyCount', (
      select count(*)::integer
      from public.image_assets
      where brand_id = p_brand_id
        and created_at >= p_since
        and created_at < p_until
        and status = 'ready'
    ),
    'byStyle', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('style', content_style, 'count', draft_count)
          order by content_style
        )
        from styles
      ),
      '[]'::jsonb
    ),
    'successfulRunsByType', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('runType', run_type, 'count', run_count)
          order by run_type
        )
        from successful_runs
      ),
      '[]'::jsonb
    )
  )
  into v_volume;

  return jsonb_build_object(
    'brandId', p_brand_id,
    'since', p_since,
    'until', p_until,
    'feedHealth', v_feed_health,
    'decisions', v_decisions,
    'generationVolume', v_volume
  );
end;
$$;

revoke all on function public.get_brand_performance_dashboard(
  uuid,
  timestamptz,
  timestamptz
) from public, anon;
grant execute on function public.get_brand_performance_dashboard(
  uuid,
  timestamptz,
  timestamptz
) to authenticated;

comment on function public.get_brand_performance_dashboard(
  uuid,
  timestamptz,
  timestamptz
) is
  'Returns an RLS-authorized brand dashboard for feed health, review outcomes, and generation volume.';
