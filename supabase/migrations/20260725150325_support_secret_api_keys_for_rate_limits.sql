-- Supabase secret API keys are opaque credentials. The API gateway maps them
-- to the service_role database role, but they do not expose the legacy
-- request.jwt.claim.role setting used by JWT-shaped service keys.
create or replace function private.consume_api_rate_limit(
  requested_scope text,
  requested_subject_hash text,
  requested_operation text,
  requested_limit integer,
  requested_window_seconds integer
)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  observed_at timestamptz := clock_timestamp();
  bucket_started_at timestamptz;
  bucket_ends_at timestamptz;
  observed_count integer;
  request_allowed boolean;
begin
  if current_user <> 'service_role' then
    raise exception using errcode = '42501', message = 'API rate limiting requires a service request';
  end if;
  if requested_scope not in ('user', 'internal')
    or requested_subject_hash !~ '^[0-9a-f]{64}$'
    or requested_operation !~ '^[a-z0-9_:/.-]{1,180}$'
    or requested_limit not between 1 and 10000
    or requested_window_seconds not between 1 and 86400
  then
    raise exception using errcode = '22023', message = 'Invalid API rate limit request';
  end if;

  bucket_started_at := to_timestamp(
    floor(extract(epoch from observed_at) / requested_window_seconds)
      * requested_window_seconds
  );
  bucket_ends_at := bucket_started_at + make_interval(secs => requested_window_seconds);

  insert into private.api_rate_limit_counters (
    scope,
    subject_hash,
    operation,
    window_started_at,
    window_ends_at,
    request_count,
    created_at,
    updated_at
  )
  values (
    requested_scope,
    requested_subject_hash,
    requested_operation,
    bucket_started_at,
    bucket_ends_at,
    1,
    observed_at,
    observed_at
  )
  on conflict (scope, subject_hash, operation, window_started_at)
  do update
    set request_count = private.api_rate_limit_counters.request_count + 1,
        updated_at = observed_at
    where private.api_rate_limit_counters.request_count < requested_limit
  returning request_count into observed_count;

  request_allowed := observed_count is not null;
  if observed_count is null then
    select counter.request_count
    into observed_count
    from private.api_rate_limit_counters counter
    where counter.scope = requested_scope
      and counter.subject_hash = requested_subject_hash
      and counter.operation = requested_operation
      and counter.window_started_at = bucket_started_at;
  end if;

  return jsonb_build_object(
    'allowed', request_allowed,
    'limit', requested_limit,
    'remaining', greatest(requested_limit - observed_count, 0),
    'resetAt', bucket_ends_at
  );
end;
$$;

revoke all on function private.consume_api_rate_limit(text, text, text, integer, integer)
  from public, anon, authenticated;
grant execute on function private.consume_api_rate_limit(text, text, text, integer, integer)
  to service_role;
