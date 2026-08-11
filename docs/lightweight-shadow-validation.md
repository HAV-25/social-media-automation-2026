# Lightweight shadow-validation runbook

This runbook proves the lightweight release candidate without changing the
production scheduler, production database, or legacy reviewer deployment.

## Preconditions

- Use a disposable Supabase development branch created from project
  `hqffgchxwtymyfwtkmdt` only after the product owner confirms its quoted cost.
- Keep all five lightweight n8n workflows inactive during import and credential
  configuration.
- Use a dedicated shadow worker secret and a provider budget approved for the
  test. Never reuse or print production secrets.
- Use a test brand/feed scope. Do not activate legacy publishing or scheduling;
  neither exists in the lightweight workflows.

## 1. Database gate

1. Apply the two additive lightweight migrations in timestamp order.
2. Run every file under `supabase/tests/database`, including
   `lightweight_pipeline.test.sql`.
3. Run Supabase security and performance advisors.
4. Record the branch project ref, migration versions, pgTAP totals and advisor
   results in `docs/progress.md`.

Pass criteria:

- migrations complete without manual edits;
- cross-organization and cross-brand reads/writes are denied;
- only the service role can claim or persist worker jobs;
- stale workers cannot persist output;
- stage output, job completion and next-stage creation are atomic;
- duplicate provider-operation and reviewer requests reuse their original
  result rather than creating a second durable mutation;
- a final expired lease becomes terminal rather than remaining leased;
- reviewer state and expected-version rules reject stale decisions.

## 2. Edge gate

Deploy `lightweight-daily-intake` and `lightweight-stage-worker` to the disposable
branch. Configure only:

- `LIGHTWEIGHT_WORKER_SECRET`;
- the approved OpenAI key and model settings;
- bounded cost-estimate settings used by the worker.

Call each endpoint once with an invalid worker secret and prove it returns 401
without a database mutation. Then call its no-work path with the valid secret
and prove the response is bounded and contains no secret or raw provider error.

## 3. n8n gate

Import these exact files without publishing them:

1. `lw-01-daily-intake.json`
2. `lw-02-research-worker.json`
3. `lw-03-draft-verification-worker.json`
4. `lw-04-image-package-worker.json`
5. `lw-05-retry-recovery.json`

Verify:

- daily intake is `01:00 Europe/Berlin`;
- it scans up to 50 unseen items per feed while the daily post limit remains a
  separate brand policy;
- intake retry arithmetic fits inside its 720-second execution timeout;
- paid workers have no synchronous node retry and claim one durable job per
  invocation;
- workflow JSON contains no prompts, Supabase secret key, OpenAI key, n8n API
  key, Netlify URL or application API URL.

## 4. Shadow happy path

1. Add one known-good RSS feed to the shadow brand.
2. Trigger only `lw-01-daily-intake` manually.
3. Run the inactive worker workflows manually until the queue has no runnable
   job. Do not manually create or rewrite database content between stages.
4. Open the static reviewer build against the branch publishable URL/key.

Required evidence for one selected opportunity:

- normalized source and deterministic deduplication identity;
- explainable score and threshold/daily-limit selection;
- bounded research with at most two web-search calls;
- claim ledger, canonical citations, conflicts, warnings and recorded cost;
- three materially different Facebook drafts from one structured provider call;
- deterministic verification results and non-blocking warnings;
- one 1200x630 image whose base and final paths match the current post version;
- measured typography and safe-margin validation with no silent text truncation;
- immutable JSON package manifest and separate image download;
- Ready Posts shows only `ready_for_review` drafts;
- approval/edit/regeneration requests are version-bound, idempotent and audited.

## 5. Recovery matrix

Run each case in its own pipeline and retain the job/event evidence:

| Case                                  | Expected result                                    |
| ------------------------------------- | -------------------------------------------------- |
| Broken feed                           | Other feeds continue; failure is safely classified |
| Duplicate item                        | No second source, opportunity or paid pipeline     |
| Zero qualifying items                 | Intake succeeds with no paid job                   |
| Provider timeout before acceptance    | Bounded retry is scheduled                         |
| Provider outcome ambiguous            | Automatic paid replay stops for review             |
| Worker dies after provider completion | Cached provider result is reused                   |
| Stale lease attempts persistence      | Mutation is rejected                               |
| Final attempt lease expires           | Job becomes terminal                               |
| Invalid research evidence mapping     | Claim is downgraded/warned, never falsely verified |
| Unfit image headline                  | Final image is rejected, never silently truncated  |
| Browser double-click                  | One immutable action/version is recorded           |
| Cross-brand reviewer request          | RLS/RPC rejects it                                 |

## 6. Acceptance and cleanup

Export a redacted evidence bundle containing IDs, states, timestamps, usage,
costs and checksums—not secrets or source/provider payloads. Product-owner
acceptance is required before any production cutover.

After evidence is accepted or the test is abandoned, delete the disposable
branch to stop branch charges. Do not merge it into production. Production
cutover follows `docs/lightweight-cutover-checklist.md` as a separate,
approval-gated action.
