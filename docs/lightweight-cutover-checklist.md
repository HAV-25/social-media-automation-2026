# Lightweight cutover checklist

Execute and retain the evidence defined in
`docs/lightweight-shadow-validation.md` before checking any pre-cutover item.

## Pre-cutover

- [ ] Migration reviewed and applied successfully.
- [ ] Cross-brand RLS denial tests pass.
- [ ] Static reviewer build contains only publishable Supabase configuration.
- [ ] Five lightweight n8n workflows import inactive without warnings.
- [ ] RSS schedule timezone is `Europe/Berlin` and run time is `01:00`.
- [ ] OpenAI and image costs are bounded and visible per stage.
- [ ] Shadow run completes RSS to downloadable package.
- [ ] Broken feed, duplicate, provider timeout and image failure recoveries pass.
- [ ] Product owner approves cutover.

## Cutover

- [ ] Record legacy workflow activation state and execution IDs.
- [ ] Pause legacy WF-01 only.
- [ ] Activate lightweight daily intake and worker workflows.
- [ ] Deploy static reviewer release candidate.
- [ ] Confirm first job claim, first completion and reviewer visibility.

## Monitoring

- [ ] No duplicated source, opportunity, draft, image or paid stage.
- [ ] No job remains leased beyond its expiry.
- [ ] Retry-wait jobs either succeed or reach a classified terminal failure.
- [ ] Costs reconcile with provider usage.
- [ ] Two consecutive scheduled cycles complete.

## Rollback

- [ ] Disable lightweight daily intake.
- [ ] Re-enable the recorded legacy WF-01 version.
- [ ] Restore static or legacy UI from `v0.9.0-current-architecture.20260811`.
- [ ] Leave additive queue records intact for diagnosis.
