# Feature 8.5 security and advisor review — 2026-07-27

## Result

The live Supabase project has no critical or high security advisor finding.
The application security regressions cover dependency boundaries, secret
redaction, authorization and cross-tenant denial, SSRF, upload validation,
signed webhooks and replay protection, and prompt-injection containment.

## Live Supabase advisor snapshot

Project: `hqffgchxwtymyfwtkmdt`

Security advisor:

- 0 critical findings.
- 0 high findings.
- 0 errors.
- 1 warning: leaked-password protection is disabled.
- 5 informational notices: RLS is enabled without policies on unexposed
  `private` tables used only by privileged server transactions.

The five private-table notices are expected. The tables are outside the exposed
API schema, have no browser grants, and intentionally have no authenticated or
anonymous policy. Adding a permissive client policy would weaken the design.

Leaked-password protection is an Auth dashboard setting and is available only
on qualifying Supabase plans. It is recommended before expansion beyond the
controlled approved-user pilot. It is not a database exposure and is below the
Milestone 8 critical/high release gate.

Performance advisor:

- 48 unindexed-foreign-key warnings.
- 60 multiple-permissive-policy warnings.
- 17 unused-index informational notices.

These are optimization findings, not security bypasses. The high-traffic
selected-brand, run, feed, audit, cost, membership, and performance paths
already have feature-specific indexes. The remaining foreign-key and policy
consolidation work is retained as an optimization backlog because a broad
policy rewrite immediately before UAT would carry greater authorization
regression risk than its demonstrated pilot benefit.

## Security regression surfaces

- Dependency audit: `sharp` was raised to 0.35.0 and `postcss` to 8.5.18,
  including transitive Next.js copies through workspace overrides. The final
  production audit reports no known vulnerability.
- Secrets: provider-shaped values and hostile source/prompt/response fields are
  recursively redacted; workflow JSON contains no credential IDs.
- Authorization: exposed tables use RLS and explicit grants; live pgTAP probes
  deny cross-organization and cross-brand access.
- SSRF: source URLs reject private, loopback, metadata, DNS-rebound, and unsafe
  redirect destinations.
- Uploads: size, MIME, byte signature, active SVG content, private storage
  prefixes, and authorized brand ownership are validated.
- Webhooks: HMAC, timestamp, nonce, body digest, service identity, idempotency,
  replay windows, and bounded key rotation are enforced.
- Prompt injection: every production prompt marks source, research, and brand
  material as hostile data rather than instructions; hostile fixtures verify
  no instruction following or secret disclosure.
- Recovery: permanent failures do not loop; transient retry attempts are
  leased, capped, redacted, and idempotent.

## Accepted follow-up

Enable leaked-password protection in Supabase Auth if the project's plan
supports it before broadening access beyond the four approved pilot accounts.
Re-run both advisors after any schema, RLS, or index migration.
