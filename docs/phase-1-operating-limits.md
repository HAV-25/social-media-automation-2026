# Phase 1 operating limits and load evidence

## Supported pilot envelope

The Phase 1 limits come from the product blueprint and remain configurable at
the application boundary:

- 20 internal brands.
- 100 active RSS feeds.
- 1,000 ingested feed items per UTC day.
- 50 one-off submissions per UTC day.
- Three automatically selected opportunities per brand per UTC day by default.
- Three post styles per selected opportunity.
- Four image jobs in flight at once.

The first three opportunities that durably reserve a daily slot while scoring
75 or higher are prepared automatically. Scores from 60 through 74 remain in
Review. Lower scores remain durable but cannot create an automatic candidate.
The selection counter resets at 00:00 UTC.

## Deterministic resource bounds

- An RSS response is limited to 2 MB and at most 1,000 parsed entries.
- Each feed poll processes at most `RSS_ITEMS_PER_FEED_PER_RUN` entries; the
  production default is three and the validated maximum is 20.
- Research, writing, and image calls retain their existing query, result,
  token, timeout, retry, idempotency, and cost limits.
- At most four content packages or image jobs are exercised concurrently in
  the capacity fixture. Production orchestration remains subject to its
  service-side leases and rate limits.
- The load fixture uses deterministic fake providers and therefore spends
  $0.00 and makes no external model or image request.

## Release targets

On the repository's Windows development host:

- Parse and cluster the 1,000-item/100-feed daily envelope in under 20 seconds.
- Prepare 60 content packages (20 brands × three opportunities) with one
  evidence package and three materially distinct drafts each in under 10
  seconds using fake providers and concurrency four.
- Generate four deterministic image jobs in under 15 seconds, with less than
  50 MB of retained base64 output.

These are release-regression targets for deterministic application work, not
promises about external provider latency. Production provider calls retain
their separate 60-second research/writing and 120-second image timeout
defaults.

## 2026-07-27 evidence

- 100 feeds and 1,000 items parsed and clustered in approximately 5.14 seconds.
- 60 fake research packages and 180 fake editorial drafts completed with a
  maximum concurrency of four in under one second.
- Four deterministic fake images completed concurrently in under one second
  and stayed below the retained-output ceiling.
- Every provider usage record in the fixture reported an estimated cost of
  $0.00.

The tests live in:

- `packages/source-processing/src/operating-limits.test.ts`
- `packages/ai/src/operating-limits.test.ts`
