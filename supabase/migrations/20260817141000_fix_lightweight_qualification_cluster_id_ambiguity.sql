-- Fix PL/pgSQL ambiguity between the local cluster_id variable and table columns.
-- This migration is intentionally narrow and fails if the expected function body
-- is not present, preventing an accidental rewrite of a different definition.
do $migration$
declare
  function_sql text;
begin
  select pg_get_functiondef(p.oid)
    into function_sql
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'qualify_lightweight_source';

  if function_sql is null
     or position('cluster_id uuid;' in function_sql) = 0 then
    raise exception 'Expected private.qualify_lightweight_source definition not found';
  end if;

  function_sql := replace(function_sql,
    'cluster_id uuid;', 'cluster_id_value uuid;');
  function_sql := replace(function_sql,
    'returning id into cluster_id;', 'returning id into cluster_id_value;');
  function_sql := replace(function_sql,
    'source_record.organization_id, cluster_id, source_record.id',
    'source_record.organization_id, cluster_id_value, source_record.id');
  function_sql := replace(function_sql,
    E'    cluster_id,\n    payload ->> ''valueNucleus''',
    E'    cluster_id_value,\n    payload ->> ''valueNucleus''');

  execute function_sql;
end
$migration$;

-- Rollback, if required: apply the inverse replacements in a new migration,
-- changing only cluster_id_value back to cluster_id in this function body.
