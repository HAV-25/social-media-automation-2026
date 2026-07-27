begin;

create extension if not exists pgtap with schema extensions;
select plan(22);

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
    '40000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'admin@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'editor@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'reviewer@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'other@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000005',
    'authenticated',
    'authenticated',
    'viewer@example.test',
    '',
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

insert into public.organizations (id, name)
values
  ('10000000-0000-4000-8000-000000000001', 'Primary test organization'),
  ('30000000-0000-4000-8000-000000000001', 'Other test organization')
on conflict (id) do nothing;

insert into public.brands (id, organization_id, name, slug)
values (
  '30000000-0000-4000-8000-000000000002',
  '30000000-0000-4000-8000-000000000001',
  'Other brand',
  'other-brand'
)
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'administrator'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    'viewer'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003',
    'viewer'
  ),
  (
    '30000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000004',
    'administrator'
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000005',
    'viewer'
  );

insert into public.brand_members (brand_id, user_id, role)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    'editor'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000003',
    'reviewer'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000005',
    'viewer'
  );

insert into public.generation_runs (
  id,
  organization_id,
  brand_id,
  run_type,
  entity_type,
  entity_id,
  workflow_name,
  idempotency_key,
  status
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'research',
    'opportunity',
    '61000000-0000-4000-8000-000000000001',
    'WF-05 Research',
    'tenancy-run-primary-0001',
    'running'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    'research',
    'opportunity',
    '61000000-0000-4000-8000-000000000002',
    'WF-05 Research',
    'tenancy-run-other-0002',
    'failed'
  );

insert into public.pipeline_events (
  organization_id,
  brand_id,
  generation_run_id,
  entity_type,
  entity_id,
  event_type,
  to_status,
  correlation_id
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001',
    'opportunity',
    '61000000-0000-4000-8000-000000000001',
    'research.started',
    'running',
    '62000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000002',
    '60000000-0000-4000-8000-000000000002',
    'opportunity',
    '61000000-0000-4000-8000-000000000002',
    'research.failed',
    'failed',
    '62000000-0000-4000-8000-000000000002'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000001', true);

select results_eq(
  $$ select count(*)::bigint from public.brands $$,
  array[5::bigint],
  'organization administrator can read every brand in their organization'
);
select results_eq(
  $$ select count(*)::bigint from public.brands where organization_id = '30000000-0000-4000-8000-000000000001' $$,
  array[0::bigint],
  'organization administrator cannot read a different organization'
);
select results_eq(
  $$
    select array_agg(id order by id)
    from public.generation_runs
    where id in (
      '60000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values (array['60000000-0000-4000-8000-000000000001'::uuid]) $$,
  'organization administrator reads only runs in their organization'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.pipeline_events
    where correlation_id in (
      '62000000-0000-4000-8000-000000000001',
      '62000000-0000-4000-8000-000000000002'
    )
  $$,
  array[1::bigint],
  'organization administrator reads only pipeline events in their organization'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000002', true);
select results_eq(
  $$ select array_agg(id order by id) from public.brands $$,
  $$ values (array['20000000-0000-4000-8000-000000000001'::uuid]) $$,
  'brand editor reads only their assigned brand'
);
select results_eq(
  $$
    select array_agg(id order by id)
    from public.generation_runs
    where id in (
      '60000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002'
    )
  $$,
  $$ values (array['60000000-0000-4000-8000-000000000001'::uuid]) $$,
  'brand editor reads only runs for their assigned brand'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.pipeline_events
    where correlation_id in (
      '62000000-0000-4000-8000-000000000001',
      '62000000-0000-4000-8000-000000000002'
    )
  $$,
  array[1::bigint],
  'brand editor reads only pipeline events for their assigned brand'
);
select results_eq(
  $$
    update public.brand_profiles
    set positioning = 'Assigned editor configuration'
    where brand_id = '20000000-0000-4000-8000-000000000001'
    returning brand_id
  $$,
  array['20000000-0000-4000-8000-000000000001'::uuid],
  'assigned editor can change brand configuration'
);
select throws_ok(
  $$
    update public.brands
    set status = 'archived'
    where id = '20000000-0000-4000-8000-000000000001'
  $$,
  '42501',
  'Only organization administrators may change brand lifecycle status',
  'editor cannot change administrator-only brand lifecycle status'
);
select throws_ok(
  $$ select * from public.ingest_manual_input('{}'::jsonb) $$,
  '42501',
  'permission denied for function ingest_manual_input',
  'authenticated clients cannot call the service-only manual intake mutation directly'
);
select throws_ok(
  $$ select * from public.record_source_failure('{}'::jsonb) $$,
  '42501',
  'permission denied for function record_source_failure',
  'authenticated clients cannot call the service-only extraction failure mutation directly'
);
select throws_ok(
  $$ select * from public.upsert_rss_feed('{}'::jsonb) $$,
  '42501',
  'permission denied for function upsert_rss_feed',
  'authenticated clients cannot call the service-only feed mutation directly'
);
select throws_ok(
  $$ select * from public.reserve_rss_generation('{}'::jsonb) $$,
  '42501',
  'permission denied for function reserve_rss_generation',
  'authenticated clients cannot call the service-only feed limit reservation directly'
);
select throws_ok(
  $$ select * from public.record_rss_poll('{}'::jsonb) $$,
  '42501',
  'permission denied for function record_rss_poll',
  'authenticated clients cannot call the service-only feed health mutation directly'
);
select lives_ok(
  $$
    insert into public.rss_feeds (
      id,
      organization_id,
      name,
      feed_url,
      created_by
    )
    values (
      '50000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'Editor feed',
      'https://example.test/feed.xml',
      '40000000-0000-4000-8000-000000000002'
    )
  $$,
  'assigned editor can create an organization feed'
);
select lives_ok(
  $$
    insert into public.rss_feed_brand_links (
      organization_id,
      rss_feed_id,
      brand_id
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001'
    )
  $$,
  'assigned editor can route the feed to their brand'
);
select results_eq(
  $$
    select count(*)::bigint
    from public.rss_feeds
    where id = '50000000-0000-4000-8000-000000000001'
  $$,
  array[1::bigint],
  'editor can read a feed after it is linked to their brand'
);
select throws_ok(
  $$
    insert into public.rss_feed_brand_links (
      organization_id,
      rss_feed_id,
      brand_id
    )
    values (
      '30000000-0000-4000-8000-000000000001',
      '50000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "rss_feed_brand_links"',
  'cross-organization feed routing is denied'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000003', true);
select results_eq(
  $$
    update public.brand_profiles
    set positioning = 'Reviewer attempted infrastructure edit'
    where brand_id = '20000000-0000-4000-8000-000000000001'
    returning brand_id
  $$,
  $$ select null::uuid where false $$,
  'reviewer cannot change brand configuration'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000005', true);
select throws_ok(
  $$
    insert into public.rss_feeds (
      organization_id,
      name,
      feed_url,
      created_by
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      'Viewer feed',
      'https://viewer.example.test/feed.xml',
      '40000000-0000-4000-8000-000000000005'
    )
  $$,
  '42501',
  'new row violates row-level security policy for table "rss_feeds"',
  'viewer cannot create a feed'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000004', true);
select results_eq(
  $$ select array_agg(id order by id) from public.brands $$,
  $$ values (array['30000000-0000-4000-8000-000000000002'::uuid]) $$,
  'other organization administrator sees only the other organization'
);

set local role anon;
select throws_ok(
  $$ select count(*) from public.brands $$,
  '42501',
  'permission denied for table brands',
  'anonymous role has no application-table grant'
);

select * from finish();
rollback;
