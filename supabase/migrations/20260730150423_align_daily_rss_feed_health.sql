-- WF-01 now polls once per day. Preserve the existing RLS-authorized,
-- SECURITY INVOKER dashboard function while replacing the obsolete
-- twice-the-15-minute-interval stale boundary with a 26-hour boundary. The
-- additional two hours allow for the 01:00 Europe/Berlin run and bounded
-- processing variance; an explicit poll failure still becomes `failing`
-- immediately through consecutive_failures.
do $$
declare
  function_definition text;
begin
  select pg_get_functiondef(
    'public.get_brand_performance_dashboard(uuid,timestamptz,timestamptz)'::regprocedure
  )
  into function_definition;

  if position('interval ''30 minutes''' in function_definition) = 0 then
    raise exception
      'Expected 30-minute feed-health boundary was not found'
      using errcode = 'P0001';
  end if;

  execute replace(
    function_definition,
    'interval ''30 minutes''',
    'interval ''26 hours'''
  );
end;
$$;

revoke all on function public.get_brand_performance_dashboard(
  uuid,
  timestamptz,
  timestamptz
) from public, anon;
grant execute on function public.get_brand_performance_dashboard(
  uuid,
  timestamptz,
  timestamptz
) to authenticated;

comment on function public.get_brand_performance_dashboard(
  uuid,
  timestamptz,
  timestamptz
) is
  'Returns an RLS-authorized brand dashboard using a 26-hour daily RSS feed-health window.';
