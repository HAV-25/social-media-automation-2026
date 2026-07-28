# Architecture

## System boundary

The browser talks only to the Next.js application and Supabase's publishable
surface. Supabase PostgreSQL, Auth, Storage, and RLS own durable state. n8n
orchestrates asynchronous stages by calling signed, versioned internal APIs.
OpenAI and image providers are reachable only through the application gateway.

```text
Browser → Next.js → Supabase Auth/PostgreSQL/Storage
                 ↘ signed n8n workflows ↗
                  controlled AI gateway → provider adapters
                  image compositor → private Storage
```

## Availability

The dashboard reads durable run/entity state from Supabase and remains usable
when n8n or an AI provider is unavailable. Workflows are idempotent projections
of database state, not the source of truth.

## API abuse and credential controls

All authenticated user APIs and signed internal workflow APIs consume an atomic
fixed-window allowance before performing work. Supabase stores hashed subjects,
normalized endpoint operations, window bounds, and counts in an unexposed
private table. Service-only access, RLS defense in depth, bounded configuration,
and fail-closed application behavior keep the browser and n8n from bypassing
the same durable control.

Workflow HMAC rotation uses active/previous overlap on both application and n8n
receivers. Only the active key signs new requests. Structured operational
metadata passes through the shared recursive redactor; raw request/source bodies
and provider responses are not logging inputs.

## Recovery pipeline

WF-05 through WF-09 register a typed, body-digested execution envelope before
calling their application endpoint. Supabase owns the root run, immutable retry
runs, execution context, redacted failure category/code, deterministic
one/two/four-minute backoff, five-minute dispatch lease, three-attempt
automatic cap, dead-letter state, and audit trail.

WF-10 receives n8n Error Trigger summaries and polls the signed recovery
dispatcher each minute. The dispatcher atomically claims due work with
`FOR UPDATE SKIP LOCKED` and starts the target webhook from immutable typed
request context with a fresh timestamp, nonce, digest, and HMAC signature.
WF-10 treats dispatcher/persistence transport outages as durable operational
signals instead of throwing its scheduled branch into its own Error Trigger.
Only an organization administrator can queue a manual replay; PostgreSQL
reauthorizes the actor and preserves the failed generation-run history.

## Operational reporting

The Performance workspace gives business reviewers a selected-brand summary of
feed health, review outcomes, rejection reasons, generation volume, and recorded
AI cost. A security-invoker PostgreSQL function performs bounded time-window
aggregation while preserving every underlying RLS policy. It reports neither
raw feed errors nor provider responses.

Runs & Errors remains the technical execution/recovery view, and Activity &
Feedback remains the immutable human/system accountability view. These three
surfaces share durable Supabase records but answer different operational
questions.

## Lean source pipeline

All supported source adapters converge on a strict normalized/failure contract.
Deterministic application code owns canonicalization, extraction, hashing,
deduplication, clustering, scoring, and risk arithmetic. For RSS, a service-only
transaction advances the staged source and creates one brand-specific
opportunity per routed brand. Automatic selection is governed once per brand:
a deterministic minimum score and a UTC-day draft limit apply across all of
that brand's active feeds. The brand profile row is the shared quota lock, so
concurrent feed workers cannot exceed the cross-feed limit. Individual feed
routes may still opt out through `ingest_only`. n8n coordinates these signed
calls but stores no editorial state.

## Bounded research pipeline

An authorized reviewer selects an analyzed opportunity. Deterministic code
constructs a small research plan and calculates its worst-case cost. A
service-only PostgreSQL function locks the organization budget scope, reserves
the UTC-day allowance idempotently, creates the durable generation run, and
moves the opportunity to `researching`. Only then may the provider adapter
perform bounded web search and structured evidence synthesis.

Provider output crosses a strict Zod boundary and is checked against the URLs
actually consulted. A second service-only transaction persists research
sources, claims, evidence links, conflicts, model/prompt/response/usage/cost
provenance, pipeline events, and the opportunity state together. Failure follows
an equally durable path, preserving available provider usage while releasing an
unused reservation. n8n WF-05 coordinates the signed call; it contains neither
prompts nor provider credentials and is never the system of record.

## Security boundaries

- `anon` receives no application-table grants.
- `authenticated` receives explicit table/sequence grants and remains constrained
  by organization and brand RLS.
- Browser code receives only the Supabase publishable key.
- Source retrieval runs behind SSRF checks, redirect revalidation, byte/time
  limits, MIME inspection, and private-network blocking.
- AI inputs place source text in a delimited untrusted-data field.

## Authentication

Production mode uses request-scoped `@supabase/ssr` clients and PKCE cookies.
Authenticated routes are dynamic and not shared-cacheable. Demo mode is isolated
behind `NEXT_PUBLIC_DEMO_MODE=true` and exists only for credential-free local UI
and CI; it never grants database access.

## Package boundaries

- `apps/web`: dashboard, authenticated routes, editor, and typed endpoints.
- `packages/contracts`: shared Zod schemas and enums.
- `packages/database`: generated types and database adapters.
- `packages/security`: signing, replay, SSRF, and upload controls.
- `packages/content-scoring`: deterministic opportunity and draft arithmetic.
- `packages/ai`: versioned prompts, provider adapters, research budgets, and
  evaluation metrics.
- Later packages own images and observability without bypassing these
  boundaries.
