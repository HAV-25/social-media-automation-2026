-- Keep the database integrity boundary aligned with the versioned application
-- contract: a quarantined do_not_use claim must remain in the immutable ledger,
-- but it does not veto a separately usable core claim.
do $migration$
declare
  definition text;
  corrected text;
begin
  select pg_get_functiondef('private.persist_research_evidence(jsonb)'::regprocedure)
  into definition;

  corrected := replace(
    definition,
    E'where claim.value ->> ''importance'' = ''core''\n        and claim.value ->> ''verificationState'' in (''unsupported'', ''disputed'')',
    E'where claim.value ->> ''importance'' = ''core''\n        and claim.value ->> ''usageGuidance'' <> ''do_not_use''\n        and claim.value ->> ''verificationState'' in (''unsupported'', ''disputed'')'
  );
  if corrected = definition then
    raise exception 'Expected unqualified research readiness blocker was not found';
  end if;

  execute corrected;
end
$migration$;
