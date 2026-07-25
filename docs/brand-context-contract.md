# Brand context contract

Downstream analysis and generation receive a normalized, versioned brand
context. The durable source remains Supabase; this contract is a bounded view,
not a second data store.

## Included fields

- Brand identity, audience, and positioning.
- Content pillars, restricted topics, CTA policy, geography, and risk tolerance.
- Numeric voice fingerprint and vocabulary constraints.
- Length, emoji, hashtag, CTA, and 1–3 variant defaults.
- Up to three approved examples selected for relevance.
- Up to twelve visual asset references.
- Completeness score and missing-input labels.

## Safety and isolation

- Source content is never permitted to modify brand context.
- Example retrieval always filters by `brand_id` before similarity ranking.
- Unapproved examples are excluded from AI context.
- An entire example library is never copied into a prompt.
- Visual paths refer to private storage; client previews are time-limited signed
  URLs.
- The contract is validated with Zod before a model or workflow receives it.

The current contract version is `1.0`.
