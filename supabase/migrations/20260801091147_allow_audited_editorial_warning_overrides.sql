-- UAT policy: completed research and deterministic verification findings remain
-- visible, but they do not prevent draft or image preparation. Human approval
-- of a warning-bearing post requires a reason and a durable acknowledgement.

do $$
declare
  function_definition text;
  updated_definition text;
begin
  select pg_get_functiondef('private.create_evaluated_draft(jsonb)'::regprocedure)
  into function_definition;

  updated_definition := regexp_replace(
    function_definition,
    E'\\n[[:space:]]*and research_runs\\.ready_for_writing',
    '',
    'g'
  );

  if updated_definition = function_definition
    or position('research_runs.ready_for_writing' in updated_definition) > 0
  then
    raise exception 'Expected editorial research gate was not replaced';
  end if;

  execute updated_definition;
end;
$$;

do $$
declare
  function_definition text;
  updated_definition text;
begin
  select pg_get_functiondef('private.persist_research_evidence(jsonb)'::regprocedure)
  into function_definition;

  updated_definition := regexp_replace(
    function_definition,
    E'case[[:space:]]+when is_ready then ''ready_to_generate''::public\\.opportunity_status[[:space:]]+else ''research_pending''::public\\.opportunity_status[[:space:]]+end',
    '''ready_to_generate''::public.opportunity_status',
    'g'
  );
  updated_definition := regexp_replace(
    updated_definition,
    E'case[[:space:]]+when is_ready then ''ready_to_generate''[[:space:]]+else ''research_pending''[[:space:]]+end',
    '''ready_to_generate''',
    'g'
  );

  if updated_definition = function_definition
    or position('else ''research_pending''::public.opportunity_status' in updated_definition) > 0
    or position('else ''research_pending'' end' in updated_definition) > 0
  then
    raise exception 'Expected research preparation gates were not replaced';
  end if;

  execute updated_definition;
end;
$$;

do $$
declare
  function_definition text;
  updated_definition text;
begin
  select pg_get_functiondef('private.persist_image_asset(jsonb)'::regprocedure)
  into function_definition;

  updated_definition := regexp_replace(
    function_definition,
    E'(?s)if current_post_status <> ''ready_for_review''.*?raise exception ''Post has not passed editorial readiness''[[:space:]]+using errcode = ''23514'';[[:space:]]+end if;',
    E'if current_post_status <> ''ready_for_review'' then\n    raise exception ''Post has not completed editorial verification''\n      using errcode = ''23514'';\n  end if;',
    'g'
  );

  if updated_definition = function_definition
    or position('Post has not passed editorial readiness' in updated_definition) > 0
    or position('score_breakdown -> ''evaluation'' ->> ''readyForReview''' in updated_definition) > 0
  then
    raise exception 'Expected image editorial gate was not replaced';
  end if;

  execute updated_definition;
end;
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
  target_organization_id uuid;
  target_brand_id uuid;
  actor_id uuid := nullif(payload ->> 'actorId', '')::uuid;
  latest_research_id uuid;
  stored_evaluation jsonb;
  stored_warning_snapshot jsonb;
  warning_approval boolean := false;
begin
  if coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select
    post_drafts.opportunity_id,
    post_drafts.organization_id,
    post_drafts.brand_id,
    post_drafts.score_breakdown -> 'evaluation'
  into
    target_opportunity_id,
    target_organization_id,
    target_brand_id,
    stored_evaluation
  from public.post_drafts
  where post_drafts.id = target_draft_id;

  if target_opportunity_id is null then
    raise exception 'Post draft not found' using errcode = 'P0002';
  end if;

  if payload ->> 'action' = 'approve' then
    perform private.assert_editorial_evaluation(stored_evaluation, target_opportunity_id);
    warning_approval := not coalesce(
      (stored_evaluation ->> 'readyForReview')::boolean,
      false
    );

    if warning_approval then
      stored_warning_snapshot := jsonb_build_object(
        'readyForReview', false,
        'warnings', stored_evaluation -> 'warnings',
        'evidenceScore', (stored_evaluation ->> 'evidenceScore')::numeric,
        'brandFitScore', (stored_evaluation ->> 'brandFitScore')::numeric,
        'unsupportedHighRiskClaims',
          (stored_evaluation ->> 'unsupportedHighRiskClaims')::integer,
        'contradictions', (stored_evaluation ->> 'contradictions')::integer,
        'prohibitedPhrases', stored_evaluation -> 'prohibitedPhrases',
        'restrictedTopics', stored_evaluation -> 'restrictedTopics',
        'sourceSimilarity', (stored_evaluation ->> 'sourceSimilarity')::numeric,
        'sameBrandSimilarity', (stored_evaluation ->> 'sameBrandSimilarity')::numeric
      );

      if coalesce((payload ->> 'warningsAcknowledged')::boolean, false) is not true
        or char_length(coalesce(payload ->> 'reason', '')) not between 10 and 2000
        or jsonb_typeof(payload -> 'warningSnapshot') <> 'object'
      then
        raise exception 'Warning approval requires acknowledgement and reason'
          using errcode = '22023';
      end if;
      if payload -> 'warningSnapshot' is distinct from stored_warning_snapshot then
        raise exception 'Editorial warning snapshot is stale' using errcode = '40001';
      end if;
    end if;
  elsif payload ->> 'action' = 'edit' then
    perform private.assert_editorial_evaluation(payload -> 'evaluation', target_opportunity_id);
  end if;

  select * into reviewed from private.review_post(payload);

  if warning_approval and not reviewed.duplicate then
    insert into public.feedback_events (
      organization_id,
      brand_id,
      post_draft_id,
      event_type,
      reason,
      user_id,
      metadata
    )
    values (
      target_organization_id,
      target_brand_id,
      reviewed.post_draft_id,
      'approval_warning_acknowledged',
      payload ->> 'reason',
      actor_id,
      jsonb_build_object(
        'postVersionId', reviewed.post_version_id,
        'warningSnapshot', stored_warning_snapshot
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
      'post.approval_warning_acknowledged',
      'post_draft',
      reviewed.post_draft_id,
      jsonb_build_object(
        'postVersionId', reviewed.post_version_id,
        'reason', payload ->> 'reason',
        'warningSnapshot', stored_warning_snapshot
      )
    );
  end if;

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

revoke all on function private.review_evaluated_post(jsonb)
  from public, anon, authenticated;
grant execute on function private.review_evaluated_post(jsonb) to service_role;

comment on function private.review_evaluated_post(jsonb) is
  'Persists review decisions. Warning-bearing approvals require an exact warning snapshot, explicit acknowledgement, and a reviewer reason.';
