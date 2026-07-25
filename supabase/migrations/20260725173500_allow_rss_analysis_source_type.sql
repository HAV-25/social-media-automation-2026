-- WF-04 persists normalized RSS documents through the same atomic function used
-- by supported one-off sources. The initial validation list accidentally omitted
-- RSS even though the function's downstream run provenance already handles it.
do $migration$
declare
  function_definition text;
  updated_definition text;
begin
  function_definition :=
    pg_get_functiondef('private.ingest_manual_input(jsonb)'::regprocedure);

  if function_definition like E'%''plain_text'',\r\n      ''rss'',\r\n      ''url''%'
    or function_definition like E'%''plain_text'',\n      ''rss'',\n      ''url''%'
  then
    return;
  end if;

  updated_definition := replace(
    function_definition,
    E'''plain_text'',\r\n      ''url''',
    E'''plain_text'',\r\n      ''rss'',\r\n      ''url'''
  );
  if updated_definition = function_definition then
    updated_definition := replace(
      function_definition,
      E'''plain_text'',\n      ''url''',
      E'''plain_text'',\n      ''rss'',\n      ''url'''
    );
  end if;

  if updated_definition = function_definition then
    raise exception 'Expected ingest_manual_input source-type allowlist was not found';
  end if;

  execute updated_definition;
end;
$migration$;
