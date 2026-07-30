# n8n workflow package

Workflows are inactive on import and contain no credentials or credential IDs.
Supabase remains the durable system of record; n8n only calls signed,
versioned application endpoints.

## Required n8n environment

- `APP_BASE_URL`: reachable base URL of the Next.js application.
- `N8N_WEBHOOK_BASE_URL`: n8n's reachable webhook base URL for signed
  workflow-to-workflow handoffs.
- `WORKFLOW_HMAC_SECRET`: the same 32+ character secret configured on the
  application.
- `WORKFLOW_HMAC_PREVIOUS_SECRET`: optional previous value used only during a
  bounded zero-downtime rotation.
- `NODE_FUNCTION_ALLOW_BUILTIN=crypto`: permits the Code nodes to create
  SHA-256/HMAC signatures and UUID nonces.

WF-08 owns the signed image-generation handoff. WF-09 routes selective image
concept, base, and template actions to that same typed endpoint.

Rotate workflow authentication in three phases:

1. Configure the new value as `WORKFLOW_HMAC_PREVIOUS_SECRET` in both n8n and
   the application while the old value remains active.
2. Promote the new value to `WORKFLOW_HMAC_SECRET` in both systems and retain
   the old value as previous. Receivers accept either value; signers use only
   the active value.
3. After the signature tolerance and all in-flight executions have elapsed,
   remove the previous value from both systems. Never print either value or
   place it in workflow JSON.

Repository publication is name-stable and idempotent. Copy `.env.n8n.example`
to the ignored `.env.n8n.local` file and set the API key. The checked-in URL,
project ID, and folder ID target the Social Media Automation folder on the
Spaarker instance. Run `pnpm n8n:plan` for a read-only destination check and
create/update preview. Run `pnpm n8n:publish` only after reviewing that plan; it
creates or updates WF-10 followed by recoverable WF-05 through WF-09 by exact
workflow name in that folder and activates them. It then links those five
workflows to the remote WF-10 ID as their n8n error workflow. Duplicate remote
names stop publication. On n8n versions whose public workflow-create schema
does not accept `parentFolderId`, the command stages missing workflows inactive
in the project and stops. Move them into the configured folder in the UI,
rerun the read-only plan, and then run publication; the command never activates
a newly staged workflow before that folder placement is verified.

For a manual alternative, import WF-01 through WF-10 from `workflows/`, inspect
the nodes, run them manually against non-production sources, and only then
activate WF-01's daily 01:00 Europe/Berlin schedule, WF-10's recovery schedule,
and the webhook workflows.
The workflow never fetches a configured feed directly: the application fetches
each URL through its DNS-pinned SSRF boundary, validates redirects, MIME type,
size, timeout, and XML before returning normalized items. RSS intake then calls
the application-owned normalization, cluster, score, and research-policy gate;
n8n does not calculate or persist those decisions itself.

WF-05 accepts a signed, reviewer-authorized bounded-research contract and calls
the application-owned research endpoint. The application owns prompts,
provider selection, strict evidence validation, cost enforcement, and durable
claim provenance; n8n only orchestrates the typed handoff.

WF-05 through WF-08 acknowledge a valid signed webhook with HTTP 202 before
starting their paid or deterministic stage. The accepted child execution owns
its recovery registration and completion, so a slow provider call cannot hold
WF-01 or its parent stage open. An asynchronous recovery replay is completed
only by the accepted child stage; synchronous WF-09 content actions retain
atomic acknowledgement completion.

WF-06 coordinates bounded angle/post generation for one to three requested
styles. WF-07 re-runs deterministic claim, risk, brand-fit, and similarity
verification. WF-08 generates and persists branded images. WF-09 carries
selective text and image actions. All four call signed, typed application
endpoints; prompts, evaluation arithmetic, immutable versions, and durable
state stay in the application and Supabase.

WF-10 receives n8n Error Trigger summaries and polls the application recovery
dispatcher once per minute. PostgreSQL owns classification, deterministic
backoff, the three-attempt cap, leases, dead-letter state, manual administrator
override, and audit provenance. A claimed recovery starts the target webhook
from immutable typed request context with a fresh timestamp, nonce, digest, and
HMAC signature; saved n8n HTTP-node input is never retried. WF-10's own
dispatcher and failure-persistence requests continue safely on transport
failure so its scheduled branch cannot invoke its Error Trigger recursively.
Raw exception messages are never forwarded or stored.

Each request signs:

```text
timestamp
nonce
HTTP method
path
SHA-256(raw body)
```

The server rejects stale signatures and consumes every nonce once. Each feed
item also carries a stable idempotency key, so retries cannot create duplicate
source documents.

Run `pnpm runtime:preflight` before activating WF-01. It verifies required local
key names and lengths, exact remote workflow inventory, duplicates, and active
states without printing credential values or mutating n8n. The n8n public API
cannot attest server environment values, so the operator must still confirm all
reported n8n runtime keys after any container restart.
