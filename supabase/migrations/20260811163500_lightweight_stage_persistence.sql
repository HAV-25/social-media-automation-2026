-- Atomic persistence for the lightweight Supabase workers. The public wrapper is
-- SECURITY INVOKER so opaque sb_secret keys are authorized from the actual
-- PostgREST database role before the private definer can write durable outputs.

create table public.content_packages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  pipeline_id uuid not null,
  opportunity_id uuid not null,
  manifest jsonb not null,
  storage_path text,
  checksum text not null check (checksum ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  unique (pipeline_id),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade,
  foreign key (pipeline_id, brand_id, organization_id)
    references public.pipeline_instances(id, brand_id, organization_id) on delete cascade,
  foreign key (opportunity_id, brand_id, organization_id)
    references public.opportunities(id, brand_id, organization_id) on delete cascade
);

create index content_packages_brand_created_idx
  on public.content_packages (brand_id, created_at desc);
alter table public.content_packages enable row level security;
create policy content_packages_select on public.content_packages for select
  using ((select public.can_read_brand(brand_id)));
revoke all on public.content_packages from public, anon, authenticated;
grant select on public.content_packages to authenticated;

create table private.pipeline_stage_outputs (
  job_id uuid primary key references public.pipeline_jobs(id) on delete cascade,
  stage public.pipeline_stage not null,
  output_hash text not null check (output_hash ~ '^[0-9a-f]{64}$'),
  persistence_result jsonb not null,
  created_at timestamptz not null default now()
);
revoke all on private.pipeline_stage_outputs from public, anon, authenticated;

create or replace function private.persist_lightweight_stage_output(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_job public.pipeline_jobs%rowtype;
  target_pipeline public.pipeline_instances%rowtype;
  stage_value public.pipeline_stage := (payload ->> 'stage')::public.pipeline_stage;
  actor_value uuid := nullif(payload ->> 'actorId', '')::uuid;
  research_run_id_value uuid;
  generation_run_id_value uuid;
  draft_value jsonb;
  draft_id_value uuid;
  version_id_value uuid;
  angle_value jsonb;
  evaluation_value jsonb;
  sentence_claim_value jsonb;
  claim_id_value uuid;
  selected_angle_id_value uuid;
  next_version_number integer;
  image_value jsonb;
  image_id_value uuid;
  package_id_value uuid;
  affected_count integer;
  output_value jsonb := payload -> 'output';
  output_hash_value text;
  cost_value numeric := coalesce((payload ->> 'costUsd')::numeric, 0);
  next_stage_value public.pipeline_stage := nullif(payload ->> 'nextStage', '')::public.pipeline_stage;
  result jsonb := '{}'::jsonb;
begin
  select * into target_job
  from public.pipeline_jobs
  where id = (payload ->> 'jobId')::uuid
    and state = 'leased'
    and worker_id = payload ->> 'workerId'
    and lease_expires_at > now()
  for update;
  if target_job.id is null then
    raise exception 'Active stage job lease not found' using errcode = 'P0002';
  end if;
  select * into target_pipeline
  from public.pipeline_instances
  where id = target_job.pipeline_id
  for update;
  if target_pipeline.id is null
     or target_pipeline.opportunity_id is null
     or actor_value is null
     or target_job.pipeline_id is distinct from nullif(payload ->> 'pipelineId', '')::uuid
     or target_job.stage is distinct from stage_value
     or target_job.organization_id is distinct from target_pipeline.organization_id
     or target_job.brand_id is distinct from target_pipeline.brand_id
     or target_pipeline.current_stage is distinct from stage_value
     or jsonb_typeof(output_value) is distinct from 'object'
     or pg_catalog.octet_length(output_value::text) > 2097152
     or jsonb_typeof(coalesce(payload -> 'usage', '{}'::jsonb)) is distinct from 'object'
     or cost_value not between 0 and 100
  then
    raise exception 'Invalid lightweight stage output' using errcode = '22023';
  end if;
  if next_stage_value is distinct from case stage_value
       when 'research' then 'draft'::public.pipeline_stage
       when 'draft' then 'verify'::public.pipeline_stage
       when 'verify' then 'image'::public.pipeline_stage
       when 'image' then 'package'::public.pipeline_stage
       else null::public.pipeline_stage
     end
  then
    raise exception 'Invalid lightweight stage transition' using errcode = '23514';
  end if;
  output_hash_value := encode(extensions.digest(convert_to(output_value::text, 'utf8'), 'sha256'), 'hex');

  if stage_value = 'research' and (
       jsonb_typeof(output_value -> 'plan') is distinct from 'object'
       or jsonb_typeof(output_value -> 'evidencePackage') is distinct from 'object'
       or jsonb_typeof(output_value -> 'evidencePackage' -> 'sources') is distinct from 'array'
       or jsonb_typeof(output_value -> 'evidencePackage' -> 'claims') is distinct from 'array'
       or jsonb_array_length(output_value -> 'evidencePackage' -> 'sources') < 1
       or jsonb_array_length(output_value -> 'evidencePackage' -> 'claims') < 1
       or output_value -> 'evidencePackage' ->> 'readyForWriting' is distinct from 'true'
     ) then
    raise exception 'Research output is incomplete' using errcode = '23514';
  elsif stage_value = 'draft' and (
       jsonb_typeof(output_value -> 'drafts') is distinct from 'array'
       or jsonb_array_length(output_value -> 'drafts') not between 1 and 3
     ) then
    raise exception 'Draft output is incomplete' using errcode = '23514';
  elsif stage_value = 'verify' and (
       jsonb_typeof(output_value -> 'evaluations') is distinct from 'array'
       or jsonb_array_length(output_value -> 'evaluations') < 1
     ) then
    raise exception 'Verification output is incomplete' using errcode = '23514';
  elsif stage_value = 'image' and (
       jsonb_typeof(output_value -> 'images') is distinct from 'array'
       or jsonb_array_length(output_value -> 'images') < 1
     ) then
    raise exception 'Image output is incomplete' using errcode = '23514';
  elsif stage_value = 'package' and (
       jsonb_typeof(output_value -> 'manifest') is distinct from 'object'
       or char_length(coalesce(output_value ->> 'storagePath', '')) not between 1 and 1000
       or coalesce(output_value ->> 'checksum', '') !~ '^[0-9a-f]{64}$'
     ) then
    raise exception 'Package output is incomplete' using errcode = '23514';
  end if;

  if stage_value = 'research' then
    insert into public.generation_runs (
      organization_id, brand_id, run_type, entity_type, entity_id, workflow_name,
      correlation_id, idempotency_key, status, started_at, completed_at, model_usage
    ) values (
      target_pipeline.organization_id, target_pipeline.brand_id, 'research', 'opportunity',
      target_pipeline.opportunity_id, 'LW-02 Research', target_pipeline.correlation_id,
      target_pipeline.idempotency_key || ':research', 'succeeded', now(), now(),
      coalesce(payload -> 'output' -> 'usage', '{}'::jsonb)
    ) on conflict (organization_id, workflow_name, idempotency_key, attempt)
      do update set model_usage = excluded.model_usage
    returning id into generation_run_id_value;

    insert into public.research_runs (
      organization_id, opportunity_id, generation_run_id, research_plan, evidence_package,
      status, started_at, completed_at, cost_metadata, model, prompt_version,
      provider_response_id, provider_usage, ready_for_writing
    ) values (
      target_pipeline.organization_id, target_pipeline.opportunity_id, generation_run_id_value,
      payload -> 'output' -> 'plan', payload -> 'output' -> 'evidencePackage', 'succeeded',
      now(), now(), jsonb_build_object('estimatedCostUsd', coalesce((payload -> 'output' -> 'usage' ->> 'estimatedCostUsd')::numeric, 0)),
      payload -> 'output' ->> 'model', payload -> 'output' ->> 'promptVersion',
      payload -> 'output' ->> 'responseId', payload -> 'output' -> 'usage', true
    ) on conflict (generation_run_id) do update
      set evidence_package = excluded.evidence_package,
          provider_usage = excluded.provider_usage,
          completed_at = excluded.completed_at
    returning id into research_run_id_value;

    insert into public.research_sources (
      research_run_id, source_key, url, title, publisher, published_at, source_type,
      authority_score, relevant_excerpt, retrieved_at
    )
    select research_run_id_value, source.value ->> 'sourceKey', source.value ->> 'url',
      source.value ->> 'title', source.value ->> 'publisher',
      nullif(source.value ->> 'publishedAt', '')::timestamptz,
      source.value ->> 'sourceType', (source.value ->> 'authorityScore')::numeric,
      source.value ->> 'relevantExcerpt', (source.value ->> 'retrievedAt')::timestamptz
    from jsonb_array_elements(payload -> 'output' -> 'evidencePackage' -> 'sources') source
    on conflict (research_run_id, source_key) do nothing;

    insert into public.claims (
      research_run_id, claim_key, claim_text, claim_type, verification_state,
      verification_detail, importance, confidence, risk_level, usage_guidance, caveat
    )
    select research_run_id_value, claim.value ->> 'claimKey', claim.value ->> 'text',
      claim.value ->> 'claimType',
      case claim.value ->> 'verificationState'
        when 'verified' then 'verified'::public.claim_verification_state
        when 'partially_supported' then 'partially_verified'::public.claim_verification_state
        when 'opinion' then 'not_applicable'::public.claim_verification_state
        when 'disputed' then 'conflicting'::public.claim_verification_state
        else 'unverified'::public.claim_verification_state end,
      claim.value ->> 'verificationState', claim.value ->> 'importance',
      (claim.value ->> 'confidence')::numeric, claim.value ->> 'riskLevel',
      claim.value ->> 'usageGuidance', claim.value ->> 'caveat'
    from jsonb_array_elements(payload -> 'output' -> 'evidencePackage' -> 'claims') claim
    on conflict (research_run_id, claim_key) do nothing;

    insert into public.claim_sources (claim_id, research_source_id, support_type, excerpt, locator)
    select claim_row.id, source_row.id, evidence.value ->> 'supportType',
      evidence.value ->> 'excerpt', evidence.value ->> 'locator'
    from jsonb_array_elements(payload -> 'output' -> 'evidencePackage' -> 'claims') claim
    join public.claims claim_row on claim_row.research_run_id = research_run_id_value
      and claim_row.claim_key = claim.value ->> 'claimKey'
    cross join jsonb_array_elements(claim.value -> 'evidence') evidence
    join public.research_sources source_row on source_row.research_run_id = research_run_id_value
      and source_row.source_key = evidence.value ->> 'sourceKey'
    on conflict (claim_id, research_source_id) do nothing;

    update public.opportunities set status = 'ready_to_generate', updated_at = now()
    where id = target_pipeline.opportunity_id;
    result := jsonb_build_object('researchRunId', research_run_id_value, 'generationRunId', generation_run_id_value);

  elsif stage_value = 'draft' then
    select id into research_run_id_value
    from public.research_runs
    where opportunity_id = target_pipeline.opportunity_id and status = 'succeeded'
    order by completed_at desc nulls last, created_at desc
    limit 1;
    for draft_value in select value from jsonb_array_elements(payload -> 'output' -> 'drafts') loop
      if nullif(draft_value ->> 'postDraftId', '') is not null then
        select id into draft_id_value from public.post_drafts
        where id = (draft_value ->> 'postDraftId')::uuid
          and opportunity_id = target_pipeline.opportunity_id
          and brand_id = target_pipeline.brand_id
        for update;
        if draft_id_value is null then raise exception 'Selective draft target not found' using errcode = 'P0002'; end if;
      else
        insert into public.post_drafts (
          organization_id, brand_id, opportunity_id, content_style, tone, status,
          quality_score, score_breakdown
        ) values (
          target_pipeline.organization_id, target_pipeline.brand_id, target_pipeline.opportunity_id,
          (draft_value ->> 'contentStyle')::public.content_style, draft_value ->> 'tone',
          'verifying', (draft_value -> 'evaluation' ->> 'qualityScore')::numeric,
          jsonb_build_object('contractVersion', '1.0', 'angles', draft_value -> 'angles',
            'selectedAngleKey', draft_value ->> 'selectedAngleKey', 'evaluation', draft_value -> 'evaluation',
            'revisionCount', 0)
        ) on conflict (opportunity_id, content_style, tone) do update
          set updated_at = public.post_drafts.updated_at
        returning id into draft_id_value;
      end if;

      if nullif(draft_value ->> 'postDraftId', '') is not null
         or not exists (select 1 from public.post_versions where post_draft_id = draft_id_value) then
        select coalesce(max(version_number), 0) + 1 into next_version_number
        from public.post_versions where post_draft_id = draft_id_value;
        insert into public.post_versions (
          post_draft_id, version_number, hook, body, closing, full_text, generation_type,
          model, prompt_version, created_by, prompt_snapshot
        ) values (
          draft_id_value, next_version_number, draft_value -> 'content' ->> 'hook', draft_value -> 'content' ->> 'body',
          draft_value -> 'content' ->> 'closing', draft_value -> 'content' ->> 'fullText',
          case when nullif(draft_value ->> 'postDraftId', '') is null then 'initial' else 'selective_regeneration' end,
          draft_value ->> 'model', draft_value ->> 'promptVersion', actor_value,
          draft_value -> 'promptSnapshot'
        ) returning id into version_id_value;
        update public.post_drafts
        set current_version_id = version_id_value, status = 'verifying',
            quality_score = (draft_value -> 'evaluation' ->> 'qualityScore')::numeric,
            score_breakdown = jsonb_build_object('contractVersion', '1.0', 'angles', draft_value -> 'angles',
              'selectedAngleKey', draft_value ->> 'selectedAngleKey', 'evaluation', draft_value -> 'evaluation',
              'revisionCount', next_version_number - 1), updated_at = now()
        where id = draft_id_value;

        if research_run_id_value is not null then
          for sentence_claim_value in
            select value from jsonb_array_elements(
              coalesce(draft_value -> 'evaluation' -> 'sentenceClaims', '[]'::jsonb)
            )
          loop
            if nullif(sentence_claim_value ->> 'claimKey', '') is not null then
              select id into claim_id_value
              from public.claims
              where research_run_id = research_run_id_value
                and claim_key = sentence_claim_value ->> 'claimKey';
              if claim_id_value is not null then
                insert into public.post_claims (post_version_id, claim_id, sentence_text)
                values (version_id_value, claim_id_value, sentence_claim_value ->> 'sentence')
                on conflict do nothing;
              end if;
            end if;
          end loop;
        end if;

        for angle_value in select value from jsonb_array_elements(draft_value -> 'angles') loop
          insert into public.angles (
            opportunity_id, title, thesis, content_style, intended_reaction,
            supporting_claim_ids, score, selected
          ) values (
            target_pipeline.opportunity_id, angle_value ->> 'title', angle_value ->> 'thesis',
            (draft_value ->> 'contentStyle')::public.content_style,
            angle_value ->> 'intendedReaction', '{}', (angle_value ->> 'score')::numeric,
            angle_value ->> 'angleKey' = draft_value ->> 'selectedAngleKey'
          ) returning id into selected_angle_id_value;
          if angle_value ->> 'angleKey' = draft_value ->> 'selectedAngleKey' then
            update public.post_drafts set angle_id = selected_angle_id_value where id = draft_id_value;
          end if;
        end loop;
      end if;
    end loop;
    result := jsonb_build_object('draftCount', jsonb_array_length(payload -> 'output' -> 'drafts'));

  elsif stage_value = 'verify' then
    affected_count := 0;
    for evaluation_value in
      select value from jsonb_array_elements(coalesce(payload -> 'output' -> 'evaluations', '[]'::jsonb))
    loop
      update public.post_drafts draft
      set status = 'ready_for_review',
          quality_score = (evaluation_value ->> 'qualityScore')::numeric,
          score_breakdown = draft.score_breakdown || jsonb_build_object(
            'evaluation', evaluation_value,
            'verification', coalesce(payload -> 'output' -> 'verification', '{}'::jsonb),
            'warningsAreNonBlocking', true
          ),
          updated_at = now()
      where draft.id = (evaluation_value ->> 'postDraftId')::uuid
        and draft.opportunity_id = target_pipeline.opportunity_id
        and draft.brand_id = target_pipeline.brand_id
        and draft.status in ('verifying', 'evaluating', 'image_pending', 'ready_for_review');
      affected_count := affected_count + case when found then 1 else 0 end;
    end loop;
    result := jsonb_build_object('verifiedDraftCount', affected_count);

  elsif stage_value = 'image' then
    for image_value in select value from jsonb_array_elements(payload -> 'output' -> 'images') loop
      if coalesce(image_value ->> 'baseChecksum', '') !~ '^[0-9a-f]{64}$'
         or coalesce(image_value ->> 'finalChecksum', '') !~ '^[0-9a-f]{64}$'
         or image_value -> 'validation' -> 'finalComposition' ->> 'readyForReview' is distinct from 'true'
         or image_value ->> 'baseImagePath' is distinct from concat(
           target_pipeline.organization_id, '/', target_pipeline.brand_id, '/',
           image_value ->> 'postDraftId', '/', image_value ->> 'imageAssetId', '/base.png'
         )
         or image_value ->> 'finalImagePath' is distinct from concat(
           target_pipeline.organization_id, '/', target_pipeline.brand_id, '/',
           image_value ->> 'postDraftId', '/', image_value ->> 'imageAssetId', '/final.png'
         )
         or not exists (
           select 1 from public.post_drafts draft
           where draft.id = (image_value ->> 'postDraftId')::uuid
             and draft.current_version_id = (image_value ->> 'postVersionId')::uuid
             and draft.opportunity_id = target_pipeline.opportunity_id
             and draft.brand_id = target_pipeline.brand_id
         )
         or not exists (
           select 1 from storage.objects object
           where object.bucket_id = 'generated-images'
             and object.name = image_value ->> 'baseImagePath'
         )
         or not exists (
           select 1 from storage.objects object
           where object.bucket_id = 'generated-images'
             and object.name = image_value ->> 'finalImagePath'
         )
      then
        raise exception 'Generated image output failed durable validation' using errcode = '23514';
      end if;
      insert into public.image_assets (
        id, organization_id, brand_id, post_draft_id, post_version_id, image_style,
        concept, concept_key, concept_direction, template, prompt, prompt_version,
        base_image_path, final_image_path, dimensions, status, model, provider_response_id,
        validation, base_checksum, final_checksum, created_by, metadata
      ) values (
        (image_value ->> 'imageAssetId')::uuid, target_pipeline.organization_id,
        target_pipeline.brand_id, (image_value ->> 'postDraftId')::uuid,
        (image_value ->> 'postVersionId')::uuid, 'editorial_hero', image_value ->> 'concept',
        image_value ->> 'conceptKey', image_value -> 'conceptDirection', 'editorial_overlay',
        image_value ->> 'prompt', image_value ->> 'promptVersion', image_value ->> 'baseImagePath',
        image_value ->> 'finalImagePath', '{"width":1200,"height":630}'::jsonb, 'ready',
        image_value ->> 'model', image_value ->> 'responseId', image_value -> 'validation',
        image_value ->> 'baseChecksum', image_value ->> 'finalChecksum', actor_value,
        jsonb_build_object('lightweightRuntime', true, 'costUsd', image_value -> 'costUsd')
      ) on conflict (id) do nothing
      returning id into image_id_value;
    end loop;
    result := jsonb_build_object('imageCount', jsonb_array_length(payload -> 'output' -> 'images'));

  elsif stage_value = 'package' then
    if not exists (
      select 1 from storage.objects object
      where object.bucket_id = 'generated-images'
        and object.name = payload -> 'output' ->> 'storagePath'
    ) then
      raise exception 'Content package storage object is missing' using errcode = '23514';
    end if;
    insert into public.content_packages (
      organization_id, brand_id, pipeline_id, opportunity_id, manifest, storage_path, checksum
    ) values (
      target_pipeline.organization_id, target_pipeline.brand_id, target_pipeline.id,
      target_pipeline.opportunity_id, payload -> 'output' -> 'manifest',
      payload -> 'output' ->> 'storagePath', payload -> 'output' ->> 'checksum'
    ) on conflict (pipeline_id) do update
      set manifest = public.content_packages.manifest
      where public.content_packages.manifest = excluded.manifest
        and public.content_packages.storage_path is not distinct from excluded.storage_path
        and public.content_packages.checksum = excluded.checksum
    returning id into package_id_value;
    if package_id_value is null then
      raise exception 'Package replay does not match immutable output' using errcode = '23505';
    end if;
    result := jsonb_build_object('packageId', package_id_value);
  else
    raise exception 'Unsupported lightweight persistence stage' using errcode = '22023';
  end if;

  insert into private.pipeline_stage_outputs (job_id, stage, output_hash, persistence_result)
  values (target_job.id, stage_value, output_hash_value, result)
  on conflict (job_id) do update
    set output_hash = private.pipeline_stage_outputs.output_hash
  where private.pipeline_stage_outputs.stage = excluded.stage
    and private.pipeline_stage_outputs.output_hash = excluded.output_hash;
  if not found then
    raise exception 'Stage output replay does not match the recorded result' using errcode = '23505';
  end if;

  perform private.complete_pipeline_job(jsonb_build_object(
    'jobId', target_job.id,
    'workerId', target_job.worker_id,
    'outputRefs', result,
    'usage', coalesce(payload -> 'usage', '{}'::jsonb),
    'costUsd', cost_value,
    'nextStage', next_stage_value,
    'nextRequest', coalesce(payload -> 'nextRequest', '{}'::jsonb)
  ));
  return result;
end;
$$;

create or replace function public.persist_lightweight_stage_output(payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return private.persist_lightweight_stage_output(payload);
end;
$$;

revoke all on function private.persist_lightweight_stage_output(jsonb) from public;
revoke all on function public.persist_lightweight_stage_output(jsonb) from public, anon, authenticated;
grant execute on function private.persist_lightweight_stage_output(jsonb) to service_role;
grant execute on function public.persist_lightweight_stage_output(jsonb) to service_role;

comment on table public.content_packages is
  'Immutable package manifests produced by the lightweight pipeline; publishing remains out of scope.';

create or replace function private.manage_lightweight_feed(payload jsonb)
returns public.rss_feeds
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_brand public.brands%rowtype;
  target_feed public.rss_feeds%rowtype;
  actor_value uuid := auth.uid();
  action_value text := coalesce(payload ->> 'action', 'upsert');
  is_organization_admin boolean := false;
begin
  select * into target_brand from public.brands where id = (payload ->> 'brandId')::uuid;
  if actor_value is null or target_brand.id is null or not public.can_edit_brand(target_brand.id) then
    raise exception 'Brand editor permission required' using errcode = '42501';
  end if;
  if action_value not in ('upsert', 'toggle') then
    raise exception 'Unsupported feed action' using errcode = '22023';
  end if;
  select exists (
    select 1 from public.organization_members member
    where member.organization_id = target_brand.organization_id
      and member.user_id = actor_value
      and member.role = 'administrator'
  ) into is_organization_admin;
  if action_value = 'toggle' then
    select * into target_feed
    from public.rss_feeds
    where id = (payload ->> 'feedId')::uuid
      and organization_id = target_brand.organization_id
    for update;
    if target_feed.id is null then
      raise exception 'Feed not found' using errcode = 'P0002';
    end if;
    if not is_organization_admin and (
      not exists (
        select 1 from public.rss_feed_brand_links link
        where link.rss_feed_id = target_feed.id and link.brand_id = target_brand.id
      )
      or exists (
        select 1 from public.rss_feed_brand_links link
        where link.rss_feed_id = target_feed.id and link.brand_id <> target_brand.id
      )
    ) then
      raise exception 'A shared feed can be changed only by an organization administrator'
        using errcode = '42501';
    end if;
    update public.rss_feeds
    set active = (payload ->> 'active')::boolean, updated_at = now()
    where id = target_feed.id
    returning * into target_feed;
  else
    if char_length(coalesce(payload ->> 'name', '')) not between 1 and 200
       or coalesce(payload ->> 'feedUrl', '') !~ '^https?://'
       or char_length(coalesce(payload ->> 'feedUrl', '')) > 2000
       or coalesce((payload ->> 'authorityScore')::numeric, -1) not between 0 and 100
       or coalesce((payload ->> 'minimumScore')::numeric, 0) not between 60 and 100
       or coalesce((payload ->> 'dailyLimit')::integer, -1) not between 0 and 100
    then
      raise exception 'Invalid feed configuration' using errcode = '22023';
    end if;
    select * into target_feed
    from public.rss_feeds
    where organization_id = target_brand.organization_id
      and feed_url = payload ->> 'feedUrl'
    for update;
    if target_feed.id is not null and not is_organization_admin and (
      not exists (
        select 1 from public.rss_feed_brand_links link
        where link.rss_feed_id = target_feed.id and link.brand_id = target_brand.id
      )
      or exists (
        select 1 from public.rss_feed_brand_links link
        where link.rss_feed_id = target_feed.id and link.brand_id <> target_brand.id
      )
    ) then
      raise exception 'A shared feed can be changed only by an organization administrator'
        using errcode = '42501';
    end if;
    insert into public.rss_feeds (
      organization_id, name, feed_url, authority_score, active, created_by
    ) values (
      target_brand.organization_id, payload ->> 'name', payload ->> 'feedUrl',
      coalesce((payload ->> 'authorityScore')::numeric, 60),
      coalesce((payload ->> 'active')::boolean, true), actor_value
    ) on conflict (organization_id, feed_url) do update
      set name = excluded.name, authority_score = excluded.authority_score,
          active = excluded.active, updated_at = now()
    returning * into target_feed;
    insert into public.rss_feed_brand_links (
      organization_id, rss_feed_id, brand_id, generation_policy, minimum_score,
      daily_generation_limit, include_keywords, exclude_keywords
    ) values (
      target_brand.organization_id, target_feed.id, target_brand.id, 'score_then_research',
      (payload ->> 'minimumScore')::numeric, (payload ->> 'dailyLimit')::integer,
      array(select jsonb_array_elements_text(coalesce(payload -> 'includeKeywords', '[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(payload -> 'excludeKeywords', '[]'::jsonb)))
    ) on conflict (rss_feed_id, brand_id) do update
      set minimum_score = excluded.minimum_score,
          daily_generation_limit = excluded.daily_generation_limit,
          include_keywords = excluded.include_keywords,
          exclude_keywords = excluded.exclude_keywords;
  end if;
  if target_feed.id is null then raise exception 'Feed not found' using errcode = 'P0002'; end if;
  return target_feed;
end;
$$;

create or replace function public.manage_lightweight_feed(payload jsonb)
returns public.rss_feeds
language sql
security definer
set search_path = ''
as $$ select private.manage_lightweight_feed(payload); $$;

revoke all on function private.manage_lightweight_feed(jsonb) from public;
revoke all on function public.manage_lightweight_feed(jsonb) from public, anon;
grant execute on function public.manage_lightweight_feed(jsonb) to authenticated;
