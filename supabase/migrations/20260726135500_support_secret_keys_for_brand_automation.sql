-- The brand automation function was added after the general opaque-key
-- compatibility migration. Apply the same gateway claims guard to this newer
-- SECURITY DEFINER function without changing its owner, grants, or search path.
do $migration$
declare
  original_definition text;
  updated_definition text;
  legacy_guard constant text :=
    'coalesce(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role''';
  claims_guard constant text :=
    'coalesce(nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb ->> ''role'', '''') <> ''service_role''';
begin
  select pg_get_functiondef('private.reserve_rss_generation(jsonb)'::regprocedure)
  into original_definition;

  updated_definition := replace(original_definition, legacy_guard, claims_guard);
  if updated_definition = original_definition then
    raise exception 'Brand automation service-role guard was not updated';
  end if;

  execute updated_definition;
end;
$migration$;

revoke all on function private.reserve_rss_generation(jsonb)
  from public, anon, authenticated;
grant execute on function private.reserve_rss_generation(jsonb)
  to service_role;

revoke all on function public.reserve_rss_generation(jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_rss_generation(jsonb)
  to service_role;
