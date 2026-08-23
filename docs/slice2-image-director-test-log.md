# Slice 2 — image director test log

Internal verification of the brand-configurable, divergent image director ported
into the `lightweight-stage-worker` edge function.

## Part A — offline scenario log (logic, no cost)

Ran the edge catalog (`supabase/functions/_shared/image-concept-catalog.ts`) across
scenarios via a temporary Node harness (`--experimental-strip-types`). **Result:
ALL ASSERTIONS PASSED.**

| # | Scenario | Result |
|---|---|---|
| 1 | Default / unconfigured brand | 3 content styles → 3 **distinct** groups + styles: newsworthy→`literal_hero` (photographic), educational→`process_flow` (structured), perspective→`conceptual_metaphor` (conceptual). Divergence confirmed. |
| 1b | Same config, different topic (drone) | Same divergent trio; briefs are topic-specific (subject text differs). |
| 2 | Configured: photographic medium + palette + mood + art direction | Prompt contains `Preferred medium: photographic`, `Mood: …`, `Brand art direction: …` (asserted). Palette carried for compositing. |
| 3 | Enabled subset = photographic only | Catalog = 3 concepts; all picks stay photographic (structured/conceptual groups empty → safe fallback within enabled set). |
| 4 | Custom concept (`blueprint_iso`) | Appears in resolved catalog and is selectable (perspective→`blueprint_iso`). |
| 5 | Preferred style = `branded_headline_card` | Lead (newsworthy) → `human_context` (branded_headline_card); others still diverge. |
| 6 | Malformed / hostile `visual_identity` jsonb | Falls back safely: medium→mixed, bad hex dropped, enabled→[], bad preferred dropped, incomplete custom dropped. |
| — | Determinism | Same seed → same concept (asserted for every pick). |

Key guarantee: `content_style` deterministically maps to a concept group
(newsworthy→photographic, educational→structured, perspective→conceptual), so the
three angles of one topic diverge; the seed rotates within the group; brand
`enabledConceptIds` / `preferredStyle` / `customConcepts` tune the pool.

## Part B — live end-to-end (real generations)

_(appended after deploying the edge function and triggering real image jobs)_
