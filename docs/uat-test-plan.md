# Phase 1 UAT test plan

## Purpose

This plan lets the business reviewer validate the complete internal workflow
without requiring knowledge of Supabase or n8n. Payal is the primary UAT
reviewer. Phase 1 remains human-approved and must not publish or schedule
content.

## Test configuration

- Production application: `https://appsbrite-social.netlify.app`
- Initial test brand: Klaank
- Automatic opportunity threshold: 75
- Manual Review band: 60–74
- Automatic daily maximum: 3 opportunities per UTC day
- RSS polling: every 15 minutes
- Standard styles: Newsworthy, Educational, and Perspective
- Tone overlays: choose only from the structured options shown by the product

Record the test date, account email, selected brand, article title, and any
visible run identifier for every result. Do not record passwords or API keys.

## UAT journeys

### UAT-01 — Authentication and brand access

1. Sign up or sign in with an approved reviewer account.
2. Open Klaank and confirm the selected brand remains Klaank after navigation.
3. Sign out and confirm protected pages cannot be reopened anonymously.

Pass when authentication is real, access is brand-scoped, and no demo identity
or hard-coded dashboard metric appears.

### UAT-02 — Brand editorial configuration

1. Review Klaank's description, audience, voice, examples, prohibited language,
   visual assets, automatic threshold, Review band, and daily maximum.
2. Make one harmless configuration edit and save it.
3. Reload and confirm the edit persists with audit history.

Pass when configuration is durable and affects only the selected brand.

### UAT-03 — Feed setup and autonomous intake

1. Open Sources and confirm active feed URLs and brand routing.
2. Add or edit one valid RSS feed.
3. Wait for the next 15-minute poll, or use the explicit one-off intake control.
4. Confirm Runs & errors records the intake and each feed shows its latest poll.

Pass when a real feed is fetched without manual approval at every stage and a
repeated poll does not create a duplicate source.

### UAT-04 — Daily source decisions

1. Open Content inbox after a poll.
2. Confirm every newly observed item is visible as filtered, pending, scored,
   automatically selected, waiting for capacity, or retained.
3. Use search, feed, state, score, and ordering controls.
4. Open a scored item and compare its value nucleus and score explanation with
   the source article.

Pass when filtered items explain why they were not scored, scored items show
their arithmetic, and the Priority view contains only automatically preparable
items at or above 75.

### UAT-05 — Daily limit and Review band

1. Confirm no more than three eligible opportunities are automatically selected
   across all Klaank feeds during one UTC day.
2. Confirm a score from 60 through 74 appears under Review and does not generate
   automatically.
3. Confirm a score below 60 remains stored but is not a post candidate.

Pass when the selected count is brand-wide, resets at 00:00 UTC, and lower
scores cannot silently consume an automatic slot.

### UAT-06 — Research and claims

1. Open an automatically selected opportunity.
2. Inspect the research package, sources, claim type, confidence, support,
   conflicts, and usage guidance.
3. Follow at least one evidence link.
4. Confirm model, usage, and cost are shown for the research step.

Pass when statements are traceable to evidence and unsupported or conflicting
claims are visibly constrained.

### UAT-07 — Three distinct post styles

1. Generate Newsworthy, Educational, and Perspective versions for one eligible
   opportunity.
2. Apply an approved tone overlay.
3. Read the explanation of each style and compare the three drafts.

Pass when the drafts are materially different, remain faithful to the evidence
ledger and brand voice, and no arbitrary production-prompt editor is exposed.

### UAT-08 — Quality review, edit, and selective regeneration

1. Inspect quality, risk, similarity, evidence, and brand-fit results.
2. Edit one draft and save it.
3. Selectively regenerate one component or one style.
4. Confirm the other approved content is unchanged.
5. Confirm each provider call shows model, usage, and recorded cost.

Pass when changes are durable, bounded, attributable to the reviewer, and do
not cause duplicate paid calls on retry.

### UAT-09 — Branded image

1. Review the three ranked image concepts.
2. Generate the selected concept.
3. Compare the exact displayed provider prompt with the resulting image.
4. Confirm deterministic brand composition and image provenance.
5. Regenerate once and verify the new attempt and cost are separately recorded.

Pass when the image, exact prompt, model, prompt version, usage, cost, and
selected concept are inspectable.

### UAT-10 — Approval and package

1. Reject one test draft and verify the reason is retained.
2. Approve a separate complete post.
3. Copy its text and download its image/package.
4. Inspect the package for source, evidence, prompt/model, version, cost, and
   human-decision provenance.

Pass when only a human can approve, rejected work is not presented as ready,
and no publish or schedule action exists.

### UAT-11 — Operations, recovery, and cost

1. Open Runs & errors and filter by state and workflow stage.
2. Change the time window and confirm the exact cost ledger updates for the
   selected brand across workflow step, model, source input, and content
   package.
3. Open one content package from the ledger and reconcile its research,
   writing, image, draft-readiness, and approval counts.
4. Inspect one successful run and one controlled failed or retried run.
5. Confirm attempts, duration, model, usage, step cost, total cost, error class,
   and recovery action are understandable.
6. Retry only where the interface says it is safe and confirm idempotency.

Pass when operational history agrees with the content record and a retry cannot
duplicate content or spend.

### UAT-12 — Archive and resurfacing

1. In Settings → Retention & archive, confirm the selected brand's active inbox
   and resurfacing windows.
2. After an item leaves the configured rolling inbox, find it in Archive.
3. Inspect its retained score and downstream outcome.
4. Resurface one scored item.
5. Confirm it returns to the inbox for the configured review window without changing its score,
   automatically generating content, approving it, or consuming an automatic
   slot without an explicit reviewer action.

Pass when archive is durable history rather than deletion and changing the
rolling window does not change the UTC daily-selection count or daily spend.

### UAT-13 — Isolation and prohibited behavior

1. Switch brands and confirm Klaank records do not leak into another brand.
2. Attempt direct navigation to a known record outside the selected/assigned
   brand.
3. Confirm there is no automatic publish, schedule, or virality-guarantee
   control.

Pass when organization and brand boundaries fail closed.

### UAT-14 — Activity and feedback accountability

1. Reject one review-ready draft with a reason and approve another.
2. Open Activity & feedback for the selected brand.
3. Filter to Reviewer feedback and confirm both decisions, reviewer identity,
   timestamps, and the rejection reason appear.
4. Open the affected post from the activity record.
5. Switch to another brand and confirm the first brand's history disappears.
6. Search for the rejection reason and change the time window.

Pass when the visible history agrees with the durable audit record, links to the
correct entity, and cannot expose activity from an unauthorized brand.

### UAT-15 — Team roles and brand assignments

1. Sign in as an organization administrator and open Settings → Team & access.
2. Confirm only existing approved users are listed and no password, secret, or
   private allowlist control is exposed.
3. Change a test member's organization role and remove one brand assignment.
4. Reload and confirm the change persists with exactly one activity record.
5. Sign in as that test member and confirm the removed brand is unavailable
   while retained brands still work at the assigned role.
6. Attempt to demote the only remaining organization administrator.

Pass when role and brand access are enforced by RLS, cross-brand data remains
inaccessible, and the final administrator cannot be removed.

### UAT-16 — Brand performance and cost

1. Open Performance for Klaank and select Last 7 days.
2. Compare the feed-health list with Sources and confirm each routed feed has a
   clear healthy, late, failing, never-polled, or paused state.
3. Compare prepared opportunities, draft variants, ready image assets, and
   successful workflow stages with Content inbox, Ready posts, and Runs &
   errors.
4. Approve one review-ready draft and reject another with a reason, then reload
   Performance.
5. Confirm approval/rejection totals and the rejection reason update. Confirm
   approval rate equals approved divided by approved plus rejected and excludes
   change requests.
6. Follow Exact cost ledger and reconcile the total with the per-step, model,
   source, and content-package breakdown.
7. Switch brands and confirm the first brand's metrics disappear.

Pass when the business summary reconciles with durable source, post, run, cost,
and reviewer-decision records without exposing another brand's data.

## Defect recording

For every defect capture:

- UAT case and step
- expected result
- actual result
- brand and article
- time in UTC
- screenshot
- visible run or record identifier
- whether the defect blocks the end-to-end demonstration

Never include passwords, Supabase secret keys, OpenAI keys, workflow HMAC
secrets, cookies, or authorization headers.

## Sign-off

UAT is complete only when every critical journey passes, no security or
data-isolation defect is open, provider cost is visible at every paid step, and
Payal accepts the end-to-end reviewer experience.
