-- Supabase opaque secret keys are mapped to the service_role database role but
-- do not populate the legacy request.jwt.claim.role setting. Authorize while
-- this public wrapper is still running as the invoker, then set the
-- transaction-local compatibility claim consumed by the private SECURITY
-- DEFINER implementation. Only service_role may execute this RPC.
create or replace function public.claim_due_recovery_replays(requested_limit integer)
returns table (
  recovery_id uuid,
  generation_run_id uuid,
  target public.recovery_target,
  request_payload jsonb,
  attempt_count integer
)
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Recovery claiming requires a service request';
  end if;

  perform set_config('request.jwt.claim.role', 'service_role', true);

  return query
  select *
  from private.claim_due_recovery_replays(requested_limit);
end;
$$;

revoke all on function public.claim_due_recovery_replays(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_recovery_replays(integer)
  to service_role;
