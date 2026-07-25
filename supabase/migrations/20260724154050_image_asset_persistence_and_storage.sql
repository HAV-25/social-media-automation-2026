create type public.image_asset_status as enum (
  'generating',
  'validation_required',
  'ready',
  'failed'
);

alter table public.image_assets
  add column organization_id uuid references public.organizations(id) on delete cascade,
  add column brand_id uuid,
  add column post_version_id uuid references public.post_versions(id) on delete restrict,
  add column concept_key text,
  add column concept_direction jsonb not null default '{}'::jsonb,
  add column template text,
  add column prompt_version text,
  add column provider_response_id text,
  add column validation jsonb not null default '{}'::jsonb,
  add column base_checksum text,
  add column final_checksum text,
  add column created_by uuid references auth.users(id) on delete set null,
  add column human_override_by uuid references auth.users(id) on delete set null,
  add column human_override_reason text,
  add column human_override_at timestamptz,
  add column updated_at timestamptz not null default now(),
  add constraint image_assets_brand_organization_fk
    foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade;

alter table public.image_assets alter column status drop default;
alter table public.image_assets
  alter column status type public.image_asset_status
  using (
    case status::text
      when 'failed' then 'failed'::public.image_asset_status
      else 'failed'::public.image_asset_status
    end
  );
alter table public.image_assets
  alter column status set default 'generating'::public.image_asset_status;
update public.image_assets
set image_style = case
      when image_style in (
        'editorial_hero',
        'insight_card',
        'conceptual_illustration',
        'branded_headline_card'
      ) then image_style
      else 'editorial_hero'
    end,
    metadata = metadata || '{"legacyMigrationState":"failed_unverified"}'::jsonb;

alter table public.image_assets
  add constraint image_assets_style_check check (
    image_style in (
      'editorial_hero',
      'insight_card',
      'conceptual_illustration',
      'branded_headline_card'
    )
  ),
  add constraint image_assets_template_check check (
    template is null
    or template in (
      'editorial_overlay',
      'insight_split',
      'concept_frame',
      'headline_panel'
    )
  ),
  add constraint image_assets_concept_key_check check (
    concept_key is null or concept_key ~ '^concept_[a-z0-9]{6,40}$'
  ),
  add constraint image_assets_checksum_check check (
    (base_checksum is null or base_checksum ~ '^[0-9a-f]{64}$')
    and (final_checksum is null or final_checksum ~ '^[0-9a-f]{64}$')
  ),
  add constraint image_assets_dimensions_check check (
    jsonb_typeof(dimensions) = 'object'
    and jsonb_typeof(dimensions -> 'width') = 'number'
    and jsonb_typeof(dimensions -> 'height') = 'number'
    and (dimensions ->> 'width')::integer between 256 and 3840
    and (dimensions ->> 'height')::integer between 256 and 3840
  ),
  add constraint image_assets_validation_contract_check check (
    validation = '{}'::jsonb
    or (
      validation ->> 'contractVersion' = '1.0'
      and jsonb_typeof(validation -> 'readyForComposition') = 'boolean'
      and jsonb_typeof(validation -> 'humanOverrideRequired') = 'boolean'
      and jsonb_typeof(validation -> 'warnings') = 'array'
      and jsonb_array_length(validation -> 'warnings') <= 30
    )
  ),
  add constraint image_assets_override_check check (
    (
      human_override_by is null
      and human_override_reason is null
      and human_override_at is null
    )
    or (
      human_override_by is not null
      and char_length(human_override_reason) between 10 and 2000
      and human_override_at is not null
    )
  ),
  add constraint image_assets_ready_check check (
    status <> 'ready'
    or (
      organization_id is not null
      and brand_id is not null
      and post_version_id is not null
      and concept_key is not null
      and template is not null
      and base_image_path is not null
      and final_image_path is not null
      and base_checksum is not null
      and final_checksum is not null
      and prompt_version is not null
      and provider_response_id is not null
      and (dimensions ->> 'width')::integer = 1200
      and (dimensions ->> 'height')::integer = 630
      and (
        (
          validation ->> 'readyForComposition' = 'true'
          and validation ->> 'humanOverrideRequired' = 'false'
        )
        or human_override_by is not null
      )
    )
  ),
  add constraint image_assets_validation_required_check check (
    status <> 'validation_required'
    or (
      organization_id is not null
      and brand_id is not null
      and post_version_id is not null
      and concept_key is not null
      and base_image_path is not null
      and final_image_path is null
      and base_checksum is not null
      and validation ->> 'humanOverrideRequired' = 'true'
    )
  );

create unique index image_assets_base_path_unique
  on public.image_assets (base_image_path)
  where base_image_path is not null;
create unique index image_assets_final_path_unique
  on public.image_assets (final_image_path)
  where final_image_path is not null;
create index image_assets_post_created_idx
  on public.image_assets (post_draft_id, created_at desc);
create index image_assets_brand_status_idx
  on public.image_assets (brand_id, status, created_at desc);

create or replace function private.assert_image_asset_tenancy()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_organization_id uuid;
  parent_brand_id uuid;
  version_draft_id uuid;
begin
  select post_drafts.organization_id, post_drafts.brand_id
  into parent_organization_id, parent_brand_id
  from public.post_drafts
  where post_drafts.id = new.post_draft_id;

  if parent_organization_id is null
    or new.organization_id is distinct from parent_organization_id
    or new.brand_id is distinct from parent_brand_id
  then
    raise exception 'Image asset tenant does not match its post'
      using errcode = '23514';
  end if;

  if new.post_version_id is not null then
    select post_versions.post_draft_id
    into version_draft_id
    from public.post_versions
    where post_versions.id = new.post_version_id;
    if version_draft_id is distinct from new.post_draft_id then
      raise exception 'Image asset version does not belong to its post'
        using errcode = '23514';
    end if;
  end if;

  if new.base_image_path is not null
    and new.base_image_path <> concat(
      new.organization_id,
      '/',
      new.brand_id,
      '/',
      new.post_draft_id,
      '/',
      new.id,
      '/base.png'
    )
  then
    raise exception 'Invalid generated base-image path'
      using errcode = '23514';
  end if;
  if new.final_image_path is not null
    and new.final_image_path <> concat(
      new.organization_id,
      '/',
      new.brand_id,
      '/',
      new.post_draft_id,
      '/',
      new.id,
      '/final.png'
    )
  then
    raise exception 'Invalid generated final-image path'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger image_assets_assert_tenancy
before insert or update on public.image_assets
for each row execute function private.assert_image_asset_tenancy();

create or replace function private.protect_image_asset_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if row(
    new.id,
    new.organization_id,
    new.brand_id,
    new.post_draft_id,
    new.post_version_id,
    new.image_style,
    new.concept_key,
    new.concept_direction,
    new.prompt,
    new.base_image_path,
    new.base_checksum,
    new.model,
    new.prompt_version,
    new.provider_response_id,
    new.created_by,
    new.created_at
  ) is distinct from row(
    old.id,
    old.organization_id,
    old.brand_id,
    old.post_draft_id,
    old.post_version_id,
    old.image_style,
    old.concept_key,
    old.concept_direction,
    old.prompt,
    old.base_image_path,
    old.base_checksum,
    old.model,
    old.prompt_version,
    old.provider_response_id,
    old.created_by,
    old.created_at
  )
  then
    raise exception 'Image generation provenance is immutable'
      using errcode = '23514';
  end if;

  if old.status = 'validation_required'
    and new.status not in ('validation_required', 'ready', 'failed')
  then
    raise exception 'Invalid image validation state transition'
      using errcode = '23514';
  elsif old.status in ('ready', 'failed') and new.status <> old.status then
    raise exception 'Terminal image assets cannot change state'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger image_assets_protect_lifecycle
before update on public.image_assets
for each row execute function private.protect_image_asset_lifecycle();
create trigger image_assets_set_updated_at
before update on public.image_assets
for each row execute function public.set_updated_at();

drop policy if exists image_assets_write on public.image_assets;
revoke insert, update, delete on public.image_assets from authenticated;

drop policy if exists storage_brand_objects_select on storage.objects;
drop policy if exists storage_brand_objects_insert on storage.objects;
drop policy if exists storage_brand_objects_update on storage.objects;
drop policy if exists storage_brand_objects_delete on storage.objects;

create policy storage_brand_objects_select on storage.objects for select
to authenticated
using (
  bucket_id in ('source-originals', 'brand-assets', 'generated-images')
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (select public.is_organization_member(((storage.foldername(name))[1])::uuid))
  and (select public.can_read_brand(((storage.foldername(name))[2])::uuid))
);
create policy storage_source_brand_insert on storage.objects for insert
to authenticated
with check (
  bucket_id in ('source-originals', 'brand-assets')
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (select public.is_organization_member(((storage.foldername(name))[1])::uuid))
  and (select public.can_edit_brand(((storage.foldername(name))[2])::uuid))
  and owner_id = (select auth.uid()::text)
);
create policy storage_source_brand_update on storage.objects for update
to authenticated
using (
  bucket_id in ('source-originals', 'brand-assets')
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (select public.is_organization_member(((storage.foldername(name))[1])::uuid))
  and (select public.can_edit_brand(((storage.foldername(name))[2])::uuid))
)
with check (
  bucket_id in ('source-originals', 'brand-assets')
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (select public.is_organization_member(((storage.foldername(name))[1])::uuid))
  and (select public.can_edit_brand(((storage.foldername(name))[2])::uuid))
);
create policy storage_source_brand_delete on storage.objects for delete
to authenticated
using (
  bucket_id in ('source-originals', 'brand-assets')
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (select public.is_organization_member(((storage.foldername(name))[1])::uuid))
  and (select public.can_edit_brand(((storage.foldername(name))[2])::uuid))
);

create or replace function private.persist_image_asset(payload jsonb)
returns table (
  image_asset_id uuid,
  generation_run_id uuid,
  duplicate boolean,
  asset_status public.image_asset_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := nullif(payload ->> 'actorId', '')::uuid;
  target_brand_id uuid := nullif(payload ->> 'brandId', '')::uuid;
  target_post_id uuid := nullif(payload ->> 'postDraftId', '')::uuid;
  target_version_id uuid := nullif(payload ->> 'postVersionId', '')::uuid;
  asset_id uuid := nullif(payload ->> 'imageAssetId', '')::uuid;
  target_organization_id uuid;
  current_version_id uuid;
  current_post_status public.post_status;
  requested_status public.image_asset_status;
  run_id uuid;
  selected_concept jsonb;
  correlation uuid := nullif(payload ->> 'correlationId', '')::uuid;
  idempotency_record private.idempotency_keys%rowtype;
  was_duplicate boolean := false;
  expected_base_path text;
  expected_final_path text;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if actor_id is null
    or target_brand_id is null
    or target_post_id is null
    or target_version_id is null
    or asset_id is null
    or correlation is null
    or char_length(coalesce(payload ->> 'idempotencyKey', '')) not between 16 and 200
    or coalesce(payload ->> 'requestHash', '') !~ '^[0-9a-f]{64}$'
    or coalesce(payload ->> 'status', '') not in ('ready', 'validation_required')
    or coalesce(payload ->> 'imageStyle', '') not in (
      'editorial_hero',
      'insight_card',
      'conceptual_illustration',
      'branded_headline_card'
    )
    or coalesce(payload ->> 'template', '') not in (
      'editorial_overlay',
      'insight_split',
      'concept_frame',
      'headline_panel'
    )
    or coalesce(payload ->> 'selectedConceptKey', '') !~ '^concept_[a-z0-9]{6,40}$'
    or jsonb_typeof(payload -> 'imageDirection') <> 'object'
    or jsonb_typeof(payload -> 'imageDirection' -> 'concepts') <> 'array'
    or jsonb_array_length(payload -> 'imageDirection' -> 'concepts') <> 3
    or jsonb_typeof(payload -> 'validation') <> 'object'
    or coalesce(payload -> 'validation' ->> 'contractVersion', '') <> '1.0'
    or coalesce(payload ->> 'baseChecksum', '') !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(payload ->> 'promptVersion', '')) not between 1 and 100
    or char_length(coalesce(payload ->> 'providerResponseId', '')) not between 1 and 500
  then
    raise exception 'Invalid image persistence payload' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(payload -> 'imageDirection' -> 'concepts') concept
    group by concept.value ->> 'conceptKey'
    having count(*) > 1
  ) or (
    select count(distinct (concept.value ->> 'rank')::integer)
    from jsonb_array_elements(payload -> 'imageDirection' -> 'concepts') concept
    where (concept.value ->> 'rank')::integer between 1 and 3
  ) <> 3
  then
    raise exception 'Image concepts must have unique keys and ranks'
      using errcode = '23514';
  end if;

  select concept.value
  into selected_concept
  from jsonb_array_elements(payload -> 'imageDirection' -> 'concepts') concept
  where concept.value ->> 'conceptKey' = payload ->> 'selectedConceptKey';
  if selected_concept is null
    or selected_concept ->> 'imageStyle' is distinct from payload ->> 'imageStyle'
  then
    raise exception 'Selected image concept is invalid'
      using errcode = '23514';
  end if;

  requested_status := (payload ->> 'status')::public.image_asset_status;
  if requested_status = 'ready' and (
    payload -> 'validation' ->> 'readyForComposition' <> 'true'
    or payload -> 'validation' ->> 'humanOverrideRequired' <> 'false'
    or coalesce(payload ->> 'finalChecksum', '') !~ '^[0-9a-f]{64}$'
  )
  then
    raise exception 'Ready image has not passed validation'
      using errcode = '23514';
  end if;
  if requested_status = 'validation_required' and (
    payload -> 'validation' ->> 'humanOverrideRequired' <> 'true'
    or nullif(payload ->> 'finalImagePath', '') is not null
  )
  then
    raise exception 'Validation-required image state is inconsistent'
      using errcode = '23514';
  end if;

  select
    post_drafts.organization_id,
    post_drafts.current_version_id,
    post_drafts.status
  into
    target_organization_id,
    current_version_id,
    current_post_status
  from public.post_drafts
  where post_drafts.id = target_post_id
    and post_drafts.brand_id = target_brand_id
  for update;
  if target_organization_id is null then
    raise exception 'Post draft not found' using errcode = 'P0002';
  end if;
  if current_version_id is distinct from target_version_id then
    raise exception 'Post version changed' using errcode = '40001';
  end if;
  if current_post_status <> 'ready_for_review'
    or coalesce(
      (
        select post_drafts.score_breakdown -> 'evaluation' ->> 'readyForReview'
        from public.post_drafts
        where post_drafts.id = target_post_id
      )::boolean,
      false
    ) is not true
  then
    raise exception 'Post has not passed editorial readiness'
      using errcode = '23514';
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

  expected_base_path := concat(
    target_organization_id, '/', target_brand_id, '/', target_post_id, '/', asset_id, '/base.png'
  );
  expected_final_path := concat(
    target_organization_id, '/', target_brand_id, '/', target_post_id, '/', asset_id, '/final.png'
  );
  if payload ->> 'baseImagePath' is distinct from expected_base_path
    or (
      requested_status = 'ready'
      and payload ->> 'finalImagePath' is distinct from expected_final_path
    )
  then
    raise exception 'Generated image storage path is invalid'
      using errcode = '23514';
  end if;
  if not exists (
    select 1 from storage.objects
    where bucket_id = 'generated-images'
      and name = expected_base_path
  ) or (
    requested_status = 'ready'
    and not exists (
      select 1 from storage.objects
      where bucket_id = 'generated-images'
        and name = expected_final_path
    )
  )
  then
    raise exception 'Generated image storage object is missing'
      using errcode = '23514';
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = target_organization_id
    and scope = 'image_generation'
    and idempotency_key = payload ->> 'idempotencyKey';
  if found then
    if idempotency_record.request_hash <> payload ->> 'requestHash' then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'imageAssetId')::uuid,
        (idempotency_record.response_body ->> 'generationRunId')::uuid,
        true,
        (idempotency_record.response_body ->> 'status')::public.image_asset_status;
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
      'image_generation',
      payload ->> 'idempotencyKey',
      payload ->> 'requestHash',
      now() + interval '24 hours'
    );
  end if;

  insert into public.image_assets (
    id,
    organization_id,
    brand_id,
    post_draft_id,
    post_version_id,
    image_style,
    concept,
    concept_key,
    concept_direction,
    prompt,
    template,
    base_image_path,
    final_image_path,
    dimensions,
    status,
    model,
    prompt_version,
    provider_response_id,
    validation,
    base_checksum,
    final_checksum,
    metadata,
    created_by
  )
  values (
    asset_id,
    target_organization_id,
    target_brand_id,
    target_post_id,
    target_version_id,
    payload ->> 'imageStyle',
    selected_concept ->> 'title',
    payload ->> 'selectedConceptKey',
    payload -> 'imageDirection',
    payload ->> 'prompt',
    payload ->> 'template',
    expected_base_path,
    case when requested_status = 'ready' then expected_final_path else null end,
    payload -> 'dimensions',
    requested_status,
    payload ->> 'model',
    payload ->> 'promptVersion',
    payload ->> 'providerResponseId',
    payload -> 'validation',
    payload ->> 'baseChecksum',
    nullif(payload ->> 'finalChecksum', ''),
    jsonb_build_object(
      'modelRecord', payload -> 'modelRecord',
      'selectedConcept', selected_concept
    ),
    actor_id
  );

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
    'image_generation',
    'image_asset',
    asset_id,
    'app-image-generation',
    correlation,
    payload ->> 'idempotencyKey',
    'succeeded',
    now(),
    now(),
    payload -> 'modelRecord'
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
    'image_asset',
    asset_id,
    case
      when requested_status = 'ready' then 'image.ready'
      else 'image.validation_required'
    end,
    'generating',
    requested_status::text,
    correlation,
    actor_id,
    jsonb_build_object(
      'postDraftId', target_post_id,
      'postVersionId', target_version_id,
      'warningCount', jsonb_array_length(payload -> 'validation' -> 'warnings')
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
    case
      when requested_status = 'ready' then 'image.generated'
      else 'image.validation_flagged'
    end,
    'image_asset',
    asset_id,
    jsonb_build_object(
      'postDraftId', target_post_id,
      'postVersionId', target_version_id,
      'model', payload ->> 'model',
      'promptVersion', payload ->> 'promptVersion',
      'providerResponseId', payload ->> 'providerResponseId'
    )
  );

  update private.idempotency_keys
  set response_status = 201,
      response_body = jsonb_build_object(
        'imageAssetId', asset_id,
        'generationRunId', run_id,
        'status', requested_status,
        'duplicate', false
      )
  where organization_id = target_organization_id
    and scope = 'image_generation'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select asset_id, run_id, was_duplicate, requested_status;
end;
$$;

create or replace function private.override_image_validation(payload jsonb)
returns table (
  image_asset_id uuid,
  generation_run_id uuid,
  duplicate boolean,
  asset_status public.image_asset_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := nullif(payload ->> 'actorId', '')::uuid;
  asset_id uuid := nullif(payload ->> 'imageAssetId', '')::uuid;
  target_organization_id uuid;
  target_brand_id uuid;
  target_post_id uuid;
  target_version_id uuid;
  current_post_version_id uuid;
  current_status public.image_asset_status;
  final_path text;
  run_id uuid;
  correlation uuid := nullif(payload ->> 'correlationId', '')::uuid;
  idempotency_record private.idempotency_keys%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if actor_id is null
    or asset_id is null
    or correlation is null
    or char_length(coalesce(payload ->> 'idempotencyKey', '')) not between 16 and 200
    or coalesce(payload ->> 'requestHash', '') !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(payload ->> 'reason', '')) not between 10 and 2000
    or coalesce(payload ->> 'finalChecksum', '') !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid image override payload' using errcode = '22023';
  end if;

  select
    image_assets.organization_id,
    image_assets.brand_id,
    image_assets.post_draft_id,
    image_assets.post_version_id,
    post_drafts.current_version_id,
    image_assets.status,
    concat(
      image_assets.organization_id,
      '/',
      image_assets.brand_id,
      '/',
      image_assets.post_draft_id,
      '/',
      image_assets.id,
      '/final.png'
    )
  into
    target_organization_id,
    target_brand_id,
    target_post_id,
    target_version_id,
    current_post_version_id,
    current_status,
    final_path
  from public.image_assets
  join public.post_drafts on post_drafts.id = image_assets.post_draft_id
  where image_assets.id = asset_id
  for update;
  if target_organization_id is null then
    raise exception 'Image asset not found' using errcode = 'P0002';
  end if;
  if current_status <> 'validation_required' then
    raise exception 'Image asset does not require an override'
      using errcode = '23514';
  end if;
  if current_post_version_id is distinct from target_version_id then
    raise exception 'Post version changed' using errcode = '40001';
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
        or brand_member.role in ('administrator', 'editor', 'reviewer')
      )
  )
  then
    raise exception 'Image reviewer permission required' using errcode = '42501';
  end if;
  if payload ->> 'finalImagePath' is distinct from final_path
    or not exists (
      select 1 from storage.objects
      where bucket_id = 'generated-images' and name = final_path
    )
  then
    raise exception 'Generated final-image object is missing'
      using errcode = '23514';
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = target_organization_id
    and scope = 'image_validation_override'
    and idempotency_key = payload ->> 'idempotencyKey';
  if found then
    if idempotency_record.request_hash <> payload ->> 'requestHash' then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'imageAssetId')::uuid,
        (idempotency_record.response_body ->> 'generationRunId')::uuid,
        true,
        'ready'::public.image_asset_status;
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
      'image_validation_override',
      payload ->> 'idempotencyKey',
      payload ->> 'requestHash',
      now() + interval '24 hours'
    );
  end if;

  update public.image_assets
  set status = 'ready',
      final_image_path = final_path,
      final_checksum = payload ->> 'finalChecksum',
      dimensions = '{"width":1200,"height":630}'::jsonb,
      human_override_by = actor_id,
      human_override_reason = payload ->> 'reason',
      human_override_at = now()
  where id = asset_id;

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
    'image_validation_override',
    'image_asset',
    asset_id,
    'app-image-validation-override',
    correlation,
    payload ->> 'idempotencyKey',
    'succeeded',
    now(),
    now(),
    '{"provider":"human","costUsd":0}'::jsonb
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
    'image_asset',
    asset_id,
    'image.validation_overridden',
    'validation_required',
    'ready',
    correlation,
    actor_id,
    jsonb_build_object('reason', payload ->> 'reason')
  );

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
    target_post_id,
    'image_validation_overridden',
    payload ->> 'reason',
    actor_id,
    jsonb_build_object('imageAssetId', asset_id)
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
    'image.validation_overridden',
    'image_asset',
    asset_id,
    jsonb_build_object('reason', payload ->> 'reason')
  );

  update private.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'imageAssetId', asset_id,
        'generationRunId', run_id,
        'status', 'ready',
        'duplicate', false
      )
  where organization_id = target_organization_id
    and scope = 'image_validation_override'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select asset_id, run_id, false, 'ready'::public.image_asset_status;
end;
$$;

create or replace function public.persist_image_asset(payload jsonb)
returns table (
  image_asset_id uuid,
  generation_run_id uuid,
  duplicate boolean,
  asset_status public.image_asset_status
)
language sql
set search_path = ''
as $$
  select * from private.persist_image_asset(payload);
$$;

create or replace function public.override_image_validation(payload jsonb)
returns table (
  image_asset_id uuid,
  generation_run_id uuid,
  duplicate boolean,
  asset_status public.image_asset_status
)
language sql
set search_path = ''
as $$
  select * from private.override_image_validation(payload);
$$;

revoke all on function private.assert_image_asset_tenancy() from public;
revoke all on function private.protect_image_asset_lifecycle() from public;
revoke all on function private.persist_image_asset(jsonb) from public;
revoke all on function private.override_image_validation(jsonb) from public;
revoke all on function public.persist_image_asset(jsonb) from public, anon, authenticated;
revoke all on function public.override_image_validation(jsonb) from public, anon, authenticated;
grant execute on function private.persist_image_asset(jsonb) to service_role;
grant execute on function private.override_image_validation(jsonb) to service_role;
grant execute on function public.persist_image_asset(jsonb) to service_role;
grant execute on function public.override_image_validation(jsonb) to service_role;
