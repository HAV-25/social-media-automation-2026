begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '40000000-0000-4000-8000-000000000081',
  'authenticated', 'authenticated', 'archive-editor@example.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now()
);

insert into public.organizations (id, name)
values
  ('10000000-0000-4000-8000-000000000081', 'Archive policy test'),
  ('10000000-0000-4000-8000-000000000082', 'Outside archive policy test');

insert into public.profiles (user_id, display_name, email)
values (
  '40000000-0000-4000-8000-000000000081',
  'Archive editor',
  'archive-editor@example.test'
);

insert into public.organization_members (organization_id, user_id, role)
values (
  '10000000-0000-4000-8000-000000000081',
  '40000000-0000-4000-8000-000000000081',
  'reviewer'
);

insert into public.brands (id, organization_id, name, slug)
values
  (
    '20000000-0000-4000-8000-000000000081',
    '10000000-0000-4000-8000-000000000081',
    'Archive brand',
    'archive-brand'
  ),
  (
    '20000000-0000-4000-8000-000000000082',
    '10000000-0000-4000-8000-000000000082',
    'Outside archive brand',
    'outside-archive-brand'
  );

insert into public.brand_profiles (brand_id)
values
  ('20000000-0000-4000-8000-000000000081'),
  ('20000000-0000-4000-8000-000000000082');

insert into public.brand_members (brand_id, user_id, role)
values (
  '20000000-0000-4000-8000-000000000081',
  '40000000-0000-4000-8000-000000000081',
  'editor'
);

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000081', true);

select is(
  (
    select rss_inbox_window_hours
    from public.brand_profiles
    where brand_id = '20000000-0000-4000-8000-000000000081'
  ),
  24::smallint,
  'new brands receive the 24-hour inbox default'
);

select lives_ok(
  $$
    update public.brand_profiles
    set rss_inbox_window_hours = 48,
        rss_resurface_window_hours = 12
    where brand_id = '20000000-0000-4000-8000-000000000081'
  $$,
  'an assigned editor can update the brand archive policy'
);

select results_eq(
  $$
    select rss_inbox_window_hours::integer, rss_resurface_window_hours::integer
    from public.brand_profiles
    where brand_id = '20000000-0000-4000-8000-000000000081'
  $$,
  $$
    values (48, 12)
  $$,
  'both rolling windows persist'
);

select is(
  (
    select count(*)::integer
    from public.audit_logs
    where action = 'brand.archive_policy_updated'
      and brand_id = '20000000-0000-4000-8000-000000000081'
  ),
  1,
  'one atomic audit event records the update'
);

select is(
  (
    select metadata #>> '{current,rssInboxWindowHours}'
    from public.audit_logs
    where action = 'brand.archive_policy_updated'
      and brand_id = '20000000-0000-4000-8000-000000000081'
  ),
  '48',
  'the audit event preserves the effective policy'
);

select is_empty(
  $$
    update public.brand_profiles
    set rss_inbox_window_hours = 72
    where brand_id = '20000000-0000-4000-8000-000000000082'
    returning 1
  $$,
  'an editor cannot update another organization brand'
);

select throws_ok(
  $$
    update public.brand_profiles
    set rss_inbox_window_hours = 5
    where brand_id = '20000000-0000-4000-8000-000000000081'
  $$,
  '23514',
  null,
  'an inbox window below the supported bound is rejected'
);

set local role service_role;
update public.brand_members
set role = 'viewer'
where brand_id = '20000000-0000-4000-8000-000000000081'
  and user_id = '40000000-0000-4000-8000-000000000081';
set local role authenticated;

select is_empty(
  $$
    update public.brand_profiles
    set rss_resurface_window_hours = 48
    where brand_id = '20000000-0000-4000-8000-000000000081'
    returning 1
  $$,
  'a viewer cannot change archive controls'
);

select * from finish();
rollback;
