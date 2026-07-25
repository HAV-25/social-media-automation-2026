# Architecture decisions

## ADR-001 — Next.js, Supabase, and n8n boundary

**Status:** Accepted, 2026-07-23

Next.js owns the product UI, typed user/workflow APIs, AI gateway, and image
composition. Supabase owns identity and durable state. n8n owns orchestration
only and may not directly invent or overwrite application state.

## ADR-002 — Lean research is the default

**Status:** Accepted, 2026-07-23

Every source receives deterministic low-cost normalization, deduplication,
classification, and preliminary scoring. Bounded web research runs only for a
selected opportunity that meets policy/threshold requirements or is manually
requested. This preserves the PRD's evidence-first rule without researching
every feed item.

## ADR-003 — One to three post styles

**Status:** Accepted, 2026-07-23

The product supports Newsworthy Authority, Educational Breakdown, and
Perspective and Conversation. A user or feed policy requests 1–3 variants.
Variants must differ in editorial thesis and structure, not only wording.

## ADR-004 — Role approval policy

**Status:** Accepted, 2026-07-23

Administrators, editors, and reviewers may approve or reject posts. Viewers are
read-only and may copy/download only where brand membership permits.

## ADR-005 — Credential-free demo mode

**Status:** Accepted, 2026-07-23

Normal CI and the first walking skeleton run with deterministic fakes. Real
Supabase, n8n, and provider adapters remain production-shaped and
environment-driven. Demo mode never weakens production RLS or exposes secrets.

## ADR-006 — RSS feeds are organization resources with brand routing

**Status:** Accepted, 2026-07-23

One feed may serve several brands. Feeds therefore belong to the organization,
while `rss_feed_brand_links` stores per-brand enablement, thresholds, research
policy, and variant defaults. This prevents duplicate polling without merging
brand-specific editorial policy.

## ADR-007 — The application performs untrusted network retrieval

**Status:** Accepted, 2026-07-23

n8n requests a signed application endpoint instead of fetching arbitrary feed
URLs directly. The application resolves DNS, rejects private and reserved
addresses, pins the approved address, limits redirects, bytes, MIME types, and
duration, and parses returned markup as hostile data. This gives SSRF policy one
deterministic enforcement point.

## ADR-008 — Workflow calls use signed, replay-protected contracts

**Status:** Accepted, 2026-07-23

Workflow requests carry a timestamp, nonce, body digest, and HMAC signature.
The application validates the canonical request, atomically consumes the nonce,
and persists idempotency keys before retriable mutations. Service credentials
remain server-only.

## ADR-009 — Existing Next.js and Supabase architecture is preserved

**Status:** Accepted, 2026-07-23

The internal tool needs app-owned identity, PostgreSQL RLS, object storage, and
portable n8n/API integrations. The existing Next.js application and Supabase
system of record remain the deployment architecture. Hosting-specific platform
storage or identity substitutes would split authority and weaken the product's
tenant controls.

## ADR-010 — Local Next.js uses the webpack development path

**Status:** Accepted, 2026-07-23

The workspace is inside a synchronized OneDrive directory and its dependency
directory is junctioned to a stable local path to avoid file-lock failures.
Next.js therefore uses webpack for local development and production compilation,
because the current Turbopack filesystem boundary rejects the external
dependency junction.

## ADR-011 — Brand memory is structured and retrieval-bounded

**Status:** Accepted, 2026-07-23

Audience, positioning, editorial policy, numeric voice controls, vocabulary,
and generation defaults are validated independently. Reference examples are
embedded through a provider interface and retrieved by brand and relevance.
Every downstream context has a hard cap of three examples rather than pasting a
brand's entire library into a prompt.

## ADR-012 — Brand files remain private and content-validated

**Status:** Accepted, 2026-07-23

Brand assets use the private `brand-assets` bucket with organization and brand
path prefixes. Uploads are checked for size, MIME, binary file signature, and
unsafe SVG content before storage. Review previews use short-lived signed URLs;
public bucket URLs are not used.

## ADR-013 — Retriable content mutations are atomic service operations

**Status:** Accepted, 2026-07-23

Manual ingestion, draft creation, and post review are exposed as narrowly
validated server APIs. Each durable mutation executes through a service-only
PostgreSQL function that checks actor membership and commits the idempotency
record, domain state, provenance, pipeline event, feedback, and audit record in
one transaction. Browser roles cannot call the functions directly.

## ADR-014 — Demo editorial state is isolated and disposable

**Status:** Accepted, 2026-07-23

Credential-free development stores a small, schema-validated walking-skeleton
record in HTTP-only same-site cookies. This state is bounded, non-production,
and intentionally disposable. Production always uses Supabase as the durable
system of record; demo storage is not a second production persistence model.

## ADR-015 — Source adapters share one strict result boundary

**Status:** Accepted, 2026-07-23

URLs, PDFs, documents, transcripts, social content, and plain text converge on
one versioned raw/normalized/failure contract with provenance and section
locations. Extraction is deterministic and model-free. Heavy PDF and DOCX
engines are lazy-loaded behind a package subpath so RSS and plain-text routes do
not pay their startup cost.

## ADR-016 — Similarity arithmetic is deterministic and bounded

**Status:** Accepted, 2026-07-23

Exact canonical URL and SHA-256 matches run before near-duplicate comparison.
Near-duplicate and event-cluster decisions use version-controlled token
similarity thresholds against at most 200 recent organization sources.
PostgreSQL persists duplicate lineage and cluster membership atomically with the
new source; the application does not ask a model whether two records are
duplicates.

## ADR-017 — RSS performs a lean deterministic gate before research

**Status:** Accepted, 2026-07-23

RSS polling, extraction, filtering, normalization, deduplication, clustering,
and preliminary scoring are model-free. Each feed-brand route then applies its
configured ingest-only or score-then-research policy, minimum score, and
transactional UTC-day limit. Only a successfully reserved opportunity may enter
bounded research. This implements the product owner's lean-research direction
and prevents every incoming feed item from creating provider spend.

## ADR-018 — Paid research requires reservation and an accepted evaluation baseline

**Status:** Accepted, 2026-07-23

Research is explicitly requested by an authorized reviewer and runs through a
provider interface. The application validates a bounded plan and worst-case
cost, then atomically reserves the organization's UTC-day allowance in
PostgreSQL before calling a paid provider. The resulting evidence package must
pass the same provenance and writing-readiness rules in TypeScript and in the
database transaction. Production OpenAI mode additionally requires an accepted
live-evaluation baseline identifier; credentials alone cannot enable it.

## ADR-019 — Development spend requires an explicit heavy-work approval checkpoint

**Status:** Accepted, 2026-07-24

Routine implementation uses targeted local static checks, deterministic
providers, and representative fixtures. Before a development step can consume
paid model, image, web-search, or material cloud-compute credits—or initiate a
broad browser or infrastructure workload—the implementation agent must state
the expected purpose and ask the product owner for approval. Credentials or
available credits do not themselves authorize paid execution. Secrets remain
in approved secret storage and never in the shared input register.

## ADR-020 — Generated images are server-written and provenance-immutable

**Status:** Accepted, 2026-07-24

The private `generated-images` bucket is readable only through organization and
brand authorization. Browser roles cannot insert, replace, or delete generated
objects; a server-only adapter uploads immutable UUID-addressed base and final
PNG files with upsert disabled. PostgreSQL verifies both object paths before an
idempotent transaction can mark an image ready.

Unsafe base art remains in `validation_required` without a final asset. An
assigned editor, reviewer, or organization administrator may explicitly
override validation only by recording a reason. The final composed object,
actor, reason, timestamp, run, pipeline event, feedback event, and audit event
are then committed together. Provider, prompt, concept, base path, checksum,
model, response, and creation provenance cannot be rewritten.

## ADR-021 — Image development uses GPT Image 2 at low quality

**Status:** Accepted, 2026-07-24

Development image calls use `gpt-image-2`, `1536x1024`, and `low` quality.
At the time of selection, the official landscape-output estimate is $0.005 per
image before small prompt-token charges. This is cheaper than the deprecated
GPT Image 1 Mini landscape equivalent while keeping the project on the current
supported image model. The application still requires its evaluation-baseline
and per-run budget gates, and no paid call is implied by configuration alone.

## ADR-022 — Reviewer image actions are immutable and post-version-bound

**Status:** Accepted, 2026-07-24

Concept selection, concept regeneration, base regeneration, and template
recomposition are explicit server actions tied to the current immutable post
version. Every accepted action creates a new immutable image asset; changing
only the template reuses the prior base artwork. A post edit therefore cannot
silently retain an image whose meaning was derived from earlier text.

Private previews and downloads reauthorize the requesting user instead of
exposing durable public URLs. The reviewer ZIP contains only the post, final
image, source/evidence summary, and non-secret generation metadata. Demo mode
stores only bounded compressed direction metadata and a deterministic seed;
image bytes are recreated server-side and never placed in cookies.

## ADR-023 — n8n image workflows are thin, signed, and name-stably published

**Status:** Accepted, 2026-07-24

WF-08 and WF-09 verify their inbound HMAC before forwarding a minimal typed
request under a fresh signature, nonce, timestamp, and body digest. Image
direction, provider configuration, budget gates, validation, composition,
authorization, idempotency, and persistence remain application-owned. A failed
provider call therefore cannot create a post version or rewrite post text.

Repository publication compares exact stable workflow names through the n8n
public API. The default command is read-only; applying changes creates or
updates without duplicating names, enforces the configured project/folder, and
publication is explicit. Publication stops when a duplicate remote name is
detected. The n8n API key is read only from process environment or the ignored
`.env.n8n.local` file and is never embedded in workflow JSON or logged.

## ADR-024 — Operations views expose safe derived state, not hostile payloads

**Status:** Accepted, 2026-07-24

Supabase `generation_runs` and `pipeline_events` remain the durable operations
record. The brand-scoped application view derives stalled state from a fixed
15-minute threshold and displays only bounded model usage, recorded cost,
correlation/entity provenance, and a deterministic latest stage.

Provider error messages, responses, source text, credentials, and idempotency
keys are treated as hostile and never enter the rendered view model. Errors are
reduced to a normalized code, fixed category, retryability flag, and generic
safe explanation. Recovery mutations are excluded from this read-only feature
and belong to Feature 8.2 with their own authorization and idempotency rules.

## ADR-025 — Supabase owns bounded recovery; n8n retries claimed executions

**Status:** Accepted, 2026-07-24

Recoverable WF-05 through WF-09 register a strict execution envelope and exact
request digest in Supabase before application work begins. WF-10 classifies only
bounded codes/categories, receives n8n error summaries, and polls for work; it
does not own retry state or retain raw exception messages.

PostgreSQL atomically claims due rows, creates a distinct immutable generation
run for every retry, applies deterministic exponential backoff, expires stalled
dispatch leases, and dead-letters after three automatic attempts. A manual retry
is an idempotent, reasoned, audited organization-administrator action and opens
one bounded attempt without rewriting earlier failed-run provenance. Runtime
publication links the remote WF-10 ID into WF-05 through WF-09 rather than
committing environment-specific workflow IDs.

## ADR-026 — API abuse controls are durable and workflow keys rotate in overlap

**Status:** Accepted, 2026-07-25

User and internal API limits use an atomic fixed-window PostgreSQL counter in
the unexposed `private` schema. Only the service role can execute the bounded
consumer function. Subjects are SHA-256 digests, endpoint UUIDs are normalized,
and callers fail closed when the counter is unavailable. Demo mode uses a
bounded process-local equivalent and is never the production authority.

Workflow receivers accept exactly the configured active and optional previous
HMAC secrets. Signers always use the active secret. Rotation therefore stages
the new secret as previous on both systems, promotes it to active while retaining
the old value as previous, waits beyond the replay/in-flight window, and then
removes the old value. Credentials remain environment-only.

Operational data is allowlisted rather than dumping requests or exceptions.
The shared redactor removes credential-shaped values and recursively sensitive
source, prompt, token, and provider-response fields before failure persistence.

## ADR-027 — Self-registration verifies identity but never grants workspace access

**Status:** Accepted, 2026-07-25

Phase 1 permits email/password self-registration so the two pilot reviewers can
create their own credentials without sharing passwords. Email verification
supports both a six-digit Supabase email token and the hosted service's default
PKCE confirmation link. The callback accepts only signup/email token types,
uses a fixed application-owned destination, and never honors a user-controlled
post-authentication redirect.

A verified `auth.users` identity with no organization membership is a distinct
`pending_access` state. It receives a session but cannot enter the dashboard,
select a brand, or query protected content. Organization and brand access still
comes exclusively from administrator-created `organization_members` and
`brand_members` rows; user metadata is display-only and is never an
authorization input. This keeps public identity proof separate from internal
workspace approval.

For the controlled pilot, Supabase email confirmation may be disabled by the
product owner. The application detects the session returned by an auto-confirmed
signup and proceeds directly to `pending_access`; when confirmation is enabled,
the same build retains the token/link verification path. Auto-confirmation does
not weaken the independent organization and brand membership gate.

## ADR-028 — Pilot access uses a private exact-email allowlist

**Status:** Accepted, 2026-07-25

The controlled internal pilot provisions only confirmed identities whose
normalized email exactly matches an active entry in
`private.approved_internal_users`. The allowlist is server-managed, RLS-enabled,
unexposed, and grants no browser role any table or function privilege. Approved
addresses are operational data inserted directly in Supabase and are not
committed to the repository.

An `auth.users` trigger idempotently creates the profile, organization
administrator membership, and administrator membership for every active brand.
Adding an allowlist entry backfills an existing confirmed identity, and newly
activated brands inherit the same approved administrators. User-editable
metadata remains display-only. Confirmed identities without an exact active
match retain the `pending_access` state.

## ADR-029 — Live dashboard metrics are exact brand-scoped aggregates

**Status:** Accepted, 2026-07-25

Production dashboards do not display illustrative operational counts, dates,
costs, thresholds, or pipeline outcomes. A stable, security-invoker PostgreSQL
function returns exact source, normalization, active-opportunity, research-cost,
deduplication, processing, and completion totals for the selected brand and a
caller-supplied UTC window.

The function rechecks `can_read_brand`, executes under the authenticated
caller's RLS, rejects invalid windows, and is not executable by anonymous
users. Recorded research cost is derived from immutable generation-run usage
provenance; the daily limit comes from validated server configuration. Empty
brands therefore render zero rather than seeded activity.

## ADR-030 — Manual RSS demos dispatch a selected-brand workflow session

**Status:** Accepted, 2026-07-25

Runs & errors exposes a reviewer-controlled one-off RSS trigger for the active
brand. The application reauthorizes the actor, enforces the user API limit,
persists an idempotent dispatch run, signs an HMAC-authenticated n8n webhook,
and records pipeline and audit evidence. WF-01 filters its feed plan to routes
for that brand while the scheduled trigger retains its organization-wide plan.

The control stops at deterministic intake, normalization, deduplication,
clustering, scoring, and the lean research-eligibility gate. It never starts
research, generation, publishing, or scheduling on the reviewer's behalf. A
successful dispatch record means n8n accepted the session; item-level workflow
runs remain the durable evidence of downstream processing.
