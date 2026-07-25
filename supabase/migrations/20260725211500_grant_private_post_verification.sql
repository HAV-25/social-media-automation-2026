-- The public SQL wrapper executes as its caller and therefore needs the
-- service role to be able to invoke its private implementation.
revoke all on function private.verify_evaluated_post(jsonb)
  from public, anon, authenticated;
grant execute on function private.verify_evaluated_post(jsonb) to service_role;
