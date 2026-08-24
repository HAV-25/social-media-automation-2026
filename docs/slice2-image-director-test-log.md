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

Edge function `lightweight-stage-worker` **v11 deployed** to prod (2026-08-24).
Real image jobs enqueued via `request_lightweight_action(action:"image")` and
processed by the live worker (`gpt-image-1-mini`, ~$0.01/image).

### Scenario A — divergence on real data (default brand config)
Topic "Humanoid Robots Put China Ahead in Tech Race" — all 3 angles imaged:

| content_style | concept (stored) | image style | group |
|---|---|---|---|
| newsworthy_authority | Macro detail (`concept_macrodetail`) | editorial_hero | photographic |
| educational_breakdown | Process flow (`concept_processflow`) | insight_card | structured |
| perspective_conversation | Conceptual metaphor (`concept_conceptualmetaphor`) | conceptual_illustration | conceptual |

→ **3 distinct concepts, styles, and groups** on real generation (vs. the old
hardcoded "Editorial signal / editorial_hero" for all three, still visible on a
stale pre-deploy row). All `status=ready`. Enriched prompt confirmed in
`image_assets.prompt`:
`… BRAND: Klaank / VISUAL APPROACH: Process flow — Show the mechanism … / COMPOSITION: …`

### Scenario B — brand visual identity applied
Set Klaank `visual_identity` = medium `illustration`, palette `#0B1F3A`/`#F59E0B`,
mood, art direction, preferredStyle `conceptual_illustration`; regenerated the
newsworthy angle. Stored prompt COMPOSITION line:
`… Preferred medium: illustration. Mood: Clinical, precise, forward-looking. Brand art direction: Restrained technical illustration in real engineering environments, no stock clichés.`
Palette override applied via the brand path. **Brand reset to `{}` after the test.**

### Observations
- `content_style` → group mapping guarantees the 3 angles diverge; the seed
  rotates within the group (newsworthy landed on `macro_detail` this run).
- `preferredStyle` biases only within the content-style group — newsworthy maps to
  photographic, so a `conceptual_illustration` preference did not override it
  (expected).
- No pipeline regression: jobs succeeded, final-image validation passed, cost
  normal. `verify_jwt` remained disabled; `lightweight-daily-intake` untouched.
