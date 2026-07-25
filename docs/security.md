# Security model

- Application authorization comes from `organization_members` and
  `brand_members`, never user-editable profile or JWT user metadata.
- Email/password signup proves control of an email address but creates no
  organization or brand authorization by itself. A private, server-managed
  exact-email allowlist provisions approved pilot identities through hardened
  database triggers; verified identities without an active match remain in a
  locked `pending_access` state.
- The pilot allowlist is in the unexposed `private` schema with RLS enabled and
  no browser grants. Its security-definer functions have an empty search path,
  are not executable by anonymous or authenticated roles, and derive
  authorization only from confirmed `auth.users.email` values.
- Signup callbacks accept only email/signup verification types and fixed local
  destinations. Both six-digit token and PKCE confirmation-link flows terminate
  in the same membership gate.
- All exposed tables enable RLS and use explicit grants.
- Service credentials remain server-only and are forbidden in workflow exports.
- Signed workflow requests include timestamp, nonce, method, path, body digest,
  and HMAC; consumed nonces are stored for replay prevention.
- Workflow verification accepts an active and optional previous secret during a
  bounded rotation. n8n receivers use the same overlap while signing only with
  the active secret; neither value enters workflow JSON, logs, or browser code.
- User and internal APIs fail closed behind configurable, atomic fixed-window
  limits. Production stores only hashed subjects and normalized operations in
  an RLS-enabled private table; authenticated/anonymous roles have no grants.
- RSS feed mutations and research reservations execute through service-only
  database functions. Poll-health increments and daily-limit reservations lock
  their target rows to remain correct under concurrent workers.
- Source inputs are hostile data. URL ingestion blocks private/link-local
  networks and revalidates every redirect. Uploads are size- and content-MIME
  checked.
- Source originals use a private organization/brand-prefixed bucket. PDF and
  DOCX declared types are checked against binary signatures; extraction
  failures remain inspectable without exposing the original object.
- Brand images and fonts are checked against their declared MIME type using
  binary signatures. SVGs with doctypes, entities, scripts, foreign objects,
  event handlers, or external/data/javascript references are rejected.
- Private brand asset previews use ten-minute signed URLs and organization/brand
  storage prefixes.
- Immutable versions and append-only audit/pipeline events preserve human and
  model provenance.
- Authenticated responses that can refresh cookies must not be shared-cached.
- Errors are typed and redacted; provider/database secrets never reach users.
- Log metadata is recursively bounded and redacts authorization, cookies,
  credentials, JWTs, connection passwords, source content, prompts, tokens, and
  raw provider responses. Unknown internal errors return generic user messages.
- Research accepts only HTTP(S) evidence URLs, bounds domains/queries/results,
  and verifies that returned evidence URLs were actually consulted by the web
  search tool.
- Paid research requires a successful atomic database budget reservation.
  Concurrent calls share an organization/day advisory lock, and every retry is
  tied to an idempotency key.
- Evidence provenance and readiness are enforced at both the Zod boundary and
  inside the persistence transaction. Verified factual/numerical claims require
  supporting evidence; unverified high-risk claims are blocked; unknown
  source/claim references and empty writing-ready packages are rejected.
- Provider failures retain available model, prompt, response, token, search,
  cost, and error provenance without returning secrets or raw provider errors to
  the browser.
- Recovery stores only a bounded error code, fixed category, and retryability
  flag. Raw n8n/provider messages are neither forwarded nor persisted. Execution
  bodies are capped, content-digested, service-only, RLS-protected, and retained
  in the unexposed `private` schema.
- Automatic recovery is leased and capped at three retries. Manual recovery
  requires organization-administrator membership, actor/session equality, an
  idempotency key, a reason, and an audit event.
