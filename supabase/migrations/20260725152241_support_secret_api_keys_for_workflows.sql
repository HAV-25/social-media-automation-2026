-- Opaque sb_secret API keys populate request.jwt.claims, not the legacy
-- request.jwt.claim.role setting. Rewrite the exact service-request guard in
-- every existing private workflow function while preserving each function's
-- body, SECURITY DEFINER setting, owner, grants, and safe search_path.
do $migration$
declare
  function_record record;
  original_definition text;
  updated_definition text;
  updated_count integer := 0;
  legacy_guard constant text :=
    'coalesce(current_setting(''request.jwt.claim.role'', true), '''') <> ''service_role''';
  claims_guard constant text :=
    'coalesce(nullif(current_setting(''request.jwt.claims'', true), '''')::jsonb ->> ''role'', '''') <> ''service_role''';
begin
  for function_record in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'private'
      and p.prokind = 'f'
      and pg_get_functiondef(p.oid) like '%' || legacy_guard || '%'
    order by p.oid
  loop
    original_definition := pg_get_functiondef(function_record.oid);
    updated_definition := replace(original_definition, legacy_guard, claims_guard);

    if updated_definition = original_definition then
      raise exception 'Service-role guard rewrite did not change function %',
        function_record.oid::regprocedure;
    end if;

    execute updated_definition;
    updated_count := updated_count + 1;
  end loop;

  if updated_count <> 24 then
    raise exception 'Expected to update 24 workflow functions, updated %', updated_count;
  end if;
end;
$migration$;
