-- Durable control plane for the lightweight architecture.
-- n8n workers claim these jobs directly from Supabase; the reviewer UI only reads
-- the RLS-protected summaries and can never access provider credentials or payloads.

create type public.pipeline_stage as enum (
  'ingest',
  'qualify',
  'research',
  'draft',
  'verify',
  'image',
  'package'
);

create type public.pipeline_job_state as enum (
  'queued',
  'leased',
  'retry_wait',
  'succeeded',
  'failed',
  'cancelled'
);

create table public.pipeline_instances (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  opportunity_id uuid references public.opportunities(id) on delete cascade,
  source_document_id uuid references public.source_documents(id) on delete cascade,
  correlation_id uuid not null default gen_random_uuid(),
  state public.pipeline_job_state not null default 'queued',
  current_stage public.pipeline_stage not null default 'ingest',
  trigger_type text not null check (trigger_type in ('schedule', 'manual', 'retry', 'resurface')),
  started_at timestamptz,
  completed_at timestamptz,
  total_cost_usd numeric(12,6) not null default 0 check (total_cost_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (correlation_id),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade
);

create index pipeline_instances_brand_created_idx
  on public.pipeline_instances (brand_id, created_at desc);
create index pipeline_instances_opportunity_idx
  on public.pipeline_instances (opportunity_id)
  where opportunity_id is not null;

create table public.pipeline_jobs (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null,
  organization_id uuid not null,
  brand_id uuid not null,
  stage public.pipeline_stage not null,
  state public.pipeline_job_state not null default 'queued',
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 300),
  attempt integer not null default 0 check (attempt between 0 and 20),
  max_attempts integer not null default 4 check (max_attempts between 1 and 20),
  available_at timestamptz not null default now(),
  leased_at timestamptz,
  lease_expires_at timestamptz,
  worker_id text,
  output_refs jsonb not null default '{}'::jsonb,
  usage_metadata jsonb not null default '{}'::jsonb,
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0),
  error_code text,
  error_category text check (
    error_category is null or error_category in (
      'transient', 'provider', 'validation', 'security', 'budget', 'permanent'
    )
  ),
  error_summary text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (organization_id, idempotency_key),
  foreign key (pipeline_id, organization_id)
    references public.pipeline_instances(id, organization_id) on delete cascade,
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade
);

create index pipeline_jobs_claim_idx
  on public.pipeline_jobs (state, available_at, created_at)
  where state in ('queued', 'retry_wait', 'leased');
create index pipeline_jobs_pipeline_idx on public.pipeline_jobs (pipeline_id, created_at);
create index pipeline_jobs_brand_created_idx on public.pipeline_jobs (brand_id, created_at desc);

create table private.pipeline_job_payloads (
  job_id uuid primary key references public.pipeline_jobs(id) on delete cascade,
  request_payload jsonb not null,
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

alter table public.pipeline_instances enable row level security;
alter table public.pipeline_jobs enable row level security;

create policy pipeline_instances_select on public.pipeline_instances for select
  using ((select public.can_read_brand(brand_id)));
create policy pipeline_jobs_select on public.pipeline_jobs for select
  using ((select public.can_read_brand(brand_id)));

revoke all on public.pipeline_instances, public.pipeline_jobs from public, anon, authenticated;
revoke all on private.pipeline_job_payloads from public, anon, authenticated;
grant select on public.pipeline_instances, public.pipeline_jobs to authenticated;
grant usage on schema private to service_role;

create or replace function private.start_pipeline(payload jsonb)
returns public.pipeline_instances
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_brand public.brands%rowtype;
  result public.pipeline_instances%rowtype;
  first_stage public.pipeline_stage := coalesce(
    nullif(payload ->> 'stage', '')::public.pipeline_stage,
    'ingest'::public.pipeline_stage
  );
begin
  select * into target_brand from public.brands where id = (payload ->> 'brandId')::uuid;
  if target_brand.id is null or target_brand.status <> 'active' then
    raise exception 'Active brand not found' using errcode = 'P0002';
  end if;

  insert into public.pipeline_instances (
    organization_id, brand_id, opportunity_id, source_document_id,
    correlation_id, current_stage, trigger_type
  ) values (
    target_brand.organization_id,
    target_brand.id,
    nullif(payload ->> 'opportunityId', '')::uuid,
    nullif(payload ->> 'sourceDocumentId', '')::uuid,
    coalesce(nullif(payload ->> 'correlationId', '')::uuid, gen_random_uuid()),
    first_stage,
    coalesce(nullif(payload ->> 'triggerType', ''), 'schedule')
  ) returning * into result;

  perform private.enqueue_pipeline_job(jsonb_build_object(
    'pipelineId', result.id,
    'stage', first_stage,
    'idempotencyKey', payload ->> 'idempotencyKey',
    'request', coalesce(payload -> 'request', '{}'::jsonb),
    'maxAttempts', coalesce((payload ->> 'maxAttempts')::integer, 4)
  ));
  return result;
end;
$$;

create or replace function public.start_pipeline(payload jsonb)
returns public.pipeline_instances
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return private.start_pipeline(payload);
end;
$$;

create or replace function private.enqueue_pipeline_job(payload jsonb)
returns public.pipeline_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_pipeline public.pipeline_instances%rowtype;
  result public.pipeline_jobs%rowtype;
  target_stage public.pipeline_stage := (payload ->> 'stage')::public.pipeline_stage;
  key_value text := payload ->> 'idempotencyKey';
  request_value jsonb := coalesce(payload -> 'request', '{}'::jsonb);
  request_hash_value text := encode(extensions.digest(convert_to(request_value::text, 'utf8'), 'sha256'), 'hex');
begin
  select * into target_pipeline
  from public.pipeline_instances
  where id = (payload ->> 'pipelineId')::uuid;

  if target_pipeline.id is null then
    raise exception 'Pipeline instance not found' using errcode = 'P0002';
  end if;
  if key_value is null or char_length(key_value) not between 8 and 300 then
    raise exception 'Invalid idempotency key' using errcode = '22023';
  end if;

  insert into public.pipeline_jobs (
    pipeline_id, organization_id, brand_id, stage, idempotency_key, max_attempts
  ) values (
    target_pipeline.id,
    target_pipeline.organization_id,
    target_pipeline.brand_id,
    target_stage,
    key_value,
    coalesce((payload ->> 'maxAttempts')::integer, 4)
  )
  on conflict (organization_id, idempotency_key) do update
    set updated_at = public.pipeline_jobs.updated_at
  returning * into result;

  insert into private.pipeline_job_payloads (job_id, request_payload, request_hash)
  values (result.id, request_value, request_hash_value)
  on conflict (job_id) do update
    set request_payload = excluded.request_payload,
        request_hash = excluded.request_hash
  where private.pipeline_job_payloads.request_hash = excluded.request_hash;

  if not found then
    raise exception 'Idempotency key reused with different payload' using errcode = '23505';
  end if;
  return result;
end;
$$;

create or replace function public.enqueue_pipeline_job(payload jsonb)
returns public.pipeline_jobs
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return private.enqueue_pipeline_job(payload);
end;
$$;

create or replace function private.claim_pipeline_jobs(
  requested_worker_id text,
  requested_stages public.pipeline_stage[],
  requested_limit integer,
  requested_lease_seconds integer
)
returns table (
  job_id uuid,
  pipeline_id uuid,
  organization_id uuid,
  brand_id uuid,
  stage public.pipeline_stage,
  attempt integer,
  idempotency_key text,
  request_payload jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if char_length(coalesce(requested_worker_id, '')) not between 3 and 120
    or requested_limit not between 1 and 25
    or requested_lease_seconds not between 30 and 1800
    or cardinality(requested_stages) = 0
  then
    raise exception 'Invalid claim parameters' using errcode = '22023';
  end if;

  return query
  with candidates as (
    select job.id
    from public.pipeline_jobs job
    where job.stage = any(requested_stages)
      and (
        (job.state in ('queued', 'retry_wait') and job.available_at <= now())
        or (job.state = 'leased' and job.lease_expires_at <= now())
      )
      and job.attempt < job.max_attempts
    order by job.available_at, job.created_at
    limit requested_limit
    for update skip locked
  ), claimed as (
    update public.pipeline_jobs job
    set state = 'leased',
        attempt = job.attempt + 1,
        worker_id = requested_worker_id,
        leased_at = now(),
        lease_expires_at = now() + make_interval(secs => requested_lease_seconds),
        updated_at = now(),
        error_code = null,
        error_category = null,
        error_summary = null
    from candidates
    where job.id = candidates.id
    returning job.*
  )
  select claimed.id, claimed.pipeline_id, claimed.organization_id, claimed.brand_id,
         claimed.stage, claimed.attempt, claimed.idempotency_key, payload.request_payload
  from claimed
  join private.pipeline_job_payloads payload on payload.job_id = claimed.id;
end;
$$;

create or replace function public.claim_pipeline_jobs(
  requested_worker_id text,
  requested_stages public.pipeline_stage[],
  requested_limit integer default 10,
  requested_lease_seconds integer default 600
)
returns table (
  job_id uuid,
  pipeline_id uuid,
  organization_id uuid,
  brand_id uuid,
  stage public.pipeline_stage,
  attempt integer,
  idempotency_key text,
  request_payload jsonb
)
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return query select * from private.claim_pipeline_jobs(
    requested_worker_id, requested_stages, requested_limit, requested_lease_seconds
  );
end;
$$;

create or replace function private.complete_pipeline_job(payload jsonb)
returns public.pipeline_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.pipeline_jobs%rowtype;
  next_stage_value public.pipeline_stage := nullif(payload ->> 'nextStage', '')::public.pipeline_stage;
  next_request jsonb := coalesce(payload -> 'nextRequest', '{}'::jsonb);
begin
  update public.pipeline_jobs
  set state = 'succeeded',
      output_refs = coalesce(payload -> 'outputRefs', '{}'::jsonb),
      usage_metadata = coalesce(payload -> 'usage', '{}'::jsonb),
      cost_usd = coalesce((payload ->> 'costUsd')::numeric, 0),
      completed_at = now(),
      lease_expires_at = null,
      updated_at = now()
  where id = (payload ->> 'jobId')::uuid
    and state = 'leased'
    and worker_id = payload ->> 'workerId'
  returning * into job;

  if job.id is null then
    raise exception 'Active job lease not found' using errcode = 'P0002';
  end if;

  update public.pipeline_instances
  set current_stage = coalesce(next_stage_value, job.stage),
      state = case when next_stage_value is null then 'succeeded' else 'queued' end,
      started_at = coalesce(started_at, job.leased_at),
      completed_at = case when next_stage_value is null then now() else null end,
      total_cost_usd = total_cost_usd + job.cost_usd,
      updated_at = now()
  where id = job.pipeline_id;

  insert into public.pipeline_events (
    organization_id, brand_id, entity_type, entity_id, event_type,
    from_status, to_status, correlation_id, metadata
  )
  select job.organization_id, job.brand_id, 'pipeline_job', job.id,
         'lightweight.job_succeeded', 'leased', 'succeeded', instance.correlation_id,
         jsonb_build_object('stage', job.stage, 'attempt', job.attempt, 'costUsd', job.cost_usd)
  from public.pipeline_instances instance where instance.id = job.pipeline_id;

  if next_stage_value is not null then
    perform private.enqueue_pipeline_job(jsonb_build_object(
      'pipelineId', job.pipeline_id,
      'stage', next_stage_value,
      'idempotencyKey', job.idempotency_key || ':' || next_stage_value::text,
      'request', next_request,
      'maxAttempts', job.max_attempts
    ));
  end if;
  return job;
end;
$$;

create or replace function public.complete_pipeline_job(payload jsonb)
returns public.pipeline_jobs
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return private.complete_pipeline_job(payload);
end;
$$;

create or replace function private.fail_pipeline_job(payload jsonb)
returns public.pipeline_jobs
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.pipeline_jobs%rowtype;
  retryable boolean := coalesce((payload ->> 'retryable')::boolean, false);
begin
  update public.pipeline_jobs
  set state = case
        when retryable and attempt < max_attempts then 'retry_wait'::public.pipeline_job_state
        else 'failed'::public.pipeline_job_state
      end,
      available_at = case
        when retryable and attempt < max_attempts
          then now() + make_interval(secs => least(3600, 30 * power(2, greatest(attempt - 1, 0))::integer))
        else available_at
      end,
      error_code = left(payload ->> 'errorCode', 120),
      error_category = (payload ->> 'category'),
      error_summary = left(payload ->> 'summary', 1000),
      lease_expires_at = null,
      completed_at = case when retryable and attempt < max_attempts then null else now() end,
      updated_at = now()
  where id = (payload ->> 'jobId')::uuid
    and state = 'leased'
    and worker_id = payload ->> 'workerId'
  returning * into job;

  if job.id is null then
    raise exception 'Active job lease not found' using errcode = 'P0002';
  end if;

  update public.pipeline_instances
  set state = case when job.state = 'failed' then 'failed' else 'retry_wait' end,
      updated_at = now()
  where id = job.pipeline_id;

  insert into public.pipeline_events (
    organization_id, brand_id, entity_type, entity_id, event_type,
    from_status, to_status, correlation_id, metadata
  )
  select job.organization_id, job.brand_id, 'pipeline_job', job.id,
         'lightweight.job_' || job.state::text, 'leased', job.state::text, instance.correlation_id,
         jsonb_build_object(
           'stage', job.stage, 'attempt', job.attempt, 'errorCode', job.error_code,
           'category', job.error_category
         )
  from public.pipeline_instances instance where instance.id = job.pipeline_id;
  return job;
end;
$$;

create or replace function public.fail_pipeline_job(payload jsonb)
returns public.pipeline_jobs
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return private.fail_pipeline_job(payload);
end;
$$;

create or replace function private.request_lightweight_action(payload jsonb)
returns public.pipeline_instances
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_brand_id uuid := (payload ->> 'brandId')::uuid;
  target_opportunity_id uuid := nullif(payload ->> 'opportunityId', '')::uuid;
  target_draft_id uuid := nullif(payload ->> 'postDraftId', '')::uuid;
  action_value text := payload ->> 'action';
  stage_value public.pipeline_stage;
  result public.pipeline_instances%rowtype;
  organization_value uuid;
begin
  if (select auth.uid()) is null or not (select private.can_edit_brand(target_brand_id)) then
    raise exception 'Brand editor access required' using errcode = '42501';
  end if;
  if action_value not in ('research', 'draft', 'verify', 'image', 'package', 'resurface') then
    raise exception 'Unsupported lightweight action' using errcode = '22023';
  end if;
  stage_value := case when action_value = 'resurface' then 'qualify'::public.pipeline_stage
                      else action_value::public.pipeline_stage end;

  if target_draft_id is not null then
    select opportunity_id into target_opportunity_id
    from public.post_drafts where id = target_draft_id and brand_id = target_brand_id;
  end if;
  select organization_id into organization_value from public.brands where id = target_brand_id;
  if organization_value is null or target_opportunity_id is null then
    raise exception 'Action target not found' using errcode = 'P0002';
  end if;

  insert into public.pipeline_instances (
    organization_id, brand_id, opportunity_id, correlation_id,
    current_stage, trigger_type
  ) values (
    organization_value, target_brand_id, target_opportunity_id, gen_random_uuid(),
    stage_value, case when action_value = 'resurface' then 'resurface' else 'manual' end
  ) returning * into result;

  perform private.enqueue_pipeline_job(jsonb_build_object(
    'pipelineId', result.id,
    'stage', stage_value,
    'idempotencyKey', 'reviewer:' || action_value || ':' || result.id::text,
    'request', jsonb_build_object(
      'actorId', (select auth.uid()),
      'brandId', target_brand_id,
      'opportunityId', target_opportunity_id,
      'postDraftId', target_draft_id,
      'instruction', left(coalesce(payload ->> 'instruction', ''), 1000)
    ),
    'maxAttempts', 4
  ));

  insert into public.audit_logs (
    organization_id, brand_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    organization_value, target_brand_id, (select auth.uid()),
    'lightweight.' || action_value || '_requested', 'pipeline_instance', result.id,
    jsonb_build_object('opportunityId', target_opportunity_id, 'postDraftId', target_draft_id)
  );
  return result;
end;
$$;

create or replace function public.request_lightweight_action(payload jsonb)
returns public.pipeline_instances
language sql
set search_path = ''
as $$
  select private.request_lightweight_action(payload);
$$;

create or replace function private.save_lightweight_post_edit(payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft public.post_drafts%rowtype;
  version_id uuid;
  next_number integer;
  hook_value text := trim(payload ->> 'hook');
  body_value text := trim(payload ->> 'body');
  closing_value text := nullif(trim(payload ->> 'closing'), '');
begin
  select * into draft from public.post_drafts
  where id = (payload ->> 'postDraftId')::uuid for update;
  if draft.id is null or (select auth.uid()) is null
     or not (select private.can_edit_brand(draft.brand_id)) then
    raise exception 'Editable post not found' using errcode = '42501';
  end if;
  if char_length(hook_value) not between 1 and 1000
     or char_length(body_value) not between 1 and 10000
     or char_length(coalesce(closing_value, '')) > 2000 then
    raise exception 'Post content is outside allowed bounds' using errcode = '22023';
  end if;

  select coalesce(max(version_number), 0) + 1 into next_number
  from public.post_versions where post_draft_id = draft.id;

  insert into public.post_versions (
    post_draft_id, version_number, hook, body, closing, full_text,
    generation_type, created_by
  ) values (
    draft.id, next_number, hook_value, body_value, closing_value,
    concat_ws(E'\n\n', hook_value, body_value, closing_value),
    'manual_edit', (select auth.uid())
  ) returning id into version_id;

  update public.post_drafts
  set current_version_id = version_id, status = 'verifying', updated_at = now()
  where id = draft.id;

  insert into public.audit_logs (
    organization_id, brand_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    draft.organization_id, draft.brand_id, (select auth.uid()),
    'lightweight.post_edited', 'post_draft', draft.id,
    jsonb_build_object('versionId', version_id, 'versionNumber', next_number)
  );
  return version_id;
end;
$$;

create or replace function public.save_lightweight_post_edit(payload jsonb)
returns uuid
language sql
set search_path = ''
as $$
  select private.save_lightweight_post_edit(payload);
$$;

create or replace function private.review_lightweight_post(payload jsonb)
returns public.post_drafts
language plpgsql
security definer
set search_path = ''
as $$
declare
  draft public.post_drafts%rowtype;
  decision text := payload ->> 'decision';
  reason_value text := trim(coalesce(payload ->> 'reason', ''));
begin
  select * into draft from public.post_drafts where id = (payload ->> 'postDraftId')::uuid;
  if draft.id is null or (select auth.uid()) is null
     or not (select private.can_edit_brand(draft.brand_id)) then
    raise exception 'Reviewable post not found' using errcode = '42501';
  end if;
  if decision not in ('approve', 'reject') then
    raise exception 'Unsupported review decision' using errcode = '22023';
  end if;
  if decision = 'reject' and char_length(reason_value) < 3 then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;

  update public.post_drafts
  set status = case when decision = 'approve' then 'approved' else 'rejected' end,
      approved_by = case when decision = 'approve' then (select auth.uid()) else null end,
      approved_at = case when decision = 'approve' then now() else null end,
      updated_at = now()
  where id = draft.id
  returning * into draft;

  insert into public.audit_logs (
    organization_id, brand_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    draft.organization_id, draft.brand_id, (select auth.uid()),
    'lightweight.post_' || case when decision = 'approve' then 'approved' else 'rejected' end,
    'post_draft', draft.id, jsonb_build_object('reason', reason_value)
  );
  return draft;
end;
$$;

create or replace function public.review_lightweight_post(payload jsonb)
returns public.post_drafts
language sql
set search_path = ''
as $$
  select private.review_lightweight_post(payload);
$$;

revoke all on function private.enqueue_pipeline_job(jsonb) from public;
revoke all on function private.start_pipeline(jsonb) from public;
revoke all on function private.claim_pipeline_jobs(text, public.pipeline_stage[], integer, integer) from public;
revoke all on function private.complete_pipeline_job(jsonb) from public;
revoke all on function private.fail_pipeline_job(jsonb) from public;
revoke all on function private.request_lightweight_action(jsonb) from public;
revoke all on function private.save_lightweight_post_edit(jsonb) from public;
revoke all on function private.review_lightweight_post(jsonb) from public;
revoke all on function public.enqueue_pipeline_job(jsonb) from public, anon, authenticated;
revoke all on function public.start_pipeline(jsonb) from public, anon, authenticated;
revoke all on function public.claim_pipeline_jobs(text, public.pipeline_stage[], integer, integer) from public, anon, authenticated;
revoke all on function public.complete_pipeline_job(jsonb) from public, anon, authenticated;
revoke all on function public.fail_pipeline_job(jsonb) from public, anon, authenticated;
revoke all on function public.request_lightweight_action(jsonb) from public, anon;
revoke all on function public.save_lightweight_post_edit(jsonb) from public, anon;
revoke all on function public.review_lightweight_post(jsonb) from public, anon;
grant execute on function public.request_lightweight_action(jsonb) to authenticated;
grant execute on function public.save_lightweight_post_edit(jsonb) to authenticated;
grant execute on function public.review_lightweight_post(jsonb) to authenticated;
grant execute on function private.request_lightweight_action(jsonb) to authenticated;
grant execute on function private.save_lightweight_post_edit(jsonb) to authenticated;
grant execute on function private.review_lightweight_post(jsonb) to authenticated;
grant execute on function private.enqueue_pipeline_job(jsonb) to service_role;
grant execute on function private.start_pipeline(jsonb) to service_role;
grant execute on function private.claim_pipeline_jobs(text, public.pipeline_stage[], integer, integer) to service_role;
grant execute on function private.complete_pipeline_job(jsonb) to service_role;
grant execute on function private.fail_pipeline_job(jsonb) to service_role;
grant execute on function public.enqueue_pipeline_job(jsonb) to service_role;
grant execute on function public.start_pipeline(jsonb) to service_role;
grant execute on function public.claim_pipeline_jobs(text, public.pipeline_stage[], integer, integer) to service_role;
grant execute on function public.complete_pipeline_job(jsonb) to service_role;
grant execute on function public.fail_pipeline_job(jsonb) to service_role;

create trigger pipeline_instances_set_updated_at before update on public.pipeline_instances
for each row execute function public.set_updated_at();
create trigger pipeline_jobs_set_updated_at before update on public.pipeline_jobs
for each row execute function public.set_updated_at();
