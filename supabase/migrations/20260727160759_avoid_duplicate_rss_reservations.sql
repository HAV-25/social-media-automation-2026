-- A brand-policy edit or UTC rollover may create a fresh idempotency identity
-- for an eligible opportunity. Only an opportunity that has never been
-- reserved may consume another daily slot; downstream recovery owns retries.
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
  existing_run_id uuid;
  used_count integer;
  eligibility_reason text;
  idempotency_record private.idempotency_keys%rowtype;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select profile.*
  into profile_record
  from public.brand_profiles as profile
  where profile.brand_id = (payload ->> 'brandId')::uuid
  for update of profile;

  if not found then
    return query select false, 'inactive'::text, null::uuid, 0, 0, false;
    return;
  end if;

  select link.*
  into link_record
  from public.rss_feed_brand_links as link
  join public.rss_feeds as feed
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

  select reservation.id
  into existing_run_id
  from public.generation_runs as reservation
  where reservation.organization_id = link_record.organization_id
    and reservation.brand_id = link_record.brand_id
    and reservation.entity_id = (payload ->> 'opportunityId')::uuid
    and reservation.run_type = 'rss_opportunity_reservation'
    and reservation.workflow_name = 'WF-04 Cluster and Score'
    and reservation.status = 'succeeded'
  order by reservation.created_at, reservation.id
  limit 1;

  select count(distinct reservation.entity_id)::integer
  into used_count
  from public.generation_runs as reservation
  where reservation.organization_id = link_record.organization_id
    and reservation.brand_id = link_record.brand_id
    and reservation.run_type = 'rss_opportunity_reservation'
    and reservation.workflow_name = 'WF-04 Cluster and Score'
    and reservation.status = 'succeeded'
    and reservation.created_at >= (
      date_trunc('day', now() at time zone 'UTC') at time zone 'UTC'
    );

  eligibility_reason := case
    when existing_run_id is not null then 'already_prepared'
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
      completed_at,
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
      'succeeded',
      now(),
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
  else
    run_id := existing_run_id;
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
    eligibility_reason = 'already_prepared';
end;
$$;

revoke all on function private.reserve_rss_generation(jsonb)
  from public, anon, authenticated;
grant execute on function private.reserve_rss_generation(jsonb)
  to service_role;

revoke all on function public.reserve_rss_generation(jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_rss_generation(jsonb)
  to service_role;
