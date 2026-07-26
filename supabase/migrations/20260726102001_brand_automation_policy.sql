alter table public.brand_profiles
  add column automatic_opportunity_selection boolean not null default true,
  add column minimum_opportunity_score numeric(5,2) not null default 72
    check (minimum_opportunity_score between 60 and 100),
  add column daily_draft_limit integer not null default 3
    check (daily_draft_limit between 0 and 20);

comment on column public.brand_profiles.automatic_opportunity_selection is
  'Whether qualifying feed opportunities may enter the brand-wide automatic preparation queue.';
comment on column public.brand_profiles.minimum_opportunity_score is
  'Brand-wide minimum deterministic opportunity score for automatic selection.';
comment on column public.brand_profiles.daily_draft_limit is
  'Maximum opportunities selected across all feeds for this brand per UTC day.';

create or replace function private.reserve_rss_generation(payload jsonb)
returns table (
  eligible boolean,
  reason text,
  generation_run_id uuid,
  used_today integer,
  daily_limit integer,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_record public.brand_profiles%rowtype;
  link_record public.rss_feed_brand_links%rowtype;
  run_id uuid;
  used_count integer;
  eligibility_reason text;
  idempotency_record private.idempotency_keys%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  -- This row is the shared brand-wide quota lock. Different feeds routed to
  -- the same brand therefore cannot reserve beyond the daily cap concurrently.
  select profile.*
  into profile_record
  from public.brand_profiles profile
  where profile.brand_id = (payload ->> 'brandId')::uuid
  for update of profile;

  if not found then
    return query select false, 'inactive'::text, null::uuid, 0, 0, false;
    return;
  end if;

  select link.*
  into link_record
  from public.rss_feed_brand_links link
  join public.rss_feeds feed
    on feed.id = link.rss_feed_id
   and feed.organization_id = link.organization_id
  where link.rss_feed_id = (payload ->> 'feedId')::uuid
    and link.brand_id = profile_record.brand_id
    and feed.active
  for update of link;

  if not found then
    return query select false, 'inactive'::text, null::uuid, 0, 0, false;
    return;
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = link_record.organization_id
    and scope = 'rss_generation_reservation'
    and idempotency_key = payload ->> 'idempotencyKey';

  if found then
    if idempotency_record.request_hash <> payload ->> 'requestHash' then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'eligible')::boolean,
        idempotency_record.response_body ->> 'reason',
        nullif(idempotency_record.response_body ->> 'generationRunId', '')::uuid,
        (idempotency_record.response_body ->> 'usedToday')::integer,
        (idempotency_record.response_body ->> 'dailyLimit')::integer,
        true;
      return;
    end if;
  else
    insert into private.idempotency_keys (
      organization_id,
      scope,
      idempotency_key,
      request_hash,
      expires_at
    )
    values (
      link_record.organization_id,
      'rss_generation_reservation',
      payload ->> 'idempotencyKey',
      payload ->> 'requestHash',
      now() + interval '48 hours'
    );
  end if;

  select count(*)::integer
  into used_count
  from public.generation_runs run
  where run.organization_id = link_record.organization_id
    and run.brand_id = link_record.brand_id
    and run.run_type = 'rss_opportunity_reservation'
    and run.workflow_name = 'WF-04 Cluster and Score'
    and run.created_at >= (
      date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    );

  eligibility_reason := case
    when link_record.generation_policy = 'ingest_only'
      or not profile_record.automatic_opportunity_selection then 'ingest_only'
    when (payload ->> 'opportunityScore')::numeric
      < profile_record.minimum_opportunity_score then 'below_threshold'
    when used_count >= profile_record.daily_draft_limit then 'daily_limit'
    else 'reserved'
  end;

  if eligibility_reason = 'reserved' then
    insert into public.generation_runs (
      organization_id,
      brand_id,
      run_type,
      entity_type,
      entity_id,
      workflow_name,
      correlation_id,
      idempotency_key,
      status,
      model_usage
    )
    values (
      link_record.organization_id,
      link_record.brand_id,
      'rss_opportunity_reservation',
      'opportunity',
      (payload ->> 'opportunityId')::uuid,
      'WF-04 Cluster and Score',
      (payload ->> 'correlationId')::uuid,
      payload ->> 'idempotencyKey',
      'queued',
      jsonb_build_object(
        'rssFeedId', link_record.rss_feed_id,
        'sourceDocumentId', payload ->> 'sourceDocumentId',
        'opportunityScore', (payload ->> 'opportunityScore')::numeric,
        'minimumOpportunityScore', profile_record.minimum_opportunity_score,
        'selectionPolicy', 'brand_wide'
      )
    )
    returning id into run_id;
    used_count := used_count + 1;
  end if;

  update private.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'eligible', eligibility_reason = 'reserved',
        'reason', eligibility_reason,
        'generationRunId', run_id,
        'usedToday', used_count,
        'dailyLimit', profile_record.daily_draft_limit
      )
  where organization_id = link_record.organization_id
    and scope = 'rss_generation_reservation'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select
    eligibility_reason = 'reserved',
    eligibility_reason,
    run_id,
    used_count,
    profile_record.daily_draft_limit,
    false;
end;
$$;
