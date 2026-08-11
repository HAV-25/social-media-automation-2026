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

## ADR-031 — RSS transport is bounded and explicitly decoded in n8n

**Status:** Accepted, 2026-07-25

Each RSS run processes at most one recent item per active feed by default and
limits copied summaries to 4,000 characters. This bounds one-off demo latency,
fan-out, memory, and downstream cost without changing durable deduplication or
allowing research automatically.

n8n 2.21.7 exposes chunked Netlify POST responses as Node response streams even
when its HTTP Request node is configured for JSON. Any response required by a
later WF-01 step is therefore downloaded as binary, decoded with the built-in
Extract From File node, and checked at a small Code-node contract boundary.
Terminal workflow calls may ignore their response body because durable
application state, not n8n execution output, is authoritative.

## ADR-032 — Browser mutation origins are proxy-aware and centrally enforced

**Status:** Accepted, 2026-07-25

Browser mutation routes validate `Origin` against the direct request origin,
the sanitized forwarded host/protocol, and the configured public application
URL. This accommodates trusted Netlify proxy rewriting without accepting an
unrelated browser origin. Requests without `Origin` retain the existing support
for signed or non-browser clients; authentication, authorization, RLS, rate
limits, and strict payload validation remain independently required.

The policy is implemented once and shared by RSS dispatch/feed changes, source
submission/upload, research, generation, regeneration, and image actions so a
deployment-host mismatch cannot fail each feature separately.

## ADR-033 — Authorized server mutations use the server-only database client

**Status:** Accepted, 2026-07-25

Application routes first authenticate the user and deterministically authorize
their organization role and selected-brand assignment. Mutations that create
workflow orchestration records then use the server-only Supabase client because
browser roles intentionally have no direct insert or update grants on those
operational tables. The privileged client is never exposed to browser code and
does not replace the route's actor, brand, origin, rate-limit, validation, audit,
or idempotency checks.

## ADR-034 — RSS markup is removed before editorial and visual use

**Status:** Accepted, 2026-07-25

RSS descriptions are hostile markup-bearing inputs. The RSS analysis boundary
extracts their human-readable text before hashing, deduplication, scoring, or
value-nucleus creation. Manual plain-text submissions keep their literal text
semantics unless the caller explicitly identifies markup.

Image direction and deterministic composition independently sanitize every
headline and source label. This defense in depth also protects existing records
and provider-returned structured direction. Selective template recomposition
reuses validated immutable base art without a second paid provider call.

## ADR-035 — Automatic RSS selection is a brand-wide policy

**Status:** Accepted, 2026-07-26

The automatic preparation policy belongs to the brand, not to each feed route.
Administrators configure one minimum opportunity score and one maximum number
of selected drafts per UTC day. Every active feed routed to that brand competes
under the same deterministic policy; an individual route may only opt out by
remaining `ingest_only`.

The reservation transaction locks the brand profile row and counts prior
reservations across every feed for that brand. This prevents concurrent workers
from exceeding the cross-feed daily limit while preserving idempotency and
service-only execution. Selection may automatically prepare material for human
review, but it does not approve, schedule, or publish content.

## ADR-036 — Operational history degrades per record, not per page

**Status:** Accepted, 2026-07-26

The Runs & errors screen is an incident-diagnosis surface and must remain
reachable when operational history is incomplete or contains an older record
shape. Generation runs, pipeline events, and recovery records are validated
individually at the application boundary. A malformed historical row is omitted
from the presentation rather than crashing the entire screen, while database
query failures render a safe temporary-unavailability state.

This tolerance applies only to the read-only observability presentation.
Workflow mutations, state transitions, signatures, permissions, and durable
writes remain strict and fail closed.

## ADR-037 — Selected RSS opportunities prepare through signed workflow handoffs

**Status:** Accepted, 2026-07-26

WF-01 dispatches only brand-policy reservations marked `reserved` to WF-05.
The analysis result binds each selection to the authorized feed creator or
organization administrator so downstream actions retain a durable human actor.
WF-05 then orchestrates the typed WF-06, WF-07, and WF-08 webhooks: bounded
research, the three Phase 1 content styles, deterministic verification, and one
branded image per review-ready draft.

Every handoff is HMAC-signed and uses an entity-derived idempotency key. The
application APIs remain responsible for authorization, cost gates, structured
model contracts, persistence, and provenance. A failed evidence or quality gate
stops that branch. Successful branches stop at `ready_for_review`; the chain
cannot approve, schedule, or publish content.

## ADR-038 — New privileged functions use opaque-key gateway claims

**Status:** Accepted, 2026-07-26

The hosted Supabase gateway maps an `sb_secret_` key to `service_role` and
populates `request.jwt.claims`; it does not populate the legacy
`request.jwt.claim.role` setting. Any privileged function added after the
general secret-key compatibility migration must therefore use the JSON claims
guard. Execution remains restricted independently through explicit
`service_role` grants and revocation from `PUBLIC`, `anon`, and `authenticated`.

## ADR-039 — RSS reservation identity excludes derived scores

**Status:** Accepted, 2026-07-26

The idempotency identity for an automatic RSS reservation is the feed, brand,
source document, and opportunity. Opportunity score is deterministic derived
data, but it may legitimately change when normalization or scoring versions are
corrected. Including the score caused the same article to conflict instead of
reusing its existing reservation. Existing reservation hashes are migrated to
the stable identity; score and threshold remain preserved in run provenance.

## ADR-037 — The daily RSS view accounts for every configured feed

**Status:** Accepted, 2026-07-26

The reviewer dashboard shows every RSS item seen in the current UTC day and
retains the latest known item for any configured feed that has not contributed
a new article today. This prevents a quiet feed from disappearing and makes the
brand-routing outcome explainable across all configured sources.

Each item is labeled as scored, filtered, duplicate, or pending. Scored items
also show their deterministic score and brand-wide selection outcome:
selected, below threshold, daily maximum reached, scoring only, or awaiting
selection. Selection visibility is derived from durable reservation runs and
the active brand policy; it does not start research or generation.

## ADR-040 — n8n decoded file responses are consumed through the data envelope

**Status:** Accepted, 2026-07-26

n8n 2.21's Extract From File node exposes parsed JSON to the following node as
`$json.data`. Every non-terminal application response in the automatic RSS
preparation chain must therefore be decoded and then read through that explicit
envelope. Contract tests inspect the actual downstream Code-node expressions
for opportunity decisions, research, editorial generation, and verification;
checking only that a decoder node exists is insufficient.

The application response contracts remain unchanged. A missing or malformed
envelope fails closed before the next signed workflow handoff.

## ADR-041 — RSS polls use a bounded three-item catch-up window

**Status:** Accepted, 2026-07-26

Each feed poll inspects up to three newest items by default instead of only the
single latest item. A low-information or off-topic lead item must not conceal a
stronger article immediately behind it. The limit remains environment
configurable from one to twenty and every item still passes deterministic
deduplication, routing, scoring, and brand-wide reservation.

This catch-up bound does not increase the brand's daily preparation allowance.
The locked brand policy remains the authoritative control for the number of
research and draft branches allowed per UTC day.

## ADR-042 — RSS reservations are completed operational decisions

**Status:** Accepted, 2026-07-26

An `rss_opportunity_reservation` records the result of the atomic brand-policy
decision. It is complete when the database transaction commits and must be
stored as `succeeded` with `completed_at`; it is not the asynchronous research
or generation work itself.

Research, editorial generation, verification, and image generation each retain
their own generation runs and lifecycle. This separation keeps Runs & errors
accurate: a selected opportunity does not create a permanent in-progress count,
and downstream failures remain independently diagnosable.

## ADR-043 — Quarantined claims cannot veto verified usable evidence

**Status:** Accepted, 2026-07-26

Writing readiness requires at least one usable core claim and no unsupported or
disputed core claim that the writer is permitted to use. A claim explicitly
marked `do_not_use` remains preserved in the ledger and excluded from every
writing context, but it does not veto separately verified usable core evidence.

This distinction prevents a provider-generated warning such as “do not claim
that this solves the whole problem” from blocking a carefully bounded post
about independently supported facts. Removing the `do_not_use` quarantine would
make the claim blocking again; no unsupported claim becomes writable.

## ADR-044 — Bounded style generation is concurrent

**Status:** Accepted, 2026-07-26

The one-to-three requested editorial styles are independent provider calls and
run concurrently within one workflow request. Each retains its own style-bound
idempotency key, structured-output validation, evaluation, provenance record,
and per-run budget. Persistence remains ordered by the request so the response
and reviewer presentation are deterministic.

Structured Facebook writing uses no additional model reasoning by default and a
2,500-token output ceiling. Research remains the reasoning-heavy stage. This
keeps the synchronous application bridge within its hosting limit without
weakening evidence or review gates.

## ADR-045 — Automatic RSS preparation requires full text and a strong score

**Status:** Accepted, 2026-07-26

Klaank automatically prepares only opportunities scoring at least 75. Scores
from 60 through 74 remain in the Review band for an optional human decision;
scores below 60 are stored only. These bands control entry into research and
drafting, not the separate post-quality score applied after writing.

Before scoring, the RSS analysis boundary attempts an SSRF-protected, MIME- and
size-bounded extraction of the canonical article. When at least 500 readable
characters are unavailable, the title and RSS summary remain durable and
visible but are marked for manual review and cannot be reserved for automatic
preparation. Re-analysis refreshes deterministic opportunity intelligence while
preserving the opportunity identity, workflow state, and audit history.

## ADR-042 — RSS inbox retention is a rolling view, not destructive archival

The selected-brand RSS inbox shows items first observed during the brand's
bounded rolling window, which defaults to 24 hours, plus articles explicitly
resurfaced during the separately configurable review window. Older items remain
durable and move to the Archive view without changing or deleting their source,
opportunity, evidence, draft, image, feedback, run, cost, or audit records.

Resurfacing stores one idempotent brand-and-item review state, records the actor
and audit event, and returns the existing scored opportunity for the configured
review window. It never changes the deterministic score, creates a draft,
bypasses the brand's automatic threshold, approves content, schedules content,
or publishes content.

Reservation idempotency includes the server-owned brand-policy version. A
policy edit therefore creates a new bounded decision without allowing score
text or user-controlled metadata to redefine request identity.

## ADR-046 — Editorial retries reuse durable drafts before provider work

**Status:** Accepted, 2026-07-26

Automatic editorial preparation dispatches each requested content style as an
independent signed workflow item. Every item contains one style-bound
idempotency key, so a slow or failed style cannot make the other styles exceed
the synchronous application request window.

Before constructing an AI provider, the application checks the durable
opportunity/style/tone draft identity and its successful generation-run
provenance. A review-ready match is returned as a duplicate without another
model call. Existing terminal, non-review-ready, or provenance-incomplete
drafts fail closed for human attention instead of incurring new spend or
overwriting editorial work. Newly generated and reused results are returned in
the original requested style order.

## ADR-047 — Material evidence conflicts block only drafts that rely on them

**Status:** Accepted, 2026-07-26

A material conflict in the research ledger remains visible to reviewers, but it
does not automatically reject every draft produced from that research package.
Deterministic verification counts a contradiction only when the draft maps to a
claim that participates in the material conflict. A draft that avoids those
claims receives an explicit warning and may continue through the remaining
quality gates.

This distinction preserves fail-closed behavior for disputed claims while
allowing carefully qualified writing to use independent verified evidence. The
conflict, its member claims, and its prescribed resolution remain durable and
inspectable; this rule does not change a claim's verification state or usage
guidance.

## ADR-048 — Image review exposes the exact provider prompt

**Status:** Accepted, 2026-07-26

The image provider prompt is built by one exported, versioned function and the
same exact string is both sent to the provider and persisted with the immutable
image asset. Post review displays that recorded prompt above the branded image
alongside the model and prompt version so an administrator can assess creative
quality against the actual provider instruction.

The earlier generic image-brief placeholders are deterministically recoverable
from each immutable selected concept and `image-director.v1`. A guarded
one-time migration backfills those prompts under an exclusive table lock,
records an audit event for every repaired asset, and restores the provenance
immutability trigger before releasing the transaction.

## ADR-049 — Priority means automatically preparable, not score alone

**Status:** Accepted, 2026-07-26

The Priority inbox view contains only opportunities that meet the selected
brand's automatic score threshold and are eligible for automatic preparation.
A high-scoring RSS-summary-only item remains in Review because missing full
article evidence prevents automatic research and writing. Selected,
awaiting-capacity, and daily-limit opportunities remain Priority because all
other automatic eligibility gates passed.

## ADR-050 — Styles are structured editorial controls, not prompt editors

**Status:** Accepted, 2026-07-26

Phase 1 exposes three standard post styles: Newsworthy, Educational, and
Perspective. Reviewers may combine a style with an approved tone overlay and
must be shown a plain-language explanation of the intended structure, use case,
and expected difference from the other styles.

Production prompts remain versioned TypeScript modules. The Styles interface
does not expose arbitrary prompt editing. This keeps editorial configuration
understandable, testable, and resistant to accidental prompt or safety-control
changes.

## ADR-051 — RSS polling and automatic daily selection

**Status:** Accepted, 2026-07-26

The active RSS workflow polls every 15 minutes throughout the day. Each poll
retrieves up to three recent items per active feed by default. Durable
feed-item, source, analysis, and reservation idempotency prevents an item from
being processed or charged twice when it appears in later polls.

Automatic opportunity selection is shared across every feed routed to the
brand, not allocated per feed or per poll. Klaank initially permits at most
three automatically selected opportunities per UTC day, and the count resets
at 00:00 UTC. Opportunities scoring at least 75 compete for those slots in
arrival order after all evidence and eligibility gates pass. Scores from 60
through 74 remain available for optional manual review and do not consume an
automatic slot unless a reviewer deliberately advances them.

## ADR-052 — Observe actual AI cost before setting business budgets

**Status:** Accepted, 2026-07-26

Research, writing, verification, regeneration, image generation, and any other
provider-backed step must persist and display its model, usage, currency, and
actual recorded cost at the step and aggregate run levels. Initial business
budgets remain configurable but are not yet calibrated from assumed spend.

Existing per-call bounds, idempotency, retry limits, and provider safety gates
remain in force while real UAT usage is measured. Later budget decisions will
use the recorded cost history rather than estimates alone.

## ADR-053 — Phase 1 UAT ownership

**Status:** Accepted, 2026-07-26

Payal is the primary Phase 1 UAT reviewer. UAT evidence follows
`docs/uat-test-plan.md`; a journey passes only when its durable database,
workflow, cost, provenance, and audit records agree with the visible reviewer
experience.

## ADR-054 — Cost totals use the durable ledger and content-package allocation

**Status:** Accepted, 2026-07-26

AI cost reporting uses immutable `generation_runs.model_usage` provenance as
the accounting ledger. An actual recorded cost takes precedence over an
estimate, and a reservation is shown only when no completed cost exists. Brand
totals are calculated in PostgreSQL for the selected time window rather than
by summing the currently paginated Runs screen.

Research is shared across the three style variants, so completed-work cost is
grouped by opportunity as one content package. This avoids assigning the same
research cost to every draft and overstating spend. Zero-cost mock and
deterministic records remain visible as ledgered steps for auditability but
never increase recorded spend.

## ADR-055 — Audit history is a brand-scoped accountability view

**Status:** Accepted, 2026-07-26

The reviewer interface exposes immutable `audit_logs` records through a
selected-brand Activity & Feedback workspace. It combines editorial feedback,
other attributed human changes, and workflow actions in one chronological
history while preserving their distinct classifications.

The page is read-only and uses the authenticated Supabase client so existing
organization and brand RLS remains authoritative. It does not introduce a
service-role query or security-definer reporting function. Runs & Errors remains
the technical execution view; Activity & Feedback answers who changed or
decided what, when it happened, and why.

## ADR-056 — Approved users start open; administrators may narrow access

**Status:** Accepted, 2026-07-26

The private approved-email pilot flow continues to provision each confirmed
approved user into every active brand with the allowlisted role. This preserves
the product owner's instruction that approved pilot users should not encounter a
locked or partially disabled product by default.

After provisioning, an organization administrator may deliberately change the
member's organization role and per-brand assignments through Settings. The
change is an authenticated, security-invoker PostgreSQL transaction with strict
brand ownership checks, one audit event, and a database guard that prevents the
last organization administrator from being demoted or deleted.

## ADR-057 — Performance reporting separates business outcomes from run diagnosis

**Status:** Accepted, 2026-07-26

The selected-brand Performance workspace is the business reporting surface for
feed reliability, preparation volume, reviewer decisions, rejection reasons,
and recorded AI cost. Runs & Errors remains the technical diagnosis and
recovery surface; Activity & Feedback remains the immutable accountability
history.

Feed health uses a deterministic 30-minute freshness boundary, twice the
current 15-minute polling interval. Approval rate is approved divided by
approved plus rejected; change requests are reported separately. Ready image
volume counts immutable ready image assets rather than implying that content
was approved or published.

The reporting function is security-invoker and reads only RLS-visible rows. It
accepts a bounded time window, exposes no raw feed/provider error, and has
explicit authenticated execution with anonymous execution revoked.

## ADR-058 — Archive visibility and daily automation use independent clocks

**Status:** Accepted, 2026-07-27

Each brand may configure its active RSS inbox and resurfaced-review windows from
6 through 168 hours. The controls change visibility only and are audited
atomically on the brand profile. Phase 1 does not destructively delete durable
content or provenance because an organization-wide deletion period and backup
policy have not yet been approved.

The rolling inbox window must not change daily business arithmetic. Sources,
research spend, and automatic opportunity capacity reset at 00:00 UTC, while
RSS visibility uses the brand's rolling window. Resurfacing never consumes an
automatic slot or triggers AI work by itself.

## ADR-059 — Phase 1 capacity is bounded by UTC selection and concurrency

**Status:** Accepted, 2026-07-27

The controlled pilot supports the blueprint envelope of 20 brands, 100 active
RSS feeds, 1,000 ingested feed items per UTC day, 50 one-off submissions per
UTC day, three standard post styles, and four concurrent content/image jobs.

Each brand automatically prepares the first three opportunities that durably
reserve a slot at a score of 75 or higher. The selection counter resets at
00:00 UTC. Scores from 60 through 74 remain optional Review items and lower
scores remain durable without becoming automatic candidates.

Release capacity is tested with deterministic fake providers so performance
verification never consumes paid credits or depends on provider latency.
External research, writing, and image calls retain independent token, query,
timeout, retry, idempotency, and cost bounds.

## ADR-060 — RSS reservation idempotency resets with the UTC operating day

**Status:** Accepted, 2026-07-27

An RSS opportunity's automatic-reservation identity includes the UTC date as
well as source, brand, and brand-policy version.

Feed polling deliberately revisits recent entries, while source intake and
scoring remain durably idempotent. A reservation key that survived across UTC
days replayed yesterday's `daily_limit` or `reserved` response and could leave
today's open capacity unused. A daily reservation identity lets an eligible,
still-unprepared opportunity in the rolling inbox compete for the first three
slots after 00:00 UTC without duplicating its source, opportunity, research,
drafts, or images. The database's brand-row lock and daily run count remain the
authoritative concurrent quota controls.

## ADR-061 — Optional image resources must not gate non-image workflow startup

**Status:** Accepted, 2026-07-27

The deterministic compositor loads its bundled font only when composition is
requested. Research, writing, verification, and content-action functions must
start without opening or parsing an image-only asset.

The font remains a checked-in, traced deployment asset and is explicitly
included for nested API functions. Lazy loading changes startup isolation only;
it does not change typography, dimensions, checksums, validation, branding, or
the human-review boundary.

The image endpoint also authenticates and validates its typed request before
loading the native image workflow. Unauthenticated traffic therefore cannot
force Sharp or font initialization, and an optional image-runtime failure
cannot prevent the route from returning the normal authenticated API contract.
Typed errors crossing that dynamically loaded module boundary are recognized
structurally by their code, message, and status. Runtime identity through
`instanceof` is not an API contract and cannot be used to classify them.

## ADR-062 — Paid image work requires a no-cost compositor preflight

**Status:** Accepted, 2026-07-27

The image workflow dynamically loads and exercises the native Sharp runtime and
the bundled deterministic font before invoking a paid image provider. A
missing native binary, deployment trace, or font therefore fails with the typed
`image_runtime_unavailable` infrastructure error before model spend.

The preflight renders only a one-pixel local PNG and does not persist an asset,
call a provider, or modify editorial state. Successful preflight leaves image
generation, validation, deterministic composition, provenance, cost recording,
and human review unchanged.

## ADR-063 — Deployment tracing must see the OpenType runtime

**Status:** Accepted, 2026-07-27

The deterministic compositor loads OpenType with a direct dynamic import.
Loading it through a runtime-created CommonJS `require` hid the dependency from
Next.js output-file tracing, so the optimized server function could contain the
font file while omitting the parser required to open it.

The asynchronous import is visible to the production bundler and remains lazy:
non-image functions still do not load OpenType, while the image preflight
verifies Sharp, the traced font, and the traced parser before any provider call.
Typography, composition rules, checksums, and the human-review boundary remain
unchanged.

## ADR-064 — Exact generation prompts are immutable version provenance

**Status:** Accepted, 2026-07-27

Every newly generated post version stores the exact system prompt and user
prompt sent to the writing provider, the registered prompt version, and a
SHA-256 checksum. The same snapshot remains in the generation run's model
record for cost/run diagnosis; a private trigger copies it onto the current
post version created by that run.

The snapshot is captured at generation time rather than reconstructed from
mutable brand, source, or research state. Historical versions without a
snapshot are labeled as unavailable instead of presenting a reconstruction as
exact. Existing post-version RLS remains authoritative, and the private trigger
helper is security-invoker with no Data API execution grant.

Image assets continue to store their exact generated prompt in
`image_assets.prompt`. Reviewer-triggered image generation must use the same
real provider, persistence, validation, composition, and cost path as autonomous
WF-08; a production-only fake image is not valid provenance.

## ADR-065 — Review queues are filtered server-side within brand scope

**Status:** Accepted, 2026-07-27

Ready posts may be filtered by a bounded date window, editorial state, standard
content style, and tone, then sorted by update time or quality. URL inputs use
strict enums with safe defaults, and production filters are applied to the
brand-scoped RLS query before version details are loaded.

The Phase 1 default remains three automatic selections per brand per UTC day.
Klaank's pilot configuration is temporarily four; changing a brand policy must
advance `brand_profiles.updated_at` so daily reservation idempotency reflects
the new policy rather than replaying an earlier capacity decision.

## ADR-066 — Compositor preflight must exercise the deployed Sharp contract

**Status:** Accepted, 2026-07-27

The no-cost compositor preflight uses Sharp's supported `r`, `g`, `b`, and
`alpha` background-color keys. Long-form color keys are not accepted by the
pinned Sharp 0.35 runtime and caused the safety check itself to fail before any
provider request.

The checked-in deterministic font is also explicitly included in Netlify
function artifacts. Runtime lookup walks only the current directory and a
bounded number of parents, allowing the same code to run from the repository,
Next.js output, or Netlify's nested handler directory without scanning unrelated
filesystem locations. Tests exercise the exact preflight and nested-path lookup.

## ADR-067 — Daily capacity counts distinct prepared opportunities

**Status:** Accepted, 2026-07-27

An automatic-selection slot is consumed by a distinct opportunity, not by an
idempotency record or policy revision. A brand-policy edit or UTC rollover may
make an eligible, unprepared opportunity reconsiderable, but it must never
reserve an opportunity that already has a successful RSS reservation.

The reservation function serializes decisions per brand, checks for a prior
successful reservation of the opportunity, and counts distinct opportunity IDs
for the current UTC day. Downstream failures are retried through durable
recovery; they do not create another selection reservation. The content-inbox
counter uses the same distinct-opportunity definition even when an older
opportunity has moved outside the rolling feed window.

## ADR-068 — Netlify packages Sharp's complete native runtime

**Status:** Accepted, 2026-07-27

Next.js output tracing identifies Sharp's JavaScript entrypoint, but Sharp 0.35
loads its Linux binary and libvips payload from optional `@img` packages at
runtime. Netlify's single generated Next.js handler must therefore explicitly
include the complete installed `sharp` and `@img` directories, in addition to
the deterministic compositor font.

The provider remains behind the local compositor preflight, so a packaging
failure cannot incur image cost. A configuration contract test prevents a
future deployment from silently dropping these native runtime files.

## ADR-069 — Serverless image composition has a pinned Wasm fallback

**Status:** Accepted, 2026-07-27

The Netlify handler retains Sharp's faster Linux x64 binary as its primary
runtime and also installs Sharp 0.35's official `@img/sharp-wasm32` fallback.
This follows Sharp's documented serverless guidance for environments where a
platform binary is unavailable after function bundling.

The compositor renders text as deterministic OpenType paths rather than using
Sharp's native text renderer, so the Wasm runtime's lack of native text
rendering does not weaken typography or provenance. The provider remains behind
the no-cost preflight, and both runtimes are pinned in the committed lockfile.

## ADR-070 — An idempotent RSS reservation replay never redispatches research

**Status:** Accepted, 2026-07-27

The reservation transaction may return its original successful response when a
stable reservation key is replayed. That response is marked `duplicate: true`.
The RSS analysis boundary must therefore require both `eligible: true` and
`duplicate: false` before dispatching research. A duplicate response is exposed
as `already_prepared` and cannot consume provider budget or invoke downstream
workflows again.

This keeps the database transaction conventionally idempotent while making the
workflow side effect exactly-once from the application's perspective.

## ADR-071 — Scheduled RSS intake claims recent deferred opportunities first

**Status:** Accepted, 2026-07-28

An automatically eligible RSS opportunity can be deferred when a brand reaches
its UTC daily maximum. A later feed poll may no longer return that article
within the bounded per-feed catch-up window, so feed polling alone is not a
complete retry mechanism.

Before processing newly fetched feed items, WF-01 now asks a signed application
endpoint to reconsider unprepared RSS opportunities created within the brand's
rolling 24-hour inbox window. Candidates must still come from an active feed
with `score_then_research`, meet the current brand threshold, and pass the
existing transactional daily-limit reservation. Selection is deterministic by
score descending, then creation time and ID.

An existing successful RSS reservation is retryable only while no draft and no
downstream generation run exists. This closes the narrow failure window between
committing the reservation and dispatching research without consuming another
daily slot. Once any downstream run exists, durable recovery owns retries.
Existing drafts are always excluded, and the stable downstream research
idempotency key remains opportunity-scoped.

The carry-over claim happens before new articles can consume the day's slots.
It does not expand the daily limit, reopen archived items, auto-publish, or
introduce a second source of truth; Supabase remains authoritative for every
selection and state transition.

## ADR-072: Quarantined evidence remains visible without blocking usable research

**Date:** 2026-07-28

**Decision:** Keep every researched claim in the immutable claims ledger, including
unsupported or disputed claims marked `do_not_use`. A writing-ready evidence
package may proceed only when it contains a separately usable core claim and has
no unsupported or disputed core claim that is still permitted for writing. The
PostgreSQL integrity function and the versioned TypeScript contract enforce the
same rule.

**Why:** Production research for a real 82.98 opportunity passed the application
contract, then failed with PostgreSQL `23514` because the database treated a
quarantined claim as a writing blocker. Deleting that claim would lose provenance;
allowing it to be written would weaken safety. Excluding only `do_not_use` claims
from the readiness veto preserves both evidence history and the safety boundary.

**Consequences:** The existing failed run is not silently mutated or charged
again. The migration narrowly requeues a dead-lettered research recovery only
when a related persistence run contains the corrected PostgreSQL `23514`.
WF-10 then creates a new idempotent attempt. Provider cost remains attributable
to that attempt, and human approval is still mandatory before any package
leaves the platform.

## ADR-073: Recover signed workflows from immutable request context

**Date:** 2026-07-28

**Decision:** Do not use n8n's failed-execution retry endpoint for WF-05 through
WF-09. WF-10 claims the immutable, typed request payload stored in
`private.workflow_execution_contexts` and starts the target webhook from the
beginning with a fresh timestamp, nonce, body digest, and HMAC signature.

**Why:** Production execution `13955` proved that n8n retries a failed HTTP node
with its saved input. That input contains a five-minute workflow signature, so
the application correctly rejects it when replayed later. Extending the
signature window would weaken replay protection.

**Consequences:** A private database trigger binds the new n8n execution ID to
the existing bounded recovery attempt when the workflow registers its context.
Tenant isolation, idempotency, the three-attempt cap, leases, dead-lettering,
and audit events remain authoritative. n8n API credentials may remain
configured for operational inspection but are no longer part of automatic
content recovery.

## ADR-074: Authorize opaque Supabase keys at the recovery RPC boundary

**Date:** 2026-07-28

**Decision:** The public recovery-claim RPC verifies `current_user` is
`service_role` before entering the private `SECURITY DEFINER` implementation.
For compatibility with existing private authorization, it sets the legacy
`request.jwt.claim.role` value only for the current transaction. Execution
remains revoked from `PUBLIC`, `anon`, and `authenticated`.

**Why:** Supabase opaque `sb_secret_…` keys are mapped to the `service_role`
database role but do not populate the legacy JWT claim setting. Production
WF-10 therefore received a 503 before claiming any due recovery even though its
credential was valid. Authorization must be evaluated while the wrapper still
runs with invoker identity; checking `current_user` inside the definer would
instead observe the function owner.

**Consequences:** Both opaque secret keys and legacy service-role JWTs can use
the bounded recovery RPC. No browser client gains access, the private
implementation stays outside the exposed schema, and the compatibility claim
cannot escape the request transaction.

## ADR-075: WF-10 transport failures must not trigger WF-10 again

**Date:** 2026-07-28

**Decision:** Keep the error intake and bounded one-minute recovery poll in
WF-10, but configure both application HTTP nodes to return their full response,
continue on every HTTP or transport failure, and never treat a non-2xx response
as an n8n execution error. If required scheduler environment is unavailable, the
signing node returns no work rather than throwing.

**Why:** Production executions `14098` and `14099` proved that a failed
scheduled dispatch invoked the Error Trigger in the same workflow, after which
failure persistence also failed. This produced two red executions every minute
without advancing durable recovery state.

**Consequences:** Supabase remains the authoritative place for retry state and
the Runs & errors view continues to expose unresolved work. A temporary
application or network outage no longer creates a self-amplifying n8n failure
loop. Runtime preflight now fails for inactive workflows and explicitly reports
the environment-access setting required by n8n Code nodes.

## ADR-076: Recovery attempts receive fresh deterministic idempotency keys

**Date:** 2026-07-28

**Decision:** Preserve the original correlation and immutable request payload
when WF-10 replays a failed workflow, but replace its mutation idempotency key
with `wf10-replay:<recovery-id>:<attempt>`. Apply the transformation at the
durable recovery-claim RPC and again at the typed application client boundary.

**Why:** Production WF-10 successfully claimed and replayed the Enigma research
request after opaque-key authorization was corrected. WF-05 then returned
`research_already_running` because the replay reused the failed attempt's
idempotency key. A retry is a distinct bounded mutation attempt; treating it as
a duplicate prevents it from progressing, while an unbounded random identity
would weaken deterministic deduplication.

**Consequences:** Repeated delivery within one recovery attempt remains
idempotent, subsequent attempts can reserve and persist new provider work, and
the three-attempt recovery cap remains authoritative. A narrow data correction
requeues only dead letters whose active run proves this exact historical
`research_already_running` defect; unrelated dead letters remain untouched.

## ADR-077: Recoverable stages own their downstream handoff

**Date:** 2026-07-29

**Decision:** WF-05 ends after dispatching isolated style requests. WF-06 owns
the generation-to-verification handoff, and WF-07 owns the
verification-to-image handoff. Parent dispatch nodes tolerate a child's bounded
failure because the child application wrapper has already persisted its own
recovery state. WF-10 ignores error-trigger events from application HTTP nodes
whose failure was already durably classified.

**Why:** The first successful production Enigma research created one
Educational draft while two style calls failed. The original WF-05 monolith
then marked the already-succeeded research replay as failed and never verified
the successful draft. Replaying a child WF-06 in isolation also had no path to
WF-07 or WF-08.

**Consequences:** Each style can fail and recover independently without
invalidating completed research or blocking another style. A recovered
generation continues to verification, a recovered verification continues to
image generation, and duplicate parent/child recovery records no longer
overwrite the application's more accurate retry classification.

## ADR-078: Application-owned editorial fields are deterministic

**Date:** 2026-07-29

**Decision:** The requested style and tone remain authoritative application
inputs. `fullText` is derived from the structured hook, body, and closing.
Provider output is normalized to those values after strict schema parsing.
Unique/selected angles and claim-key provenance remain fail-closed. The
production writing prompt advances to `facebook-writer.v2` and states these
invariants explicitly.

**Why:** Two of three real Enigma style calls returned valid structured writing
but failed a generic consistency gate because model-controlled copies of
application-owned or derived fields were not byte-identical. Rejecting those
safe redundant differences caused paid work to be discarded without improving
claim safety.

**Consequences:** Formatting and enum repetition no longer cause false
provider failures. Unknown claim identifiers, missing selected angles,
duplicate angle keys, malformed output, and safety/quality gates are still
rejected or surfaced for reviewer control.

## ADR-079: Brand restrictions are phrase-level policies

**Date:** 2026-07-29

**Decision:** Store Klaank's prohibited areas as explicit semantic phrases
rather than comma-split keywords. Replace the accidental standalone `Safety`
restriction with `Unverified safety, compliance, legal, or investment claims`.
Re-verify only recent persisted drafts whose evaluation proves that the
standalone restriction blocked them.

**Why:** The production Enigma journey generated and verified all three styles,
but every style mentioned responsible robotics safety considerations and was
therefore blocked by the accidental single-word restriction. Safety discussion
is one of Klaank's content pillars; unsupported safety claims are the actual
prohibited category.

**Consequences:** Responsible safety language no longer fails merely because it
contains the word `Safety`. Unverified safety or compliance claims remain
restricted. Recovery uses fresh attempt-specific idempotency keys and repeats
only deterministic verification—not paid research or writing.

## ADR-080: A synchronous 2xx recovery replay completes its durable claim

**Date:** 2026-07-29

**Decision:** After the recovery client receives a successful synchronous n8n
webhook response, atomically mark the claimed generation run `succeeded` and
the recovery `completed`. If that acknowledgement cannot be persisted, report
an unknown dispatch state and retain the lease for bounded reconciliation.

**Why:** Production recovery successfully created styles, verification results,
and an image, but `dispatchDueRecoveries` never completed the claimed retry
record. Its five-minute lease expired and WF-10 safely but noisily replayed the
same idempotent stage until the retry cap.

**Consequences:** Successful recovered work no longer creates stale queued runs
or repeated lease-expiry retries. A migration closes only recent stale claims
where a separate durable generation run proves the same entity and stage
already succeeded. Failed history remains immutable.

## ADR-081: Daily automation uses explicit terminal gates and asynchronous stage ownership

**Date:** 2026-07-30

**Decision:** Run WF-01 once daily at 01:00 in the `Europe/Berlin` workflow
timezone. Represent every legitimate no-work result as a typed `dispatch:
false` item and route it through an explicit IF gate before any HTTP node.
WF-05 through WF-08 acknowledge signed intake with HTTP 202, then own their
application execution, recovery registration, and downstream handoff. A
recovery replay receiving 202 remains active until the accepted child stage
completes; only a synchronous success is completed from the dispatcher.

**Why:** The 30 July scheduled WF-01 run had no newly eligible selection.
n8n's enabled Always Output Data behavior converted the empty Code-node result
to `{}`, and the next HTTP node failed because `$json.url` was undefined.
The same empty-array hazard existed when research was not writing-ready and
when verification withheld imagery. Synchronous parent/child webhooks also
coupled the full research-to-image chain to inactivity timeouts.

**Consequences:** A scan with zero eligible items, bounded research that cannot
support writing, and a draft that fails verification now end successfully
without a downstream request. Accepted stages continue autonomously without
holding their parent open. Rejected handoffs fail visibly and enter WF-10
instead of being hidden by `neverError`. Gateway and inactivity failures at an
application node are recorded even when the application could not persist its
own classification. No publishing or scheduling capability is introduced.

## ADR-082: Completed research without a draft is a resumable backlog state

**Date:** 2026-07-30

**Decision:** The deferred RSS sweep may re-enter WF-05 when research is
durably `succeeded` and no post draft exists. Queued, running, failed, or
cancelled research remains blocked for WF-10. Existing draft presence remains
the terminal backlog guard.

**Why:** A previously successful research call could be left at
`ready_to_generate` when its n8n-to-n8n editorial handoff failed before WF-06
accepted it. Blocking every opportunity with any research run made that state
permanent.

**Consequences:** The existing research package is reused idempotently and does
not incur a second research charge; WF-05 performs only the missing editorial
handoff. Retry caps and dead-letter handling cannot be bypassed for incomplete
or failed research.

## ADR-083: Internal UAT treats editorial findings as audited warnings

**Date:** 2026-08-01

**Decision:** Preserve the automatic opportunity threshold of 75, bounded
research, deterministic evaluation, claims ledger, and all provenance, but do
not stop draft or image preparation solely because `readyForWriting` or
`readyForReview` is false. Generate the three standard styles after completed
research and permit image preparation after completed verification. A reviewer
may approve a warning-bearing post only by acknowledging the current warning
snapshot and recording a reason of at least ten characters.

**Why:** During the controlled internal-test period, research conflicts and
quality findings must inform the human decision without making otherwise valid
drafts and images impossible to inspect. The reviewer remains accountable for
the final decision; the platform must still expose exactly what was known when
that decision was made.

**Consequences:** `readyForWriting` and `readyForReview` remain durable signals,
not erased or converted into passes. Missing or structurally invalid research,
missing verification, authentication/authorization failures, invalid state
transitions, stale warning snapshots, provider failures, retry limits, and
provenance failures remain hard blockers. Warning approvals persist the reason,
reviewer, exact warning snapshot, and audit/feedback events, and the reviewer
package includes source, claim, score, prompt, model, cost, warning, and decision
provenance. Only WF-05 and WF-07 change orchestration behavior. No publishing or
scheduling capability is introduced.

## ADR-084: Final social imagery uses template-aware prompts and measured composition

**Date:** 2026-08-01

**Decision:** Direct base-image generation with the versioned
`image-director.v2` prompt. The prompt declares the 1536×1024 provider canvas,
the deterministic 1200×630 Facebook crop, the selected composition template,
and the exact region that must remain visually quiet for the later overlay.
Keep all generated artwork text-free. Fit the reviewer-visible headline with
bundled-font metrics inside a template-specific typography box, and validate
the final composed PNG—not only the provider artwork—against typed dimensions,
safe-area, text-fit, and contrast checks before marking the asset ready.

**Why:** Image generation cannot reliably validate typography that is added
afterward by the deterministic compositor. The previous character-count layout
could overflow even when the base artwork passed validation, as demonstrated by
the long KUKA Automation Management Platform headline.

**Consequences:** The image model receives precise social-use geometry and
negative-space instructions, while the compositor remains authoritative for
brand typography. It performs one deterministic font-size/wrapping adjustment
without another paid provider call and records whether adjustment occurred.
Existing validation JSON remains readable because `finalComposition` is
nullable by default. No database migration, n8n change, publishing behavior, or
new model spend is introduced.

# 2026-08-11: Separate automation runtime from reviewer hosting

- Decision: adopt the lightweight Option 2 architecture on a release-candidate
  branch. Supabase owns durable state, authorization and atomic pipeline jobs;
  n8n owns scheduling/orchestration; the reviewer is a static Supabase client.
- Reason: all legacy workflows called Netlify-hosted internal APIs, making a UI
  deployment an automation dependency and amplifying timeout/retry failures.
- Compatibility: the tagged `v0.9.0-current-architecture.20260811` release remains
  restorable. Cutover requires explicit product-owner approval after shadow UAT.
- Image constraint: final composition must use an n8n worker-compatible renderer
  or WebAssembly renderer; Supabase Edge does not support the legacy Sharp path.

## ADR-086: Lightweight workers own typed execution; n8n owns schedules only

**Date:** 2026-08-11

**Decision:** Replace the ten application-calling workflows with five small n8n
schedulers. They call authenticated Supabase workers for daily intake, bounded
research, drafting/verification, image/package creation, and recovery. Prompts,
hostile-input handling, model contracts, deterministic image framing, and output
persistence remain in versioned TypeScript and Postgres—not n8n JSON.

**Why:** This removes Netlify runtime availability, synchronous webhook chains,
and duplicated workflow code from the autonomous path while retaining visible
n8n scheduling. Durable leases and idempotency ensure that retries resume a
missing stage without repeating completed paid work.

**Consequences:** n8n requires only the Supabase URL and a separate worker
secret. Supabase workers alone receive the database service credential; the
browser receives only the publishable key. Production migration, function
deployment, workflow activation, and legacy deactivation are still
approval-gated shadow-cutover steps.
