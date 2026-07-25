# Supabase development-project runbook

Target only the designated empty development project:
`hqffgchxwtymyfwtkmdt`.

Do not run these commands against the older `klaank` project
`wmrexnkicegnectgrmbt`.

## Preferred: Supabase CLI

Run these commands from the repository root. Authentication and the database
password must be entered through the CLI prompt or approved local secret
storage, never committed or pasted into the team input register.

```powershell
.\node_modules\.bin\supabase.cmd login
.\node_modules\.bin\supabase.cmd link --project-ref hqffgchxwtymyfwtkmdt
.\node_modules\.bin\supabase.cmd db push --linked --dry-run
.\node_modules\.bin\supabase.cmd db push --linked --include-seed
.\node_modules\.bin\supabase.cmd test db --linked supabase/tests/database
```

The dry run must list only the committed project migrations. Stop if it targets
a different project or reports unexpected remote migration history.

The database test runs in a transaction and rolls back its fixture users and
tenant data after checking cross-organization, cross-brand, role, and anonymous
access denial.

## SQL Editor fallback

For a new empty project, the SQL files can be run manually in this exact order:

1. `20260723125216_initial_tenancy_and_content_schema.sql`
2. `20260723201500_research_evidence_ledger.sql`
3. `20260723213000_editorial_quality_and_regeneration.sql`
4. `20260724111716_verify_editorial_post.sql`
5. `20260724154050_image_asset_persistence_and_storage.sql`
6. `20260724180022_operations_run_indexes.sql`
7. `20260724183139_run_recovery.sql`
8. `20260724190000_run_recovery_context_index.sql`
9. `20260724205940_api_security_controls.sql`
10. `seed.sql`
11. `tests/database/tenancy_rls.test.sql`
12. `tests/database/image_assets.test.sql`
13. `tests/database/run_recovery.test.sql`
14. `tests/database/api_security_controls.test.sql`

Open each local file, copy its complete contents into a fresh Supabase SQL
Editor query, confirm the active project reference is
`hqffgchxwtymyfwtkmdt`, and run it once. Stop on the first error.

The SQL Editor fallback does not create the same CLI migration-history records.
Do not later mix this method with `supabase db push` until migration history has
been reconciled. Prefer the CLI route whenever possible.

## Post-run evidence

Save the following in `docs/progress.md` without credentials:

- Project reference and region.
- Migration list/status.
- pgTAP result count.
- Any advisor warnings and their resolution.
- Date and operator.
