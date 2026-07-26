-- A reservation identifies one feed-routed source opportunity. Its score is
-- mutable derived data and must not make the same logical request conflict
-- after scoring arithmetic or source cleanup improves.
update private.idempotency_keys as idempotency
set request_hash = encode(
  extensions.digest(
    concat(
      run.model_usage ->> 'rssFeedId',
      ':',
      run.brand_id,
      ':',
      run.model_usage ->> 'sourceDocumentId',
      ':',
      run.entity_id
    ),
    'sha256'
  ),
  'hex'
)
from public.generation_runs as run
where idempotency.scope = 'rss_generation_reservation'
  and idempotency.response_body is not null
  and nullif(idempotency.response_body ->> 'generationRunId', '')::uuid = run.id
  and run.run_type = 'rss_opportunity_reservation';
