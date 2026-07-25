alter table public.research_runs
  add column generation_run_id uuid unique
    references public.generation_runs(id) on delete set null,
  add column evidence_package jsonb,
  add column model text,
  add column prompt_version text,
  add column provider_response_id text,
  add column provider_usage jsonb not null default '{}'::jsonb,
  add column ready_for_writing boolean not null default false;

alter table public.research_sources
  add column source_key text;
update public.research_sources
set source_key = 'source_' || left(replace(id::text, '-', ''), 12)
where source_key is null;
alter table public.research_sources
  alter column source_key set not null,
  add constraint research_sources_key_format
    check (source_key ~ '^source_[a-z0-9]{6,40}$'),
  add constraint research_sources_run_key_unique unique (research_run_id, source_key);

alter table public.claims
  add column claim_key text,
  add column importance text not null default 'supporting'
    check (importance in ('core', 'supporting', 'optional')),
  add column verification_detail text not null default 'unsupported'
    check (
      verification_detail in (
        'verified',
        'partially_supported',
        'disputed',
        'unsupported',
        'opinion'
      )
    ),
  add column usage_guidance text not null default 'do_not_use'
    check (usage_guidance in ('safe', 'caveat', 'do_not_use')),
  add column caveat text,
  add constraint claims_key_format check (claim_key ~ '^claim_[a-z0-9]{6,40}$');
update public.claims
set claim_key = 'claim_' || left(replace(id::text, '-', ''), 12)
where claim_key is null;
alter table public.claims
  alter column claim_key set not null,
  add constraint claims_run_key_unique unique (research_run_id, claim_key);

alter table public.claim_sources
  add column excerpt text,
  add column locator text;
update public.claim_sources
set excerpt = '[Legacy evidence link: excerpt unavailable]'
where excerpt is null;
alter table public.claim_sources alter column excerpt set not null;

create index if not exists research_runs_opportunity_idx
  on public.research_runs (opportunity_id, completed_at desc);
create index if not exists research_sources_run_idx
  on public.research_sources (research_run_id);
create index if not exists claims_run_idx
  on public.claims (research_run_id);

drop policy if exists research_runs_write on public.research_runs;
create policy research_runs_insert on public.research_runs
for insert with check (
  exists (
    select 1 from public.opportunities
    where opportunities.id = research_runs.opportunity_id
      and opportunities.organization_id = research_runs.organization_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy research_runs_update on public.research_runs
for update using (
  exists (
    select 1 from public.opportunities
    where opportunities.id = research_runs.opportunity_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
) with check (
  exists (
    select 1 from public.opportunities
    where opportunities.id = research_runs.opportunity_id
      and opportunities.organization_id = research_runs.organization_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy research_runs_delete on public.research_runs
for delete using (
  exists (
    select 1 from public.opportunities
    where opportunities.id = research_runs.opportunity_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);

drop policy if exists research_sources_write on public.research_sources;
create policy research_sources_insert on public.research_sources
for insert with check (
  exists (
    select 1 from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = research_sources.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy research_sources_update on public.research_sources
for update using (
  exists (
    select 1 from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = research_sources.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
) with check (
  exists (
    select 1 from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = research_sources.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy research_sources_delete on public.research_sources
for delete using (
  exists (
    select 1 from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = research_sources.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);

drop policy if exists claims_write on public.claims;
create policy claims_insert on public.claims
for insert with check (
  exists (
    select 1 from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = claims.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy claims_update on public.claims
for update using (
  exists (
    select 1 from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = claims.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
) with check (
  exists (
    select 1 from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = claims.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy claims_delete on public.claims
for delete using (
  exists (
    select 1 from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = claims.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);

drop policy if exists claim_sources_write on public.claim_sources;
create policy claim_sources_insert on public.claim_sources
for insert with check (
  exists (
    select 1 from public.claims
    join public.research_runs on research_runs.id = claims.research_run_id
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where claims.id = claim_sources.claim_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy claim_sources_update on public.claim_sources
for update using (
  exists (
    select 1 from public.claims
    join public.research_runs on research_runs.id = claims.research_run_id
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where claims.id = claim_sources.claim_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
) with check (
  exists (
    select 1 from public.claims
    join public.research_runs on research_runs.id = claims.research_run_id
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where claims.id = claim_sources.claim_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy claim_sources_delete on public.claim_sources
for delete using (
  exists (
    select 1 from public.claims
    join public.research_runs on research_runs.id = claims.research_run_id
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where claims.id = claim_sources.claim_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);

create table public.claim_conflicts (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  conflict_key text not null check (conflict_key ~ '^conflict_[a-z0-9]{6,40}$'),
  description text not null check (char_length(description) between 3 and 2000),
  resolution text not null check (char_length(resolution) between 3 and 2000),
  material boolean not null default false,
  created_at timestamptz not null default now(),
  unique (research_run_id, conflict_key)
);
create index claim_conflicts_run_idx on public.claim_conflicts (research_run_id);

create table public.claim_conflict_members (
  claim_conflict_id uuid not null references public.claim_conflicts(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  primary key (claim_conflict_id, claim_id)
);
create index claim_conflict_members_claim_idx on public.claim_conflict_members (claim_id);

alter table public.claim_conflicts enable row level security;
alter table public.claim_conflict_members enable row level security;

create policy claim_conflicts_select on public.claim_conflicts
for select using (
  exists (
    select 1
    from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = claim_conflicts.research_run_id
      and (select public.can_read_brand(opportunities.brand_id))
  )
);
create policy claim_conflicts_insert on public.claim_conflicts
for insert with check (
  exists (
    select 1
    from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = claim_conflicts.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy claim_conflicts_update on public.claim_conflicts
for update using (
  exists (
    select 1
    from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = claim_conflicts.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
) with check (
  exists (
    select 1
    from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = claim_conflicts.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy claim_conflicts_delete on public.claim_conflicts
for delete using (
  exists (
    select 1
    from public.research_runs
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where research_runs.id = claim_conflicts.research_run_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);

create policy claim_conflict_members_select on public.claim_conflict_members
for select using (
  exists (
    select 1
    from public.claim_conflicts
    join public.research_runs on research_runs.id = claim_conflicts.research_run_id
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where claim_conflicts.id = claim_conflict_members.claim_conflict_id
      and (select public.can_read_brand(opportunities.brand_id))
  )
);
create policy claim_conflict_members_insert on public.claim_conflict_members
for insert with check (
  exists (
    select 1
    from public.claim_conflicts
    join public.research_runs on research_runs.id = claim_conflicts.research_run_id
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where claim_conflicts.id = claim_conflict_members.claim_conflict_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);
create policy claim_conflict_members_delete on public.claim_conflict_members
for delete using (
  exists (
    select 1
    from public.claim_conflicts
    join public.research_runs on research_runs.id = claim_conflicts.research_run_id
    join public.opportunities on opportunities.id = research_runs.opportunity_id
    where claim_conflicts.id = claim_conflict_members.claim_conflict_id
      and (select public.can_edit_brand(opportunities.brand_id))
  )
);

create or replace function private.reserve_research_budget(payload jsonb)
returns table (
  generation_run_id uuid,
  duplicate boolean,
  reserved_cost_usd numeric,
  spent_today_usd numeric,
  daily_budget_usd numeric
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := nullif(payload ->> 'actorId', '')::uuid;
  target_brand_id uuid := nullif(payload ->> 'brandId', '')::uuid;
  target_opportunity_id uuid := nullif(payload ->> 'opportunityId', '')::uuid;
  target_organization_id uuid;
  correlation uuid := coalesce(nullif(payload ->> 'correlationId', '')::uuid, gen_random_uuid());
  requested_cost numeric := coalesce((payload ->> 'reservedCostUsd')::numeric, -1);
  daily_limit numeric := coalesce((payload ->> 'dailyBudgetUsd')::numeric, -1);
  current_spend numeric := 0;
  run_id uuid;
  idempotency_exists boolean := false;
  idempotency_record private.idempotency_keys%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if actor_id is null
    or target_brand_id is null
    or target_opportunity_id is null
    or coalesce(payload ->> 'idempotencyKey', '') !~ '^.{16,200}$'
    or coalesce(payload ->> 'requestHash', '') !~ '^[0-9a-f]{64}$'
    or requested_cost <= 0
    or requested_cost > 100
    or daily_limit <= 0
    or daily_limit > 10000
    or requested_cost > daily_limit
  then
    raise exception 'Invalid research budget reservation' using errcode = '22023';
  end if;

  select opportunities.organization_id
  into target_organization_id
  from public.opportunities
  where opportunities.id = target_opportunity_id
    and opportunities.brand_id = target_brand_id;

  if target_organization_id is null
    or not exists (
      select 1
      from public.organization_members organization_member
      left join public.brand_members brand_member
        on brand_member.brand_id = target_brand_id
       and brand_member.user_id = actor_id
      where organization_member.organization_id = target_organization_id
        and organization_member.user_id = actor_id
        and (
          organization_member.role = 'administrator'
          or brand_member.role in ('administrator', 'editor', 'reviewer')
        )
    )
  then
    raise exception 'Brand reviewer permission required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_organization_id::text, 527)
  );

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = target_organization_id
    and scope = 'research_budget'
    and idempotency_key = payload ->> 'idempotencyKey';
  idempotency_exists := found;
  if found then
    if idempotency_record.request_hash <> payload ->> 'requestHash' then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'generationRunId')::uuid,
        true,
        (idempotency_record.response_body ->> 'reservedCostUsd')::numeric,
        (idempotency_record.response_body ->> 'spentTodayUsd')::numeric,
        (idempotency_record.response_body ->> 'dailyBudgetUsd')::numeric;
      return;
    end if;
  end if;

  select coalesce(sum(
    greatest(
      coalesce((generation_runs.model_usage ->> 'estimatedCostUsd')::numeric, 0),
      coalesce((generation_runs.model_usage ->> 'reservedCostUsd')::numeric, 0)
    )
  ), 0)
  into current_spend
  from public.generation_runs
  where generation_runs.organization_id = target_organization_id
    and generation_runs.run_type = 'research'
    and generation_runs.status in ('queued', 'running', 'succeeded', 'failed', 'cancelled')
    and generation_runs.created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';

  if current_spend + requested_cost > daily_limit then
    raise exception 'Daily AI research budget exhausted' using errcode = '22023';
  end if;

  if not idempotency_exists then
    insert into private.idempotency_keys (
      organization_id,
      scope,
      idempotency_key,
      request_hash,
      expires_at
    ) values (
      target_organization_id,
      'research_budget',
      payload ->> 'idempotencyKey',
      payload ->> 'requestHash',
      now() + interval '24 hours'
    );
  end if;

  insert into public.generation_runs (
    organization_id,
    brand_id,
    run_type,
    entity_type,
    entity_id,
    workflow_name,
    correlation_id,
    idempotency_key,
    status,
    started_at,
    model_usage
  ) values (
    target_organization_id,
    target_brand_id,
    'research',
    'opportunity',
    target_opportunity_id,
    'wf-05-research',
    correlation,
    payload ->> 'idempotencyKey',
    'running',
    now(),
    jsonb_build_object('reservedCostUsd', requested_cost)
  )
  returning id into run_id;

  update public.opportunities
  set status = 'researching'
  where id = target_opportunity_id;

  update private.idempotency_keys
  set response_status = 201,
      response_body = jsonb_build_object(
        'generationRunId', run_id,
        'reservedCostUsd', requested_cost,
        'spentTodayUsd', current_spend,
        'dailyBudgetUsd', daily_limit
      )
  where organization_id = target_organization_id
    and scope = 'research_budget'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select run_id, false, requested_cost, current_spend, daily_limit;
end;
$$;

create or replace function private.persist_research_evidence(payload jsonb)
returns table (
  research_run_id uuid,
  generation_run_id uuid,
  duplicate boolean,
  ready_for_writing boolean,
  source_count integer,
  claim_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := nullif(payload ->> 'actorId', '')::uuid;
  target_brand_id uuid := nullif(payload ->> 'brandId', '')::uuid;
  target_opportunity_id uuid := nullif(payload ->> 'opportunityId', '')::uuid;
  target_organization_id uuid;
  research_id uuid;
  run_id uuid;
  correlation uuid := coalesce(nullif(payload ->> 'correlationId', '')::uuid, gen_random_uuid());
  request_hash_value text := payload ->> 'requestHash';
  package jsonb := payload -> 'evidencePackage';
  plan jsonb := payload -> 'researchPlan';
  requested_run_id uuid := nullif(payload ->> 'generationRunId', '')::uuid;
  is_ready boolean := coalesce((payload -> 'evidencePackage' ->> 'readyForWriting')::boolean, false);
  sources_total integer;
  claims_total integer;
  idempotency_record private.idempotency_keys%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if actor_id is null
    or target_brand_id is null
    or target_opportunity_id is null
    or requested_run_id is null
    or coalesce(payload ->> 'idempotencyKey', '') !~ '^.{16,200}$'
    or coalesce(request_hash_value, '') !~ '^[0-9a-f]{64}$'
    or jsonb_typeof(plan) <> 'object'
    or jsonb_typeof(package) <> 'object'
    or plan ->> 'contractVersion' is distinct from '1.0'
    or nullif(plan ->> 'opportunityId', '')::uuid is distinct from target_opportunity_id
    or jsonb_typeof(plan -> 'queries') <> 'array'
    or jsonb_typeof(plan -> 'allowedDomains') <> 'array'
    or jsonb_typeof(plan -> 'budget') <> 'object'
    or coalesce((plan -> 'budget' ->> 'maxQueries')::integer, 0) not between 1 and 8
    or coalesce((plan -> 'budget' ->> 'maxDomains')::integer, 0) not between 1 and 100
    or package ->> 'contractVersion' is distinct from '1.0'
    or nullif(package ->> 'opportunityId', '')::uuid is distinct from target_opportunity_id
    or jsonb_typeof(package -> 'sources') <> 'array'
    or jsonb_typeof(package -> 'claims') <> 'array'
    or jsonb_typeof(package -> 'conflicts') <> 'array'
    or jsonb_array_length(package -> 'sources') > 100
    or jsonb_array_length(package -> 'claims') > 100
    or jsonb_array_length(package -> 'conflicts') > 30
    or jsonb_array_length(coalesce(plan -> 'queries', '[]'::jsonb))
      > coalesce((plan -> 'budget' ->> 'maxQueries')::integer, 0)
    or jsonb_array_length(coalesce(plan -> 'allowedDomains', '[]'::jsonb))
      > coalesce((plan -> 'budget' ->> 'maxDomains')::integer, 0)
  then
    raise exception 'Invalid research evidence payload' using errcode = '22023';
  end if;

  select opportunities.organization_id
  into target_organization_id
  from public.opportunities
  where opportunities.id = target_opportunity_id
    and opportunities.brand_id = target_brand_id
  for update;

  if target_organization_id is null
    or not exists (
      select 1
      from public.organization_members organization_member
      left join public.brand_members brand_member
        on brand_member.brand_id = target_brand_id
       and brand_member.user_id = actor_id
      where organization_member.organization_id = target_organization_id
        and organization_member.user_id = actor_id
        and (
          organization_member.role = 'administrator'
          or brand_member.role in ('administrator', 'editor', 'reviewer')
        )
    )
  then
    raise exception 'Brand reviewer permission required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(package -> 'sources') source
    group by source.value ->> 'sourceKey'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(package -> 'claims') claim
    group by claim.value ->> 'claimKey'
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_array_elements(package -> 'claims') claim
    cross join jsonb_array_elements(coalesce(claim.value -> 'evidence', '[]'::jsonb)) evidence
    where not exists (
      select 1
      from jsonb_array_elements(package -> 'sources') source
      where source.value ->> 'sourceKey' = evidence.value ->> 'sourceKey'
    )
  ) or exists (
    select 1
    from jsonb_array_elements(package -> 'claims') claim
    where claim.value ->> 'claimType' in ('factual', 'numerical')
      and claim.value ->> 'verificationState' = 'verified'
      and not exists (
        select 1
        from jsonb_array_elements(coalesce(claim.value -> 'evidence', '[]'::jsonb)) evidence
        where evidence.value ->> 'supportType' = 'supports'
      )
  ) or exists (
    select 1
    from jsonb_array_elements(package -> 'claims') claim
    where claim.value ->> 'riskLevel' = 'high'
      and claim.value ->> 'verificationState' <> 'verified'
      and claim.value ->> 'usageGuidance' <> 'do_not_use'
  ) or (
    is_ready and jsonb_array_length(package -> 'claims') = 0
  ) or (
    is_ready and exists (
      select 1
      from jsonb_array_elements(package -> 'claims') claim
      where claim.value ->> 'importance' = 'core'
        and claim.value ->> 'verificationState' in ('unsupported', 'disputed')
    )
  ) or exists (
    select 1
    from jsonb_array_elements(package -> 'conflicts') conflict
    cross join jsonb_array_elements_text(coalesce(conflict.value -> 'claimKeys', '[]'::jsonb)) member
    where not exists (
      select 1
      from jsonb_array_elements(package -> 'claims') claim
      where claim.value ->> 'claimKey' = member.value
    )
  )
  then
    raise exception 'Research evidence integrity check failed' using errcode = '23514';
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = target_organization_id
    and scope = 'research_evidence'
    and idempotency_key = payload ->> 'idempotencyKey';

  if found then
    if idempotency_record.request_hash <> request_hash_value then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'researchRunId')::uuid,
        (idempotency_record.response_body ->> 'generationRunId')::uuid,
        true,
        (idempotency_record.response_body ->> 'readyForWriting')::boolean,
        (idempotency_record.response_body ->> 'sourceCount')::integer,
        (idempotency_record.response_body ->> 'claimCount')::integer;
      return;
    end if;
  else
    insert into private.idempotency_keys (
      organization_id,
      scope,
      idempotency_key,
      request_hash,
      expires_at
    ) values (
      target_organization_id,
      'research_evidence',
      payload ->> 'idempotencyKey',
      request_hash_value,
      now() + interval '24 hours'
    );
  end if;

  select generation_runs.id
  into run_id
  from public.generation_runs
  where generation_runs.id = requested_run_id
    and generation_runs.organization_id = target_organization_id
    and generation_runs.brand_id = target_brand_id
    and generation_runs.entity_id = target_opportunity_id
    and generation_runs.run_type = 'research'
    and generation_runs.idempotency_key = payload ->> 'idempotencyKey'
    and generation_runs.status in ('running', 'succeeded')
  for update;
  if run_id is null then
    raise exception 'Research budget reservation not found' using errcode = '23503';
  end if;

  update public.generation_runs
  set status = 'succeeded',
      completed_at = now(),
      model_usage = coalesce(payload -> 'usage', '{}'::jsonb)
  where id = run_id;

  insert into public.research_runs (
    organization_id,
    opportunity_id,
    generation_run_id,
    research_plan,
    evidence_package,
    status,
    started_at,
    completed_at,
    cost_metadata,
    model,
    prompt_version,
    provider_response_id,
    provider_usage,
    ready_for_writing
  ) values (
    target_organization_id,
    target_opportunity_id,
    run_id,
    plan,
    package,
    'succeeded',
    now(),
    now(),
    jsonb_build_object(
      'estimatedCostUsd',
      coalesce((payload -> 'usage' ->> 'estimatedCostUsd')::numeric, 0)
    ),
    payload ->> 'model',
    payload ->> 'promptVersion',
    payload ->> 'responseId',
    coalesce(payload -> 'usage', '{}'::jsonb),
    is_ready
  )
  returning id into research_id;

  insert into public.research_sources (
    research_run_id,
    source_key,
    url,
    title,
    publisher,
    published_at,
    source_type,
    authority_score,
    relevant_excerpt,
    retrieved_at
  )
  select
    research_id,
    source.value ->> 'sourceKey',
    source.value ->> 'url',
    source.value ->> 'title',
    source.value ->> 'publisher',
    nullif(source.value ->> 'publishedAt', '')::timestamptz,
    source.value ->> 'sourceType',
    (source.value ->> 'authorityScore')::numeric,
    source.value ->> 'relevantExcerpt',
    (source.value ->> 'retrievedAt')::timestamptz
  from jsonb_array_elements(package -> 'sources') source;

  insert into public.claims (
    research_run_id,
    claim_key,
    claim_text,
    claim_type,
    verification_state,
    verification_detail,
    confidence,
    risk_level,
    importance,
    usage_guidance,
    caveat
  )
  select
    research_id,
    claim.value ->> 'claimKey',
    claim.value ->> 'text',
    claim.value ->> 'claimType',
    case claim.value ->> 'verificationState'
      when 'verified' then 'verified'::public.claim_verification_state
      when 'partially_supported' then 'partially_verified'::public.claim_verification_state
      when 'disputed' then 'conflicting'::public.claim_verification_state
      when 'opinion' then 'not_applicable'::public.claim_verification_state
      else 'unverified'::public.claim_verification_state
    end,
    claim.value ->> 'verificationState',
    (claim.value ->> 'confidence')::numeric,
    claim.value ->> 'riskLevel',
    claim.value ->> 'importance',
    claim.value ->> 'usageGuidance',
    nullif(claim.value ->> 'caveat', '')
  from jsonb_array_elements(package -> 'claims') claim;

  insert into public.claim_sources (
    claim_id,
    research_source_id,
    support_type,
    excerpt,
    locator
  )
  select
    claims.id,
    research_sources.id,
    evidence.value ->> 'supportType',
    evidence.value ->> 'excerpt',
    nullif(evidence.value ->> 'locator', '')
  from jsonb_array_elements(package -> 'claims') claim
  join public.claims
    on claims.research_run_id = research_id
   and claims.claim_key = claim.value ->> 'claimKey'
  cross join jsonb_array_elements(coalesce(claim.value -> 'evidence', '[]'::jsonb)) evidence
  join public.research_sources
    on research_sources.research_run_id = research_id
   and research_sources.source_key = evidence.value ->> 'sourceKey';

  insert into public.claim_conflicts (
    research_run_id,
    conflict_key,
    description,
    resolution,
    material
  )
  select
    research_id,
    conflict.value ->> 'conflictKey',
    conflict.value ->> 'description',
    conflict.value ->> 'resolution',
    (conflict.value ->> 'material')::boolean
  from jsonb_array_elements(package -> 'conflicts') conflict;

  insert into public.claim_conflict_members (claim_conflict_id, claim_id)
  select claim_conflicts.id, claims.id
  from jsonb_array_elements(package -> 'conflicts') conflict
  join public.claim_conflicts
    on claim_conflicts.research_run_id = research_id
   and claim_conflicts.conflict_key = conflict.value ->> 'conflictKey'
  cross join jsonb_array_elements_text(conflict.value -> 'claimKeys') member
  join public.claims
    on claims.research_run_id = research_id
   and claims.claim_key = member.value;

  select count(*)::integer into sources_total
  from public.research_sources counted_source
  where counted_source.research_run_id = research_id;
  select count(*)::integer into claims_total
  from public.claims counted_claim
  where counted_claim.research_run_id = research_id;

  update public.opportunities
  set status = case when is_ready then 'ready_to_generate' else 'research_pending' end
  where id = target_opportunity_id;

  insert into public.pipeline_events (
    organization_id,
    brand_id,
    generation_run_id,
    entity_type,
    entity_id,
    event_type,
    from_status,
    to_status,
    correlation_id,
    actor_id,
    metadata
  ) values (
    target_organization_id,
    target_brand_id,
    run_id,
    'opportunity',
    target_opportunity_id,
    'research.evidence_persisted',
    'researching',
    case when is_ready then 'ready_to_generate' else 'research_pending' end,
    correlation,
    actor_id,
    jsonb_build_object(
      'researchRunId', research_id,
      'sourceCount', sources_total,
      'claimCount', claims_total,
      'readyForWriting', is_ready
    )
  );

  insert into public.audit_logs (
    organization_id,
    brand_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  ) values (
    target_organization_id,
    target_brand_id,
    actor_id,
    'research.persist',
    'research_run',
    research_id,
    jsonb_build_object(
      'opportunityId', target_opportunity_id,
      'model', payload ->> 'model',
      'promptVersion', payload ->> 'promptVersion',
      'responseId', payload ->> 'responseId'
    )
  );

  update private.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'researchRunId', research_id,
        'generationRunId', run_id,
        'readyForWriting', is_ready,
        'sourceCount', sources_total,
        'claimCount', claims_total
      )
  where organization_id = target_organization_id
    and scope = 'research_evidence'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select
    research_id,
    run_id,
    false,
    is_ready,
    sources_total,
    claims_total;
end;
$$;

create or replace function public.persist_research_evidence(payload jsonb)
returns table (
  research_run_id uuid,
  generation_run_id uuid,
  duplicate boolean,
  ready_for_writing boolean,
  source_count integer,
  claim_count integer
)
language sql
set search_path = ''
as $$
  select * from private.persist_research_evidence(payload);
$$;

create or replace function public.reserve_research_budget(payload jsonb)
returns table (
  generation_run_id uuid,
  duplicate boolean,
  reserved_cost_usd numeric,
  spent_today_usd numeric,
  daily_budget_usd numeric
)
language sql
set search_path = ''
as $$
  select * from private.reserve_research_budget(payload);
$$;

create or replace function private.fail_research_run(payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := nullif(payload ->> 'actorId', '')::uuid;
  requested_run_id uuid := nullif(payload ->> 'generationRunId', '')::uuid;
  target_organization_id uuid;
  target_brand_id uuid;
  target_opportunity_id uuid;
  target_correlation_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if actor_id is null
    or requested_run_id is null
    or char_length(coalesce(payload ->> 'errorCode', '')) not between 1 and 120
    or char_length(coalesce(payload ->> 'message', '')) not between 1 and 1000
  then
    raise exception 'Invalid research failure payload' using errcode = '22023';
  end if;

  select
    generation_runs.organization_id,
    generation_runs.brand_id,
    generation_runs.entity_id,
    generation_runs.correlation_id
  into
    target_organization_id,
    target_brand_id,
    target_opportunity_id,
    target_correlation_id
  from public.generation_runs
  where generation_runs.id = requested_run_id
    and generation_runs.run_type = 'research'
  for update;

  if target_organization_id is null
    or not exists (
      select 1
      from public.organization_members organization_member
      left join public.brand_members brand_member
        on brand_member.brand_id = target_brand_id
       and brand_member.user_id = actor_id
      where organization_member.organization_id = target_organization_id
        and organization_member.user_id = actor_id
        and (
          organization_member.role = 'administrator'
          or brand_member.role in ('administrator', 'editor', 'reviewer')
        )
    )
  then
    raise exception 'Brand reviewer permission required' using errcode = '42501';
  end if;

  if exists (
    select 1 from public.generation_runs
    where id = requested_run_id and status = 'failed'
  ) then
    return true;
  end if;

  update public.generation_runs
  set status = 'failed',
      completed_at = now(),
      error = jsonb_build_object(
        'code', payload ->> 'errorCode',
        'message', payload ->> 'message',
        'retryable', coalesce((payload ->> 'retryable')::boolean, false),
        'model', payload ->> 'model',
        'promptVersion', payload ->> 'promptVersion',
        'responseId', payload ->> 'responseId'
      ),
      model_usage = case
        when jsonb_typeof(payload -> 'usage') = 'object' then payload -> 'usage'
        else model_usage - 'reservedCostUsd'
      end
  where id = requested_run_id
    and status in ('queued', 'running');

  update public.opportunities
  set status = 'research_pending'
  where id = target_opportunity_id
    and status = 'researching';

  insert into public.pipeline_events (
    organization_id,
    brand_id,
    generation_run_id,
    entity_type,
    entity_id,
    event_type,
    from_status,
    to_status,
    correlation_id,
    actor_id,
    metadata
  ) values (
    target_organization_id,
    target_brand_id,
    requested_run_id,
    'opportunity',
    target_opportunity_id,
    'research.failed',
    'researching',
    'research_pending',
    target_correlation_id,
    actor_id,
    jsonb_build_object(
      'code', payload ->> 'errorCode',
      'retryable', coalesce((payload ->> 'retryable')::boolean, false)
    )
  );
  return true;
end;
$$;

create or replace function public.fail_research_run(payload jsonb)
returns boolean
language sql
set search_path = ''
as $$
  select private.fail_research_run(payload);
$$;

revoke all on function private.reserve_research_budget(jsonb) from public;
revoke all on function public.reserve_research_budget(jsonb) from public;
revoke all on function private.fail_research_run(jsonb) from public;
revoke all on function public.fail_research_run(jsonb) from public;
revoke all on function private.persist_research_evidence(jsonb) from public;
revoke all on function public.persist_research_evidence(jsonb) from public;
grant execute on function private.reserve_research_budget(jsonb) to service_role;
grant execute on function public.reserve_research_budget(jsonb) to service_role;
grant execute on function private.fail_research_run(jsonb) to service_role;
grant execute on function public.fail_research_run(jsonb) to service_role;
grant execute on function private.persist_research_evidence(jsonb) to service_role;
grant execute on function public.persist_research_evidence(jsonb) to service_role;

revoke all on public.claim_conflicts, public.claim_conflict_members
from anon, authenticated;
grant select on public.claim_conflicts, public.claim_conflict_members to authenticated;
grant select, insert, update, delete
on public.claim_conflicts, public.claim_conflict_members to service_role;
