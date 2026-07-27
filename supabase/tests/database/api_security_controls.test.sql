begin;

create extension if not exists pgtap with schema extensions;
select plan(8);

select has_table(
  'private',
  'api_rate_limit_counters',
  'private API rate-limit counters exist'
);
select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'private.api_rate_limit_counters'::regclass
  ),
  'private API rate-limit counters have RLS enabled'
);
select is(
  has_table_privilege('authenticated', 'private.api_rate_limit_counters', 'select'),
  false,
  'authenticated users cannot read API rate-limit counters'
);

set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

select is(
  (public.consume_api_rate_limit(
    'user',
    repeat('a', 64),
    'post:/api/inputs',
    2,
    60
  ) ->> 'allowed')::boolean,
  true,
  'first request in the fixed window is allowed'
);
select is(
  (public.consume_api_rate_limit(
    'user',
    repeat('a', 64),
    'post:/api/inputs',
    2,
    60
  ) ->> 'allowed')::boolean,
  true,
  'second request in the fixed window is allowed'
);
select is(
  (public.consume_api_rate_limit(
    'user',
    repeat('a', 64),
    'post:/api/inputs',
    2,
    60
  ) ->> 'allowed')::boolean,
  false,
  'third request in the same fixed window is denied'
);
select is(
  (
    select request_count
    from private.api_rate_limit_counters
    where scope = 'user'
      and subject_hash = repeat('a', 64)
      and operation = 'post:/api/inputs'
  ),
  2,
  'denied requests do not increase the durable counter beyond its cap'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select throws_ok(
  $$
    select public.consume_api_rate_limit(
      'internal',
      repeat('b', 64),
      'post:/api/internal/workflows/rss/intake',
      2,
      60
    )
  $$,
  '42501',
  null,
  'authenticated callers cannot consume internal limits'
);

select * from finish();
rollback;
