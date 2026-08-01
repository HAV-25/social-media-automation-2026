# Workflow map

| Workflow            | Trigger                     | Durable result                               |
| ------------------- | --------------------------- | -------------------------------------------- |
| WF-01 RSS intake    | Schedule/feed trigger       | Source intake request and feed poll result   |
| WF-02 Manual intake | Signed application webhook  | Submitted source linked to a run             |
| WF-03 Normalize     | Source received             | Normalized source/chunks and dedupe decision |
| WF-04 Cluster/score | Source normalized           | Cluster, value nucleus, score breakdown      |
| WF-05 Research      | Eligible opportunity        | Research run, sources, claims, warnings      |
| WF-06 Generate      | Completed bounded research  | Angles and immutable draft versions          |
| WF-07 Evaluate      | Draft created               | Evaluation, revision, verification results   |
| WF-08 Image         | Verification completed      | Base/final image assets                      |
| WF-09 Regenerate    | Reviewer request            | New immutable component version              |
| WF-10 Error         | Error trigger/1-minute poll | Fresh signed replay or terminal recovery     |

Every workflow carries a correlation ID and idempotency key and calls a signed,
versioned internal endpoint for durable changes.

Under the internal UAT policy, WF-05 dispatches all three standard styles after
research completes even when the evidence package records writing warnings, and
WF-07 hands a completed draft to WF-08 even when evaluation records editorial
warnings. The warning signals remain persisted and visible; only the human
approval step can accept them, with an audited acknowledgement and reason.

WF-05 through WF-09 use WF-10 as their runtime-linked n8n error workflow.
Supabase, not n8n memory, owns retry timing, attempt caps, leases, dead-letter
state, manual override, and provenance. Recovery calls the target webhook with
a fresh signature; it never reuses a saved time-bounded HTTP request.
