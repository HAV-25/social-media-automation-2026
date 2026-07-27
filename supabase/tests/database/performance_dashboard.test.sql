begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '40000000-0000-4000-8000-000000000071',
  'authenticated', 'authenticated', 'performance-reviewer@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.organizations (id, name)
values
  ('10000000-0000-4000-8000-000000000071', 'Performance test'),
  ('10000000-0000-4000-8000-000000000072', 'Outside performance test');

insert into public.profiles (user_id, display_name, email)
values (
  '40000000-0000-4000-8000-000000000071',
  'Performance reviewer',
  'performance-reviewer@example.test'
);

insert into public.organization_members (organization_id, user_id, role)
values (
  '10000000-0000-4000-8000-000000000071',
  '40000000-0000-4000-8000-000000000071',
  'reviewer'
);

insert into public.brands (id, organization_id, name, slug)
values
  (
    '20000000-0000-4000-8000-000000000071',
    '10000000-0000-4000-8000-000000000071',
    'Performance brand',
    'performance-brand'
  ),
  (
    '20000000-0000-4000-8000-000000000072',
    '10000000-0000-4000-8000-000000000072',
    'Outside performance brand',
    'outside-performance-brand'
  );

insert into public.brand_members (brand_id, user_id, role)
values (
  '20000000-0000-4000-8000-000000000071',
  '40000000-0000-4000-8000-000000000071',
  'reviewer'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

insert into public.rss_feeds (
  id, organization_id, name, feed_url, active, last_polled_at,
  last_success_at, consecutive_failures
)
values
  (
    '30000000-0000-4000-8000-000000000071',
    '10000000-0000-4000-8000-000000000071',
    'Healthy robotics feed',
    'https://example.test/healthy.xml',
    true,
    now() - interval '5 minutes',
    now() - interval '5 minutes',
    0
  ),
  (
    '30000000-0000-4000-8000-000000000072',
    '10000000-0000-4000-8000-000000000071',
    'Failing robotics feed',
    'https://example.test/failing.xml',
    true,
    now() - interval '5 minutes',
    now() - interval '2 hours',
    2
  );

insert into public.rss_feed_brand_links (
  organization_id, rss_feed_id, brand_id, generation_policy, minimum_score
)
values
  (
    '10000000-0000-4000-8000-000000000071',
    '30000000-0000-4000-8000-000000000071',
    '20000000-0000-4000-8000-000000000071',
    'score_then_research',
    75
  ),
  (
    '10000000-0000-4000-8000-000000000071',
    '30000000-0000-4000-8000-000000000072',
    '20000000-0000-4000-8000-000000000071',
    'score_then_research',
    75
  );

insert into public.source_documents (
  id, organization_id, source_type, title, status, content_hash
)
values (
  '50000000-0000-4000-8000-000000000071',
  '10000000-0000-4000-8000-000000000071',
  'rss',
  'Performance robotics source',
  'analyzed',
  repeat('7', 64)
);

insert into public.opportunities (
  id, organization_id, brand_id, source_document_id, value_nucleus,
  opportunity_score, risk_penalty, score_breakdown, status
)
values (
  '60000000-0000-4000-8000-000000000071',
  '10000000-0000-4000-8000-000000000071',
  '20000000-0000-4000-8000-000000000071',
  '50000000-0000-4000-8000-000000000071',
  'A measurable robotics opportunity.',
  82,
  0,
  '{}'::jsonb,
  'ready_to_generate'
);

insert into public.post_drafts (
  id, organization_id, brand_id, opportunity_id, content_style, tone, status, created_at
)
values
  (
    '70000000-0000-4000-8000-000000000071',
    '10000000-0000-4000-8000-000000000071',
    '20000000-0000-4000-8000-000000000071',
    '60000000-0000-4000-8000-000000000071',
    'newsworthy_authority',
    'thoughtful',
    'ready_for_review',
    now() - interval '1 minute'
  ),
  (
    '70000000-0000-4000-8000-000000000072',
    '10000000-0000-4000-8000-000000000071',
    '20000000-0000-4000-8000-000000000071',
    '60000000-0000-4000-8000-000000000071',
    'educational_breakdown',
    'thoughtful',
    'rejected',
    now() - interval '1 minute'
  );

insert into public.feedback_events (
  organization_id, brand_id, post_draft_id, event_type, reason, user_id, created_at
)
values
  (
    '10000000-0000-4000-8000-000000000071',
    '20000000-0000-4000-8000-000000000071',
    '70000000-0000-4000-8000-000000000071',
    'approve',
    null,
    '40000000-0000-4000-8000-000000000071',
    now() - interval '1 minute'
  ),
  (
    '10000000-0000-4000-8000-000000000071',
    '20000000-0000-4000-8000-000000000071',
    '70000000-0000-4000-8000-000000000072',
    'reject',
    'The opening is too generic.',
    '40000000-0000-4000-8000-000000000071',
    now() - interval '1 minute'
  );

insert into public.generation_runs (
  organization_id, brand_id, run_type, entity_type, entity_id,
  workflow_name, idempotency_key, status, started_at, completed_at, created_at
)
values (
  '10000000-0000-4000-8000-000000000071',
  '20000000-0000-4000-8000-000000000071',
  'research',
  'opportunity',
  '60000000-0000-4000-8000-000000000071',
  'WF-05 Research',
  'performance-dashboard-research-71',
  'succeeded',
  now(),
  now(),
  now() - interval '1 minute'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000071', true);

select is(
  (public.get_brand_performance_dashboard(
    '20000000-0000-4000-8000-000000000071',
    now() - interval '1 hour',
    now()
  ) #>> '{feedHealth,totalCount}')::integer,
  2,
  'all routed feeds are counted'
);
select is(
  (public.get_brand_performance_dashboard(
    '20000000-0000-4000-8000-000000000071',
    now() - interval '1 hour',
    now()
  ) #>> '{feedHealth,healthyCount}')::integer,
  1,
  'healthy feed is classified'
);
select is(
  (public.get_brand_performance_dashboard(
    '20000000-0000-4000-8000-000000000071',
    now() - interval '1 hour',
    now()
  ) #>> '{feedHealth,attentionCount}')::integer,
  1,
  'failing feed needs attention'
);
select is(
  (public.get_brand_performance_dashboard(
    '20000000-0000-4000-8000-000000000071',
    now() - interval '1 hour',
    now()
  ) #>> '{decisions,approvedCount}')::integer,
  1,
  'approval volume is reported'
);
select is(
  (public.get_brand_performance_dashboard(
    '20000000-0000-4000-8000-000000000071',
    now() - interval '1 hour',
    now()
  ) #>> '{decisions,rejectedCount}')::integer,
  1,
  'rejection volume is reported'
);
select is(
  (public.get_brand_performance_dashboard(
    '20000000-0000-4000-8000-000000000071',
    now() - interval '1 hour',
    now()
  ) #>> '{decisions,approvalRate}')::numeric,
  50.0::numeric,
  'approval rate uses only approved and rejected decisions'
);
select is(
  public.get_brand_performance_dashboard(
    '20000000-0000-4000-8000-000000000071',
    now() - interval '1 hour',
    now()
  ) #>> '{decisions,rejectionReasons,0,reason}',
  'The opening is too generic.',
  'rejection reason remains visible'
);
select is(
  (public.get_brand_performance_dashboard(
    '20000000-0000-4000-8000-000000000071',
    now() - interval '1 hour',
    now()
  ) #>> '{generationVolume,draftCount}')::integer,
  2,
  'draft variants are counted'
);
select is(
  (public.get_brand_performance_dashboard(
    '20000000-0000-4000-8000-000000000071',
    now() - interval '1 hour',
    now()
  ) #>> '{generationVolume,opportunityCount}')::integer,
  1,
  'distinct prepared opportunities are counted'
);
select throws_ok(
  $$
    select public.get_brand_performance_dashboard(
      '20000000-0000-4000-8000-000000000072',
      now() - interval '1 hour',
      now()
    )
  $$,
  '42501',
  'Brand access denied',
  'unassigned brand performance is denied'
);
select throws_ok(
  $$
    select public.get_brand_performance_dashboard(
      '20000000-0000-4000-8000-000000000071',
      now(),
      now() - interval '1 hour'
    )
  $$,
  '22023',
  'Invalid performance dashboard window',
  'invalid reporting windows fail closed'
);

select * from finish();
rollback;
