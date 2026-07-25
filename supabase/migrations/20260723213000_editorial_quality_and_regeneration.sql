create or replace function private.assert_editorial_evaluation(
  evaluation jsonb,
  target_opportunity_id uuid
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(evaluation) <> 'object'
    or evaluation ->> 'contractVersion' is distinct from '1.0'
    or jsonb_typeof(evaluation -> 'sentenceClaims') <> 'array'
    or jsonb_typeof(evaluation -> 'warnings') <> 'array'
    or jsonb_typeof(evaluation -> 'prohibitedPhrases') <> 'array'
    or jsonb_typeof(evaluation -> 'restrictedTopics') <> 'array'
    or jsonb_typeof(evaluation -> 'cliches') <> 'array'
    or jsonb_typeof(evaluation -> 'readyForReview') <> 'boolean'
    or jsonb_typeof(evaluation -> 'evidenceScore') <> 'number'
    or jsonb_typeof(evaluation -> 'brandFitScore') <> 'number'
    or jsonb_typeof(evaluation -> 'qualityScore') <> 'number'
    or jsonb_typeof(evaluation -> 'sourceSimilarity') <> 'number'
    or jsonb_typeof(evaluation -> 'sameBrandSimilarity') <> 'number'
    or jsonb_typeof(evaluation -> 'crossBrandSimilarity') <> 'number'
    or jsonb_typeof(evaluation -> 'hookReuseSimilarity') <> 'number'
    or (evaluation ->> 'evidenceScore')::numeric not between 0 and 100
    or (evaluation ->> 'brandFitScore')::numeric not between 0 and 100
    or (evaluation ->> 'qualityScore')::numeric not between 0 and 100
    or (evaluation ->> 'sourceSimilarity')::numeric not between 0 and 1
    or (evaluation ->> 'sameBrandSimilarity')::numeric not between 0 and 1
    or (evaluation ->> 'crossBrandSimilarity')::numeric not between 0 and 1
    or (evaluation ->> 'hookReuseSimilarity')::numeric not between 0 and 1
    or jsonb_array_length(evaluation -> 'sentenceClaims') > 100
    or jsonb_array_length(evaluation -> 'warnings') > 50
  then
    raise exception 'Invalid editorial evaluation' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(evaluation -> 'sentenceClaims') mapping
    where jsonb_typeof(mapping.value -> 'claimKeys') <> 'array'
      or coalesce(mapping.value ->> 'state', '') not in (
        'supported',
        'interpretation',
        'unsupported'
      )
  ) or exists (
    select 1
    from jsonb_array_elements(evaluation -> 'sentenceClaims') mapping
    cross join jsonb_array_elements_text(mapping.value -> 'claimKeys') claim_key
    where not exists (
      select 1
      from public.claims
      join public.research_runs on research_runs.id = claims.research_run_id
      where research_runs.opportunity_id = target_opportunity_id
        and research_runs.status = 'succeeded'
        and claims.claim_key = claim_key.value
    )
  )
  then
    raise exception 'Editorial evaluation has invalid claim provenance'
      using errcode = '23514';
  end if;

  if (evaluation ->> 'readyForReview')::boolean and (
    (evaluation ->> 'evidenceScore')::numeric < 70
    or (evaluation ->> 'brandFitScore')::numeric < 65
    or coalesce((evaluation ->> 'unsupportedHighRiskClaims')::integer, 0) <> 0
    or coalesce((evaluation ->> 'contradictions')::integer, 0) <> 0
    or (evaluation ->> 'sourceSimilarity')::numeric >= 0.82
    or (evaluation ->> 'sameBrandSimilarity')::numeric >= 0.82
    or jsonb_array_length(evaluation -> 'prohibitedPhrases') <> 0
    or jsonb_array_length(evaluation -> 'restrictedTopics') <> 0
    or exists (
      select 1
      from jsonb_array_elements(evaluation -> 'sentenceClaims') mapping
      where mapping.value ->> 'state' = 'unsupported'
    )
  )
  then
    raise exception 'Editorial readiness arithmetic is inconsistent'
      using errcode = '23514';
  end if;
end;
$$;

revoke all on function private.assert_editorial_evaluation(jsonb, uuid) from public;

create or replace function private.create_evaluated_draft(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  generation_run_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created record;
  target_opportunity_id uuid := nullif(payload ->> 'opportunityId', '')::uuid;
  latest_research_id uuid;
  selected_angle_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if target_opportunity_id is null
    or jsonb_typeof(payload -> 'angles') <> 'array'
    or jsonb_array_length(payload -> 'angles') <> 3
    or coalesce(payload ->> 'selectedAngleKey', '') !~ '^angle_[a-z0-9]{6,40}$'
    or coalesce((payload ->> 'revisionCount')::integer, -1) not between 0 and 2
    or payload -> 'content' ->> 'fullText' is distinct from concat_ws(
      E'\n\n',
      payload -> 'content' ->> 'hook',
      payload -> 'content' ->> 'body',
      nullif(payload -> 'content' ->> 'closing', '')
    )
    or exists (
      select 1
      from jsonb_array_elements(payload -> 'angles') angle
      group by angle.value ->> 'angleKey'
      having count(*) > 1
    )
    or not exists (
      select 1
      from jsonb_array_elements(payload -> 'angles') angle
      where angle.value ->> 'angleKey' = payload ->> 'selectedAngleKey'
    )
  then
    raise exception 'Invalid evaluated draft payload' using errcode = '22023';
  end if;

  select research_runs.id
  into latest_research_id
  from public.research_runs
  where research_runs.opportunity_id = target_opportunity_id
    and research_runs.status = 'succeeded'
    and research_runs.ready_for_writing
  order by research_runs.completed_at desc nulls last, research_runs.created_at desc
  limit 1;
  if latest_research_id is null then
    raise exception 'Writing-ready research is required' using errcode = '23514';
  end if;

  perform private.assert_editorial_evaluation(
    payload -> 'evaluation',
    target_opportunity_id
  );

  if exists (
    select 1
    from jsonb_array_elements(payload -> 'angles') angle
    cross join jsonb_array_elements_text(
      coalesce(angle.value -> 'supportingClaimKeys', '[]'::jsonb)
    ) claim_key
    where not exists (
      select 1
      from public.claims
      where claims.research_run_id = latest_research_id
        and claims.claim_key = claim_key.value
    )
  )
  then
    raise exception 'Angle references an unknown claim' using errcode = '23514';
  end if;

  select * into created from private.create_mock_draft(payload);
  if not created.duplicate then
    insert into public.angles (
      opportunity_id,
      title,
      thesis,
      content_style,
      intended_reaction,
      supporting_claim_ids,
      score,
      selected
    )
    select
      target_opportunity_id,
      angle.value ->> 'title',
      angle.value ->> 'thesis',
      (angle.value ->> 'contentStyle')::public.content_style,
      angle.value ->> 'intendedReaction',
      array(
        select claims.id
        from jsonb_array_elements_text(
          coalesce(angle.value -> 'supportingClaimKeys', '[]'::jsonb)
        ) claim_key
        join public.claims
          on claims.research_run_id = latest_research_id
         and claims.claim_key = claim_key.value
      ),
      (angle.value ->> 'score')::numeric,
      angle.value ->> 'angleKey' = payload ->> 'selectedAngleKey'
    from jsonb_array_elements(payload -> 'angles') angle;

    select angles.id
    into selected_angle_id
    from public.angles
    where angles.opportunity_id = target_opportunity_id
      and angles.selected
    order by angles.created_at desc
    limit 1;

    update public.post_drafts
    set angle_id = selected_angle_id,
        quality_score = (payload -> 'evaluation' ->> 'qualityScore')::numeric,
        score_breakdown = jsonb_build_object(
          'contractVersion', '1.0',
          'angles', payload -> 'angles',
          'selectedAngleKey', payload ->> 'selectedAngleKey',
          'evaluation', payload -> 'evaluation',
          'revisionCount', (payload ->> 'revisionCount')::integer
        )
    where id = created.post_draft_id;

    insert into public.post_claims (post_version_id, claim_id, sentence_text)
    select distinct
      created.post_version_id,
      claims.id,
      mapping.value ->> 'sentence'
    from jsonb_array_elements(payload -> 'evaluation' -> 'sentenceClaims') mapping
    cross join jsonb_array_elements_text(mapping.value -> 'claimKeys') claim_key
    join public.claims
      on claims.research_run_id = latest_research_id
     and claims.claim_key = claim_key.value;
  end if;

  return query select
    created.post_draft_id,
    created.post_version_id,
    created.generation_run_id,
    created.duplicate;
end;
$$;

create or replace function public.create_evaluated_draft(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  generation_run_id uuid,
  duplicate boolean
)
language sql
set search_path = ''
as $$
  select * from private.create_evaluated_draft(payload);
$$;

create or replace function private.review_evaluated_post(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  status public.post_status,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewed record;
  target_draft_id uuid := nullif(payload ->> 'postDraftId', '')::uuid;
  target_opportunity_id uuid;
  latest_research_id uuid;
  stored_evaluation jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  select post_drafts.opportunity_id, post_drafts.score_breakdown -> 'evaluation'
  into target_opportunity_id, stored_evaluation
  from public.post_drafts
  where post_drafts.id = target_draft_id;
  if target_opportunity_id is null then
    raise exception 'Post draft not found' using errcode = 'P0002';
  end if;

  if payload ->> 'action' = 'approve' then
    perform private.assert_editorial_evaluation(stored_evaluation, target_opportunity_id);
    if not coalesce((stored_evaluation ->> 'readyForReview')::boolean, false) then
      raise exception 'Post has not passed editorial readiness' using errcode = '23514';
    end if;
  elsif payload ->> 'action' = 'edit' then
    perform private.assert_editorial_evaluation(payload -> 'evaluation', target_opportunity_id);
  end if;

  select * into reviewed from private.review_post(payload);

  if payload ->> 'action' = 'edit' and not reviewed.duplicate then
    select research_runs.id
    into latest_research_id
    from public.research_runs
    where research_runs.opportunity_id = target_opportunity_id
      and research_runs.status = 'succeeded'
    order by research_runs.completed_at desc nulls last, research_runs.created_at desc
    limit 1;

    update public.post_drafts
    set quality_score = (payload -> 'evaluation' ->> 'qualityScore')::numeric,
        score_breakdown = score_breakdown || jsonb_build_object(
          'evaluation',
          payload -> 'evaluation'
        )
    where id = reviewed.post_draft_id;

    insert into public.post_claims (post_version_id, claim_id, sentence_text)
    select distinct
      reviewed.post_version_id,
      claims.id,
      mapping.value ->> 'sentence'
    from jsonb_array_elements(payload -> 'evaluation' -> 'sentenceClaims') mapping
    cross join jsonb_array_elements_text(mapping.value -> 'claimKeys') claim_key
    join public.claims
      on claims.research_run_id = latest_research_id
     and claims.claim_key = claim_key.value;
  end if;

  return query select
    reviewed.post_draft_id,
    reviewed.post_version_id,
    reviewed.status,
    reviewed.duplicate;
end;
$$;

create or replace function public.review_evaluated_post(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  status public.post_status,
  duplicate boolean
)
language sql
set search_path = ''
as $$
  select * from private.review_evaluated_post(payload);
$$;

create or replace function private.regenerate_post_component(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  version_number integer,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewed record;
  target_opportunity_id uuid;
  target_organization_id uuid;
  target_brand_id uuid;
  latest_research_id uuid;
  regenerated_version_number integer;
  regeneration_run_id uuid;
  correlation uuid := gen_random_uuid();
  review_payload jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if coalesce(payload ->> 'component', '') not in ('hook', 'body', 'closing')
    or char_length(coalesce(payload ->> 'instruction', '')) not between 3 and 500
  then
    raise exception 'Invalid selective regeneration request' using errcode = '22023';
  end if;

  select
    post_drafts.opportunity_id,
    post_drafts.organization_id,
    post_drafts.brand_id
  into target_opportunity_id, target_organization_id, target_brand_id
  from public.post_drafts
  where post_drafts.id = nullif(payload ->> 'postDraftId', '')::uuid;
  if target_opportunity_id is null then
    raise exception 'Post draft not found' using errcode = 'P0002';
  end if;

  perform private.assert_editorial_evaluation(payload -> 'evaluation', target_opportunity_id);
  review_payload := payload || jsonb_build_object('action', 'edit');
  select * into reviewed from private.review_post(review_payload);

  select post_versions.version_number
  into regenerated_version_number
  from public.post_versions
  where post_versions.id = reviewed.post_version_id;

  if not reviewed.duplicate then
    update public.post_versions
    set generation_type = 'selective_regeneration',
        model = 'deterministic-component-v1',
        prompt_version = 'selective-regeneration.v1'
    where id = reviewed.post_version_id;

    update public.post_drafts
    set quality_score = (payload -> 'evaluation' ->> 'qualityScore')::numeric,
        score_breakdown = score_breakdown || jsonb_build_object(
          'evaluation',
          payload -> 'evaluation'
        )
    where id = reviewed.post_draft_id;

    select research_runs.id
    into latest_research_id
    from public.research_runs
    where research_runs.opportunity_id = target_opportunity_id
      and research_runs.status = 'succeeded'
    order by research_runs.completed_at desc nulls last, research_runs.created_at desc
    limit 1;

    insert into public.post_claims (post_version_id, claim_id, sentence_text)
    select distinct
      reviewed.post_version_id,
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
    ) values (
      target_organization_id,
      target_brand_id,
      'post_regeneration',
      'post_draft',
      reviewed.post_draft_id,
      'app-selective-regeneration',
      correlation,
      payload ->> 'idempotencyKey',
      'succeeded',
      now(),
      now(),
      jsonb_build_object(
        'provider', 'deterministic',
        'component', payload ->> 'component',
        'costUsd', 0
      )
    )
    returning id into regeneration_run_id;

    insert into public.feedback_events (
      organization_id,
      brand_id,
      post_draft_id,
      event_type,
      reason,
      user_id,
      metadata
    ) values (
      target_organization_id,
      target_brand_id,
      reviewed.post_draft_id,
      'selective_regeneration',
      payload ->> 'instruction',
      nullif(payload ->> 'actorId', '')::uuid,
      jsonb_build_object(
        'component', payload ->> 'component',
        'postVersionId', reviewed.post_version_id
      )
    );

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
    ) values (
      target_organization_id,
      target_brand_id,
      regeneration_run_id,
      'post_draft',
      reviewed.post_draft_id,
      'post.selective_regeneration',
      'ready_for_review',
      'ready_for_review',
      correlation,
      nullif(payload ->> 'actorId', '')::uuid,
      jsonb_build_object(
        'component', payload ->> 'component',
        'postVersionId', reviewed.post_version_id
      )
    );
  end if;

  return query select
    reviewed.post_draft_id,
    reviewed.post_version_id,
    regenerated_version_number,
    reviewed.duplicate;
end;
$$;

create or replace function public.regenerate_post_component(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  version_number integer,
  duplicate boolean
)
language sql
set search_path = ''
as $$
  select * from private.regenerate_post_component(payload);
$$;

revoke all on function public.create_evaluated_draft(jsonb) from public, anon, authenticated;
revoke all on function public.review_evaluated_post(jsonb) from public, anon, authenticated;
revoke all on function public.regenerate_post_component(jsonb) from public, anon, authenticated;
grant execute on function public.create_evaluated_draft(jsonb) to service_role;
grant execute on function public.review_evaluated_post(jsonb) to service_role;
grant execute on function public.regenerate_post_component(jsonb) to service_role;
