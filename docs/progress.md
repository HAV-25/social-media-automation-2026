# Delivery progress

## Milestone 0 — Repository contract and local toolchain

- [x] Product blueprint and execution plan reviewed in full.
- [x] Shared team-input register created in the supplied Drive folder.
- [x] Five initial brands recorded: Klaank, Spaarker, Nations of Tomorrow,
      Business of AI, and Wyngs.
- [x] Repository contract, architecture, decisions, progress, environment
      contract, CI, and monorepo configuration added.
- [x] Pinned dependency installation and lockfile verified.
- [x] Formatting, lint, type-check, tests, and production build pass.

## Milestone 1 — Identity, tenancy, database, and dashboard

- [x] Organization/profile/membership/brand schema with explicit grants and RLS.
- [x] Storage buckets and organization/brand path ownership policies.
- [x] Five seed brands and development identity instructions.
- [x] Supabase SSR authentication plus isolated demo-mode UI.
- [x] Authenticated shell and RLS-validated brand switcher.
- [x] Cross-organization/cross-brand pgTAP tests committed.
- [x] First RSS intake workflow and typed application contract committed.

### Milestone 1 evidence

- `pnpm install --config.confirmModulesPurge=false` completed with the committed
  lockfile.
- `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and
  `pnpm build` passed on 2026-07-23.
- The automated suite covers contracts, request signing and replay protection,
  hostile RSS parsing, SSR auth helpers, workflow JSON shape, and migration
  security invariants.
- `supabase/tests/database/tenancy_rls.test.sql` contains executable pgTAP
  coverage for member, cross-organization, cross-brand, viewer, and
  administrator access.
- Database execution remains an environment-validation item: Docker is not
  installed on this workstation and no Supabase project has been designated as
  the development target. The migration has not been applied to the existing
  connected project.
- The n8n workflow JSON is schema-checked and credential-ID free. Final import
  smoke testing belongs in the team's designated n8n development instance.

## Milestone 2 — Brand configuration

- [x] Brand create/update and administrator-only archive/restore.
- [x] Membership administration interface.
- [x] Structured audience, positioning, policy, voice, vocabulary, and generation
      defaults editor.
- [x] Approved, negative, and high-performing reference example library with
      provider-backed embeddings and bounded retrieval.
- [x] Private visual asset upload, metadata, byte-signature validation, expiring
      previews, and removal.
- [x] Normalized brand-context preview, completeness indicator, and audit trail.

### Milestone 2 evidence

- Five development brand memories are independently seeded and clearly marked as
  working assumptions pending team confirmation.
- The normalized context contract admits at most three approved examples and
  twelve visual assets. Tests demonstrate observably different contexts and
  deny cross-brand example retrieval.
- Administrators and editors can manage assigned brand memory; reviewers and
  viewers cannot mutate it. Brand lifecycle status is additionally protected by
  a database trigger so an editor cannot bypass the application.
- Visual uploads validate declared size, allowed MIME, binary signatures, and
  active SVG content before private storage.
- Organization administrators can inspect confirmed member names/emails, change
  organization roles, and replace per-brand role assignments from Settings →
  Team & access. The authenticated security-invoker transaction validates every
  brand against the organization, writes one audit event, and prevents the last
  organization administrator from being demoted.
- The quality suite passed with 37 automated tests on 2026-07-23.
- Execution against Supabase Storage and the pgTAP policy suite remains pending
  until a development Supabase project is designated.

## Milestone 3 — Manual input walking skeleton

- [x] Plain-text input with strict request validation and hostile-data handling.
- [x] Canonical normalization, content hashing, exact deduplication, value nucleus,
      and explainable preliminary score.
- [x] Content Inbox and source/opportunity detail foundation.
- [x] Deterministic fake-provider draft generation with model, prompt, response,
      token, and cost provenance.
- [x] Initial immutable post version plus editor-created immutable versions.
- [x] Approval, rejection, and changes-requested transitions with feedback and
      audit events.
- [x] End-to-end browser coverage for the complete walking skeleton.

### Milestone 3 evidence

- The Playwright test signs in, submits plain text, inspects the normalized and
  scored opportunity, generates an Educational draft, edits it into Version 2,
  and approves it.
- Deterministic scoring tests cover the nine score dimensions, separate risk
  penalty, normalization equivalence, and exact deduplication.
- Service-only PostgreSQL functions atomically persist idempotency, source,
  opportunity, generation, immutable versions, review state, feedback, pipeline
  events, and audit history. Browser clients cannot execute these functions.
- The deterministic fake editorial provider produces the three Phase 1 styles
  and records prompt/model/response/usage provenance without paid services.
- On 2026-07-23, 50 unit/contract/security tests and one Chromium Playwright test
  passed. Database execution remains pending the designated Supabase
  development project.

## Milestone 4 — Source adapters, deduplication, and clustering

- [x] RSS safe-fetch, parsing, typed intake, and representative hostile fixture.
- [x] One-off article URL safe-fetch, canonicalization, readable extraction, and
      provenance.
- [x] Private PDF upload, signature validation, page-aware extraction, and
      low-text manual-review flag.
- [x] DOCX/TXT/VTT/SRT transcript files plus pasted transcript intake with
      timecode-aware chunks.
- [x] Pasted social content with optional canonical URL and engagement contract.
- [x] Plain-text intake and exact content-hash deduplication.
- [x] Deterministic near-duplicate detection, lineage, and event clustering.
- [x] RSS feed-management UI, filters, health, policies, and transactional daily
      limits.
- [x] WF-02 through WF-04 importable n8n workflows.
- [x] Named entities, topic tags, and adapter-level recommended-style analysis.

### Milestone 4 evidence

- Every implemented adapter returns the shared strict `raw`, `normalized`, or
  typed `failure` contract. Extraction failures are persisted atomically with
  source, run, pipeline, and audit provenance by a service-only database
  function.
- URL retrieval revalidates DNS on redirects, blocks private/reserved targets,
  canonicalizes tracking variants, and enforces protocol, credentials, MIME,
  redirect, byte, and timeout limits.
- PDF and DOCX success fixtures exercise the actual extraction engines. The VTT
  browser test uploads a representative timecoded fixture through the product
  UI and inspects the resulting transcript opportunity.
- Exact URL/hash matches take precedence over bounded title/text similarity.
  Threshold-boundary tests and a five-reports/one-event fixture verify
  deterministic near-deduplication and clustering.
- The Sources control room creates and edits organization feeds, routes one feed
  to several assigned brands, preserves per-brand include/exclude filters,
  applies ingest-only or score-then-research policy, and pauses/resumes polling.
  A Chromium journey proves the two-brand create/pause/resume path.
- Feed poll success/failure updates use a locked service-only function, so
  concurrent failures increment rather than overwrite the health counter.
  Research eligibility and daily generation usage are reserved transactionally
  under the feed-brand row after the deterministic opportunity score is known.
- WF-01 now advances RSS intake through the signed analysis API. WF-01 through
  WF-04 are credential-ID-free importable JSON with signed handoffs; workflow
  contract tests parse all four files.
- On 2026-07-25, WF-01 through WF-04 were name-stably created in the designated
  n8n project and verified inside the `Social Media Automation - 2026` folder.
  WF-02 through WF-04 were published after placement verification. WF-01 remains
  deliberately inactive until its reachable application URL and shared HMAC
  environment are configured, preventing scheduled failure noise.
- A bounded deterministic classifier stores named-entity candidates, matched
  brand/taxonomy topic tags, a recommended content style, and its rationale.
  Opportunity detail exposes these decisions to the reviewer.
- The completed gate covers 90 unit/contract/security tests, a production build,
  and four Chromium workflows.
- Runtime migration, RLS, private-storage, and cluster transaction execution
  remains pending a designated development Supabase project.

## Milestone 5 — Research and evidence ledger

- [x] Reviewer-triggered lean research with deterministic query/domain/result,
      timeout, token, and cost budgets.
- [x] Provider abstraction with deterministic fake research and a strict OpenAI
      Responses API adapter.
- [x] Versioned research planning, source analysis, opportunity analysis, and
      evidence synthesis prompts.
- [x] Typed evidence package, claims ledger, claim-to-source links, conflicts,
      caveats, and writing-readiness rules.
- [x] Atomic daily budget reservation, evidence persistence, typed failure
      persistence, idempotency, and reviewer authorization.
- [x] Evidence, risk, cost, model, prompt, and provider provenance in the
      opportunity review interface.
- [x] WF-05 signed, credential-free research workflow and contract coverage.
- [x] Representative evaluation dataset and deterministic quality/cost metrics.
- [ ] Credentialed OpenAI evaluation baseline accepted.
- [ ] Research migration and RLS exercised in the designated Supabase project.
- [ ] WF-05 imported and smoke-tested in the designated n8n instance.

### Milestone 5 evidence

- Research is opt-in after deterministic source scoring; incoming feeds do not
  automatically incur web-search or model costs.
- A preflight rejects the provider call when worst-case cost exceeds the
  per-run allowance. PostgreSQL then reserves the organization UTC-day allowance
  under an advisory transaction lock before any paid call can begin.
- Provider output must match the versioned Zod contract. Application and SQL
  integrity checks reject unknown provenance references, duplicate keys,
  unsupported verified facts, unsafe high-risk claims, unusable core claims,
  and an empty package marked ready for writing.
- Failed provider calls preserve available response, usage, model, prompt, cost,
  and typed error provenance; unused reservations are released.
- The research suite covers success, hostile source delimiting, consulted-source
  provenance, refusal, truncation, malformed output, timeout, rate limiting,
  budget rejection, stale/disputed/numerical/promotional cases, and quality
  thresholds.
- The credential-free browser journey starts bounded simulated research, reviews
  the claims ledger and provenance, then continues to draft generation.
- Live OpenAI execution is intentionally disabled unless both a server-only API
  key and an accepted `AI_RESEARCH_EVAL_BASELINE_ID` are configured.
- On 2026-07-23, formatting, lint, strict type-checking, all 90 automated tests,
  the production build, and all four Chromium journeys passed.

## External inputs

The live register is:
https://docs.google.com/spreadsheets/d/1MpzufCl83QU4vtGC4PiYYq5Ga1R5LAgfcMXXk5mSkt0/edit

## Milestone 6 — Angles, writing, evaluation, and regeneration

- [x] Three evidence-backed angle candidates with deterministic ranking.
- [x] Materially distinct Newsworthy, Educational, and Perspective generation.
- [x] Five observable tone overlays and bounded one-to-three-style requests.
- [x] Strict OpenAI Responses adapter gated by an accepted evaluation baseline.
- [x] Deterministic quality, evidence, brand-fit, risk, claim, cliché, and
      similarity evaluation.
- [x] Sentence-to-claim mappings and approval readiness enforcement.
- [x] Selective hook/body/closing regeneration with immutable version history.
- [x] WF-06, WF-07, and WF-09 signed, credential-free orchestration contracts
      with concrete application endpoints.
- [x] Service-only, idempotent SQL persistence for evaluated generation,
      verification, and regeneration.
- [ ] Credentialed editorial evaluation baseline accepted.
- [ ] Migrations and RLS exercised against development project
      `hqffgchxwtymyfwtkmdt`.
- [ ] WF-06, WF-07, and WF-09 imported and smoke-tested in development n8n.
- [x] Full production build and Chromium regression gate rerun for Milestone 6.

### Milestone 6 evidence

- Provider output must satisfy the versioned editorial contract before
  deterministic evaluation and persistence. Production OpenAI mode requires a
  server-only key, an accepted baseline identifier, bounded tokens, timeout,
  retries, and estimated per-run cost.
- Workflow generation checks actor and brand permissions before a provider call.
  Its one-to-three requested styles receive independent deterministic
  idempotency keys and immutable draft records.
- Verification recomputes evaluation from stored evidence, brand memory,
  original source text, and bounded recent-post similarity. PostgreSQL validates
  the arithmetic and claim provenance again before replacing current-version
  claim links and recording zero-cost run, pipeline, and audit provenance.
- The reviewer interface exposes angle alternatives, sentence-level claims,
  risk and readiness warnings, selective regeneration, and the immutable
  version history. Database approval rejects drafts that have not passed the
  same readiness rules.
- On 2026-07-24, formatting, lint, strict type-checking, all 108
  unit/contract/security tests, the production build, and all four Chromium
  journeys passed. Paid-provider, cloud-migration, and n8n execution remain
  intentionally deferred pending explicit workload approval and credentials.

## Milestone 7 — Branded image generation

- [x] Feature 7.1: Three-concept visual direction and bounded image-provider
      abstraction.
- [x] Feature 7.2: Deterministic Sharp/SVG composition primitives for all four
      branded templates.
- [x] Feature 7.3: Atomic image-asset persistence, private storage, and
      validation/override controls.
- [x] Feature 7.4: Reviewer image controls, preview, download, and package
      export.
- [x] Feature 7.5: WF-08 orchestration contract and Milestone 7 release gate.

### Feature 7.1 evidence

- Visual direction returns exactly three uniquely keyed and ranked concepts,
  each with a style, composition, palette, avoid list, typography overlay, and
  rank explanation. The deterministic provider remains the default.
- The versioned visual-director prompt treats post, nucleus, brand context, and
  assets as hostile data. It prohibits generated text, logos, watermarks,
  protected characters, third-party marks, living-artist imitation, and
  unsupported visual claims.
- The GPT Image adapter requests one opaque PNG through the provider
  abstraction. Live construction requires a server-side evaluation baseline,
  an explicitly approved non-zero per-image price, and a price within the
  configured run budget.
- Provider responses retain model, prompt version, deterministic response
  digest, token usage when supplied, and the approved cost. Invalid base64,
  provider timeouts, rate limits, malformed output, and preflight budget
  failures receive typed handling.
- On 2026-07-24, targeted formatting, lint, strict type-checking, and 18
  visual-direction/provider/compositor regression tests passed. No paid model,
  image, web-search, cloud database, or n8n call was made.

### Feature 7.3 implementation evidence

- The generated-image persistence port uploads immutable UUID-addressed base
  and final PNG objects with overwrite disabled, computes SHA-256 checksums,
  and removes only objects created by a failed attempt. Idempotent retries never
  delete pre-existing objects.
- PostgreSQL validates the current post version, editorial readiness, actor
  assignment, three ranked concepts, selected style, validation state, exact
  organization/brand/post/asset paths, and Storage object existence before
  committing the image asset, run, event, audit, and idempotency response.
- Authenticated browser roles retain authorized read access to generated
  images but can no longer upload, replace, or delete them. Source-original and
  brand-asset editor permissions remain unchanged.
- Unsafe base art is stored without a final image in
  `validation_required`. An assigned editor, reviewer, or administrator can
  override only with an explicit reason; the final path, checksum, actor,
  timestamp, feedback, run, pipeline, and audit records are committed together.
- Targeted formatting, lint, strict web type-checking, six persistence/rollback
  tests, and eleven migration/security contract tests passed on 2026-07-24.
- The cloud PostgreSQL fixtures ran transactionally against project
  `hqffgchxwtymyfwtkmdt` on 2026-07-24: tenancy and cross-brand RLS passed
  18/18 assertions, and image persistence, private Storage, idempotency,
  provenance immutability, stale-version rejection, and reviewer override
  controls passed 17/17 assertions. The initial 11 tenancy failures were
  incorrect pgTAP overload and expected-row types; the database had produced
  the intended `42501` denials.
- The Supabase security advisor reported no exposed-table security error. Its
  two informational notices are expected for unexposed `private` tables that
  intentionally have RLS with no client policies. Five image-asset foreign-key
  indexes were added after the performance advisor identified the gaps; the
  follow-up advisor no longer reports an unindexed foreign key for
  `image_assets`. Newly created indexes remain reported as unused until normal
  application traffic exercises them.

### Feature 7.4 evidence

- The post review desk exposes the current 1200×630 branded preview, three
  ranked concepts, all four templates, base-only regeneration, concept
  regeneration/selection, and template-only recomposition without changing
  post text.
- Every mutation carries a strict action contract, idempotency key, and expected
  immutable post-version ID. Terminal posts reject image changes, and a text
  edit makes an earlier image unavailable for the new version.
- Template-only recomposition reuses the existing base object in persistent
  mode. The deterministic regression proves identical base bytes and different
  final bytes across templates.
- Preview, PNG download, and ZIP download reauthorize the current user on every
  request and return private, non-cacheable responses. Persistent reads remain
  protected by the live brand/organization RLS and private Storage policies
  verified in Feature 7.3.
- The ZIP contains exactly `post.txt`, `final-image.png`,
  `source-evidence-summary.md`, and `generation-metadata.json`. Entry count,
  individual size, total size, path traversal, duplicate filenames, and
  download filenames are bounded and tested.
- On 2026-07-24, targeted formatting, lint, strict contract/web type-checking,
  23 image/compositor/persistence/package tests, the optimized production
  build, and the Chromium reviewer journey passed. The journey generated and
  recomposed a fake image, downloaded both PNG and ZIP, and approved the post.
  No paid AI or image-provider call was made.

### Feature 7.5 evidence

- WF-08 is an inactive, importable, credential-free n8n workflow. It verifies
  the dashboard HMAC and replay window, validates the version-bound image
  envelope, re-signs the exact body, and delegates to the typed internal image
  endpoint.
- The internal endpoint reauthorizes the actor against organization and brand
  membership, requires the current editorially ready post version, loads
  server-side brand/post/opportunity context, and runs the provider, validation,
  deterministic composition, immutable Storage, and atomic persistence path.
- WF-09 now routes `regenerate_concept`, `regenerate_base`, and
  `change_template` through the same signed endpoint. Base regeneration reuses
  the current concept direction; template changes reuse the current base bytes
  and record a new immutable image asset with zero provider cost.
- Provider configuration remains fail-closed: OpenAI mode requires the
  server-side key, accepted image-evaluation baseline, positive approved image
  price, and per-run budget. Fake mode remains the default and was used for all
  verification.
- The name-stable n8n publisher has a read-only plan command and an explicit
  apply-and-publish command. It strips import-only fields, creates or updates
  WF-08/WF-09 in project `LM6rFYOifKxnz9j6` and folder
  `Zkn0ES0lLmQ9L5uB`, rejects duplicate remote names, and reads its API key only
  from ignored local configuration. WF-08/WF-09 were subsequently activated
  and independently read back from that folder as part of Feature 8.2.
- The failure regression proves an image-provider timeout performs no upload or
  persistence call and leaves post text unchanged. Workflow contract tests
  enforce signed endpoints, version binding, failure retention, selective image
  actions, credential-free JSON, and safe publisher behavior.
- On 2026-07-24, repository-wide formatting, lint, strict type-checking, all 142
  unit/contract/security tests, the optimized production build, and all four
  Chromium regression journeys passed. No paid AI, image-generation, Supabase
  mutation, or remote n8n call was made.

## Milestone 8 — Operations, security, reliability, and cost controls

- [x] Feature 8.1: Brand-authorized Runs & Errors observability with safe
      classification, filtering, and cursor pagination.
- [x] Feature 8.2: WF-10, capped retries, stalled/dead-letter recovery, and
      administrator recovery actions.
- [x] Feature 8.3: Workflow key rotation, user/internal rate limits, and
      systematic log redaction.
- [x] Feature 8.4: Cost, feed-health, approval, rejection, and generation-volume
      dashboards.
- [x] Feature 8.5: Retention controls, security/advisor suite, operating-limit
      load tests, and Milestone 8 release gate.
  - [x] Brand-configurable non-destructive RSS inbox and resurfacing windows.
  - [x] Consolidated security/advisor remediation and operating-limit load
        tests.

### Feature 8.1 evidence

- The Runs & errors desk reads durable `generation_runs` and
  `pipeline_events` through the request-scoped Supabase client and existing
  organization/brand RLS. It exposes status, deterministic stalled state,
  current stage, duration, attempt, bounded model usage, recorded cost, and
  provenance with state/type/window filters and stable cursor pagination.
- Raw provider errors, source content, credential-shaped text, and
  idempotency keys never reach the view model. Failure output is reduced to a
  bounded code, deterministic category, retryability flag, and generic safe
  explanation.
- Four partial indexes support brand cursor, state, type, and latest-stage
  lookups. Migration `operations_run_indexes` was applied to the healthy live
  project `hqffgchxwtymyfwtkmdt`; all four indexes were queried back from
  PostgreSQL.
- The expanded live tenancy fixture reached `ok 22`, including
  cross-organization and cross-brand denial for both observable tables. The
  security advisor reported no new warning or error; its two informational
  notices remain the intentional unexposed `private` tables.
- Unit and contract coverage verifies safe error redaction, category
  arithmetic, stalled duration, token/cost normalization, cursor rejection,
  index shape, RLS policy retention, and the exact n8n project/folder
  destination. The Chromium editorial journey now visits the operations desk
  and proves the embedded fake credential is absent.
- On 2026-07-24, repository-wide formatting, lint, strict type-checking, all
  149 unit/contract/security tests, the optimized production build, and all
  four Chromium journeys passed. Chromium required an out-of-sandbox rerun
  because Windows denied the initial process spawn before test execution. No
  paid AI or image-generation call was made.

### Feature 8.2 evidence

- WF-05 through WF-09 now register strict typed execution envelopes and call
  their original application endpoints through the signed recovery wrapper.
  WF-10 has an n8n Error Trigger plus one-minute dispatcher poll; raw error
  messages are discarded before the signed failure contract.
- Supabase owns capped retry state, deterministic backoff, dispatch leases,
  stalled-run classification, dead-letter state, immutable retry generation
  runs, administrator-only manual recovery, idempotency, pipeline events, and
  audit provenance. The execution-context table remains unexposed and
  service-only.
- Migrations `run_recovery` and `run_recovery_context_index` were applied to
  `hqffgchxwtymyfwtkmdt`. The live transactional pgTAP fixture passed all 19
  assertions. The security advisor reported no warning/error introduced; its
  informational notices describe intentionally policy-free private tables. The
  new recovery-context foreign-key index was queried back after resolving the
  performance-advisor notice.
- The Runs & errors desk displays recovery state, attempts, next retry, and
  dead-letter attention. Only an organization administrator receives the
  reasoned manual-recovery action; both the application and PostgreSQL recheck
  that authority.
- Local formatting, lint, strict type-checking, all 162 unit/contract/security
  tests, and the optimized production build passed. All four Chromium journeys
  passed after Windows browser launch was granted, including the new manual
  recovery journey. Fake providers were used; no paid AI or image-generation
  call was made.
- On 2026-07-24, WF-10 and WF-05 through WF-09 were name-stably synchronized
  and activated in project `LM6rFYOifKxnz9j6`, folder
  `Zkn0ES0lLmQ9L5uB`. The n8n 2.21.7 public API cannot place workflows into a
  folder during creation, so they were staged inactive, manually moved, and
  only then activated through the supported `/activate` endpoint.
- Independent API read-back found exactly six matching workflows, no duplicate
  names, six active states, and a target-folder count of six. WF-05 through
  WF-09 each reference remote WF-10 `sng38lo5ezbWXQrj` as their error workflow.
  The API key remains confined to ignored local configuration and was neither
  printed nor committed.

### Feature 8.3 evidence

- Workflow verification accepts the active and optional previous HMAC secret
  without disclosing which key matched. Receiving WF-02 through WF-09 mirror
  that dual-key behavior while every signer continues to use only the active
  secret, enabling a three-phase rotation without an unsigned interval.
- All ten user API routes and the shared internal-workflow authenticator enforce
  configurable fixed-window limits. Production counters are atomically capped
  in an RLS-enabled, unexposed `private` table and retain only a SHA-256 subject
  digest plus a normalized endpoint operation; denied requests cannot increase
  the durable counter beyond its cap.
- Central redaction removes bearer tokens, OpenAI-style keys, JWTs, credential
  assignments, connection-string passwords, control characters, and recursively
  sensitive source/prompt/response fields. Research failure persistence uses
  the redactor, recovery persists only classified codes, and unexpected image
  failures return a generic message.
- Migration `api_security_controls` was applied to development project
  `hqffgchxwtymyfwtkmdt` on 2026-07-25. Transactional live verification passed
  eight checks covering table existence, RLS, grants, function authorization,
  two allowed requests, one denied request, and the atomic stored cap.
- The security advisor reported no warning or error introduced. Its
  informational notices remain intentional policy-free private tables,
  including the new service-only counter. The new table has no foreign keys and
  its expiry lookup is indexed; the performance advisor's other notices predate
  this feature and remain part of the Milestone 8.5 optimization gate.
- Local formatting, strict type-checking, all 172 unit/contract/security tests,
  and the optimized production build passed. Lint initially identified a
  control-character regex style violation; the implementation was corrected
  with Unicode category handling and lint then passed. No paid AI or image call
  was made.

## Pilot authentication and deployment readiness

- [x] The initial application source was secret-scanned, committed, and pushed
      to private GitHub repository `HAV-25/social-media-automation-2026` on
      branch `main` at commit `818bb60`.
- [x] Netlify monorepo build settings are committed for package directory
      `apps/web`; project import and environment wiring remain external.
- [x] Email/password registration uses strict bounded inputs, a minimum
      12-character password, Supabase email verification, and PKCE-compatible
      server cookies.
- [x] Six-digit email verification and default confirmation-link exchange are
      both supported without exposing tokens or provider errors.
- [x] A verified user without organization membership receives a dedicated,
      locked pending-access screen instead of being mistaken for a signed-out
      user or receiving demo data.
- [x] Auto-confirmed pilot signups skip the unused code screen, while the same
      build retains code/link verification when confirmation is re-enabled.
- [x] Dashboard access still requires durable organization membership, and all
      existing brand RLS remains authoritative.
- [x] Four approved pilot identities are held in a private live-database
      allowlist; no personal address is committed to source control.
- [x] A confirmed exact-email match is idempotently provisioned as organization
      administrator across all five active brands. Non-matching signups remain
      pending.
- [ ] Configure the deployed Site URL/redirect allowlist and email delivery in
      Supabase after Netlify provides the stable application URL.
- [ ] Have the remaining approved reviewers create their own credentials.

### Approved pilot access evidence

- Migration `approved_internal_users` was applied to live project
  `hqffgchxwtymyfwtkmdt`. It creates the private allowlist and three hardened
  triggers for confirmed-auth, allowlist-backfill, and new-brand provisioning.
- The live allowlist contains four active entries. One confirmed identity
  already existed and was verified with one organization-administrator
  membership, five administrator brand assignments, and no missing profile or
  access row. The other approved identities will be provisioned on signup.
- Direct live permission checks confirmed RLS is enabled, anonymous and
  authenticated roles cannot select or insert allowlist rows, neither role can
  execute the provisioning function, and all three expected triggers exist.
- The post-migration security advisor reported only the intentional
  policy-free private-table notice plus the pre-existing leaked-password
  protection warning. The performance advisor introduced no allowlist foreign
  key warning because both relevant predicates are indexed.
- Repository-wide formatting, lint, strict type-checking, all 183
  unit/contract/security tests, and the optimized production build passed. No
  paid AI or image-generation call was made.

### Live dashboard metrics evidence

- Removed the prototype source, opportunity, research-spend, date, and
  editorial-pulse figures from the production dashboard. Cards and pulse rows
  now render exact selected-brand values; an empty brand shows zero.
- Migration `brand_dashboard_metrics` was applied to live project
  `hqffgchxwtymyfwtkmdt`. The stable security-invoker function requires
  authenticated brand-read access and computes exact UTC-window counts plus
  recorded research cost from generation-run provenance.
- Live execution under the existing approved user's authenticated role returned
  zero sources, normalization, opportunities, spend, duplicates, processing,
  and completions for the currently empty Klaank brand. This proves the same RLS
  path the deployed application uses rather than a privileged database query.
- The post-migration security advisor reported no new finding. Its remaining
  notices are the intentional private-table informational notices and the
  pre-existing leaked-password-protection warning.
- Repository-wide formatting, lint, strict type-checking, all 187 tests, and
  the optimized production build passed. No paid AI or image-generation call
  was made.

### Klaank pilot dataset

- Replaced Klaank's generic seed assumptions with an editable pilot
  configuration for a B2B robotics marketplace: defined buyer and supplier
  audiences, evidence-led positioning, five content pillars, six restricted
  claim/risk categories, four CTA preferences, a low risk tolerance, complete
  voice controls, and three output variants.
- Added three approved style references covering Newsworthy, Educational, and
  Perspective writing. Each reference avoids unsupported performance, ROI,
  safety, and market-superlative claims.
- Added and activated three live RSS routes for Bloomberg Technology,
  TechCrunch, and IEEE Spectrum Robotics. All endpoints returned HTTP 200 with
  RSS/XML content during validation on 2026-07-25.
- Broad feeds route only robotics and commercial-automation keywords; the
  robotics-specific feed accepts its full topic stream. All use
  `score_then_research`, a pilot score threshold of 65, and a daily eligibility
  limit of two items per feed to keep the lean workflow bounded.
- The live configuration audit confirmed five pillars, six restrictions, four
  CTA preferences, a complete voice/generation contract, three approved
  examples, three active feeds, and three correctly bounded brand routes.
- First-time sessions now select the earliest assigned active brand rather than
  a hard-coded brand name. With the current assignment order, the pilot opens in
  Klaank while still honoring an explicit brand-selection cookie.
- Repository formatting, web lint, strict web type-checking, all 45 web tests,
  and the optimized production build passed. External feed validation and
  database configuration made no paid AI or image-generation call.

### Signed runtime bridge status

- Added `pnpm runtime:preflight`, a read-only bridge check that validates local
  key presence and HMAC length, exact remote WF-01 through WF-10 inventory,
  duplicate names, and active states without printing credential values or
  changing n8n.
- Contract coverage prevents the preflight from activating or mutating remote
  workflows and asserts that app and publisher secret values are never logged.
  All 75 contract tests, contract lint, and strict contract type-checking pass.
- The live n8n inventory contains exactly one of every WF-01 through WF-10.
  WF-02 through WF-10 are active; WF-01 remains intentionally inactive until
  the signed runtime bridge passes.
- The ignored local app environment now has the production application URL.
  Preflight fails on exactly one remaining local item:
  `WORKFLOW_HMAC_SECRET`. Netlify's Supabase server key and the shared HMAC
  secret remain unapplied pending explicit product-owner authorization; no
  credential value was displayed or transferred.

### Selected-brand one-off RSS intake

- Runs & errors now includes a brand-scoped `Run RSS intake now` control. It
  states explicitly that intake, normalization, deduplication, clustering, and
  scoring run automatically while research and generation remain human
  decisions.
- The authenticated route enforces same-origin submission, editor-level brand
  authority, the Feature 8.3 user rate limit, strict request validation, and
  durable idempotency through a unique generation-run dispatch record.
- The application signs a dedicated WF-01 webhook. WF-01 verifies the active or
  previous workflow key, validates the actor/brand envelope, and requests only
  feed routes linked to the selected brand. The scheduled path remains capable
  of polling the complete active feed plan.
- Accepted dispatches write a generation run, pipeline event, and audit event.
  Failed n8n handoffs retain only a safe classified error code.
- Contract and workflow coverage now includes the signed one-off trigger,
  brand-filtered feed plan, durable dispatch, authorization, rate limiting, and
  absence of embedded service or n8n API credentials.
- Remote execution remains blocked until the self-hosted n8n task runner is
  restarted with `NODE_FUNCTION_ALLOW_BUILTIN=crypto`; this narrowly permits the
  HMAC and UUID functions used by all ten signed workflows.

### Live WF-01 RSS journey

- The self-hosted runtime now has persistent 2 GB swap,
  `NODE_FUNCTION_ALLOW_BUILTIN=crypto`, the application and webhook base URLs,
  and the shared workflow HMAC secret. Environment access is temporarily
  enabled for the controlled pilot workflow editors and must be tightened after
  credential-backed replacements are configured.
- All ten workflows are name-stably published and active in the intended n8n
  project and folder. WF-10 successfully authenticates and records its bounded
  recovery poll.
- RSS URL validation now permits public TechCrunch infrastructure while
  retaining private/reserved-address denial, preserves redirect path/query
  semantics separately from deduplication canonicalization, and accepts
  PostgreSQL timestamp offsets at workflow boundaries.
- Live Supabase migrations allow RSS analysis through the atomic source
  persistence function and resolve PL/pgSQL output-column ambiguity without
  exposing a privileged RPC or weakening RLS.
- WF-01 explicitly downloads and decodes the two POST responses whose data is
  consumed downstream. This works around n8n 2.21.7 returning Netlify chunked
  responses as socket objects. Contract checks fail closed before persistence
  or analysis if decoded JSON has the wrong shape.
- A signed brand-scoped WF-01 execution completed across all three Klaank feeds
  on 2026-07-25. Supabase recorded three RSS items, one deduplicated Klaank
  opportunity, recent WF-01/WF-04 nonce evidence, and a real score of 73.19.
  Research remained reserved for a reviewer decision; no paid AI or image call
  was made.

### Netlify browser-mutation origin compatibility

- Replaced direct `Origin === request.url.origin` checks with one proxy-aware
  policy that recognizes the configured public application URL and sanitized
  forwarded host/protocol while continuing to reject unrelated and malformed
  origins.
- Applied the shared policy to all nine browser mutation routes so RSS
  dispatch, feed management, source submission/upload, research, generation,
  regeneration, and image actions use the same deployment-safe protection.
- Five origin-policy regressions cover direct, Netlify-forwarded, configured,
  hostile/malformed, and non-browser requests. Web lint, strict type-checking,
  all 52 web tests, and the optimized production build passed.

### Manual RSS dispatch persistence

- Corrected the authenticated manual-dispatch route to use the server-only
  Supabase client after its user, role, selected-brand, origin, payload, and
  rate-limit checks. This preserves the intended denial of direct workflow-table
  writes to browser roles while allowing the application server to record the
  parent RSS session, pipeline event, and audit evidence.
- Contract coverage now prevents the route from regressing to an authenticated
  browser-scoped database client.

### Live provider structured-output compatibility

- A real bounded WF-05 invocation reached OpenAI but was rejected before model
  execution because Structured Outputs does not accept JSON Schema's `uri`
  format. The provider-facing evidence schema now represents source URLs as
  bounded strings, while the durable evidence contract still validates every
  returned value as an HTTP(S) URL before persistence.
- The regression test inspects the actual OpenAI request body and prevents the
  unsupported `uri` format from returning.
- Live WF-05 then recorded a real `gpt-5.6-terra` research response (17,553
  input tokens, 2,778 output tokens, one web search, $0.095552 estimated cost)
  but correctly rejected two unverified high-risk claims that the provider had
  not marked `do_not_use`.
- The provider boundary now deterministically quarantines any such claim,
  records the enforcement in the evidence caveats, and clears
  `readyForWriting` when no usable core claim remains. The claims ledger
  therefore preserves the research while preventing unsafe material from
  entering post generation.
- A subsequent live response passed the safety gate but cited the same source
  more than once for one claim. Provider-boundary normalization now collapses
  duplicate claim/source links and records the count in the evidence caveats,
  matching the ledger's one-link-per-pair invariant before its atomic write.
- The next live persistence attempt exposed ambiguous unqualified
  `research_run_id` count predicates in the existing atomic ledger function.
  Fresh-install SQL is corrected and a fail-closed hotfix migration qualifies
  both predicates in already-provisioned databases without changing function
  authority or grants.
- With database persistence corrected, a later live model response cited one
  URL outside the submitted/consulted source set and was correctly blocked.
  Provider-boundary provenance enforcement now removes such sources and their
  links, downgrades claims that lose verified support, recomputes writing
  readiness, and records each intervention in the evidence caveats rather than
  weakening the consulted-source invariant.
- A later transaction reached the opportunity transition and exposed a text
  versus `opportunity_status` enum assignment. Fresh-install SQL and a
  fail-closed live hotfix now cast both research transition branches to the
  durable enum explicitly.
- The first successfully persisted real ledger contained multiple verified
  usable core claims and one quarantined unverified capability claim, while the
  provider still marked the package not ready. Writing readiness is now
  recomputed from the normalized ledger: at least one usable core claim is
  required and any unsupported or disputed core claim blocks writing. A
  provider's conservative boolean can no longer hide otherwise safe evidence or
  override the deterministic safety rules.
- Live WF-06 persisted one real Newsworthy Klaank draft before rejecting a
  later style with inconsistent provider provenance. The valid draft remains
  reviewable with its recorded model usage and quality results; the failed
  orchestration remains visible rather than rolling back valid prior work.
- WF-07 reached its persistence RPC and exposed a missing service-role grant on
  the private implementation behind the public verification wrapper. Fresh
  installs and the live project now grant only that private function to
  `service_role`; anonymous and authenticated roles remain revoked.
- The first successful WF-07 evaluation compared the post with its own current
  version, producing false similarity and hook-reuse scores of 1. Verification
  and selective regeneration now exclude the current draft while initial
  generation continues to compare against all genuinely prior brand posts.
- Selective hook regeneration now supports an explicit request to use the
  first verified, usable core ledger claim. A live WF-09 run created immutable
  Klaank post version 2 and retained the original generated version. The
  database edit transaction's unqualified `post_draft_id` lookup was corrected
  for fresh installs and the live project through a service-only hotfix
  migration.
- Live WF-07 verification of version 2 passed with evidence 92, brand fit 80,
  quality 89.25, no unsupported high-risk claims, contradictions, similarity
  flags, prohibited language, or warnings. The post is writing-ready and
  remains `ready_for_review`; no approval was automated.
- Live WF-08 generated and deterministically composed a real Klaank image with
  `gpt-image-2`. The immutable asset is ready, passed all image validation
  checks, and recorded 301 input tokens, 158 output tokens, and an estimated
  cost of $0.005.
- Post-generation inspection found HTML markup retained in the older RSS value
  nucleus. RSS analysis now explicitly extracts text from markup before
  normalization. Image-direction output and every deterministic composition
  boundary also strip markup and decode common entities, so hostile feed
  formatting cannot become branded overlay text. Existing base art can be
  recomposed with the corrected overlay at zero provider cost.
- Visual inspection of the first Netlify composition exposed missing system
  fonts as square glyphs. The compositor now converts the bundled open-source
  Inter font into SVG vector outlines and traces the licensed font asset into
  the production server bundle, making typography deterministic across local
  and serverless environments.

### Brand-wide daily opportunity selection

- Replaced duplicated per-feed score and volume controls with one brand policy:
  automatic selection, minimum opportunity score, and maximum drafts per UTC
  day. Klaank currently uses automatic selection, score 72, and three drafts.
- The service-only reservation now locks the brand profile and counts
  reservations across all routed feeds, preserving idempotency while preventing
  concurrent feed workers from exceeding the shared daily cap.
- Focused brand-memory and migration suites pass 120 tests. The live Supabase
  project has the migration applied; RLS remains enabled, authenticated profile
  access remains policy-controlled, and only `service_role` can execute the
  reservation function.
- Corrected a pre-existing production grant omission that prevented authorized
  reviewers from reading immutable post versions. The live project now permits
  authenticated `SELECT` on `post_versions` under its existing RLS policy; no
  write grant was added.

### Reviewer navigation and RSS decision visibility

- Moved brand administration out of the daily operations navigation and into a
  working Settings screen alongside the signed-in account context.
- Activated a selected-brand Ready Posts screen backed by live post drafts and
  immutable current versions. Klaank's real Version 2 draft is included with
  its quality score, status, source, and direct review link.
- Added a selected-brand “Today's RSS scan” view that accounts for every routed
  feed, including healthy feeds with no new item. It distinguishes scored,
  filtered, duplicate, and pending items and explains the latest deterministic
  routing decision without displaying hostile source text.
- Live tracing confirmed that Bloomberg, IEEE Spectrum, and TechCrunch are all
  healthy. IEEE produced the robotics opportunity scored 73.19; the recent
  Bloomberg and TechCrunch items correctly failed Klaank's robotics/automation
  include-keyword gate rather than disappearing as unexplained missing data.
- Selective regeneration is proven live by immutable Version 2, its feedback
  event, a zero-cost deterministic generation run, and the later verification
  result (quality 89.25, evidence 92, brand fit 80). The real post remains
  unapproved for reviewer demonstration; approval stays terminal, current-
  version-bound, readiness-gated, audited, and service-only.

### Runs & errors production regression

- The production database continued returning generation runs, pipeline events,
  recoveries, and summary counts successfully while `/runs` rendered the
  generic server-error boundary.
- The operations reader now validates run, event, and recovery history per row
  so one incompatible historical record cannot take down the diagnosis screen.
- The page now renders a safe retryable state if durable history cannot be
  loaded, and render-time random idempotency material moved back to the
  recovery server action.
- Added the exact live queued `rss_opportunity_reservation` shape as a
  regression fixture. The web suite passes 55 tests, strict type-checking
  passes, and the optimized production build completes.
- Authenticated production tracing then isolated the remaining warning to
  pagination: after the brand exceeded 20 runs, cursor creation rejected
  Supabase's valid `+00:00` timestamp offset. The cursor contract now accepts
  ISO offsets and has a direct regression test using the live timestamp shape.

### Complete RSS opportunity visibility

- Added a selected-brand daily opportunity feed that lists every current-day
  RSS item across all routed feeds and retains the latest known item for a feed
  with no new article today.
- Each row now shows the feed, article, observed time, deterministic score when
  available, routing/scoring explanation, and a direct score-review link.
- Post-preparation selection is explicit: selected, below the brand threshold,
  daily maximum reached, scoring only, awaiting selection, filtered, duplicate,
  or pending.
- The policy summary shows the active minimum score, daily maximum, and durable
  reservation count for the current UTC day. Selection logic is covered by two
  focused regression tests; the web suite now passes 57 tests.

### Automatic preparation to human review

- Extended the typed RSS analysis result with the authorized actor selected by
  the application boundary. WF-01 now dispatches only opportunities that were
  atomically reserved by the brand-wide score and daily-limit policy.
- Extended WF-05 into the explicit orchestration chain for bounded research,
  materially different Newsworthy, Educational, and Perspective drafts,
  deterministic post verification, and branded image generation.
- Every n8n-to-n8n stage is HMAC-signed, credential-free, idempotent, bounded by
  the application provider limits, and decoded at the n8n 2.21 file-response
  boundary. Evidence that is not writing-ready and drafts that are not
  review-ready stop without an image.
- The chain terminates at human review. It contains no approval, scheduling, or
  publishing action. Dashboard guidance now reflects automatic bounded
  preparation rather than the former reviewer-triggered research behavior.
- Contract, n8n compatibility, and repository suites pass: 113 contract tests,
  58 web tests, strict lint/type checking, and the optimized production build.
- A signed production probe identified that the brand-wide reservation function
  was created after the general opaque Supabase secret-key compatibility
  migration and still read the legacy JWT-only role setting. A narrowly scoped
  follow-up migration applies the supported gateway claims guard while
  preserving service-role-only grants.
- The same probe then reached the transaction and exposed an older reservation
  hash that included the mutable derived opportunity score. Reservation
  identity now uses the stable feed, brand, source, and opportunity tuple, and
  existing hashes are migrated so improved scoring cannot turn a safe replay
  into an idempotency conflict.
- The first live automatic-preparation execution completed RSS acquisition,
  normalization, scoring, and reservation, then stopped before research because
  the new dispatch node read the outer Extract From File item instead of n8n
  2.21's parsed `data` envelope. No paid provider call was reached.
- WF-01 and all three non-terminal WF-05 response consumers now read the
  decoded envelope explicitly and fail closed on a malformed contract. Direct
  regression assertions cover the opportunity, research, draft-set, and
  verification consumers; the contract suite passes 117 tests.
- A real automatic research run completed for the selected IEEE opportunity at
  $0.082107. Its five-claim evidence package correctly stopped before writing:
  the promotional robot capabilities and headline implication were not
  independently verified.
- Added The Robot Report through the durable feed-upsert transaction and
  ingested its current lead article. The deterministic opportunity score was
  40.33, so the brand's threshold of 72 rejected it without research spend.
- Raised the bounded default catch-up window from one to three newest items per
  feed. This prevents a weak lead article from hiding stronger adjacent
  opportunities while the brand-wide daily maximum remains the hard paid-work
  control.
- Corrected RSS reservation observability: the atomic selection decision is now
  persisted as succeeded with a completion timestamp instead of remaining
  queued indefinitely. Existing queued reservation records are normalized, so
  the Runs & errors in-progress counter represents real outstanding work.
- A second real bounded research run on MIT SceneSmith recorded two web
  searches, 22,315 input tokens, 2,824 output tokens, and $0.118148 estimated
  cost. It produced multiple verified core facts and material sim-to-real and
  latency caveats.
- Corrected ledger readiness so an explicitly quarantined `do_not_use` core
  statement cannot veto separately verified usable core claims. The statement
  remains durable and unavailable to writers; non-quarantined unsupported or
  disputed core claims continue to block.
- Corrected the live writing-path latency defect exposed by the SceneSmith run:
  one-to-three independently bounded style calls now run concurrently and use
  the no-reasoning structured-writing default with a 2,500-token ceiling.
  Validation, per-style budgets, deterministic persistence order, and human
  review remain unchanged.
- Restored Klaank's production opportunity policy with the business-approved
  bands: automatic preparation at 75 or higher, manual Review from 60 through
  74, and store-only below 60. The live Supabase profile was updated and the
  policy change was audited.
- RSS analysis now safely extracts the canonical full article before final
  scoring. Summary-only fallbacks remain visible with explicit provenance and
  are excluded from automatic research and writing regardless of score.
- Added versioned re-analysis and policy-aware reservation identities. The
  deployed atomic ingestion function now refreshes value nucleus, style, score,
  risk, and score breakdown when a staged RSS source gains full text, while
  preserving the durable opportunity identity and lifecycle.
- Enforced the automatic-preparation safety floor in both application schemas
  and the live Supabase database: brand and legacy feed-route thresholds cannot
  be configured below 60. Klaank remains configured at 75, giving the business
  a 60–74 Review band and a store-only band below 60. The consolidated local
  release passed formatting, lint, type checking, 265 tests, and the production
  Next.js build before deployment.
- Verified the policy with a real Klaank RSS pass. Full-article extraction
  refreshed live opportunities to scores including 83.03, 80.64, 75.51, 69.45,
  65.24, and sub-60 results. Only a full-text 83.03 opportunity received a
  reservation; summary-only content remained manual even when its deterministic
  score exceeded 75. Corrected WF-01's final n8n 2.21 data-envelope read and
  made workflow publication refresh active webhook registrations after updates.

### Cost-safe automatic editorial continuation

- WF-05 now emits one signed generation request per Newsworthy, Educational,
  and Perspective style and rejoins the three decoded durable results before
  verification. Each request has a style-bound idempotency identity, keeping
  individual provider calls within the application request window.
- Editorial generation now checks Supabase for an existing review-ready
  opportunity/style/tone draft and its successful generation-run provenance
  before constructing the provider. Safe retries therefore reuse the durable
  post and make no duplicate paid writing call.
- Existing terminal, non-review-ready, or provenance-incomplete drafts fail
  closed rather than being overwritten or regenerated automatically. Reused and
  new results retain the requested deterministic style order.
- The reuse boundary accepts Supabase's valid `+00:00` generation-run timestamp
  shape, retained as a regression fixture. A signed probe against the older
  production deployment returned before provider execution; Netlify automatic
  builds are now stopped, so this release remains intentionally pending one
  explicit manual deployment after the bundle is complete.
- Exact boundary coverage confirms Klaank's live policy remains automatic at
  75 or higher, Review from 60 through 74, and stored-only below 60. The stale
  no-data fallback was aligned to 75 without triggering a Netlify deployment.
- Repository-wide formatting, lint, strict type-checking, all 269 automated
  tests, valid WF-05 JSON parsing, and the optimized production build passed.
  No paid AI, image, or Netlify build call was made.
- The manually released cost-safe reuse path returned the existing real
  Newsworthy SceneSmith draft in 2.47 seconds with the same draft, version, and
  generation-run identifiers and `duplicate: true`. The generation ledger
  remained at two historical calls and $0.05486, proving the release made no
  new writer call.
- Live WF-07 verification correctly reevaluated all three real SceneSmith
  drafts but exposed an over-broad gate: a material sim-to-real evidence
  boundary rejected every draft even though the drafts avoided the disputed
  broad-solution claims and explicitly preserved the caveat. Verification now
  blocks only when a draft maps to a claim participating in the material
  conflict, while retaining an inspectable warning when the draft avoids it.
- Production validation after deploying `b0a6da7` passed the corrected WF-07
  path. The real Newsworthy and Educational SceneSmith drafts now pass
  deterministic review readiness with zero contradictions; Perspective remains
  correctly held because its 64.26 brand-fit score is below the 65 gate.
- One bounded WF-08 production call generated and persisted a real
  `gpt-image-2` editorial-hero asset. Supabase records immutable base and
  deterministically composed final PNG paths, ready status, successful
  provenance, and exactly $0.005 cost. The Newsworthy draft is now a complete
  Ready Posts review item; approval and package download remain deliberate
  authenticated human actions.
- Removed six explicitly identified sub-75 Klaank test opportunities from the
  production demo dataset after confirming they had no research runs, drafts,
  generation runs, images, or spend. Guarded deletion preserved all six
  normalized source documents and the configured RSS feeds; verification
  confirmed zero targeted opportunity rows remain.

### Rolling RSS archive and resurfacing

- Replaced the UTC-calendar daily RSS list with a rolling 24-hour active window.
  The main opportunity cards use the same rolling boundary. Older feed articles
  move to a selected-brand Archive view without deletion.
- Activated Archive navigation and added retained score, opportunity state,
  downstream draft outcome, automatic-archive explanation, and direct
  opportunity inspection.
- Added an authenticated, brand-routed resurfacing state with RLS, explicit
  grants, an indexed brand/time access path, actor attribution, and an audit
  event. Resurfaced scored articles return to the active inbox for 24 hours but
  do not bypass research, verification, approval, or the 75-point automatic
  preparation threshold.
- Applied the review-state and foreign-key index migrations to the connected
  Supabase project. Direct inspection confirms RLS enabled, one authenticated
  SELECT/INSERT/UPDATE policy, no anonymous grant, and covering indexes for the
  active-window query and each foreign key.
- Added focused rolling-window tests and migration contract checks. The
  consolidated release passes formatting, lint, strict type-checking, all 269
  repository tests, and the optimized production build.

### Daily opportunity filtering and sorting

- Activated server-validated Content Inbox controls for article/feed/reason
  search, feed selection, decision state, minimum score, and newest,
  highest-score, lowest-score, or feed-name ordering.
- Activated the All, Priority, and Review views. Priority derives from the
  selected brand's current automatic threshold; Review derives from the manual
  review decision rather than a duplicated hard-coded score rule.
- Filter inputs are bounded and fail safely to default values. Focused
  combinations cover automatic priority, manual review, feed state, minimum
  score, search, and numeric score ordering. Web strict type-checking and all 67
  web tests pass locally.

### Score-state repair and exact image prompt review

- Production diagnosis proved that six apparent `pending` Klaank articles were
  the normalized sources retained after the earlier requested deletion of their
  sub-75 opportunity rows. Deterministic re-analysis restored all six real
  opportunity records and visible scores without research, writing, image, or
  other paid provider work.
- Filtered feed items remain intentionally unscored because brand keyword
  routing stops them before opportunity creation. The next interface release
  replaces the ambiguous dash with `Not scored` and `Filtered before scoring`.
- The exact versioned image-provider prompt now has one implementation used for
  both provider invocation and durable persistence. Post review displays the
  recorded prompt above the branded image with its model and prompt version.
- Migration `backfill_exact_image_prompts` was applied to project
  `hqffgchxwtymyfwtkmdt`. All nine existing image assets now contain exact
  `image-director.v1` prompts, zero generic placeholders remain, each repair has
  an audit event, and the immutable provenance trigger was queried back after
  the transaction.
- Authenticated production verification confirmed Archive navigation, manual
  Review filtering, article search, and descending score ordering. No Klaank
  feed item was yet older than the rolling 24-hour boundary, so the empty
  Archive state was correct and a real resurfacing click was not fabricated by
  changing source timestamps.
- Priority semantics now require automatic-preparation eligibility in addition
  to the brand score threshold. Summary-only opportunities remain in Review
  even above 75. The dashboard operating date now represents the current UTC
  date rather than the start of its rolling measurement window.

### UAT operating decisions

- Confirmed the deployed WF-01 contract polls every 15 minutes throughout the
  day. Default retrieval is bounded to three recent entries per feed per poll;
  durable idempotency prevents later polls from duplicating sources or spend.
- Confirmed Klaank's initial automatic selection policy is a brand-wide maximum
  of three eligible opportunities per UTC day, resetting at 00:00 UTC, rather
  than three per feed or per polling cycle.
- Accepted a structured Styles experience comprising Newsworthy, Educational,
  and Perspective plus approved tone overlays and plain-language explanations.
  Arbitrary production-prompt editing remains outside the reviewer interface.
- Accepted cost observability before budget calibration: every paid AI stage
  must expose durable model, usage, step cost, and aggregate cost while existing
  per-call and retry protections remain active.
- Added `docs/uat-test-plan.md` with Payal as the primary reviewer and thirteen
  business-facing journeys covering authentication, brand setup, autonomous
  RSS, scoring, daily selection, research, styles, quality, images, approval,
  recovery/cost, archive/resurfacing, and brand isolation.
- Tightened the autonomous UAT acceptance path: the first three eligible
  opportunities at 75 or above must proceed from completed research through
  three isolated style calls, verification, and branded images without
  intermediate reviewer clicks. The controlled smoke journey now requires
  correlation-level evidence, exact per-stage costs, human approval, and a
  matching downloaded package.
- Diagnosed historical WF-05 execution `9807`: research completed successfully,
  but the former batched three-style request failed with
  `malformed_upstream_response`. The name-stable remote workflow now matches the
  cost-safe version that isolates each style into its own idempotent call, and
  all ten workflows were queried as active before the consolidated application
  deployment.

### Structured Styles workspace

- Activated Styles in the selected-brand navigation and added a complete
  reviewer-facing catalog for Newsworthy Authority, Educational Breakdown, and
  Perspective & Conversation. Each style explains its purpose, intended reader
  outcome, six-part structure, best-fit source types, and patterns to avoid.
- Added the five approved tone overlays—Authoritative, Conversational, Bold,
  Thoughtful, and Witty—with observable traits and a safety guardrail for each.
  The screen explicitly separates strategic structure from voice treatment and
  exposes no production-prompt editor.
- Made the catalog the single UI source for generation labels and explanations.
  Opportunity generation now explains the currently selected style/tone
  combination before a paid call, while strict shared schemas reject any
  unapproved value.
- Made automatic volume legible: Klaank's three selected opportunities can each
  request three independently verified styles, producing at most nine draft
  variants before evidence or quality holds. Automatic preparation uses the
  Thoughtful overlay and still stops at human review.
- Corrected the remaining development and new-feed fallback threshold from 72
  to the approved 75, matching the live Klaank policy and the 60–74 manual
  Review band.
- Local visual inspection confirmed the desktop hierarchy and selected
  navigation state. The Chromium walking-skeleton journey now visits Styles,
  verifies the 75-point explanation, changes Educational + Bold controls, and
  confirms the combined explanation before generation. All four Chromium
  journeys pass without paid provider calls.
- Release verification passed `pnpm format:check`, `pnpm lint`,
  `pnpm typecheck`, all 13 repository test tasks (including 71 web tests),
  `pnpm build`, and all four Chromium regression journeys.

### Exact AI cost observability

- Replaced the misleading paginated “Visible cost” total with an exact,
  brand-scoped cost ledger for the selected time window. The database summary
  reports recorded cost, paid calls, ledgered steps, input/output tokens, web
  searches, and generated images.
- Added breakdowns by workflow step, model, source input, and content package.
  Each package links back to its opportunity and shows draft, review-ready, and
  approval counts without multiplying shared research spend across styles.
- Normalized every supported historical model-usage shape and backfilled model,
  prompt version, and response ID on all three persisted research runs that had
  a durable research record. Future research persistence writes the same
  complete provenance directly.
- Applied `ai_cost_observability` and its brand/time index to Supabase project
  `hqffgchxwtymyfwtkmdt`. An authenticated Klaank reviewer transaction returned
  the real 30-day total of `$0.649108` across 12 paid calls; a temporary
  brand-limited reviewer was denied Spaarker cost access and the transaction
  was rolled back. Direct catalog verification confirms the function is
  security-invoker, anonymous execution is denied, authenticated execution is
  granted, and the brand/time index exists.
- Added strict response parsing, cost formatting and label tests, migration
  security contracts, a ten-assertion pgTAP RLS/aggregation test, and Chromium
  coverage for the reviewer-facing ledger. Local Docker was unavailable, so
  the pgTAP file could not run locally; equivalent live RLS and aggregation
  checks passed against the connected project without retaining test data.
- Release verification passed formatting, lint, strict type checking, all 13
  repository test tasks (291 assertions), the optimized production build, and
  all four Chromium regression journeys. No paid provider call or Netlify build
  was made.

### Brand-scoped activity and feedback

- Added an Activity & Feedback workspace for the selected brand. It presents
  reviewer feedback, other attributed human actions, and workflow changes as a
  chronological accountability history instead of requiring administrators to
  infer decisions from technical run records.
- Added bounded time, activity-type, and text filters; rejection and
  change-request reasons; actor names; durable timestamps; entity identifiers;
  and direct links back to posts, opportunities, or runs where the audit entity
  supports inspection.
- Kept the query on the authenticated Supabase client so the existing
  organization/brand RLS policies remain authoritative. No service credential,
  exposed security-definer function, or client-side secret was introduced.
- Added the partial `(brand_id, created_at desc)` access-path index used by the
  selected-brand history query and covering indexes for the audit actor and
  composite brand/organization foreign keys, plus focused filter,
  classification, label, reason, link, rolling-window, and migration-contract
  tests.
- Applied both index migrations to Supabase project
  `hqffgchxwtymyfwtkmdt`. A rollback-only authenticated reviewer probe could
  read all 39 Klaank audit records and zero Spaarker audit records; the
  temporary identity and membership were not retained. The post-DDL advisors
  reported no new security finding and no remaining uncovered audit-table
  foreign key.
- Release verification passed formatting, lint, strict type checking, all 13
  repository test tasks (297 assertions), the optimized production build, and
  all four Chromium regression journeys. No paid provider or Netlify build was
  invoked.

### Administrator membership management

- Added Settings → Team & access for organization administrators. The page
  lists existing authorized members, organization roles, confirmed profile
  emails, assigned brands, and each brand-level role without exposing the
  private pilot allowlist, credentials, or `auth.users`.
- Preserved the approved-pilot default: an approved signup still receives every
  active brand initially. Administrators can then deliberately narrow or change
  that member's role and brand scope; no access is blocked merely because this
  interface exists.
- Added the authenticated, security-invoker
  `manage_organization_member_access` transaction. It bounds and validates the
  complete payload, rejects inactive or cross-organization brands, replaces
  assignments atomically, updates the organization role, and writes one
  organization-scoped audit event.
- Added a database trigger that prevents update or deletion of the last
  organization administrator. A rollback-only live probe confirmed a rejected
  self-demotion preserved the administrator role, original brand assignment,
  and zero partial audit events.
- Applied migration `manage_organization_members` to Supabase project
  `hqffgchxwtymyfwtkmdt`. The function is security-invoker, anonymous execution
  is denied, authenticated execution is explicit, and the existing profile
  email was safely backfilled. The organization role and membership-user access
  paths are covered by dedicated indexes.
- The nine-assertion live pgTAP suite passed role changes, assignment
  replacement, audit persistence, cross-organization denial,
  non-administrator denial, last-administrator protection, and rollback
  integrity.
- Release verification passed formatting, lint, strict type checking, all 13
  repository test tasks (305 assertions), the optimized production build, and
  all four Chromium regression journeys. The Supabase performance advisor no
  longer reports an unindexed membership foreign key. No paid provider or
  Netlify build was invoked.

### Brand performance dashboard

- Added a selected-brand Performance workspace that explains business outcomes
  without requiring administrators to interpret the technical run ledger. It
  combines 24-hour, 7-day, and 30-day reporting windows for current feed
  health, reviewer outcomes, rejection reasons, generation volume, and exact
  recorded AI cost.
- Feed health is deterministic: an active feed with no consecutive failures and
  a poll within 30 minutes is healthy; failing, never-polled, late, and paused
  feeds remain separately visible with their last poll and failure count.
- Approval rate is explicitly approved divided by approved plus rejected;
  change requests are shown but excluded. Generation volume distinguishes
  prepared opportunities, three-style draft variants, review-ready drafts,
  immutable ready image assets, and successful workflow stages.
- Reused the exact cost ledger already delivered for Feature 8.4 and linked the
  business summary to Runs & errors for per-step, model, source, and content
  package inspection.
- Applied `brand_performance_dashboard` to Supabase project
  `hqffgchxwtymyfwtkmdt`. Its function is security-invoker, validates a maximum
  366-day window, denies anonymous execution, grants only authenticated
  execution, and relies on existing brand/table RLS. The live 11-assertion
  transaction passed feed classification, decision arithmetic, rejection
  reasons, volume, invalid-window denial, and cross-brand denial.
- A live Klaank read returned five healthy routed feeds, four review-ready
  drafts across two prepared opportunities, and nine ready immutable image
  assets. Post-migration advisors reported no new security finding; the new
  feedback index has only the expected unused-index informational notice until
  normal reporting traffic uses it.
- Release verification passed formatting, lint, strict type checking, all 13
  repository test tasks (313 assertions), the optimized production build, and
  all four Chromium regression journeys. No paid provider or Netlify build was
  invoked.

### Configurable non-destructive archive controls

- Added Settings → Retention & archive for the selected brand. Editors can
  choose bounded 12-hour, 24-hour, 48-hour, 3-day, or 7-day active-inbox and
  resurfaced-review windows; PostgreSQL independently enforces the supported
  6-to-168-hour range.
- Kept archival strictly non-destructive. Changing a window moves RSS items
  between the active inbox and Archive without deleting or mutating sources,
  scores, evidence, drafts, images, costs, feedback, runs, or audit history.
  Resurfacing still creates no AI work, automatic reservation, approval,
  schedule, or publication.
- Separated three clocks that had previously shared one rolling timestamp:
  RSS visibility uses the configured inbox window, resurfacing uses its own
  configured review window, and daily source/research/selection arithmetic
  resets at 00:00 UTC. A 48-hour inbox therefore cannot consume two days of
  automatic capacity or mislabel 48-hour spend as today's spend.
- Applied migration `brand_archive_policy` to Supabase project
  `hqffgchxwtymyfwtkmdt`. Existing brand-profile RLS remains authoritative;
  archive-policy updates run as authenticated invoker statements and an
  after-update trigger records the previous and current policy atomically.
- The live rollback-only eight-assertion pgTAP suite passed defaults, editor
  update, persisted values, one audit event, audit metadata,
  cross-organization denial, database bounds, and viewer denial. The
  post-DDL advisors found no new archive-policy issue; existing private-schema
  informational notices and the previously known leaked-password setting
  remain part of the separate Feature 8.5 security review.
- Release verification passed formatting, lint, strict type checking, all 13
  repository test tasks (317 assertions), the optimized production build, and
  all four Chromium regression journeys. The walking-skeleton journey changes
  Klaank to a 48-hour inbox and 12-hour resurfacing window and verifies both on
  Archive. No paid provider or Netlify build was invoked.

### Feature 8.5 security, advisor, and operating-limit release gate

- Added deterministic capacity regressions for the blueprint's Phase 1
  envelope: 20 brands, 100 active feeds, 1,000 daily RSS items, three automatic
  opportunities per brand, three editorial styles, and four concurrent
  content/image jobs. The 1,000-item parse-and-cluster fixture completed in
  7.39 seconds during the full suite; 60 fake evidence packages, 180 fake
  drafts, and four fake images stayed inside their release targets and recorded
  $0.00.
- Upgraded `sharp` to 0.35.0 and `postcss` to 8.5.18, including transitive
  Next.js copies with pnpm workspace overrides. The final production dependency
  audit reports no known vulnerability. A narrow TypeScript path alias points
  at sharp's bundled declaration file because its 0.35.0 export map omits a
  `types` condition; runtime resolution remains the package export.
- Ran the live Supabase security and performance advisors. Security has no
  critical/high/error finding: five expected private-schema informational
  notices and one leaked-password-protection warning remain. The password
  setting is a plan-dependent Auth dashboard hardening action before access
  expands beyond the controlled pilot. Performance findings are documented as
  an optimization backlog rather than risking a broad RLS rewrite immediately
  before UAT.
- Updated the rollback-only database fixtures for opaque secret-key JWT claims,
  current image lifecycle states, required source-to-brand routing, and safe
  coexistence with real production rows. All eight live suites passed 104 pgTAP
  assertions across RLS/tenancy, rate limiting, recovery, images, cost
  attribution, member access, performance reporting, and archive policy.
- Release verification passed formatting, lint, strict type checking, all 13
  repository test tasks (320 assertions), the optimized production build, and
  all four Chromium regression journeys. No paid provider call or Netlify
  build was made.

### UTC daily reservation rollover correction

- Production deployment verification confirmed the consolidated 27 July
  application, real Klaank authentication/selection, five healthy feeds, the
  75+ automatic threshold, 60–74 Review band, daily maximum three, Archive,
  Styles, Performance, Activity, Ready posts, and exact cost ledger.
- A real one-off poll at `2026-07-27T09:11Z` succeeded for all five Klaank feeds
  with zero consecutive failures. It correctly deduplicated every observed
  entry, but exposed that today's zero used slots did not reconsider the
  eligible 80.64 opportunity still marked Awaiting selection.
- Root cause: source intake, normalization, scoring, and the former reservation
  identity were intentionally stable across polls. The latter also replayed a
  previous day's reservation response, preventing the UTC daily limit from
  resetting operationally.
- Added a versioned daily reservation identity using UTC date, source, brand,
  and brand-policy version. Repeated polls on one day remain idempotent; the
  first poll after a UTC rollover may deterministically reconsider eligible,
  unprepared opportunities. Existing downstream research, per-style draft, and
  image idempotency continues to prevent duplicate content or spend.
- Corrected Runs & errors copy to describe the actual autonomous preparation
  boundary: qualifying opportunities proceed through research, three styles,
  verification, and branded images before stopping for human review.

### Autonomous preparation production-startup correction

- Production proved that the daily rollover fix reserved exactly three Klaank
  opportunities at 75 or above. The WF-01 handoff then exposed a batching
  defect: the preparation node inspected only the first n8n analysis envelope,
  so a below-threshold first item could discard later reserved opportunities.
- WF-01 now validates every decoded analysis envelope, flattens every decision,
  and starts research for every reserved opportunity. The contract suite
  asserts the all-item behavior and passed 148 checks.
- A bounded retry proved that all three reservations reached WF-05 together.
  No model cost was recorded because the deployed research function failed
  during module startup before an OpenAI request.
- The shared AI export eagerly imported the deterministic image compositor,
  which opened and parsed its bundled font during startup for research,
  writing, verification, and content-action functions. The compositor now
  loads that font only when an image is composed, and nested API functions
  explicitly trace the checked-in font asset. This preserves deterministic
  composition while isolating non-image workflow startup.
- Image capabilities now use an explicit `@content-engine/ai/image` subpath.
  The optimized research-function trace contains neither Sharp nor OpenType,
  so non-image cold starts no longer load native image dependencies.
- Release verification passed formatting, lint, strict type checking, all 13
  repository test tasks (323 assertions), and the optimized production build.
  No successful provider call or Netlify build was made during diagnosis.
- Production verification after `5e23981` confirmed that research, writing,
  verification, and content-action functions start normally. The image
  function still failed during cold start before invoking `gpt-image-2`.
  OpenType initialization is now lazy, and the image route authenticates and
  validates before dynamically loading native image dependencies. The image
  provider and deterministic compositor behavior are otherwise unchanged.
- The contract suite now asserts the connected unattended WF-05 path from the
  decoded research result through three-style drafting, verification, and
  branded-image dispatch. Formatting, lint, strict type checking, all 13 test
  tasks (324 assertions), and the optimized production build pass.
- The partially recovered production journey is component evidence only. It
  does not satisfy autonomous UAT because two missing style branches were
  manually replayed. Final acceptance requires a fresh single RSS trigger to
  reach reviewable text-and-image packages through automatic workflow retries
  alone; human action may begin only at review and approval.
- Production deployment `e447a29` passed the no-cost authenticated route-shell
  probe. A fresh single RSS trigger at 10:53 UTC then autonomously reached
  WF-05 and three WF-08 executions without manual handoffs, proving the
  connected downstream dispatch. All three image executions failed in 1–3
  seconds before a new image-generation run or cost record was created.
- Durable recovery classified the opaque application `500` as a malformed
  upstream response and dead-lettered the existing image runs without an
  automatic retry. This run is recorded as failed autonomous UAT evidence, not
  as a completed journey.
- Sharp is now dynamically loaded and exercised with the bundled font through a
  one-pixel local compositor preflight before any paid provider call. Native
  runtime failures become typed, retryable infrastructure responses and cannot
  spend image budget. All 13 test tasks (324 assertions), strict type checking,
  and the optimized production build pass with the preflight.
- A second untouched RSS run at 11:06 UTC again autonomously reached three
  WF-08 executions with no new recorded image cost. The image route still
  flattened the typed failure because its structural guard retained an
  `instanceof Error` prerequisite across the dynamically loaded server chunk.
- The image error boundary now recognizes the versioned code, message, and
  numeric status structurally. Cross-chunk runtime identity is no longer part of
  the error contract, so n8n and durable recovery receive the actual bounded
  failure classification instead of a generic application `500`.
- Production commit `399b75b` exposed the bounded failure as HTTP 503 during
  the no-cost image preflight. The single untouched RSS journey reached WF-05
  and three WF-08 branches; all three stopped before new image spend, so
  autonomous UAT remains incomplete.
- The optimized image-route trace contained Sharp and the checked-in font but
  omitted OpenType because a runtime-created CommonJS `require` was invisible
  to dependency tracing. The compositor now uses a lazy direct dynamic import,
  and the built server chunk contains the OpenType runtime. A contract
  regression prevents the opaque loader from returning.

### Klaank review controls and exact prompt provenance

- Raised Klaank's configured UTC automatic-selection maximum from three to four
  through the authenticated brand settings surface. Corrected brand-profile
  saves to advance the policy revision timestamp, allowing unchanged recent
  opportunities to be reconsidered under a genuinely changed daily limit.
- Reproduced the reviewer failure for “New flapping robot swims and flies like
  a diving bird” with Decision frame plus Insight split. Initial generation now
  submits both selected values, uses the same current-version concept identity
  as WF-08, and invokes the real production image workflow instead of the local
  fake renderer. Typed image failures remain visible at the API boundary.
- Added exact post-prompt capture: system prompt, rendered user prompt, prompt
  version, and SHA-256 checksum are written to the generation run and copied by
  a private non-exposed trigger to the immutable post version. Reviewers can
  inspect both exact prompts in Model provenance. Historical versions are
  explicitly labeled when capture predates them.
- Added Ready-post controls for 24-hour, 7-day, 30-day, or all-time windows;
  ready/change-requested state; three standard styles; five tone overlays; and
  update-time or quality sorting. Production filtering remains server-side and
  brand-scoped.
- Targeted verification passed 37 AI tests, 151 contract/migration tests, 90
  web tests, and strict web type checking. Local database execution is pending
  because Docker Desktop is not running; production migration and autonomous
  UAT remain release gates rather than being inferred from static tests.
- Consolidated release verification passed formatting, lint, strict type
  checking, all 13 repository test tasks (331 assertions), the optimized
  production build, and all four Chromium regression journeys. No paid model
  call or Netlify build was made during these checks.
- Production verification of `0324bd7` confirmed the Ready-post date, state,
  style, tone, and quality sorting controls and Klaank's daily maximum of four.
  The Decision frame plus Insight split request reached the real image workflow
  but stopped at the no-cost compositor preflight; no provider cost was incurred.
- A new local regression reproduced the preflight failure against the pinned
  Sharp 0.35 runtime. The preflight now uses Sharp's supported short-form color
  keys, passes end to end, resolves its font from nested serverless directories,
  and explicitly includes that font plus Sharp in Netlify's function bundle.

### Consolidated readiness audit and quota correction

- A production read-only audit found a real 82.98 Klaank opportunity still in
  `candidate` state with no generation run despite automatic selection being
  enabled at 75 and the daily maximum being four.
- The fourth slot had been consumed by a second successful reservation for an
  already-prepared 80.64 opportunity after the brand policy revision changed.
  The inbox simultaneously displayed zero selected because its count was
  restricted to opportunities still present in the rolling 24-hour feed.
- The reservation function now rejects an already-prepared opportunity,
  counts distinct opportunity IDs for the current UTC day, and preserves the
  existing service-role-only execution boundary. Durable recovery remains the
  only retry path for downstream failures.
- The inbox counter now counts distinct current-day reservations independently
  of rolling feed visibility. Contracts include the explicit
  `already_prepared` outcome, and focused contract, migration, web, and strict
  type checks pass.
- The consolidated release still requires the production migration, one
  deployment, and a fresh untouched RSS-to-reviewable-package journey before
  autonomous UAT can be declared complete.
- Consolidated local release verification passed formatting, lint, strict type
  checking, all 13 repository test tasks (331 assertions), the optimized
  production build, all four Chromium journeys, and the production-dependency
  audit with no known vulnerabilities. The n8n publication plan reports all
  ten workflows unchanged and active; its runtime bridge preflight confirms
  every required variable without disclosing values.
- Production verification of `8b11ee6` confirmed the corrected distinct daily
  counter, 75 automatic threshold, 60–74 review band, daily maximum four,
  Ready-post filters, and the current authenticated Klaank data. The 82.98
  candidate remained unreserved after the 16:15 UTC poll, proving that the
  accompanying database migration had not yet been applied.
- The reviewer image action for the flapping robot reproduced the bounded
  compositor-runtime failure before provider spend. Next's trace contains
  Sharp's JavaScript but its Linux binary and libvips payload are optional
  `@img` packages. Netlify now explicitly includes the installed Sharp and
  `@img` runtime trees, with a regression contract alongside the existing
  font, OpenType, and no-cost preflight checks.
- After deployment, the compositor-specific response disappeared but the
  serverless handler still terminated before creating an image run or recording
  provider cost. Added Sharp 0.35's official, pinned Wasm runtime as a fallback
  while retaining the Linux binary as primary. Typography remains implemented
  as deterministic OpenType paths and does not depend on unsupported native
  text rendering.
- The first scheduler tick after applying the distinct-reservation migration
  exposed a consumer defect: the reservation RPC returned the cached successful
  result with `duplicate: true`, but RSS analysis stripped that flag and
  redispatched the opportunity. The analysis boundary now converts every
  duplicate reservation to `already_prepared` with `researchEligible: false`.
  Regression coverage proves a replay cannot invoke research while a new
  reservation still dispatches once.

### 2026-07-28 production verification and deferred-opportunity carry-over

- The scheduled 10:00 Berlin RSS run persisted and scored a real article at
  55.8. It correctly stopped below Klaank's automatic threshold. A controlled
  11:14 Berlin run polled all five active feeds, processed 15 real items, left
  every feed with zero consecutive failures, and incurred no AI cost.
- No WF-05 Research or WF-07 Post Verification error execution occurred on
  2026-07-28. The earlier duplicate-reservation redispatch cascade therefore
  stopped after the consumer correction. Successful WF-01 executions are not
  retained by n8n because its production setting deliberately saves error data
  but not successful execution payloads; durable application records remain the
  acceptance evidence.
- A real reviewer-triggered production image completed for post
  `29a4e9bd-25e4-448e-8432-88d2c8b579c8`. Generation run
  `3e7e6172-e4c0-477a-b888-4f1d4e00bd32` used `gpt-image-2`, passed deterministic
  composition checks, produced a 1200×630 ready asset with exact prompt
  provenance, and recorded $0.005 cost.
- Autonomous UAT was not yet complete: the real 82.98 opportunity
  `d0edb898-b882-415d-8731-c69fc382a05e` had been deferred by the prior day's
  daily maximum, then disappeared from the next three-item-per-feed catch-up
  window. It remained a candidate with no draft or reservation.
- Added a signed deferred-opportunity sweep to WF-01. It claims recent eligible
  backlog before new feed items, uses the existing atomic reservation and daily
  limit, excludes prepared/reserved/non-RSS/expired content, and dispatches the
  normal research → three styles → verification → image chain with stable
  idempotency.
- The content inbox now labels qualified unclaimed work as “Queued for automatic
  preparation,” shows Completed/Failed/Pending polling status on each feed, and
  defaults the Daily opportunity feed to highest score first. The 60–74 band
  remains an optional manual-review queue with no automatic provider spend.
- Consolidated verification passes repository formatting, lint, strict
  TypeScript, all 13 test tasks (156 contract/security assertions and 97 web
  assertions), the optimized Next.js production build including the signed RSS
  backlog route, and all four local Chromium regression journeys. The initial
  sandboxed browser launch was denied by Windows process policy; the approved
  unsandboxed rerun passed all four journeys. These checks used no paid model
  call and no Netlify build.
- Production commit `70fb8bd` was confirmed live through the authenticated
  content inbox. The 12:00 Berlin scheduler tick correctly claimed the deferred
  82.98 Enigma opportunity and committed one real daily reservation. n8n 2.21.7
  then exposed the new POST response as a stream despite JSON response mode, so
  WF-01 stopped before research with zero provider cost.
- WF-01 now downloads and decodes the deferred-sweep response through the same
  built-in Extract From File boundary used by its other non-terminal Netlify
  calls. The application also permits a previously committed RSS reservation
  to be redispatched only when it has neither a draft nor any downstream
  generation run; this repairs the reservation-to-dispatch failure window
  without creating a second reservation or competing with durable recovery.

### 2026-07-28 admin decision states and research-integrity correction

- Verified the authenticated production inbox for Klaank. Every feed now shows
  Completed, Failed, or Pending beside its poll timestamp, and the Daily
  opportunity feed defaults to Highest score.
- Confirmed the 64.57 Kraken opportunity is intentionally in the 60–74 manual
  review band. It incurs no automatic AI spend; an administrator may inspect its
  source, scoring dimensions, risk, and value nucleus, then either leave it
  stored or explicitly start bounded research.
- Confirmed the 82.98 Enigma opportunity was selected automatically on
  28 July, reserved one of four daily slots, and transitioned to
  `research_pending`. It did not create a Ready post because its research
  persistence attempt failed with PostgreSQL `23514`; no research cost was
  recorded.
- Root cause was a contract mismatch: the TypeScript evidence validator permits
  an immutable quarantined `do_not_use` core claim when another usable core claim
  exists, while the database function rejected every unsupported/disputed core
  claim. Added a migration that excludes only `do_not_use` claims from that
  readiness veto while retaining them in the claims ledger.
- The migration also requeues only dead-lettered research recoveries tied to the
  corrected `23514` persistence failure. WF-10 can therefore resume the original
  autonomous journey without a reviewer replaying research.
- Production migration application, the resulting WF-10 retry, and the
  three-style/image Ready-post package remain verification gates.
