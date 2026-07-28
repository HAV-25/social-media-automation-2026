-- A recovery replay is a new bounded attempt, not a duplicate delivery of the
-- failed attempt. Give the replay a deterministic attempt-specific
-- idempotency key before it leaves the durable recovery queue. This keeps
-- provider/budget mutations idempotent within an attempt while allowing a
-- failed attempt to be retried.
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
  select
    claimed.recovery_id,
    claimed.generation_run_id,
    claimed.target,
    jsonb_set(
      claimed.request_payload,
      '{idempotencyKey}',
      to_jsonb(
        format(
          'wf10-replay:%s:%s',
          claimed.recovery_id,
          claimed.attempt_count
        )
      ),
      true
    ),
    claimed.attempt_count
  from private.claim_due_recovery_replays(requested_limit) claimed;
end;
$$;

revoke all on function public.claim_due_recovery_replays(integer)
  from public, anon, authenticated;
grant execute on function public.claim_due_recovery_replays(integer)
  to service_role;

-- Requeue only recoveries proven to have been rejected by the old
-- same-idempotency replay behavior. Other dead letters remain untouched.
update public.run_recoveries recovery
set status = 'scheduled',
    category = 'transient',
    error_code = 'replay_idempotency_conflict',
    retryable = true,
    next_retry_at = now(),
    lease_expires_at = null,
    updated_at = now()
from public.generation_runs active_run
where recovery.active_generation_run_id = active_run.id
  and recovery.status = 'dead_letter'
  and recovery.target = 'research'
  and active_run.error ->> 'code' = 'research_already_running'
  and recovery.attempt_count < recovery.max_attempts;
