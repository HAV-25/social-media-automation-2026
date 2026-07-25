# AI Social Content Engine

Internal multi-brand editorial research and Facebook content production desk.
Phase 1 ingests sources, identifies opportunities, builds evidence, creates
brand-specific posts and images, and requires human approval. It does not
publish or schedule content.

## Local setup

1. Install Node.js 20.9+ and pnpm 11.9.0.
2. Copy `.env.example` to `.env.local`.
3. Run `pnpm install`.
4. Run `pnpm dev`.

With `NEXT_PUBLIC_DEMO_MODE=true`, the dashboard works without paid credentials.
The Brands area includes five distinct provisional brand memories and a
functional cookie-isolated profile editor for local review. These values are
working assumptions, not approved brand guidance.
The demo also supports the full manual-input walking skeleton: add plain text,
inspect its normalized opportunity and deterministic score, run bounded
simulated research, inspect the evidence and claims ledger, generate one of
three editorial styles, save an immutable edit, and approve or reject it.
For database/auth work, install Docker and the Supabase CLI, then run
`supabase start` and `supabase db reset`.

The application intentionally has no publishing or scheduling integration.

## Production environment

Set and validate the variables documented in `.env.example`, including the
public Supabase URL/key, server-only Supabase secret key, and workflow HMAC
secret. Apply committed migrations to a designated development Supabase project
before staging or production. Follow
[`docs/supabase-development-runbook.md`](docs/supabase-development-runbook.md)
for the migration, seed, and RLS-test sequence.

Import WF-01 through WF-07 and WF-09 from `n8n/workflows/` into the development
n8n instance and supply `APP_BASE_URL` and `WORKFLOW_HMAC_SECRET` through that
environment. Workflows must call the application API; do not give n8n direct
database credentials. WF-08 is added with the deterministic image-composition
milestone.

Real research also requires the server-only OpenAI variables in `.env.example`.
Set model/web-search pricing and per-run/daily budgets to approved values. Paid
OpenAI mode remains disabled until a bounded live evaluation has been reviewed
and its accepted identifier is set as `AI_RESEARCH_EVAL_BASELINE_ID`. Store the
API key in an approved secret manager—never in the shared team-input sheet,
workflow JSON, browser variables, or source control.

The shared team-input register is available at:
https://docs.google.com/spreadsheets/d/1MpzufCl83QU4vtGC4PiYYq5Ga1R5LAgfcMXXk5mSkt0/edit

## Verification

```text
pnpm check
```

`pnpm check` includes formatting, lint, strict type-checking, unit and contract
tests, a production build, and the Chromium walking-skeleton test. Install the
browser once with `pnpm exec playwright install chromium`.

See `docs/progress.md` for exact milestone evidence and remaining wiring.
