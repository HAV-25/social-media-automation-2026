begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'lw-admin@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'lw-editor@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '4a000000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'lw-outsider@example.test', '', now(), '{}'::jsonb, '{}'::jsonb, now(), now());

insert into public.organizations (id, name) values
  ('1a000000-0000-4000-8000-000000000001', 'Lightweight primary'),
  ('1a000000-0000-4000-8000-000000000002', 'Lightweight other');
insert into public.brands (id, organization_id, name, slug) values
  ('2a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001', 'LW Brand A', 'lw-brand-a'),
  ('2a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000001', 'LW Brand B', 'lw-brand-b'),
  ('2a000000-0000-4000-8000-000000000003', '1a000000-0000-4000-8000-000000000002', 'LW Other', 'lw-other');
insert into public.organization_members (organization_id, user_id, role) values
  ('1a000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000001', 'administrator'),
  ('1a000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000002', 'viewer'),
  ('1a000000-0000-4000-8000-000000000002', '4a000000-0000-4000-8000-000000000003', 'administrator');
insert into public.brand_members (brand_id, user_id, role) values
  ('2a000000-0000-4000-8000-000000000001', '4a000000-0000-4000-8000-000000000002', 'editor');

insert into public.source_documents (
  id, organization_id, source_type, canonical_url, title, clean_text, status
) values
  ('3a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001',
   'rss', 'https://lw.example.test/article', 'Lightweight article', repeat('Robotics evidence. ', 20), 'analyzed'),
  ('3a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000002',
   'rss', 'https://other.example.test/article', 'Other article', repeat('Other evidence. ', 20), 'analyzed');
insert into public.opportunities (
  id, organization_id, brand_id, source_document_id, value_nucleus,
  recommended_style, opportunity_score, score_breakdown, status
) values
  ('5a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001',
   '2a000000-0000-4000-8000-000000000001', '3a000000-0000-4000-8000-000000000001',
   'A sufficiently detailed lightweight test opportunity nucleus.', 'newsworthy_authority', 85, '{}'::jsonb, 'ready_to_generate'),
  ('5a000000-0000-4000-8000-000000000002', '1a000000-0000-4000-8000-000000000002',
   '2a000000-0000-4000-8000-000000000003', '3a000000-0000-4000-8000-000000000002',
   'A sufficiently detailed cross tenant opportunity nucleus.', 'newsworthy_authority', 85, '{}'::jsonb, 'ready_to_generate');
insert into public.post_drafts (
  id, organization_id, brand_id, opportunity_id, content_style, tone, status, score_breakdown
) values (
  '6a000000-0000-4000-8000-000000000001', '1a000000-0000-4000-8000-000000000001',
  '2a000000-0000-4000-8000-000000000001', '5a000000-0000-4000-8000-000000000001',
  'newsworthy_authority', 'thoughtful', 'ready_for_review', '{}'::jsonb
);
insert into public.post_versions (
  id, post_draft_id, version_number, hook, body, closing, full_text, generation_type
) values (
  '7a000000-0000-4000-8000-000000000001', '6a000000-0000-4000-8000-000000000001', 1,
  'Original hook', 'Original evidence-led body.', 'Original closing',
  E'Original hook\n\nOriginal evidence-led body.\n\nOriginal closing', 'initial'
);
update public.post_drafts set current_version_id = '7a000000-0000-4000-8000-000000000001'
where id = '6a000000-0000-4000-8000-000000000001';

create temporary table lw_claims as
select null::uuid job_id, null::uuid pipeline_id, null::text worker_id where false;
create temporary table lw_values (name text primary key, value uuid);
grant select, insert, update, delete, truncate on lw_claims, lw_values to service_role, authenticated;

-- Reviewer-visible summaries are brand isolated, while worker mutations remain service-only.
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select * from public.claim_pipeline_jobs('bad-worker', array['verify']::public.pipeline_stage[], 1, 60)$$,
  '42501', 'permission denied for function claim_pipeline_jobs',
  'authenticated reviewers cannot claim worker jobs'
);
select throws_ok(
  $$select public.begin_provider_operation('{}'::jsonb)$$,
  '42501', 'permission denied for function begin_provider_operation',
  'authenticated reviewers cannot reserve provider operations'
);
select throws_ok(
  $$select public.persist_lightweight_stage_output('{}'::jsonb)$$,
  '42501', 'permission denied for function persist_lightweight_stage_output',
  'authenticated reviewers cannot persist worker output'
);

reset role;
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
insert into lw_values
select 'verify_pipeline', (public.start_pipeline(jsonb_build_object(
  'brandId', '2a000000-0000-4000-8000-000000000001',
  'opportunityId', '5a000000-0000-4000-8000-000000000001',
  'sourceDocumentId', '3a000000-0000-4000-8000-000000000001',
  'idempotencyKey', 'lw:verify:pipeline:0001', 'triggerType', 'manual', 'stage', 'verify',
  'request', jsonb_build_object('purpose', 'atomic-persistence'), 'maxAttempts', 2
))).id;
insert into lw_claims (job_id, pipeline_id, worker_id)
select job_id, pipeline_id, 'worker-one'
from public.claim_pipeline_jobs('worker-one', array['verify']::public.pipeline_stage[], 1, 300);

select is((public.begin_provider_operation(jsonb_build_object(
  'jobId', (select job_id from lw_claims limit 1), 'workerId', 'worker-one',
  'operationKey', 'verify-provider-0001'
)) ->> 'execute')::boolean, true, 'a leased worker reserves a provider call once');
select is(public.complete_provider_operation(jsonb_build_object(
  'jobId', (select job_id from lw_claims limit 1), 'workerId', 'worker-one',
  'operationKey', 'verify-provider-0001', 'result', jsonb_build_object('answer', 42),
  'model', 'test-model', 'responseId', 'response-1', 'usage', jsonb_build_object('tokens', 10),
  'costUsd', 0.01
)) ->> 'state', 'succeeded', 'provider completion is recorded');
select is((public.begin_provider_operation(jsonb_build_object(
  'jobId', (select job_id from lw_claims limit 1), 'workerId', 'worker-one',
  'operationKey', 'verify-provider-0001'
)) -> 'result' ->> 'answer')::integer, 42, 'a completed provider result is reused idempotently');
select throws_ok(
  $$select public.complete_provider_operation(jsonb_build_object(
    'jobId', (select job_id from lw_claims limit 1), 'workerId', 'worker-one',
    'operationKey', 'verify-provider-0001', 'result', jsonb_build_object('answer', 43),
    'model', 'test-model', 'responseId', 'response-1', 'usage', jsonb_build_object('tokens', 10),
    'costUsd', 0.01
  ))$$,
  '23505', 'Provider completion replay does not match the recorded result',
  'a provider completion cannot replay with a different result'
);

select is(public.persist_lightweight_stage_output(jsonb_build_object(
  'jobId', (select job_id from lw_claims limit 1),
  'pipelineId', (select pipeline_id from lw_claims limit 1),
  'workerId', 'worker-one', 'actorId', '4a000000-0000-4000-8000-000000000001',
  'stage', 'verify', 'nextStage', 'image',
  'output', jsonb_build_object('evaluations', jsonb_build_array(jsonb_build_object(
    'postDraftId', '6a000000-0000-4000-8000-000000000001', 'qualityScore', 88
  )), 'verification', jsonb_build_object('warnings', jsonb_build_array())),
  'usage', jsonb_build_object('inputTokens', 10), 'costUsd', 0.02,
  'nextRequest', jsonb_build_object('postDraftId', '6a000000-0000-4000-8000-000000000001')
)) ->> 'verifiedDraftCount', '1', 'stage persistence records the verification output');
select results_eq(
  $$select state::text from public.pipeline_jobs where id = (select job_id from lw_claims limit 1)$$,
  array['succeeded'], 'stage persistence completes the lease in the same transaction'
);
select results_eq(
  $$select stage::text || ':' || state::text from public.pipeline_jobs
    where pipeline_id = (select pipeline_id from lw_claims limit 1) and stage = 'image'$$,
  array['image:queued'], 'atomic completion enqueues exactly one next-stage job'
);
select throws_ok(
  $$select public.persist_lightweight_stage_output(jsonb_build_object(
      'jobId', (select job_id from lw_claims limit 1),
      'pipelineId', (select pipeline_id from lw_claims limit 1),
      'workerId', 'worker-one', 'actorId', '4a000000-0000-4000-8000-000000000001',
      'stage', 'verify', 'nextStage', 'image', 'output', jsonb_build_object('evaluations', jsonb_build_array())
    ))$$,
  'P0002', 'Active stage job lease not found', 'a stale worker cannot persist after atomic completion'
);

-- An uncertain provider call is never executed again under a later lease.
insert into lw_values
select 'ambiguous_pipeline', (public.start_pipeline(jsonb_build_object(
  'brandId', '2a000000-0000-4000-8000-000000000001',
  'opportunityId', '5a000000-0000-4000-8000-000000000001',
  'idempotencyKey', 'lw:ambiguous:pipeline:0001', 'triggerType', 'retry', 'stage', 'research',
  'request', '{}'::jsonb, 'maxAttempts', 2
))).id;
truncate lw_claims;
insert into lw_claims select job_id, pipeline_id, 'worker-old'
from public.claim_pipeline_jobs('worker-old', array['research']::public.pipeline_stage[], 1, 300);
select is((public.begin_provider_operation(jsonb_build_object(
  'jobId', (select job_id from lw_claims), 'workerId', 'worker-old',
  'operationKey', 'ambiguous-provider-0001'
)) ->> 'execute')::boolean, true, 'first lease starts the uncertain provider operation');
reset role;
update public.pipeline_jobs set lease_expires_at = now() - interval '1 second'
where id = (select job_id from lw_claims);
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
truncate lw_claims;
insert into lw_claims select job_id, pipeline_id, 'worker-new'
from public.claim_pipeline_jobs('worker-new', array['research']::public.pipeline_stage[], 1, 300);
select is(public.begin_provider_operation(jsonb_build_object(
  'jobId', (select job_id from lw_claims), 'workerId', 'worker-new',
  'operationKey', 'ambiguous-provider-0001'
)) ->> 'state', 'ambiguous', 'a changed lease makes an uncertain provider operation ambiguous');
select is((public.begin_provider_operation(jsonb_build_object(
  'jobId', (select job_id from lw_claims), 'workerId', 'worker-new',
  'operationKey', 'ambiguous-provider-0001'
)) ->> 'execute')::boolean, false, 'an ambiguous provider operation is never re-executed');

-- A final expired attempt terminalizes both job and pipeline.
insert into lw_values
select 'exhausted_pipeline', (public.start_pipeline(jsonb_build_object(
  'brandId', '2a000000-0000-4000-8000-000000000001',
  'opportunityId', '5a000000-0000-4000-8000-000000000001',
  'idempotencyKey', 'lw:exhausted:pipeline:0001', 'triggerType', 'retry', 'stage', 'research',
  'request', '{}'::jsonb, 'maxAttempts', 1
))).id;
truncate lw_claims;
insert into lw_claims select job_id, pipeline_id, 'worker-final'
from public.claim_pipeline_jobs('worker-final', array['research']::public.pipeline_stage[], 1, 300);
reset role;
update public.pipeline_jobs set lease_expires_at = now() - interval '1 second'
where pipeline_id = (select value from lw_values where name = 'exhausted_pipeline');
set local role service_role;
select set_config('request.jwt.claim.role', 'service_role', true);
select lives_ok(
  $$select * from public.claim_pipeline_jobs('worker-sweeper', array['research']::public.pipeline_stage[], 1, 300)$$,
  'claiming runs the expired-final-attempt sweeper'
);
select results_eq(
  $$select state::text || ':' || error_code from public.pipeline_jobs
    where pipeline_id = (select value from lw_values where name = 'exhausted_pipeline')$$,
  array['failed:worker_lease_exhausted'], 'the final expired lease becomes a terminal failed job'
);
select results_eq(
  $$select state::text from public.pipeline_instances
    where id = (select value from lw_values where name = 'exhausted_pipeline')$$,
  array['failed'], 'the final expired lease terminalizes its parent pipeline'
);
insert into lw_values
select 'other_pipeline', (public.start_pipeline(jsonb_build_object(
  'brandId', '2a000000-0000-4000-8000-000000000003',
  'opportunityId', '5a000000-0000-4000-8000-000000000002',
  'sourceDocumentId', '3a000000-0000-4000-8000-000000000002',
  'idempotencyKey', 'lw:other:pipeline:0001', 'triggerType', 'schedule', 'stage', 'research',
  'request', '{}'::jsonb, 'maxAttempts', 1
))).id;
insert into lw_values
select 'unassigned_brand_pipeline', (public.start_pipeline(jsonb_build_object(
  'brandId', '2a000000-0000-4000-8000-000000000002',
  'idempotencyKey', 'lw:unassigned:pipeline:0001', 'triggerType', 'schedule', 'stage', 'ingest',
  'request', '{}'::jsonb, 'maxAttempts', 1
))).id;

-- RLS exposes only the assigned brand's control-plane summary.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-000000000002', true);
select ok(
  (select count(*) > 0 from public.pipeline_instances where brand_id = '2a000000-0000-4000-8000-000000000001'),
  'assigned editor can read their brand pipeline summary'
);
select is(
  (select count(*) from public.pipeline_instances where brand_id = '2a000000-0000-4000-8000-000000000002'),
  0::bigint, 'an editor cannot read an unassigned brand in the same organization'
);
select is(
  (select count(*) from public.pipeline_instances where organization_id = '1a000000-0000-4000-8000-000000000002'),
  0::bigint, 'cross-tenant pipeline summaries are denied by RLS'
);

-- Reviewer mutations enforce expected versions, idempotency, and state transitions.
select lives_ok(
  $$select public.save_lightweight_post_edit(jsonb_build_object(
    'postDraftId', '6a000000-0000-4000-8000-000000000001',
    'expectedVersionId', '7a000000-0000-4000-8000-000000000001',
    'idempotencyKey', 'lw-edit-idempotency-0001', 'hook', 'Edited hook',
    'body', 'Edited evidence-led body.', 'closing', 'Edited closing'
  ))$$, 'an assigned editor can save an expected post version'
);
select is(
  public.save_lightweight_post_edit(jsonb_build_object(
    'postDraftId', '6a000000-0000-4000-8000-000000000001',
    'expectedVersionId', '7a000000-0000-4000-8000-000000000001',
    'idempotencyKey', 'lw-edit-idempotency-0001', 'hook', 'Edited hook',
    'body', 'Edited evidence-led body.', 'closing', 'Edited closing'
  )),
  (select current_version_id from public.post_drafts where id = '6a000000-0000-4000-8000-000000000001'),
  'an identical edit replay returns the original new version'
);
select throws_ok(
  $$select public.save_lightweight_post_edit(jsonb_build_object(
    'postDraftId', '6a000000-0000-4000-8000-000000000001',
    'expectedVersionId', '7a000000-0000-4000-8000-000000000001',
    'idempotencyKey', 'lw-edit-idempotency-0001', 'hook', 'Different replay hook',
    'body', 'Edited evidence-led body.', 'closing', 'Edited closing'
  ))$$,
  '23505', 'Edit idempotency key was reused with a different request',
  'an edit idempotency key cannot be reused for different content'
);
select throws_ok(
  $$select public.save_lightweight_post_edit(jsonb_build_object(
    'postDraftId', '6a000000-0000-4000-8000-000000000001',
    'expectedVersionId', '7a000000-0000-4000-8000-000000000001',
    'idempotencyKey', 'lw-edit-stale-version-0002', 'hook', 'Stale hook',
    'body', 'Stale body is rejected.', 'closing', 'Stale close'
  ))$$,
  '40001', 'Post version changed', 'a stale expected version cannot overwrite a newer edit'
);
reset role;
update public.post_drafts set status = 'ready_for_review'
where id = '6a000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-000000000002', true);
select is(
  (public.review_lightweight_post(jsonb_build_object(
    'postDraftId', '6a000000-0000-4000-8000-000000000001',
    'expectedVersionId', (select current_version_id from public.post_drafts where id = '6a000000-0000-4000-8000-000000000001'),
    'idempotencyKey', 'lw-review-approve-0001', 'decision', 'approve', 'reason', 'Reviewed evidence'
  ))).status::text,
  'approved', 'a reviewable expected version can be approved'
);
select is(
  (public.review_lightweight_post(jsonb_build_object(
    'postDraftId', '6a000000-0000-4000-8000-000000000001',
    'expectedVersionId', (select current_version_id from public.post_drafts where id = '6a000000-0000-4000-8000-000000000001'),
    'idempotencyKey', 'lw-review-approve-0001', 'decision', 'approve', 'reason', 'Reviewed evidence'
  ))).status::text,
  'approved', 'an identical review replay is idempotent after the state changes'
);
select throws_ok(
  $$select public.review_lightweight_post(jsonb_build_object(
    'postDraftId', '6a000000-0000-4000-8000-000000000001',
    'expectedVersionId', (select current_version_id from public.post_drafts where id = '6a000000-0000-4000-8000-000000000001'),
    'idempotencyKey', 'lw-review-second-0002', 'decision', 'reject', 'reason', 'Cannot reverse approval'
  ))$$,
  '23514', 'Post is not in a reviewable state', 'an approved post cannot enter a second terminal decision'
);

-- Shared feed mutations require organization-administrator authority.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.manage_lightweight_feed(jsonb_build_object(
    'action', 'upsert', 'brandId', '2a000000-0000-4000-8000-000000000001',
    'name', 'Shared feed', 'feedUrl', 'https://lw.example.test/feed.xml',
    'authorityScore', 80, 'minimumScore', 75, 'dailyLimit', 3,
    'includeKeywords', jsonb_build_array('robotics'), 'excludeKeywords', '[]'::jsonb
  ))$$, 'organization administrator can create a managed feed'
);
reset role;
insert into public.rss_feed_brand_links (
  organization_id, rss_feed_id, brand_id, generation_policy, minimum_score, daily_generation_limit
)
select organization_id, id, '2a000000-0000-4000-8000-000000000002',
       'score_then_research', 75, 3
from public.rss_feeds where feed_url = 'https://lw.example.test/feed.xml';
set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-000000000002', true);
select throws_ok(
  $$select public.manage_lightweight_feed(jsonb_build_object(
    'action', 'toggle', 'brandId', '2a000000-0000-4000-8000-000000000001',
    'feedId', (select id from public.rss_feeds where feed_url = 'https://lw.example.test/feed.xml'),
    'active', false
  ))$$,
  '42501', 'A shared feed can be changed only by an organization administrator',
  'a brand editor cannot mutate a feed shared with another brand'
);
select set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-000000000001', true);
select lives_ok(
  $$select public.manage_lightweight_feed(jsonb_build_object(
    'action', 'toggle', 'brandId', '2a000000-0000-4000-8000-000000000001',
    'feedId', (select id from public.rss_feeds where feed_url = 'https://lw.example.test/feed.xml'),
    'active', false
  ))$$, 'organization administrator can mutate a shared feed'
);
select results_eq(
  $$select active from public.rss_feeds where feed_url = 'https://lw.example.test/feed.xml'$$,
  array[false], 'the authorized shared-feed mutation is durable'
);
select set_config('request.jwt.claim.sub', '4a000000-0000-4000-8000-000000000003', true);
select throws_ok(
  $$select public.manage_lightweight_feed(jsonb_build_object(
    'action', 'toggle', 'brandId', '2a000000-0000-4000-8000-000000000001',
    'feedId', (select id from public.rss_feeds where feed_url = 'https://lw.example.test/feed.xml'),
    'active', true
  ))$$,
  '42501', 'Brand editor permission required', 'a different tenant cannot manage the feed'
);

select * from finish();
rollback;
