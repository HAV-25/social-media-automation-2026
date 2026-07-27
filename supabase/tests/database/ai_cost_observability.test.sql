begin;

create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '40000000-0000-4000-8000-000000000031',
  'authenticated', 'authenticated', 'cost-reviewer@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.organization_members (organization_id, user_id, role)
values (
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000031',
  'viewer'
);
insert into public.brand_members (brand_id, user_id, role)
values (
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000031',
  'reviewer'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.source_documents (
  id, organization_id, source_type, title, status, content_hash
)
values (
  '50000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000001',
  'rss',
  'Cost observability robotics source',
  'analyzed',
  repeat('3', 64)
);

insert into public.source_brand_links (
  organization_id, source_document_id, brand_id, relevance_score, routing_reason
)
values (
  '10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000031',
  '20000000-0000-4000-8000-000000000001',
  100,
  'Cost observability test fixture'
);

insert into public.opportunities (
  id, organization_id, brand_id, source_document_id, value_nucleus,
  opportunity_score, risk_penalty, score_breakdown, status
)
values (
  '60000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000031',
  'A cost-visible robotics opportunity.',
  82,
  0,
  '{}'::jsonb,
  'ready_to_generate'
);

insert into public.post_drafts (
  id, organization_id, brand_id, opportunity_id, content_style, tone, status
)
values (
  '70000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000031',
  'newsworthy_authority',
  'thoughtful',
  'ready_for_review'
);

insert into public.image_assets (
  id, organization_id, brand_id, post_draft_id, image_style, concept, status, model
)
values (
  '80000000-0000-4000-8000-000000000031',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000031',
  'editorial_hero',
  'A test concept',
  'generating',
  'gpt-image-2'
);

insert into public.generation_runs (
  id, organization_id, brand_id, run_type, entity_type, entity_id,
  workflow_name, idempotency_key, status, started_at, completed_at, model_usage
)
values
  (
    '90000000-0000-4000-8000-000000000031',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'research',
    'opportunity',
    '60000000-0000-4000-8000-000000000031',
    'WF-05 Research',
    'cost-observability-research-31',
    'succeeded',
    now(),
    now(),
    jsonb_build_object(
      'model', 'gpt-5.6-terra',
      'inputTokens', 20000,
      'outputTokens', 2000,
      'webSearchCalls', 2,
      'estimatedCostUsd', 0.12
    )
  ),
  (
    '90000000-0000-4000-8000-000000000032',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'post_generation',
    'post_draft',
    '70000000-0000-4000-8000-000000000031',
    'WF-06 Angle and Post Generation',
    'cost-observability-writing-31',
    'succeeded',
    now(),
    now(),
    jsonb_build_object(
      'model', 'gpt-5.6-terra',
      'usage', jsonb_build_object(
        'inputTokens', 4000,
        'outputTokens', 1000,
        'estimatedCostUsd', 0.05
      ),
      'costUsd', 0.05
    )
  ),
  (
    '90000000-0000-4000-8000-000000000033',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'image_generation',
    'image_asset',
    '80000000-0000-4000-8000-000000000031',
    'WF-08 Image Generation',
    'cost-observability-image-31',
    'succeeded',
    now(),
    now(),
    jsonb_build_object(
      'model', 'gpt-image-2',
      'usage', jsonb_build_object(
        'inputTokens', 200,
        'outputTokens', 100,
        'estimatedCostUsd', 0.005
      ),
      'costUsd', 0.005
    )
  ),
  (
    '90000000-0000-4000-8000-000000000034',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'post_verification',
    'post_draft',
    '70000000-0000-4000-8000-000000000031',
    'WF-07 Post Verification',
    'cost-observability-verification-31',
    'succeeded',
    now(),
    now(),
    jsonb_build_object('model', 'deterministic-verifier-v1', 'costUsd', 0)
  );

update public.generation_runs
set created_at = '2099-01-01 00:00:00+00'::timestamptz
where id in (
  '90000000-0000-4000-8000-000000000031',
  '90000000-0000-4000-8000-000000000032',
  '90000000-0000-4000-8000-000000000033',
  '90000000-0000-4000-8000-000000000034'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000031', true);

select is(
  (public.get_brand_ai_cost_observability(
    '20000000-0000-4000-8000-000000000001',
    '2098-12-31 00:00:00+00'::timestamptz
  ) ->> 'totalCostUsd')::numeric,
  0.175::numeric,
  'brand total sums actual recorded AI costs without inflating zero-cost work'
);
select is(
  (public.get_brand_ai_cost_observability(
    '20000000-0000-4000-8000-000000000001',
    '2098-12-31 00:00:00+00'::timestamptz
  ) ->> 'paidRunCount')::integer,
  3,
  'paid run count excludes the deterministic zero-cost verification'
);
select is(
  (public.get_brand_ai_cost_observability(
    '20000000-0000-4000-8000-000000000001',
    '2098-12-31 00:00:00+00'::timestamptz
  ) ->> 'inputTokens')::integer,
  24200,
  'flat and nested input-token shapes are combined'
);
select is(
  (public.get_brand_ai_cost_observability(
    '20000000-0000-4000-8000-000000000001',
    '2098-12-31 00:00:00+00'::timestamptz
  ) ->> 'webSearchCalls')::integer,
  2,
  'research web-search usage remains visible'
);
select is(
  (public.get_brand_ai_cost_observability(
    '20000000-0000-4000-8000-000000000001',
    '2098-12-31 00:00:00+00'::timestamptz
  ) ->> 'generatedImages')::integer,
  1,
  'successful generated images are counted'
);
select is(
  jsonb_array_length(public.get_brand_ai_cost_observability(
    '20000000-0000-4000-8000-000000000001',
    '2098-12-31 00:00:00+00'::timestamptz
  ) -> 'byStage'),
  4,
  'stage breakdown includes paid and deterministic AI-related steps'
);
select is(
  public.get_brand_ai_cost_observability(
    '20000000-0000-4000-8000-000000000001',
    '2098-12-31 00:00:00+00'::timestamptz
  ) #>> '{bySourceType,0,key}',
  'rss',
  'source-type attribution follows the content package'
);
select is(
  public.get_brand_ai_cost_observability(
    '20000000-0000-4000-8000-000000000001',
    '2098-12-31 00:00:00+00'::timestamptz
  ) #>> '{byPackage,0,sourceTitle}',
  'Cost observability robotics source',
  'content-package attribution retains the source title'
);
select is(
  (
    public.get_brand_ai_cost_observability(
      '20000000-0000-4000-8000-000000000001',
      '2098-12-31 00:00:00+00'::timestamptz
    ) #>> '{byPackage,0,reviewReadyCount}'
  )::integer,
  1,
  'content-package attribution exposes review readiness'
);
select throws_ok(
  $$
    select public.get_brand_ai_cost_observability(
      '20000000-0000-4000-8000-000000000002',
      '2098-12-31 00:00:00+00'::timestamptz
    )
  $$,
  '42501',
  'Brand access denied',
  'a reviewer cannot inspect costs for an unassigned brand'
);

select * from finish();
rollback;
