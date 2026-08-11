# Lightweight architecture release candidate

Version: `1.0.0-lightweight-rc.1`  
Branch: `codex/lightweight-architecture-v1`  
Baseline: `v0.9.0-current-architecture.20260811`

## Outcome

Daily automation no longer depends on the reviewer application or a Netlify
function. Supabase is the durable control plane and system of record. n8n claims
small, typed jobs, performs orchestration, and persists every result before the
next stage becomes runnable. The reviewer application is a static authenticated
client of those stored results.

```text
01:00 Europe/Berlin
        |
        v
 n8n daily intake -----> Supabase pipeline job queue
        |                         |
        |                         +--> qualify/select
        |                         +--> bounded research
        |                         +--> three drafts + verification
        |                         +--> image + deterministic package
        v
 OpenAI/provider calls ------> Supabase records + Storage
                                      |
                                      v
                            Static reviewer interface
```

## Ownership boundaries

| Concern                                                     | Owner                                | Why                                                |
| ----------------------------------------------------------- | ------------------------------------ | -------------------------------------------------- |
| Authentication, membership, RLS                             | Supabase                             | One database-enforced authorization model          |
| Sources, opportunities, claims, posts, images, costs, audit | Supabase                             | Durable system of record                           |
| Stage queue, leases, idempotency, retries                   | Supabase                             | Atomic transitions survive worker and UI outages   |
| Scheduling and stage orchestration                          | n8n                                  | Visible operational workflow with bounded nodes    |
| Model prompts and structured-output contracts               | Versioned Supabase worker TypeScript | Reviewable, testable and absent from workflow JSON |
| AI and image provider calls                                 | Supabase stage worker                | Provider credentials never enter n8n or browser    |
| Reviewer navigation and human decisions                     | Static reviewer application          | No server/API runtime dependency                   |
| Final assets                                                | Supabase Storage                     | Signed, RLS-authorized downloads                   |

## Durable execution model

`pipeline_instances` is one end-to-end attempt for one brand/opportunity.
`pipeline_jobs` is one independently resumable stage. Private payloads are kept
in `private.pipeline_job_payloads`; reviewers see only safe summaries.

Workers atomically claim jobs using `FOR UPDATE SKIP LOCKED`. A lease expiry
returns abandoned work to the queue. Completion writes output references, usage
and cost in the same transaction that creates the next stage. The next-stage
idempotency key derives from the predecessor, so retries cannot duplicate a paid
stage. Retry delay is bounded exponential backoff and attempts stop at the
configured ceiling.

Each n8n worker invocation claims one expensive job. The durable queue—not a
long synchronous request—provides throughput, so scaling does not recreate the
gateway-timeout and repeated-dispatch failure mode of the archived architecture.

The normal state sequence is:

```text
ingest -> qualify -> research -> draft -> verify -> image -> package
```

Warnings remain visible but do not block preparation. A permanent validation,
security or budget error stops only its own pipeline. One feed or opportunity
cannot stop another.

## Reviewer interface

`apps/reviewer` is a statically bundled React application. It uses only the
Supabase URL and publishable key. It never receives the secret key, workflow
secret, n8n key or OpenAI key.

The release candidate includes:

- assigned-brand sign-in and brand switching;
- opportunity feed ordered by score with automatic/manual thresholds;
- Ready Posts review, immutable manual edits, regeneration requests,
  approval/rejection and package download;
- RSS feed add/pause/resume, brand routing, thresholds, keywords and daily limits;
- generated-image preview and exact image-prompt provenance;
- durable stage history with retries, errors and exact recorded cost;
- 30-second read refresh without starting automation.

Brand profile editing remains a cutover-gated compatibility capability. Feed
administration is implemented directly against RLS-protected Supabase records
through a narrow authenticated RPC.

## Deployment isolation

The static reviewer can be deployed to Netlify, Cloudflare Pages, GitHub Pages,
an internal web server, or Supabase Storage. If it is unavailable, n8n continues
to claim and complete Supabase jobs. Restoring the static files restores review
access; no pipeline restart is required.

## Security invariants

- New public tables have RLS and brand-scoped read policies.
- Queue payloads are private and unavailable through PostgREST.
- Edge worker endpoints require a separate constant-time-checked 32+ character
  worker secret; it never enters URLs or stored output.
- Worker mutation RPCs require the actual Postgres `service_role`, supporting
  Supabase opaque secret keys without relying on absent JWT claims.
- Reviewer RPCs require `auth.uid()` and brand edit permission.
- All SECURITY DEFINER functions use an empty `search_path` and have default
  execution revoked.
- User-provided instructions are bounded data, never workflow instructions.

## Cutover and rollback

No production cutover occurs from this branch automatically.

1. Apply and test the lightweight migration in a non-production or reversible
   production window.
2. Import the coordinated lightweight n8n workflows inactive.
3. Run one shadow RSS journey and compare its stored outputs and costs.
4. Deploy the static reviewer to a separate preview URL.
5. Obtain product-owner acceptance.
6. Pause legacy WF-01 and activate the lightweight 01:00 trigger.
7. Monitor two daily cycles before deleting nothing.

Rollback disables the lightweight trigger, re-enables legacy WF-01 and deploys
tag `v0.9.0-current-architecture.20260811`. New queue tables are additive and do
not alter historical content.
