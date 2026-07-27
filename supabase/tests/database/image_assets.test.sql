begin;

create extension if not exists pgtap with schema extensions;
select plan(17);

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000012',
    'authenticated',
    'authenticated',
    'image-editor@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000013',
    'authenticated',
    'authenticated',
    'image-reviewer@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000014',
    '40000000-0000-4000-8000-000000000014',
    'authenticated',
    'authenticated',
    'unauthorized@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.organization_members (organization_id, user_id, role)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000012',
    'viewer'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000013',
    'viewer'
  );

insert into public.brand_members (brand_id, user_id, role)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000012',
    'editor'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000013',
    'reviewer'
  );

insert into public.opportunities (
  id,
  organization_id,
  brand_id,
  value_nucleus,
  recommended_style,
  opportunity_score,
  risk_penalty,
  score_breakdown,
  status
)
values (
  '65000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'A verified operating change deserves a restrained editorial visual.',
  'newsworthy_authority',
  86,
  4,
  '{"novelty":86}'::jsonb,
  'ready_to_generate'
);

insert into public.post_drafts (
  id,
  organization_id,
  brand_id,
  opportunity_id,
  content_style,
  tone,
  status,
  quality_score,
  score_breakdown
)
values (
  '66000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '65000000-0000-4000-8000-000000000001',
  'newsworthy_authority',
  'thoughtful',
  'ready_for_review',
  88,
  '{"evaluation":{"readyForReview":true}}'::jsonb
);

insert into public.post_versions (
  id,
  post_draft_id,
  version_number,
  hook,
  body,
  closing,
  full_text,
  generation_type,
  model,
  prompt_version,
  created_by
)
values (
  '67000000-0000-4000-8000-000000000001',
  '66000000-0000-4000-8000-000000000001',
  1,
  'A verified operating change deserves attention.',
  'The evidence supports a restrained editorial interpretation.',
  'What would you examine next?',
  E'A verified operating change deserves attention.\n\nThe evidence supports a restrained editorial interpretation.\n\nWhat would you examine next?',
  'initial',
  'fake-editorial-v1',
  'facebook-writer.v1',
  '40000000-0000-4000-8000-000000000012'
);
update public.post_drafts
set current_version_id = '67000000-0000-4000-8000-000000000001'
where id = '66000000-0000-4000-8000-000000000001';

create temporary table image_test_payloads (
  name text primary key,
  payload jsonb not null
);
grant select, insert, update, delete on image_test_payloads to service_role, authenticated;

insert into image_test_payloads (name, payload)
values (
  'ready',
  jsonb_build_object(
    'actorId', '40000000-0000-4000-8000-000000000012',
    'brandId', '20000000-0000-4000-8000-000000000001',
    'postDraftId', '66000000-0000-4000-8000-000000000001',
    'postVersionId', '67000000-0000-4000-8000-000000000001',
    'imageAssetId', '68000000-0000-4000-8000-000000000001',
    'correlationId', '69000000-0000-4000-8000-000000000001',
    'idempotencyKey', 'image-database-ready-0001',
    'requestHash', repeat('a', 64),
    'status', 'ready',
    'imageStyle', 'editorial_hero',
    'template', 'editorial_overlay',
    'selectedConceptKey', 'concept_fixture1',
    'imageDirection', jsonb_build_object(
      'contractVersion', '1.0',
      'selectedConceptKey', 'concept_fixture1',
      'concepts', jsonb_build_array(
        jsonb_build_object(
          'conceptKey', 'concept_fixture1',
          'title', 'Editorial signal',
          'rank', 1,
          'imageStyle', 'editorial_hero'
        ),
        jsonb_build_object(
          'conceptKey', 'concept_fixture2',
          'title', 'Operating shift',
          'rank', 2,
          'imageStyle', 'conceptual_illustration'
        ),
        jsonb_build_object(
          'conceptKey', 'concept_fixture3',
          'title', 'Decision frame',
          'rank', 3,
          'imageStyle', 'branded_headline_card'
        )
      )
    ),
    'prompt', 'A text-free editorial base image.',
    'baseImagePath', concat(
      '10000000-0000-4000-8000-000000000001/',
      '20000000-0000-4000-8000-000000000001/',
      '66000000-0000-4000-8000-000000000001/',
      '68000000-0000-4000-8000-000000000001/base.png'
    ),
    'finalImagePath', concat(
      '10000000-0000-4000-8000-000000000001/',
      '20000000-0000-4000-8000-000000000001/',
      '66000000-0000-4000-8000-000000000001/',
      '68000000-0000-4000-8000-000000000001/final.png'
    ),
    'baseChecksum', repeat('b', 64),
    'finalChecksum', repeat('c', 64),
    'dimensions', '{"width":1200,"height":630}'::jsonb,
    'validation', jsonb_build_object(
      'contractVersion', '1.0',
      'readyForComposition', true,
      'humanOverrideRequired', false,
      'warnings', jsonb_build_array()
    ),
    'model', 'fake-image-v1',
    'promptVersion', 'image-director.v1',
    'providerResponseId', 'fake_provider_response_1',
    'modelRecord', '{"provider":"fake","costUsd":0}'::jsonb
  )
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into storage.objects (bucket_id, name, owner_id, metadata)
select
  'generated-images',
  path,
  '40000000-0000-4000-8000-000000000012',
  '{"mimetype":"image/png"}'::jsonb
from unnest(array[
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000001/68000000-0000-4000-8000-000000000001/base.png',
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000001/68000000-0000-4000-8000-000000000001/final.png'
]) path;

select results_eq(
  $$
    select asset_status::text
    from public.persist_image_asset(
      (select payload from image_test_payloads where name = 'ready')
    )
  $$,
  array['ready'::text],
  'service persistence creates a ready image only after both objects exist'
);
select results_eq(
  $$
    select duplicate
    from public.persist_image_asset(
      (select payload from image_test_payloads where name = 'ready')
    )
  $$,
  array[true],
  'image persistence is idempotent'
);
select is(
  (select count(*) from public.image_assets where id = '68000000-0000-4000-8000-000000000001'),
  1::bigint,
  'idempotent replay does not duplicate the image asset'
);
select is(
  (select count(*) from public.generation_runs where entity_id = '68000000-0000-4000-8000-000000000001'),
  1::bigint,
  'one image generation run is recorded'
);
select is(
  (select count(*) from public.pipeline_events where entity_id = '68000000-0000-4000-8000-000000000001'),
  1::bigint,
  'one image pipeline event is recorded'
);
select is(
  (select count(*) from public.audit_logs where entity_id = '68000000-0000-4000-8000-000000000001'),
  1::bigint,
  'one image audit record is recorded'
);
select throws_ok(
  $$
    select *
    from public.persist_image_asset(
      jsonb_set(
        (select payload from image_test_payloads where name = 'ready'),
        '{requestHash}',
        to_jsonb(repeat('d', 64))
      )
    )
  $$,
  '23505',
  'Idempotency key was reused with a different request',
  'idempotency key reuse with different content is rejected'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000012', true);
select throws_ok(
  $$
    select *
    from public.persist_image_asset(
      (select payload from image_test_payloads where name = 'ready')
    )
  $$,
  '42501',
  'permission denied for function persist_image_asset',
  'authenticated editors cannot call the service-only persistence function'
);
select throws_ok(
  $$
    insert into storage.objects (bucket_id, name, owner_id)
    values (
      'generated-images',
      '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/browser-write.png',
      '40000000-0000-4000-8000-000000000012'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "objects"',
  'authenticated editors cannot upload generated images'
);
select is(
  (
    select count(*)
    from public.image_assets
    where id = '68000000-0000-4000-8000-000000000001'
  ),
  1::bigint,
  'assigned editor can read the image asset'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000014', true);
select is(
  (
    select count(*)
    from public.image_assets
    where id = '68000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'an unassigned user cannot read the image asset'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'generated-images',
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000001/68000000-0000-4000-8000-000000000002/base.png',
  '40000000-0000-4000-8000-000000000012',
  '{"mimetype":"image/png"}'::jsonb
);
insert into image_test_payloads (name, payload)
select
  'override',
  jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                payload,
                '{imageAssetId}',
                '"68000000-0000-4000-8000-000000000002"'::jsonb
              ),
              '{idempotencyKey}',
              '"image-database-override-base-0001"'::jsonb
            ),
            '{requestHash}',
            to_jsonb(repeat('e', 64))
          ),
          '{status}',
          '"validation_required"'::jsonb
        ),
        '{baseImagePath}',
        '"10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000001/68000000-0000-4000-8000-000000000002/base.png"'::jsonb
      ),
      '{finalImagePath}',
      'null'::jsonb
    ),
    '{validation}',
    '{"contractVersion":"1.0","readyForComposition":false,"humanOverrideRequired":true,"warnings":["Generated text detected."]}'::jsonb
  ) - 'finalChecksum'
from image_test_payloads
where name = 'ready';
select results_eq(
  $$
    select asset_status::text
    from public.persist_image_asset(
      (select payload from image_test_payloads where name = 'override')
    )
  $$,
  array['validation_required'::text],
  'unsafe base image is held for validation override'
);

insert into public.post_versions (
  id,
  post_draft_id,
  version_number,
  hook,
  body,
  closing,
  full_text,
  generation_type,
  created_by
)
values (
  '67000000-0000-4000-8000-000000000002',
  '66000000-0000-4000-8000-000000000001',
  2,
  'A changed post has a different visual meaning.',
  'The reviewer edited the post after the base image was created.',
  'Review the new version first.',
  E'A changed post has a different visual meaning.\n\nThe reviewer edited the post after the base image was created.\n\nReview the new version first.',
  'manual_edit',
  '40000000-0000-4000-8000-000000000012'
);
update public.post_drafts
set current_version_id = '67000000-0000-4000-8000-000000000002'
where id = '66000000-0000-4000-8000-000000000001';
select throws_ok(
  $$
    select *
    from public.override_image_validation(
      jsonb_build_object(
        'actorId', '40000000-0000-4000-8000-000000000013',
        'imageAssetId', '68000000-0000-4000-8000-000000000002',
        'correlationId', '69000000-0000-4000-8000-000000000002',
        'idempotencyKey', 'image-database-stale-override-0001',
        'requestHash', repeat('2', 64),
        'reason', 'The reviewer attempted to override an image for an earlier post version.',
        'finalImagePath', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000001/68000000-0000-4000-8000-000000000002/final.png',
        'finalChecksum', repeat('1', 64)
      )
    )
  $$,
  '40001',
  'Post version changed',
  'a validation override cannot attach an image to a changed post'
);
update public.post_drafts
set current_version_id = '67000000-0000-4000-8000-000000000001'
where id = '66000000-0000-4000-8000-000000000001';

insert into storage.objects (bucket_id, name, owner_id, metadata)
values (
  'generated-images',
  '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000001/68000000-0000-4000-8000-000000000002/final.png',
  '40000000-0000-4000-8000-000000000013',
  '{"mimetype":"image/png"}'::jsonb
);
select results_eq(
  $$
    select asset_status::text
    from public.override_image_validation(
      jsonb_build_object(
        'actorId', '40000000-0000-4000-8000-000000000013',
        'imageAssetId', '68000000-0000-4000-8000-000000000002',
        'correlationId', '69000000-0000-4000-8000-000000000002',
        'idempotencyKey', 'image-database-override-0001',
        'requestHash', repeat('f', 64),
        'reason', 'The reviewer confirmed the detected mark is an abstract shape, not generated text.',
        'finalImagePath', '10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001/66000000-0000-4000-8000-000000000001/68000000-0000-4000-8000-000000000002/final.png',
        'finalChecksum', repeat('1', 64)
      )
    )
  $$,
  array['ready'::text],
  'assigned reviewer can explicitly override a flagged image'
);
select ok(
  (
    select human_override_by = '40000000-0000-4000-8000-000000000013'
      and human_override_reason is not null
      and human_override_at is not null
    from public.image_assets
    where id = '68000000-0000-4000-8000-000000000002'
  ),
  'override actor, reason, and timestamp are retained'
);
select is(
  (
    select count(*)
    from public.feedback_events
    where event_type = 'image_validation_overridden'
      and metadata ->> 'imageAssetId' = '68000000-0000-4000-8000-000000000002'
  ),
  1::bigint,
  'override feedback is captured'
);
select throws_ok(
  $$
    update public.image_assets
    set model = 'rewritten-provider'
    where id = '68000000-0000-4000-8000-000000000001'
  $$,
  '23514',
  'Image generation provenance is immutable',
  'generated-image provenance cannot be rewritten'
);

select * from finish();
rollback;
