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

For a new empty project, run every committed `.sql` file in
`supabase/migrations` in ascending filename order. The timestamp prefix is the
authoritative order and prevents this fallback list from becoming stale as
features are added. Then run:

1. `supabase/seed.sql`
2. Every committed `.sql` file in `supabase/tests/database` individually.

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
