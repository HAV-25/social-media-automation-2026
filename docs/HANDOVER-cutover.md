# Handover — web-app → lightweight pipeline cutover completion

This document is self-contained so another engineer/coding agent can continue the work
without prior chat context. Date of handover: **2026-08-27**.

## Repo & environment
- GitHub: `HAV-25/social-media-automation-2026`. Monorepo (pnpm 11.9 + turbo). Web app in
  `apps/web` (Next.js 16 App Router, React 19, Server Actions). Contracts in
  `packages/contracts` (Zod). Supabase project ref: **`hqffgchxwtymyfwtkmdt`**.
- Package names: `@content-engine/web`, `@content-engine/contracts`, plus `ai`,
  `brand-memory`, `source-processing`, `image-compositor`, `security`.
- **Gates (run per package, not root turbo):**
  ```
  corepack pnpm --filter @content-engine/contracts typecheck
  corepack pnpm --filter @content-engine/contracts test
  corepack pnpm --filter @content-engine/web typecheck
  corepack pnpm --filter @content-engine/web lint
  corepack pnpm --filter @content-engine/web test
  corepack pnpm --filter @content-engine/web build
  corepack pnpm test:e2e   # Playwright, demo mode, dev server :3200
  ```
- **Prettier** on paths with parens (e.g. `(dashboard)`) via the cmd shim breaks — use
  `node node_modules/prettier/bin/prettier.cjs --write <files>`.
- **Known pre-existing failures** (NOT caused by this work, ignore): contracts tests
  `editorial-warning-policy-migration.test.ts` and `recovery-migration.test.ts` (they assert
  raw migration SQL strings that have drifted).
- **e2e is demo-mode** (`playwright.config.ts` sets `NEXT_PUBLIC_DEMO_MODE:"true"`, dev server
  on :3200, local `retries:0`, CI `retries:2`). If the machine is slow, warm the dev server
  first and run with `--retries=2`; failures then are timeouts at unrelated steps, not code.

## The plan (approved) — finish the cutover in 4 slices, retirement last
The web app is moving OFF legacy "evaluated-post" RPCs ONTO the lightweight pipeline. The
lightweight worker already does all real generation daily (research/draft/verify/image/
package). **Guardrail:** only the real-mode branch of each route changes; demo mode stays
synchronous and byte-identical, so the demo e2e keeps passing. Full plan detail lives in the
plan file (also pasted below in "Remaining work").

Scope decisions already made with the product owner:
- **B9 dashboards: DEFERRED** (not in this batch).
- **B5:** remove "Request changes" entirely (Approve/Reject only) + reroute Edit. DONE.
- **B1:** research + draft become async (enqueue + poll). DONE.
- **Feeds (B2/B3):** MINIMAL — keep `upsert_rss_feed` fallback for multi-brand/delete; do NOT
  touch the active RSS intake workflow. NOT STARTED.
- **Retirement:** last. NOT STARTED.

## Status of branches / PRs (merge order matters — they are stacked)
1. **Selective regeneration** — MERGED to main (PR #11). Regenerate route real path uses
   `save_lightweight_post_edit`.
2. **B5** — branch `slice-b5-review-reroute`, **PR #12 → main** (open). Commit `652b5b5`.
3. **B1** — branch `slice-b1-async-research-draft`, **PR #13 → slice-b5-review-reroute**
   (open, STACKED). Commit `498954e`.
4. This handover — branch `handover/cutover-state` (off B1). Docs only.

**Merge order: #12 first, then #13** (GitHub auto-retargets #13 to main after #12 merges).
Merges + edge deploys + `apply_migration` are classifier-blocked for the AI agent — a human
runs them.

### B5 (done) — what changed
- `packages/contracts/src/index.ts`: dropped `request_changes` from `postReviewActionSchema`;
  `postReviewResultSchema.status` = enum(ready_for_review, verifying, approved, rejected).
- `apps/web/lib/post-state.ts`: `PostAction` = edit|approve|reject; `changes_requested` kept
  as a valid SOURCE state (posts already in it stay editable/rejectable) but no action
  produces it.
- `apps/web/app/(dashboard)/posts/actions.ts`: real-mode `edit` → `save_lightweight_post_edit`
  (authed client); demo evaluation precompute gated to demo mode; removed the legacy
  `review_evaluated_post` branch + its imports.
- `apps/web/app/(dashboard)/posts/[postDraftId]/page.tsx`: removed the Request-changes form.
- Tests: contracts rejects `request_changes`; `post-state.test.ts` updated; e2e asserts the
  control is absent.
- Effect: **`review_evaluated_post` now has ZERO app callers** → retirable in Slice 4.

### B1 (done) — what changed
- Real mode: `apps/web/app/api/opportunities/[opportunityId]/research/route.ts` and
  `.../generate/route.ts` POST now call `request_lightweight_action(action:"research"|"draft")`
  (authed client) and return `202 {status:"queued", pipelineInstanceId}`; each route gained a
  **GET poll** endpoint (research: `getResearchEvidence`; draft: newest `post_drafts` row for
  the opportunity). Demo branches unchanged.
- Removed inline model work: research dropped reserve/produce/persist; generate dropped
  `create_evaluated_draft` + the real-mode similarity DB read + prompt-snapshot + request-hash.
- Clients `apps/web/components/research-panel.tsx` and `draft-generator.tsx` handle BOTH the
  demo synchronous 201 and the real queued 202 (poll then refresh/navigate).
- Contracts added: `researchQueuedResultSchema`, `researchStatusSchema`,
  `draftGenerationQueuedResultSchema`, `draftGenerationStatusSchema`.
- Effect: **clears the interactive caller of `create_evaluated_draft`**.
- **KNOWN TRADE-OFF (documented in the generate route):** `request_lightweight_action` cannot
  carry contentStyle/tone; the worker derives `content_style` from the opportunity's
  `recommended_style` and hardcodes tone `"thoughtful"`. So the reviewer's style/tone picker is
  **advisory in real mode** (honored in demo). The UI defaults already match the worker, so
  unchanged selections produce identical output. Threading style/tone through
  `request_lightweight_action` is a clean follow-up if parity is wanted.

## Verification already done (both slices)
- Deterministic gates green (typecheck/lint/unit/build) on both branches.
- Demo Playwright e2e **4/4 green** on the B1 branch (includes B5 changes since stacked).
- Live real-mode RPC contract battery as the authed editor (rolled back, no cost): unknown
  action→22023, bad idempotency key→22023, removed request_changes decision→22023 (rejected at
  DB too), stale edit→40001, empty hook→22023, valid research enqueue→success. GET-poll query
  logic verified against real data (pending vs ready for both research and draft).
- B5 edit path proven live earlier (save_lightweight_post_edit → new version → verifying →
  verify succeeded → ready_for_review).

## IN-FLIGHT live test (optional, resumeable)
A real research job is **queued** on the Klaank brand and just needs the worker fired:
- Brand **Klaank** = `20000000-0000-4000-8000-000000000001`. Admin user (editor) =
  `50862c0b-8acd-4e98-a82c-a2838f80bd75`. Opportunity `71bca482-344e-48e1-a2a5-0ce2168bbe13`
  ("Bedrock Robotics…"). Job idempotency key: `reviewer:research:livetest:research:klaank-bedrock-0001`.
- The worker is an edge function `lightweight-stage-worker`, secret-gated by header
  `x-lightweight-worker-secret` = env `LIGHTWEIGHT_WORKER_SECRET` (≥32 chars, held by the
  human/scheduler; the agent must NOT extract it). Trigger (PowerShell):
  ```powershell
  $secret = "<LIGHTWEIGHT_WORKER_SECRET>"
  1..6 | ForEach-Object {
    Invoke-RestMethod -Method Post `
      -Uri "https://hqffgchxwtymyfwtkmdt.supabase.co/functions/v1/lightweight-stage-worker" `
      -Headers @{ "x-lightweight-worker-secret"=$secret; "content-type"="application/json" } `
      -Body '{"contractVersion":"1.0","stages":["research","draft","verify","image","package"],"limit":5,"workerId":"manual-livetest-0001"}'
    Start-Sleep -Seconds 20
  }
  ```
  Stages auto-cascade research→draft→verify→image→package. Then verify in the DB that
  `research_runs` has evidence, a `post_drafts` row appears (that is what the draft-GET poll
  returns), and the post reaches `ready_for_review`.

### How to drive real-mode RPCs as the authed editor (for live checks)
Wrap in a transaction; set the JWT claims; roll back for non-destructive checks:
```sql
begin;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"50862c0b-8acd-4e98-a82c-a2838f80bd75","role":"authenticated"}', true);
-- ... call public.request_lightweight_action / save_lightweight_post_edit / review_lightweight_post ...
rollback;  -- or commit for a real run
```

## Remaining work

### Slice 3 — Feeds (minimal, capability-preserving) — NOT STARTED
- **Leave the internal RSS intake workflow untouched** (`app/api/internal/workflows/rss/*`) —
  it is load-bearing (hundreds of intakes/day) and has no lightweight replacement.
- `manage_lightweight_feed` exists but is strictly less capable than `upsert_rss_feed`
  (single-brand, no delete, no per-route policy, and it errors if the brand automation policy
  row is absent). So route only the Sources-UI single-brand create + pause/resume happy path
  through `manage_lightweight_feed` (authed, `can_edit_brand`), gated by a precondition that
  the brand automation policy exists (else a clean 4xx). **Keep `upsert_rss_feed` as fallback**
  for multi-brand routes, per-route policy, and delete — no capability loss.
- Files: `apps/web/app/api/rss-feeds/route.ts` (add lightweight branch + precondition),
  `apps/web/components/rss-feed-manager*` / `apps/web/app/(dashboard)/sources/page.tsx`.
- Test: unit test the precondition guard; the e2e RSS test (walking-skeleton) must stay green.

### Slice 4 — Legacy-RPC retirement — NOT STARTED (do last)
- The internal automated post routes `app/api/internal/workflows/posts/{generate,verify,actions}`
  and their `apps/web/lib/editorial-workflows.ts` wrappers (`generateWorkflowDrafts`,
  `verifyWorkflowPost`, `regenerateWorkflowPost`) are the last callers of `create_evaluated_draft`
  / `verify_evaluated_post` / `regenerate_post_component`. **Prod telemetry (2026-08-27) shows
  these are dormant** (no non-demo `post_generation` via them in 14 days; the lightweight worker
  does all daily generation). Preflight: confirm no external scheduler still POSTs them (check
  cron/n8n config + prod logs); if unsure, make each return `410 Gone`, observe, then delete.
- Then drop, via `apply_migration` (NOT `db push` — the repo migration ledger diverges from
  remote), the `public` wrappers + `private` impls of: `review_evaluated_post` (already
  caller-free after B5), `create_evaluated_draft` (caller-free after B1 + route deletion),
  `verify_evaluated_post`, `regenerate_post_component`, and the now-orphaned
  `assert_editorial_evaluation`.
- Update tests that assert these names: `packages/contracts/src/editorial-migration.test.ts`,
  `editorial-verification-migration.test.ts`, `editorial-warning-policy-migration.test.ts`, and
  the pgTAP `supabase/tests/database/image_assets.test.sql` (calls `public.review_evaluated_post`).

### Deferred (not this batch)
- **B9 dashboards**: the Performance/Runs/Cost dashboards read `generation_runs`, which the
  lightweight pipeline only writes for the research stage, so runs are sparse and cost is
  undercounted. Fix later by rewriting the 3 dashboard RPCs to also read `pipeline_jobs`/
  `pipeline_instances` (read-side, low risk). RPCs: `get_brand_performance_dashboard`,
  `get_brand_ai_cost_observability`, `get_brand_dashboard_metrics`.
- **Style/tone parity** for B1 (see trade-off above).

## Suggested next actions for the continuing agent
1. Get B5 (#12) then B1 (#13) merged (human) and CI e2e green.
2. Optionally finish the in-flight Klaank live test (needs the worker secret).
3. Implement Slice 3 (feeds) on a new branch off `main` (after #12/#13 merge) or off
   `slice-b1-async-research-draft` if continuing before merge.
4. Implement Slice 4 (retirement) last, only after all callers are gone and the dormant
   internal routes are confirmed/removed.
