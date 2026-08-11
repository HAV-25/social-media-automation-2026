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
  opportunity_id uuid,
  source_document_id uuid,
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key text not null check (char_length(idempotency_key) between 8 and 300),
  state public.pipeline_job_state not null default 'queued',
  current_stage public.pipeline_stage not null default 'ingest',
  trigger_type text not null check (trigger_type in ('schedule', 'manual', 'retry', 'resurface')),
  started_at timestamptz,
  completed_at timestamptz,
  total_cost_usd numeric(12,6) not null default 0 check (total_cost_usd >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, brand_id, organization_id),
  unique (correlation_id),
  unique (organization_id, idempotency_key),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade,
  foreign key (opportunity_id, brand_id, organization_id)
    references public.opportunities(id, brand_id, organization_id) on delete cascade,
  foreign key (source_document_id, organization_id)
    references public.source_documents(id, organization_id) on delete cascade
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
  foreign key (pipeline_id, brand_id, organization_id)
    references public.pipeline_instances(id, brand_id, organization_id) on delete cascade,
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

create table private.provider_operations (
  job_id uuid not null references public.pipeline_jobs(id) on delete cascade,
  operation_key text not null check (char_length(operation_key) between 8 and 200),
  state text not null check (state in ('reserved', 'completed', 'ambiguous')),
  worker_id text not null check (char_length(worker_id) between 3 and 120),
  attempt integer not null check (attempt between 1 and 20),
  result jsonb,
  model text,
  provider_response_id text,
  usage_metadata jsonb not null default '{}'::jsonb,
  cost_usd numeric(12,6) not null default 0 check (cost_usd >= 0),
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (job_id, operation_key)
);

alter table public.pipeline_instances enable row level security;
alter table public.pipeline_jobs enable row level security;

create policy pipeline_instances_select on public.pipeline_instances for select
  using ((select public.can_read_brand(brand_id)));
create policy pipeline_jobs_select on public.pipeline_jobs for select
  using ((select public.can_read_brand(brand_id)));

revoke all on public.pipeline_instances, public.pipeline_jobs from public, anon, authenticated;
revoke all on private.pipeline_job_payloads from public, anon, authenticated;
revoke all on private.provider_operations from public, anon, authenticated;
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
  if char_length(coalesce(payload ->> 'idempotencyKey', '')) not between 8 and 300 then
    raise exception 'Invalid pipeline idempotency key' using errcode = '22023';
  end if;
  if nullif(payload ->> 'opportunityId', '') is not null and not exists (
    select 1
    from public.opportunities opportunity
    where opportunity.id = (payload ->> 'opportunityId')::uuid
      and opportunity.brand_id = target_brand.id
      and opportunity.organization_id = target_brand.organization_id
  ) then
    raise exception 'Pipeline opportunity does not belong to the target brand'
      using errcode = '23514';
  end if;
  if nullif(payload ->> 'sourceDocumentId', '') is not null and not exists (
    select 1
    from public.source_documents source
    where source.id = (payload ->> 'sourceDocumentId')::uuid
      and source.organization_id = target_brand.organization_id
      and (
        nullif(payload ->> 'opportunityId', '') is null
        or exists (
          select 1
          from public.opportunities opportunity
          where opportunity.id = (payload ->> 'opportunityId')::uuid
            and opportunity.source_document_id = source.id
        )
      )
  ) then
    raise exception 'Pipeline source does not belong to the target opportunity'
      using errcode = '23514';
  end if;

  insert into public.pipeline_instances (
    organization_id, brand_id, opportunity_id, source_document_id,
    correlation_id, idempotency_key, current_stage, trigger_type
  ) values (
    target_brand.organization_id,
    target_brand.id,
    nullif(payload ->> 'opportunityId', '')::uuid,
    nullif(payload ->> 'sourceDocumentId', '')::uuid,
    coalesce(nullif(payload ->> 'correlationId', '')::uuid, gen_random_uuid()),
    payload ->> 'idempotencyKey',
    first_stage,
    coalesce(nullif(payload ->> 'triggerType', ''), 'schedule')
  )
  on conflict (organization_id, idempotency_key) do nothing
  returning * into result;

  if result.id is null then
    select * into result
    from public.pipeline_instances
    where organization_id = target_brand.organization_id
      and idempotency_key = payload ->> 'idempotencyKey';
    if result.brand_id is distinct from target_brand.id
       or result.opportunity_id is distinct from nullif(payload ->> 'opportunityId', '')::uuid
       or result.source_document_id is distinct from nullif(payload ->> 'sourceDocumentId', '')::uuid
       or result.trigger_type is distinct from coalesce(nullif(payload ->> 'triggerType', ''), 'schedule')
    then
      raise exception 'Pipeline idempotency key was reused for a different target'
        using errcode = '23505';
    end if;
  end if;

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
  if result.pipeline_id is distinct from target_pipeline.id
     or result.organization_id is distinct from target_pipeline.organization_id
     or result.brand_id is distinct from target_pipeline.brand_id
     or result.stage is distinct from target_stage
  then
    raise exception 'Job idempotency key was reused for a different stage or pipeline'
      using errcode = '23505';
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
declare
  exhausted_job public.pipeline_jobs%rowtype;
begin
  if char_length(coalesce(requested_worker_id, '')) not between 3 and 120
    or requested_limit is null
    or requested_limit not between 1 and 25
    or requested_lease_seconds is null
    or requested_lease_seconds not between 30 and 1800
    or coalesce(cardinality(requested_stages), 0) = 0
  then
    raise exception 'Invalid claim parameters' using errcode = '22023';
  end if;

  -- A worker can disappear after taking its final permitted attempt. Terminalize
  -- those expired leases before claiming new work so neither the job nor its
  -- parent pipeline can remain leased forever.
  for exhausted_job in
    update public.pipeline_jobs job
    set state = 'failed',
        lease_expires_at = null,
        completed_at = now(),
        error_code = 'worker_lease_exhausted',
        error_category = 'transient',
        error_summary = 'The final worker lease expired before completion.',
        updated_at = now()
    where job.state = 'leased'
      and job.lease_expires_at <= now()
      and job.attempt >= job.max_attempts
      and job.stage = any(requested_stages)
    returning job.*
  loop
    update public.pipeline_instances
    set state = 'failed', completed_at = now(), updated_at = now()
    where id = exhausted_job.pipeline_id;

    insert into public.pipeline_events (
      organization_id, brand_id, entity_type, entity_id, event_type,
      from_status, to_status, correlation_id, metadata
    )
    select exhausted_job.organization_id, exhausted_job.brand_id,
      'pipeline_job', exhausted_job.id, 'lightweight.job_failed',
      'leased', 'failed', instance.correlation_id,
      jsonb_build_object(
        'stage', exhausted_job.stage,
        'attempt', exhausted_job.attempt,
        'errorCode', exhausted_job.error_code,
        'category', exhausted_job.error_category
      )
    from public.pipeline_instances instance
    where instance.id = exhausted_job.pipeline_id;
  end loop;

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
    and lease_expires_at > now()
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
      cost_usd = greatest(
        public.pipeline_jobs.cost_usd,
        coalesce((
          select sum(operation.cost_usd)
          from private.provider_operations operation
          where operation.job_id = public.pipeline_jobs.id
            and operation.state = 'completed'
        ), 0)
      ),
      lease_expires_at = null,
      completed_at = case when retryable and attempt < max_attempts then null else now() end,
      updated_at = now()
  where id = (payload ->> 'jobId')::uuid
    and state = 'leased'
    and worker_id = payload ->> 'workerId'
    and lease_expires_at > now()
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

create or replace function private.begin_provider_operation(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.pipeline_jobs%rowtype;
  operation private.provider_operations%rowtype;
  operation_key_value text := payload ->> 'operationKey';
begin
  if char_length(coalesce(operation_key_value, '')) not between 8 and 200 then
    raise exception 'Invalid provider operation key' using errcode = '22023';
  end if;
  select * into job
  from public.pipeline_jobs
  where id = (payload ->> 'jobId')::uuid
    and state = 'leased'
    and worker_id = payload ->> 'workerId'
    and lease_expires_at > now()
  for update;
  if job.id is null then
    raise exception 'Active provider job lease not found' using errcode = 'P0002';
  end if;

  select * into operation
  from private.provider_operations
  where job_id = job.id and operation_key = operation_key_value
  for update;
  if operation.job_id is null then
    insert into private.provider_operations (
      job_id, operation_key, state, worker_id, attempt
    ) values (
      job.id, operation_key_value, 'reserved', job.worker_id, job.attempt
    ) on conflict (job_id, operation_key) do nothing
    returning * into operation;
    if operation.job_id is not null then
      return jsonb_build_object('state', 'started', 'execute', true, 'result', null);
    end if;
    select * into operation
    from private.provider_operations
    where job_id = job.id and operation_key = operation_key_value
    for update;
  end if;

  if operation.state = 'reserved'
     and (operation.worker_id is distinct from job.worker_id or operation.attempt is distinct from job.attempt)
  then
    update private.provider_operations
    set state = 'ambiguous', error_code = 'provider_lease_changed', updated_at = now()
    where job_id = job.id and operation_key = operation_key_value
    returning * into operation;
  end if;
  return jsonb_build_object(
    'state', case when operation.state = 'completed' then 'succeeded' else 'ambiguous' end,
    'execute', false,
    'result', operation.result
  );
end;
$$;

create or replace function public.begin_provider_operation(payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return private.begin_provider_operation(payload);
end;
$$;

create or replace function private.complete_provider_operation(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.pipeline_jobs%rowtype;
  operation private.provider_operations%rowtype;
  operation_key_value text := payload ->> 'operationKey';
  cost_value numeric := coalesce((payload ->> 'costUsd')::numeric, 0);
begin
  if char_length(coalesce(operation_key_value, '')) not between 8 and 200
     or not (payload ? 'result')
     or char_length(coalesce(payload ->> 'model', '')) not between 1 and 200
     or char_length(coalesce(payload ->> 'responseId', '')) not between 1 and 500
     or jsonb_typeof(coalesce(payload -> 'usage', '{}'::jsonb)) <> 'object'
     or pg_catalog.octet_length((payload -> 'result')::text) > 1048576
     or pg_catalog.octet_length(coalesce(payload -> 'usage', '{}'::jsonb)::text) > 65536
     or cost_value not between 0 and 100
  then
    raise exception 'Invalid provider completion payload' using errcode = '22023';
  end if;
  select * into job
  from public.pipeline_jobs
  where id = (payload ->> 'jobId')::uuid
    and state = 'leased'
    and worker_id = payload ->> 'workerId'
    and lease_expires_at > now()
  for update;
  if job.id is null then
    raise exception 'Active provider job lease not found' using errcode = 'P0002';
  end if;

  select * into operation
  from private.provider_operations
  where job_id = job.id and operation_key = operation_key_value
  for update;
  if operation.job_id is null then
    raise exception 'Provider operation reservation not found' using errcode = 'P0002';
  end if;
  if operation.state = 'completed' then
    if operation.result is distinct from payload -> 'result'
       or operation.model is distinct from payload ->> 'model'
       or operation.provider_response_id is distinct from payload ->> 'responseId'
       or operation.usage_metadata is distinct from coalesce(payload -> 'usage', '{}'::jsonb)
       or operation.cost_usd is distinct from cost_value
    then
      raise exception 'Provider completion replay does not match the recorded result'
        using errcode = '23505';
    end if;
  elsif operation.state <> 'reserved'
        or operation.worker_id is distinct from job.worker_id
        or operation.attempt is distinct from job.attempt
  then
    raise exception 'Provider operation is not safely completable' using errcode = '23514';
  else
    update private.provider_operations
    set state = 'completed', result = payload -> 'result', model = payload ->> 'model',
        provider_response_id = payload ->> 'responseId',
        usage_metadata = coalesce(payload -> 'usage', '{}'::jsonb),
        cost_usd = cost_value, error_code = null, completed_at = now(), updated_at = now()
    where job_id = job.id and operation_key = operation_key_value
    returning * into operation;
  end if;
  return jsonb_build_object(
    'state', 'succeeded',
    'execute', false,
    'result', operation.result,
    'model', operation.model,
    'responseId', operation.provider_response_id,
    'usage', operation.usage_metadata,
    'costUsd', operation.cost_usd
  );
end;
$$;

create or replace function public.complete_provider_operation(payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return private.complete_provider_operation(payload);
end;
$$;

create or replace function private.fail_provider_operation(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  job public.pipeline_jobs%rowtype;
  operation private.provider_operations%rowtype;
  operation_key_value text := payload ->> 'operationKey';
  retry_safe boolean := coalesce((payload ->> 'retrySafe')::boolean, false);
  code_value text := left(coalesce(payload ->> 'code', 'provider_failure'), 120);
begin
  if char_length(coalesce(operation_key_value, '')) not between 8 and 200
     or char_length(code_value) not between 1 and 120
  then
    raise exception 'Invalid provider failure payload' using errcode = '22023';
  end if;
  select * into job
  from public.pipeline_jobs
  where id = (payload ->> 'jobId')::uuid
    and state = 'leased'
    and worker_id = payload ->> 'workerId'
    and lease_expires_at > now()
  for update;
  if job.id is null then
    raise exception 'Active provider job lease not found' using errcode = 'P0002';
  end if;

  select * into operation
  from private.provider_operations
  where job_id = job.id and operation_key = operation_key_value
  for update;
  if operation.job_id is null then
    raise exception 'Provider operation reservation not found' using errcode = 'P0002';
  end if;
  if operation.state = 'completed' then
    return jsonb_build_object('state', 'succeeded', 'execute', false, 'result', operation.result);
  end if;
  if operation.worker_id is distinct from job.worker_id or operation.attempt is distinct from job.attempt then
    raise exception 'Provider operation lease ownership changed' using errcode = '23514';
  end if;
  if retry_safe then
    delete from private.provider_operations
    where job_id = job.id and operation_key = operation_key_value and state = 'reserved';
    return jsonb_build_object('state', 'released', 'execute', false, 'result', null);
  end if;
  update private.provider_operations
  set state = 'ambiguous', error_code = code_value, updated_at = now()
  where job_id = job.id and operation_key = operation_key_value
  returning * into operation;
  return jsonb_build_object('state', 'ambiguous', 'execute', false, 'result', operation.result);
end;
$$;

create or replace function public.fail_provider_operation(payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return private.fail_provider_operation(payload);
end;
$$;

create or replace function private.qualify_lightweight_source(payload jsonb)
returns table (
  opportunity_id uuid,
  pipeline_id uuid,
  score numeric,
  decision text,
  used_today integer,
  daily_limit integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  source_record public.source_documents%rowtype;
  route_record public.rss_feed_brand_links%rowtype;
  cluster_id uuid;
  opportunity_id_value uuid;
  pipeline_id_value uuid;
  score_value numeric := (payload ->> 'score')::numeric;
  risk_value numeric := coalesce((payload ->> 'riskPenalty')::numeric, 0);
  cluster_key_value text := payload ->> 'clusterKey';
  decision_value text;
  used_count integer;
  actor_value uuid := nullif(payload ->> 'actorId', '')::uuid;
  berlin_day text := to_char(timezone('Europe/Berlin', now()), 'YYYY-MM-DD');
  automatic_key text;
begin
  if score_value not between 0 and 100
     or risk_value not between 0 and 100
     or char_length(coalesce(payload ->> 'valueNucleus', '')) not between 20 and 2000
     or coalesce(cluster_key_value, '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(payload -> 'scoreBreakdown') <> 'object'
     or jsonb_typeof(payload -> 'classification') <> 'object'
  then
    raise exception 'Invalid lightweight qualification payload' using errcode = '22023';
  end if;

  select * into source_record
  from public.source_documents
  where id = (payload ->> 'sourceDocumentId')::uuid
    and source_type = 'rss'
  for update;
  select * into route_record
  from public.rss_feed_brand_links
  where rss_feed_id = (payload ->> 'feedId')::uuid
    and brand_id = (payload ->> 'brandId')::uuid
    and organization_id = source_record.organization_id;

  if source_record.id is null or route_record.brand_id is null then
    raise exception 'Routed RSS source not found' using errcode = 'P0002';
  end if;

  -- Serialize selection for one brand so concurrent feed polls cannot exceed the
  -- configured daily maximum.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(route_record.brand_id::text, 0)
  );
  update public.source_documents
  set clean_text = payload ->> 'cleanText',
      language = coalesce(nullif(payload ->> 'language', ''), 'en'),
      extraction_confidence = coalesce((payload ->> 'extractionConfidence')::numeric, 1),
      status = 'analyzed',
      status_reason = null,
      metadata = metadata || jsonb_build_object(
        'lightweightRuntime', true,
        'namedEntities', coalesce(payload -> 'classification' -> 'namedEntities', '[]'::jsonb),
        'topicTags', coalesce(payload -> 'classification' -> 'topicTags', '[]'::jsonb),
        'classificationReasons', coalesce(payload -> 'classification' -> 'reasons', '[]'::jsonb)
      ),
      updated_at = now()
  where id = source_record.id;

  insert into public.content_clusters (
    organization_id, cluster_key, cluster_type, canonical_topic
  ) values (
    source_record.organization_id, cluster_key_value, 'event',
    left(coalesce(nullif(payload ->> 'canonicalTopic', ''), payload ->> 'valueNucleus'), 1000)
  )
  on conflict (organization_id, cluster_key) do update
    set updated_at = now()
  returning id into cluster_id;

  insert into public.cluster_sources (
    organization_id, cluster_id, source_document_id, relationship_type, similarity
  ) values (
    source_record.organization_id, cluster_id, source_record.id, 'primary', 1
  ) on conflict (cluster_id, source_document_id) do nothing;

  insert into public.opportunities (
    organization_id, brand_id, source_document_id, cluster_id, value_nucleus,
    recommended_style, opportunity_score, risk_penalty, score_breakdown, status
  ) values (
    source_record.organization_id,
    route_record.brand_id,
    source_record.id,
    cluster_id,
    payload ->> 'valueNucleus',
    (payload -> 'classification' ->> 'recommendedStyle')::public.content_style,
    score_value,
    risk_value,
    payload -> 'scoreBreakdown',
    'candidate'
  )
  on conflict (brand_id, source_document_id) where source_document_id is not null
  do update set
    cluster_id = excluded.cluster_id,
    value_nucleus = excluded.value_nucleus,
    recommended_style = excluded.recommended_style,
    opportunity_score = excluded.opportunity_score,
    risk_penalty = excluded.risk_penalty,
    score_breakdown = excluded.score_breakdown,
    updated_at = now()
  returning id into opportunity_id_value;

  automatic_key := 'rss-auto:' || route_record.brand_id::text || ':' ||
    opportunity_id_value::text || ':' || berlin_day;

  select id into pipeline_id_value
  from public.pipeline_instances
  where organization_id = source_record.organization_id
    and idempotency_key = automatic_key;

  select count(*)::integer into used_count
  from public.pipeline_instances instance
  where instance.brand_id = route_record.brand_id
    and instance.trigger_type = 'schedule'
    and timezone('Europe/Berlin', instance.created_at)::date
      = timezone('Europe/Berlin', now())::date
    and instance.current_stage >= 'research'::public.pipeline_stage;

  decision_value := case
    when pipeline_id_value is not null then 'already_selected'
    when route_record.generation_policy = 'ingest_only' then 'ingest_only'
    when score_value < 60 then 'stored'
    when score_value < route_record.minimum_score then 'manual_review'
    when used_count >= route_record.daily_generation_limit then 'daily_limit'
    else 'selected'
  end;

  if decision_value = 'selected' then
    select started.id into pipeline_id_value
    from private.start_pipeline(jsonb_build_object(
      'brandId', route_record.brand_id,
      'opportunityId', opportunity_id_value,
      'sourceDocumentId', source_record.id,
      'correlationId', coalesce(nullif(payload ->> 'correlationId', '')::uuid, gen_random_uuid()),
      'idempotencyKey', automatic_key,
      'triggerType', 'schedule',
      'stage', 'research',
      'request', jsonb_build_object(
        'actorId', actor_value,
        'brandId', route_record.brand_id,
        'opportunityId', opportunity_id_value
      ),
      'maxAttempts', 4
    )) started;
    used_count := used_count + 1;
    update public.opportunities set status = 'research_pending' where id = opportunity_id_value;
  end if;

  insert into public.pipeline_events (
    organization_id, brand_id, entity_type, entity_id, event_type,
    to_status, correlation_id, actor_id, metadata
  ) values (
    source_record.organization_id, route_record.brand_id, 'opportunity', opportunity_id_value,
    'lightweight.opportunity_qualified', decision_value,
    coalesce(nullif(payload ->> 'correlationId', '')::uuid, gen_random_uuid()),
    actor_value,
    jsonb_build_object(
      'score', score_value, 'decision', decision_value, 'feedId', route_record.rss_feed_id,
      'usedToday', used_count, 'dailyLimit', route_record.daily_generation_limit
    )
  );

  return query select opportunity_id_value, pipeline_id_value, score_value,
    decision_value, used_count, route_record.daily_generation_limit;
end;
$$;

create or replace function public.qualify_lightweight_source(payload jsonb)
returns table (
  opportunity_id uuid,
  pipeline_id uuid,
  score numeric,
  decision text,
  used_today integer,
  daily_limit integer
)
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  return query select * from private.qualify_lightweight_source(payload);
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
  request_key text := payload ->> 'idempotencyKey';
  stage_value public.pipeline_stage;
  result public.pipeline_instances%rowtype;
  organization_value uuid;
  expected_version_id uuid := nullif(payload ->> 'expectedVersionId', '')::uuid;
  current_version_id uuid;
begin
  if (select auth.uid()) is null or not (select private.can_edit_brand(target_brand_id)) then
    raise exception 'Brand editor access required' using errcode = '42501';
  end if;
  if action_value not in ('research', 'draft', 'verify', 'image', 'package', 'resurface') then
    raise exception 'Unsupported lightweight action' using errcode = '22023';
  end if;
  if request_key is null or request_key !~ '^[A-Za-z0-9:_-]{16,200}$' then
    raise exception 'A valid reviewer idempotency key is required' using errcode = '22023';
  end if;
  stage_value := case when action_value = 'resurface' then 'research'::public.pipeline_stage
                      else action_value::public.pipeline_stage end;

  if target_draft_id is not null then
    select opportunity_id, post.current_version_id
    into target_opportunity_id, current_version_id
    from public.post_drafts post
    where post.id = target_draft_id and post.brand_id = target_brand_id
    for update;
    if expected_version_id is null or current_version_id is distinct from expected_version_id then
      raise exception 'Post version changed' using errcode = '40001';
    end if;
  end if;
  select organization_id into organization_value from public.brands where id = target_brand_id;
  if organization_value is null or target_opportunity_id is null then
    raise exception 'Action target not found' using errcode = 'P0002';
  end if;

  result := private.start_pipeline(jsonb_build_object(
    'brandId', target_brand_id,
    'opportunityId', target_opportunity_id,
    'correlationId', gen_random_uuid(),
    'idempotencyKey', 'reviewer:' || action_value || ':' || request_key,
    'triggerType', case when action_value = 'resurface' then 'resurface' else 'manual' end,
    'stage', stage_value,
    'request', jsonb_build_object(
      'actorId', (select auth.uid()),
      'brandId', target_brand_id,
      'opportunityId', target_opportunity_id,
      'postDraftId', target_draft_id,
      'expectedVersionId', expected_version_id,
      'instruction', left(coalesce(payload ->> 'instruction', ''), 1000)
    ),
    'maxAttempts', 4
  ));

  insert into public.audit_logs (
    organization_id, brand_id, actor_id, action, entity_type, entity_id, metadata
  ) select
    organization_value, target_brand_id, (select auth.uid()),
    'lightweight.' || action_value || '_requested', 'pipeline_instance', result.id,
    jsonb_build_object('opportunityId', target_opportunity_id, 'postDraftId', target_draft_id)
  where not exists (
    select 1 from public.audit_logs audit
    where audit.action = 'lightweight.' || action_value || '_requested'
      and audit.entity_type = 'pipeline_instance'
      and audit.entity_id = result.id
  );
  return result;
end;
$$;

create or replace function public.request_lightweight_action(payload jsonb)
returns public.pipeline_instances
language sql
security definer
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
  actor_value uuid := (select auth.uid());
  expected_version_id uuid := nullif(payload ->> 'expectedVersionId', '')::uuid;
  request_key text := payload ->> 'idempotencyKey';
  request_hash_value text;
  idempotency_record private.idempotency_keys%rowtype;
  hook_value text := trim(payload ->> 'hook');
  body_value text := trim(payload ->> 'body');
  closing_value text := nullif(trim(payload ->> 'closing'), '');
begin
  select * into draft from public.post_drafts
  where id = (payload ->> 'postDraftId')::uuid for update;
  if draft.id is null or actor_value is null
     or not (select private.can_edit_brand(draft.brand_id)) then
    raise exception 'Editable post not found' using errcode = '42501';
  end if;
  if request_key is null or request_key !~ '^[A-Za-z0-9:_-]{16,200}$' then
    raise exception 'A valid edit idempotency key is required' using errcode = '22023';
  end if;
  if char_length(hook_value) not between 1 and 1000
     or char_length(body_value) not between 1 and 10000
     or char_length(coalesce(closing_value, '')) > 2000 then
    raise exception 'Post content is outside allowed bounds' using errcode = '22023';
  end if;

  request_hash_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'postDraftId', draft.id,
    'expectedVersionId', expected_version_id,
    'hook', hook_value,
    'body', body_value,
    'closing', closing_value,
    'actorId', actor_value
  )::text, 'utf8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(draft.organization_id::text || ':post_edit:' || request_key, 0)
  );
  select * into idempotency_record
  from private.idempotency_keys
  where organization_id = draft.organization_id
    and scope = 'lightweight_post_edit'
    and idempotency_key = request_key;
  if found then
    if idempotency_record.request_hash is distinct from request_hash_value then
      raise exception 'Edit idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return (idempotency_record.response_body ->> 'versionId')::uuid;
    end if;
  end if;
  if expected_version_id is null or draft.current_version_id is distinct from expected_version_id then
    raise exception 'Post version changed' using errcode = '40001';
  end if;
  if idempotency_record.organization_id is null then
    insert into private.idempotency_keys (
      organization_id, scope, idempotency_key, request_hash, expires_at
    ) values (
      draft.organization_id, 'lightweight_post_edit', request_key,
      request_hash_value, now() + interval '7 days'
    );
  end if;

  select coalesce(max(version_number), 0) + 1 into next_number
  from public.post_versions where post_draft_id = draft.id;

  insert into public.post_versions (
    post_draft_id, version_number, hook, body, closing, full_text,
    generation_type, created_by
  ) values (
    draft.id, next_number, hook_value, body_value, closing_value,
    concat_ws(E'\n\n', hook_value, body_value, closing_value),
    'manual_edit', actor_value
  ) returning id into version_id;

  update public.post_drafts
  set current_version_id = version_id, status = 'verifying', updated_at = now()
  where id = draft.id;

  insert into public.audit_logs (
    organization_id, brand_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    draft.organization_id, draft.brand_id, actor_value,
    'lightweight.post_edited', 'post_draft', draft.id,
    jsonb_build_object('versionId', version_id, 'versionNumber', next_number)
  );

  perform private.start_pipeline(jsonb_build_object(
    'brandId', draft.brand_id,
    'opportunityId', draft.opportunity_id,
    'correlationId', gen_random_uuid(),
    'idempotencyKey', 'reviewer:verify-edit:' || version_id::text,
    'triggerType', 'manual',
    'stage', 'verify',
    'request', jsonb_build_object(
      'actorId', actor_value,
      'brandId', draft.brand_id,
      'opportunityId', draft.opportunity_id,
      'postDraftId', draft.id
    ),
    'maxAttempts', 4
  ));
  update private.idempotency_keys
  set response_status = 201,
      response_body = jsonb_build_object('versionId', version_id, 'versionNumber', next_number)
  where organization_id = draft.organization_id
    and scope = 'lightweight_post_edit'
    and idempotency_key = request_key;
  return version_id;
end;
$$;

create or replace function public.save_lightweight_post_edit(payload jsonb)
returns uuid
language sql
security definer
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
  actor_value uuid := (select auth.uid());
  expected_version_id uuid := nullif(payload ->> 'expectedVersionId', '')::uuid;
  request_key text := payload ->> 'idempotencyKey';
  request_hash_value text;
  idempotency_record private.idempotency_keys%rowtype;
begin
  select * into draft from public.post_drafts
  where id = (payload ->> 'postDraftId')::uuid
  for update;
  if draft.id is null or actor_value is null
     or not (select private.can_edit_brand(draft.brand_id)) then
    raise exception 'Reviewable post not found' using errcode = '42501';
  end if;
  if decision not in ('approve', 'reject') then
    raise exception 'Unsupported review decision' using errcode = '22023';
  end if;
  if decision = 'reject' and char_length(reason_value) < 3 then
    raise exception 'A rejection reason is required' using errcode = '22023';
  end if;
  if char_length(reason_value) > 2000
     or request_key is null
     or request_key !~ '^[A-Za-z0-9:_-]{16,200}$'
  then
    raise exception 'Invalid review request' using errcode = '22023';
  end if;

  request_hash_value := encode(extensions.digest(convert_to(jsonb_build_object(
    'postDraftId', draft.id,
    'expectedVersionId', expected_version_id,
    'decision', decision,
    'reason', reason_value,
    'actorId', actor_value
  )::text, 'utf8'), 'sha256'), 'hex');
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(draft.organization_id::text || ':post_review:' || request_key, 0)
  );
  select * into idempotency_record
  from private.idempotency_keys
  where organization_id = draft.organization_id
    and scope = 'lightweight_post_review'
    and idempotency_key = request_key;
  if found then
    if idempotency_record.request_hash is distinct from request_hash_value then
      raise exception 'Review idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return draft;
    end if;
  end if;
  if expected_version_id is null or draft.current_version_id is distinct from expected_version_id then
    raise exception 'Post version changed' using errcode = '40001';
  end if;
  if draft.status not in ('ready_for_review', 'changes_requested') then
    raise exception 'Post is not in a reviewable state' using errcode = '23514';
  end if;
  if idempotency_record.organization_id is null then
    insert into private.idempotency_keys (
      organization_id, scope, idempotency_key, request_hash, expires_at
    ) values (
      draft.organization_id, 'lightweight_post_review', request_key,
      request_hash_value, now() + interval '7 days'
    );
  end if;

  update public.post_drafts
  set status = case when decision = 'approve' then 'approved' else 'rejected' end,
      approved_by = case when decision = 'approve' then (select auth.uid()) else null end,
      approved_at = case when decision = 'approve' then now() else null end,
      updated_at = now()
  where id = draft.id
    and current_version_id = expected_version_id
    and status in ('ready_for_review', 'changes_requested')
  returning * into draft;
  if not found then
    raise exception 'Post review state changed' using errcode = '40001';
  end if;

  insert into public.audit_logs (
    organization_id, brand_id, actor_id, action, entity_type, entity_id, metadata
  ) values (
    draft.organization_id, draft.brand_id, actor_value,
    'lightweight.post_' || case when decision = 'approve' then 'approved' else 'rejected' end,
    'post_draft', draft.id, jsonb_build_object('reason', reason_value)
  );
  update private.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'postDraftId', draft.id,
        'decision', decision,
        'status', draft.status,
        'expectedVersionId', expected_version_id
      )
  where organization_id = draft.organization_id
    and scope = 'lightweight_post_review'
    and idempotency_key = request_key;
  return draft;
end;
$$;

create or replace function public.review_lightweight_post(payload jsonb)
returns public.post_drafts
language sql
security definer
set search_path = ''
as $$
  select private.review_lightweight_post(payload);
$$;

revoke all on function private.enqueue_pipeline_job(jsonb) from public;
revoke all on function private.start_pipeline(jsonb) from public;
revoke all on function private.claim_pipeline_jobs(text, public.pipeline_stage[], integer, integer) from public;
revoke all on function private.complete_pipeline_job(jsonb) from public;
revoke all on function private.fail_pipeline_job(jsonb) from public;
revoke all on function private.begin_provider_operation(jsonb) from public;
revoke all on function private.complete_provider_operation(jsonb) from public;
revoke all on function private.fail_provider_operation(jsonb) from public;
revoke all on function private.qualify_lightweight_source(jsonb) from public;
revoke all on function private.request_lightweight_action(jsonb) from public;
revoke all on function private.save_lightweight_post_edit(jsonb) from public;
revoke all on function private.review_lightweight_post(jsonb) from public;
revoke all on function public.enqueue_pipeline_job(jsonb) from public, anon, authenticated;
revoke all on function public.start_pipeline(jsonb) from public, anon, authenticated;
revoke all on function public.claim_pipeline_jobs(text, public.pipeline_stage[], integer, integer) from public, anon, authenticated;
revoke all on function public.complete_pipeline_job(jsonb) from public, anon, authenticated;
revoke all on function public.fail_pipeline_job(jsonb) from public, anon, authenticated;
revoke all on function public.begin_provider_operation(jsonb) from public, anon, authenticated;
revoke all on function public.complete_provider_operation(jsonb) from public, anon, authenticated;
revoke all on function public.fail_provider_operation(jsonb) from public, anon, authenticated;
revoke all on function public.qualify_lightweight_source(jsonb) from public, anon, authenticated;
revoke all on function public.request_lightweight_action(jsonb) from public, anon;
revoke all on function public.save_lightweight_post_edit(jsonb) from public, anon;
revoke all on function public.review_lightweight_post(jsonb) from public, anon;
grant execute on function public.request_lightweight_action(jsonb) to authenticated;
grant execute on function public.save_lightweight_post_edit(jsonb) to authenticated;
grant execute on function public.review_lightweight_post(jsonb) to authenticated;
grant execute on function private.enqueue_pipeline_job(jsonb) to service_role;
grant execute on function private.start_pipeline(jsonb) to service_role;
grant execute on function private.claim_pipeline_jobs(text, public.pipeline_stage[], integer, integer) to service_role;
grant execute on function private.complete_pipeline_job(jsonb) to service_role;
grant execute on function private.fail_pipeline_job(jsonb) to service_role;
grant execute on function private.begin_provider_operation(jsonb) to service_role;
grant execute on function private.complete_provider_operation(jsonb) to service_role;
grant execute on function private.fail_provider_operation(jsonb) to service_role;
grant execute on function private.qualify_lightweight_source(jsonb) to service_role;
grant execute on function public.enqueue_pipeline_job(jsonb) to service_role;
grant execute on function public.start_pipeline(jsonb) to service_role;
grant execute on function public.claim_pipeline_jobs(text, public.pipeline_stage[], integer, integer) to service_role;
grant execute on function public.complete_pipeline_job(jsonb) to service_role;
grant execute on function public.fail_pipeline_job(jsonb) to service_role;
grant execute on function public.begin_provider_operation(jsonb) to service_role;
grant execute on function public.complete_provider_operation(jsonb) to service_role;
grant execute on function public.fail_provider_operation(jsonb) to service_role;
grant execute on function public.qualify_lightweight_source(jsonb) to service_role;

create trigger pipeline_instances_set_updated_at before update on public.pipeline_instances
for each row execute function public.set_updated_at();
create trigger pipeline_jobs_set_updated_at before update on public.pipeline_jobs
for each row execute function public.set_updated_at();

-- The legacy RSS intake implementation validates the legacy JWT role claim.
-- Supabase opaque sb_secret keys authenticate as the service_role database role
-- without carrying that claim, so the invoker wrapper establishes the trusted
-- transaction-local claim only after checking the actual Postgres role.
create or replace function public.ingest_rss_item(payload jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  perform set_config('request.jwt.claim.role', 'service_role', true);
  return private.ingest_rss_item(payload);
end;
$$;
revoke all on function public.ingest_rss_item(jsonb) from public, anon, authenticated;
grant execute on function public.ingest_rss_item(jsonb) to service_role;
