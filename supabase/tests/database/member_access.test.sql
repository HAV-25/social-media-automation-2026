begin;

create extension if not exists pgtap with schema extensions;
select plan(9);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000061',
    'authenticated', 'authenticated', 'member-admin@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000062',
    'authenticated', 'authenticated', 'member-target@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '40000000-0000-4000-8000-000000000063',
    'authenticated', 'authenticated', 'member-outsider@example.test', '', now(),
    '{}'::jsonb, '{}'::jsonb, now(), now()
  );

insert into public.organizations (id, name)
values
  ('10000000-0000-4000-8000-000000000061', 'Member access test'),
  ('10000000-0000-4000-8000-000000000062', 'Other organization');

insert into public.profiles (user_id, display_name, email)
values
  (
    '40000000-0000-4000-8000-000000000061',
    'Member administrator',
    'member-admin@example.test'
  ),
  (
    '40000000-0000-4000-8000-000000000062',
    'Member target',
    'member-target@example.test'
  ),
  (
    '40000000-0000-4000-8000-000000000063',
    'Member outsider',
    'member-outsider@example.test'
  );

insert into public.organization_members (organization_id, user_id, role)
values
  (
    '10000000-0000-4000-8000-000000000061',
    '40000000-0000-4000-8000-000000000061',
    'administrator'
  ),
  (
    '10000000-0000-4000-8000-000000000061',
    '40000000-0000-4000-8000-000000000062',
    'reviewer'
  ),
  (
    '10000000-0000-4000-8000-000000000062',
    '40000000-0000-4000-8000-000000000063',
    'administrator'
  );

insert into public.brands (id, organization_id, name, slug)
values
  (
    '20000000-0000-4000-8000-000000000061',
    '10000000-0000-4000-8000-000000000061',
    'Member brand one',
    'member-brand-one'
  ),
  (
    '20000000-0000-4000-8000-000000000062',
    '10000000-0000-4000-8000-000000000061',
    'Member brand two',
    'member-brand-two'
  ),
  (
    '20000000-0000-4000-8000-000000000063',
    '10000000-0000-4000-8000-000000000062',
    'Outside brand',
    'outside-brand'
  );

insert into public.brand_members (brand_id, user_id, role)
values
  (
    '20000000-0000-4000-8000-000000000061',
    '40000000-0000-4000-8000-000000000062',
    'reviewer'
  ),
  (
    '20000000-0000-4000-8000-000000000062',
    '40000000-0000-4000-8000-000000000062',
    'reviewer'
  );

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000061', true);

select lives_ok(
  $$
    select public.manage_organization_member_access(
      jsonb_build_object(
        'organizationId', '10000000-0000-4000-8000-000000000061',
        'userId', '40000000-0000-4000-8000-000000000062',
        'organizationRole', 'editor',
        'brandAssignments', jsonb_build_array(
          jsonb_build_object(
            'brandId', '20000000-0000-4000-8000-000000000061',
            'role', 'viewer'
          )
        )
      )
    )
  $$,
  'administrator atomically changes a member role and brand access'
);

select results_eq(
  $$
    select role::text
    from public.organization_members
    where organization_id = '10000000-0000-4000-8000-000000000061'
      and user_id = '40000000-0000-4000-8000-000000000062'
  $$,
  array['editor'::text],
  'organization role changed'
);

select results_eq(
  $$
    select brand_id
    from public.brand_members
    where user_id = '40000000-0000-4000-8000-000000000062'
    order by brand_id
  $$,
  array['20000000-0000-4000-8000-000000000061'::uuid],
  'unselected brand membership was removed'
);

select results_eq(
  $$
    select role::text
    from public.brand_members
    where user_id = '40000000-0000-4000-8000-000000000062'
  $$,
  array['viewer'::text],
  'selected brand role changed'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.audit_logs
    where organization_id = '10000000-0000-4000-8000-000000000061'
      and action = 'organization_member.access_updated'
      and actor_id = '40000000-0000-4000-8000-000000000061'
      and entity_id = '40000000-0000-4000-8000-000000000062'
  $$,
  array[1::bigint],
  'member access change is audited once'
);

select throws_ok(
  $$
    select public.manage_organization_member_access(
      jsonb_build_object(
        'organizationId', '10000000-0000-4000-8000-000000000061',
        'userId', '40000000-0000-4000-8000-000000000062',
        'organizationRole', 'reviewer',
        'brandAssignments', jsonb_build_array(
          jsonb_build_object(
            'brandId', '20000000-0000-4000-8000-000000000063',
            'role', 'reviewer'
          )
        )
      )
    )
  $$,
  '42501',
  'A brand assignment is outside the organization or inactive',
  'cross-organization brand assignment is rejected'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000062', true);
select throws_ok(
  $$
    select public.manage_organization_member_access(
      jsonb_build_object(
        'organizationId', '10000000-0000-4000-8000-000000000061',
        'userId', '40000000-0000-4000-8000-000000000062',
        'organizationRole', 'reviewer',
        'brandAssignments', '[]'::jsonb
      )
    )
  $$,
  '42501',
  'Organization administrator permission required',
  'non-administrator cannot change membership'
);

select set_config('request.jwt.claim.sub', '40000000-0000-4000-8000-000000000061', true);
select throws_ok(
  $$
    select public.manage_organization_member_access(
      jsonb_build_object(
        'organizationId', '10000000-0000-4000-8000-000000000061',
        'userId', '40000000-0000-4000-8000-000000000061',
        'organizationRole', 'editor',
        'brandAssignments', '[]'::jsonb
      )
    )
  $$,
  '23514',
  'The organization must retain at least one administrator',
  'last administrator cannot be demoted'
);

select results_eq(
  $$
    select role::text
    from public.organization_members
    where organization_id = '10000000-0000-4000-8000-000000000061'
      and user_id = '40000000-0000-4000-8000-000000000061'
  $$,
  array['administrator'::text],
  'failed last-administrator demotion leaves the role intact'
);

select * from finish();
rollback;
