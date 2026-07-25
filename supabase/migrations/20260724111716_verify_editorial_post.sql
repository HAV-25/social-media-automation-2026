create or replace function private.verify_evaluated_post(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := nullif(payload ->> 'actorId', '')::uuid;
  target_draft_id uuid := nullif(payload ->> 'postDraftId', '')::uuid;
  expected_version_id uuid := nullif(payload ->> 'expectedVersionId', '')::uuid;
  target_organization_id uuid;
  target_brand_id uuid;
  target_opportunity_id uuid;
  current_version_id uuid;
  current_status public.post_status;
  latest_research_id uuid;
  run_id uuid;
  request_correlation_id uuid := nullif(payload ->> 'correlationId', '')::uuid;
  idempotency_record private.idempotency_keys%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if actor_id is null
    or target_draft_id is null
    or expected_version_id is null
    or request_correlation_id is null
    or char_length(coalesce(payload ->> 'idempotencyKey', '')) not between 16 and 200
    or char_length(coalesce(payload ->> 'requestHash', '')) <> 64
  then
    raise exception 'Invalid post verification payload' using errcode = '22023';
  end if;

  select
    post_drafts.organization_id,
    post_drafts.brand_id,
    post_drafts.opportunity_id,
    post_drafts.current_version_id,
    post_drafts.status
  into
    target_organization_id,
    target_brand_id,
    target_opportunity_id,
    current_version_id,
    current_status
  from public.post_drafts
  where post_drafts.id = target_draft_id
  for update;

  if target_organization_id is null
    or target_brand_id is distinct from nullif(payload ->> 'brandId', '')::uuid
  then
    raise exception 'Post draft not found' using errcode = 'P0002';
  end if;
  if current_version_id is distinct from expected_version_id then
    raise exception 'Post version changed' using errcode = '40001';
  end if;
  if current_status in ('approved', 'rejected') then
    raise exception 'Terminal posts cannot be reverified' using errcode = '23514';
  end if;
  if not exists (
    select 1
    from public.organization_members organization_member
    left join public.brand_members brand_member
      on brand_member.brand_id = target_brand_id
     and brand_member.user_id = actor_id
    where organization_member.organization_id = target_organization_id
      and organization_member.user_id = actor_id
      and (
        organization_member.role = 'administrator'
        or brand_member.role in ('administrator', 'editor')
      )
  )
  then
    raise exception 'Brand editor permission required' using errcode = '42501';
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = target_organization_id
    and scope = 'post_verification'
    and idempotency_key = payload ->> 'idempotencyKey';

  if found then
    if idempotency_record.request_hash <> payload ->> 'requestHash' then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'postDraftId')::uuid,
        (idempotency_record.response_body ->> 'postVersionId')::uuid,
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
      target_organization_id,
      'post_verification',
      payload ->> 'idempotencyKey',
      payload ->> 'requestHash',
      now() + interval '24 hours'
    );
  end if;

  perform private.assert_editorial_evaluation(
    payload -> 'evaluation',
    target_opportunity_id
  );

  select research_runs.id
  into latest_research_id
  from public.research_runs
  where research_runs.opportunity_id = target_opportunity_id
    and research_runs.status = 'succeeded'
  order by research_runs.completed_at desc nulls last, research_runs.created_at desc
  limit 1;
  if latest_research_id is null then
    raise exception 'Research evidence is required' using errcode = '23514';
  end if;

  update public.post_drafts
  set quality_score = (payload -> 'evaluation' ->> 'qualityScore')::numeric,
      score_breakdown = score_breakdown || jsonb_build_object(
        'evaluation',
        payload -> 'evaluation'
      )
  where id = target_draft_id;

  delete from public.post_claims
  where post_claims.post_version_id = current_version_id;

  insert into public.post_claims (post_version_id, claim_id, sentence_text)
  select distinct
    current_version_id,
    claims.id,
    mapping.value ->> 'sentence'
  from jsonb_array_elements(payload -> 'evaluation' -> 'sentenceClaims') mapping
  cross join jsonb_array_elements_text(mapping.value -> 'claimKeys') claim_key
  join public.claims
    on claims.research_run_id = latest_research_id
   and claims.claim_key = claim_key.value;

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
    started_at,
    completed_at,
    model_usage
  )
  values (
    target_organization_id,
    target_brand_id,
    'post_verification',
    'post_draft',
    target_draft_id,
    'WF-07 Post Verification',
    request_correlation_id,
    payload ->> 'idempotencyKey',
    'succeeded',
    now(),
    now(),
    jsonb_build_object(
      'provider', 'deterministic',
      'costUsd', 0,
      'evaluation', payload -> 'evaluation'
    )
  )
  returning id into run_id;

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
  values (
    target_organization_id,
    target_brand_id,
    run_id,
    'post_draft',
    target_draft_id,
    'post.verified',
    current_status::text,
    current_status::text,
    request_correlation_id,
    actor_id,
    jsonb_build_object(
      'postVersionId', current_version_id,
      'readyForReview', (payload -> 'evaluation' ->> 'readyForReview')::boolean
    )
  );

  insert into public.audit_logs (
    organization_id,
    brand_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    target_brand_id,
    actor_id,
    'post.verified',
    'post_draft',
    target_draft_id,
    jsonb_build_object(
      'postVersionId', current_version_id,
      'generationRunId', run_id,
      'readyForReview', (payload -> 'evaluation' ->> 'readyForReview')::boolean
    )
  );

  update private.idempotency_keys
  set response_status = 201,
      response_body = jsonb_build_object(
        'postDraftId', target_draft_id,
        'postVersionId', current_version_id
      )
  where organization_id = target_organization_id
    and scope = 'post_verification'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select target_draft_id, current_version_id, false;
end;
$$;

create or replace function public.verify_evaluated_post(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  duplicate boolean
)
language sql
set search_path = ''
as $$
  select * from private.verify_evaluated_post(payload);
$$;

revoke all on function private.verify_evaluated_post(jsonb) from public;
revoke all on function public.verify_evaluated_post(jsonb)
  from public, anon, authenticated;
grant execute on function public.verify_evaluated_post(jsonb) to service_role;
