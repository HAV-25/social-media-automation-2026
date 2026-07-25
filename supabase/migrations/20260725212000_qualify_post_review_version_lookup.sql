do $migration$
declare
  function_definition text;
  corrected_definition text;
begin
  function_definition := pg_get_functiondef('private.review_post(jsonb)'::regprocedure);
  corrected_definition := replace(
    function_definition,
    'from public.post_versions' || chr(13) || chr(10) ||
      '    where post_draft_id = target_draft_id;',
    'from public.post_versions version' || chr(13) || chr(10) ||
      '    where version.post_draft_id = target_draft_id;'
  );

  if corrected_definition = function_definition then
    corrected_definition := replace(
      function_definition,
      'from public.post_versions' || chr(10) ||
        '    where post_draft_id = target_draft_id;',
      'from public.post_versions version' || chr(10) ||
        '    where version.post_draft_id = target_draft_id;'
    );
  end if;

  if corrected_definition = function_definition then
    raise exception 'private.review_post version lookup was not in the expected form';
  end if;

  execute corrected_definition;
end;
$migration$;

revoke all on function private.review_post(jsonb) from public, anon, authenticated;
grant execute on function private.review_post(jsonb) to service_role;
