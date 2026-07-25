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
- [ ] Membership administration interface.
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
- [ ] Feature 8.4: Cost, feed-health, approval, rejection, and generation-volume
      dashboards.
- [ ] Feature 8.5: Retention controls, security/advisor suite, operating-limit
      load tests, and Milestone 8 release gate.

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
