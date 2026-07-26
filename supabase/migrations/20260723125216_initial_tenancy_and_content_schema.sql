create extension if not exists pgcrypto with schema extensions;
create extension if not exists vector with schema extensions;

create schema if not exists private;
revoke all on schema private from public;

create type public.organization_role as enum (
  'administrator',
  'editor',
  'reviewer',
  'viewer'
);
create type public.record_status as enum ('active', 'archived');
create type public.source_type as enum (
  'rss',
  'url',
  'pdf',
  'transcript',
  'social_content',
  'plain_text'
);
create type public.source_status as enum (
  'received',
  'extracting',
  'normalized',
  'clustered',
  'analyzed',
  'completed',
  'extraction_failed',
  'unsupported',
  'duplicate',
  'rejected'
);
create type public.opportunity_status as enum (
  'candidate',
  'research_pending',
  'researching',
  'ready_to_generate',
  'dismissed',
  'archived'
);
create type public.run_status as enum (
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled'
);
create type public.claim_verification_state as enum (
  'verified',
  'partially_verified',
  'unverified',
  'conflicting',
  'not_applicable'
);
create type public.content_style as enum (
  'newsworthy_authority',
  'educational_breakdown',
  'perspective_conversation'
);
create type public.post_status as enum (
  'drafting',
  'evaluating',
  'verifying',
  'image_pending',
  'ready_for_review',
  'changes_requested',
  'approved',
  'rejected'
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_members (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create table public.brands (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  description text,
  website text,
  default_language text not null default 'en',
  default_platform text not null default 'facebook' check (default_platform = 'facebook'),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, slug),
  unique (id, organization_id)
);

create table public.brand_members (
  brand_id uuid not null references public.brands(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  primary key (brand_id, user_id)
);

create table public.brand_profiles (
  brand_id uuid primary key references public.brands(id) on delete cascade,
  audience_definition text,
  positioning text,
  content_pillars text[] not null default '{}',
  restricted_topics text[] not null default '{}',
  cta_preferences text[] not null default '{}',
  geographic_focus text[] not null default '{}',
  risk_tolerance text not null default 'medium' check (risk_tolerance in ('low', 'medium', 'high')),
  voice_settings jsonb not null default '{}'::jsonb,
  generation_defaults jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.brand_examples (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  example_type text not null check (example_type in ('positive', 'negative', 'high_performing')),
  content text not null,
  performance_notes text,
  embedding extensions.vector(1536),
  approved boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.brand_assets (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.brands(id) on delete cascade,
  asset_type text not null check (asset_type in ('logo', 'font', 'image', 'template', 'other')),
  storage_path text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (brand_id, storage_path)
);

create table public.rss_feeds (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  feed_url text not null,
  topic_tags text[] not null default '{}',
  authority_score numeric(5,2) not null default 50 check (authority_score between 0 and 100),
  active boolean not null default true,
  last_polled_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, feed_url),
  unique (id, organization_id)
);

create table public.rss_feed_brand_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rss_feed_id uuid not null,
  brand_id uuid not null,
  generation_policy text not null default 'score_then_research'
    check (generation_policy in ('ingest_only', 'score_then_research')),
  minimum_score numeric(5,2) not null default 72 check (minimum_score between 60 and 100),
  daily_generation_limit integer not null default 3 check (daily_generation_limit between 0 and 100),
  topic_tags text[] not null default '{}',
  include_keywords text[] not null default '{}',
  exclude_keywords text[] not null default '{}',
  created_at timestamptz not null default now(),
  primary key (rss_feed_id, brand_id),
  foreign key (rss_feed_id, organization_id)
    references public.rss_feeds(id, organization_id) on delete cascade,
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade
);
create index rss_feed_brand_links_brand_idx
  on public.rss_feed_brand_links (brand_id, rss_feed_id);

create table public.rss_feed_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  rss_feed_id uuid not null,
  guid text not null,
  canonical_url text,
  title text not null,
  author text,
  published_at timestamptz,
  content_hash text not null check (content_hash ~ '^[0-9a-f]{64}$'),
  source_document_id uuid,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  foreign key (rss_feed_id, organization_id)
    references public.rss_feeds(id, organization_id) on delete cascade,
  unique (rss_feed_id, guid),
  unique (rss_feed_id, content_hash)
);
create index rss_feed_items_feed_seen_idx
  on public.rss_feed_items (rss_feed_id, first_seen_at desc);

create table public.source_documents (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_type public.source_type not null,
  canonical_url text,
  title text,
  author text,
  publisher text,
  published_at timestamptz,
  raw_text text,
  clean_text text,
  language text,
  content_hash text,
  embedding extensions.vector(1536),
  storage_path text,
  extraction_confidence numeric(5,4) check (extraction_confidence between 0 and 1),
  status public.source_status not null default 'received',
  status_reason text,
  metadata jsonb not null default '{}'::jsonb,
  submitted_by uuid references auth.users(id) on delete set null,
  duplicate_of_source_id uuid references public.source_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);
create unique index source_documents_org_hash_unique
  on public.source_documents (organization_id, content_hash)
  where content_hash is not null;
create unique index source_documents_org_canonical_url_unique
  on public.source_documents (organization_id, canonical_url)
  where canonical_url is not null and source_type in ('rss', 'url');
create index source_documents_org_status_created_idx
  on public.source_documents (organization_id, status, created_at desc);
alter table public.rss_feed_items
  add constraint rss_feed_items_source_document_fk
  foreign key (source_document_id, organization_id)
  references public.source_documents(id, organization_id) on delete restrict;

create table public.source_brand_links (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_document_id uuid not null,
  brand_id uuid not null,
  relevance_score numeric(5,2) check (relevance_score between 0 and 100),
  routing_reason text,
  created_at timestamptz not null default now(),
  primary key (source_document_id, brand_id),
  foreign key (source_document_id, organization_id)
    references public.source_documents(id, organization_id) on delete cascade,
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade
);
create index source_brand_links_brand_idx
  on public.source_brand_links (brand_id, source_document_id);

create table public.source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_document_id uuid not null references public.source_documents(id) on delete cascade,
  chunk_index integer not null check (chunk_index >= 0),
  page_number integer check (page_number > 0),
  section text,
  content text not null,
  embedding extensions.vector(1536),
  token_count integer check (token_count >= 0),
  created_at timestamptz not null default now(),
  unique (source_document_id, chunk_index)
);

create table public.content_clusters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cluster_key text not null,
  cluster_type text not null default 'event',
  canonical_topic text not null,
  event_date date,
  embedding extensions.vector(1536),
  status public.record_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (organization_id, cluster_key)
);

create table public.cluster_sources (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  cluster_id uuid not null,
  source_document_id uuid not null,
  relationship_type text not null default 'primary'
    check (relationship_type in ('primary', 'corroborating', 'duplicate', 'related')),
  similarity numeric(6,5) check (similarity between 0 and 1),
  created_at timestamptz not null default now(),
  primary key (cluster_id, source_document_id),
  foreign key (cluster_id, organization_id)
    references public.content_clusters(id, organization_id) on delete cascade,
  foreign key (source_document_id, organization_id)
    references public.source_documents(id, organization_id) on delete cascade
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  source_document_id uuid,
  cluster_id uuid,
  value_nucleus text not null,
  recommended_style public.content_style,
  opportunity_score numeric(5,2) not null check (opportunity_score between 0 and 100),
  risk_penalty numeric(5,2) not null default 0 check (risk_penalty between 0 and 100),
  score_breakdown jsonb not null,
  status public.opportunity_status not null default 'candidate',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  unique (id, brand_id, organization_id),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade,
  foreign key (source_document_id, organization_id)
    references public.source_documents(id, organization_id) on delete restrict,
  foreign key (cluster_id, organization_id)
    references public.content_clusters(id, organization_id) on delete restrict
);
create index opportunities_brand_status_score_idx
  on public.opportunities (brand_id, status, opportunity_score desc);
create unique index opportunities_brand_source_unique
  on public.opportunities (brand_id, source_document_id)
  where source_document_id is not null;

create table public.research_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null,
  research_plan jsonb not null default '{}'::jsonb,
  status public.run_status not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  cost_metadata jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  foreign key (opportunity_id, organization_id)
    references public.opportunities(id, organization_id) on delete cascade
);

create table public.research_sources (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  url text not null,
  title text,
  publisher text,
  published_at timestamptz,
  source_type text not null,
  authority_score numeric(5,2) check (authority_score between 0 and 100),
  relevant_excerpt text,
  retrieved_at timestamptz not null default now()
);

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  research_run_id uuid not null references public.research_runs(id) on delete cascade,
  claim_text text not null,
  claim_type text not null,
  verification_state public.claim_verification_state not null default 'unverified',
  confidence numeric(5,4) not null default 0 check (confidence between 0 and 1),
  risk_level text not null default 'medium' check (risk_level in ('low', 'medium', 'high')),
  created_at timestamptz not null default now()
);

create table public.claim_sources (
  claim_id uuid not null references public.claims(id) on delete cascade,
  research_source_id uuid not null references public.research_sources(id) on delete cascade,
  support_type text not null check (support_type in ('supports', 'contradicts', 'context')),
  primary key (claim_id, research_source_id)
);

create table public.angles (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  title text not null,
  thesis text not null,
  content_style public.content_style not null,
  intended_reaction text,
  supporting_claim_ids uuid[] not null default '{}',
  score numeric(5,2) check (score between 0 and 100),
  selected boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.post_drafts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  opportunity_id uuid not null,
  angle_id uuid references public.angles(id) on delete set null,
  platform text not null default 'facebook' check (platform = 'facebook'),
  content_style public.content_style not null,
  tone text not null,
  status public.post_status not null default 'drafting',
  current_version_id uuid,
  quality_score numeric(5,2) check (quality_score between 0 and 100),
  score_breakdown jsonb not null default '{}'::jsonb,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade,
  foreign key (opportunity_id, brand_id, organization_id)
    references public.opportunities(id, brand_id, organization_id) on delete cascade
);

create table public.post_versions (
  id uuid primary key default gen_random_uuid(),
  post_draft_id uuid not null references public.post_drafts(id) on delete cascade,
  version_number integer not null check (version_number > 0),
  hook text not null,
  body text not null,
  closing text,
  full_text text not null,
  generation_type text not null check (generation_type in ('initial', 'manual_edit', 'selective_regeneration')),
  model text,
  prompt_version text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (post_draft_id, version_number)
);
create unique index post_drafts_opportunity_style_tone_unique
  on public.post_drafts (opportunity_id, content_style, tone);
alter table public.post_drafts
  add constraint post_drafts_current_version_fk
  foreign key (current_version_id) references public.post_versions(id) on delete set null;

create table public.post_claims (
  post_version_id uuid not null references public.post_versions(id) on delete cascade,
  claim_id uuid not null references public.claims(id) on delete cascade,
  sentence_text text not null,
  primary key (post_version_id, claim_id, sentence_text)
);

create table public.image_assets (
  id uuid primary key default gen_random_uuid(),
  post_draft_id uuid not null references public.post_drafts(id) on delete cascade,
  image_style text not null,
  concept text not null,
  prompt text,
  base_image_path text,
  final_image_path text,
  dimensions jsonb not null default '{"width": 1200, "height": 630}'::jsonb,
  status public.run_status not null default 'queued',
  model text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.generation_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid,
  run_type text not null,
  entity_type text not null,
  entity_id uuid not null,
  workflow_name text not null,
  workflow_execution_id text,
  correlation_id uuid not null default gen_random_uuid(),
  idempotency_key text not null,
  attempt integer not null default 1 check (attempt > 0),
  status public.run_status not null default 'queued',
  started_at timestamptz,
  completed_at timestamptz,
  model_usage jsonb not null default '{}'::jsonb,
  error jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, workflow_name, idempotency_key, attempt),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade
);
create index generation_runs_status_created_idx
  on public.generation_runs (status, created_at);

create table public.pipeline_events (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid,
  generation_run_id uuid references public.generation_runs(id) on delete set null,
  entity_type text not null,
  entity_id uuid not null,
  event_type text not null,
  from_status text,
  to_status text,
  correlation_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade
);
create index pipeline_events_entity_created_idx
  on public.pipeline_events (entity_type, entity_id, created_at);
create index pipeline_events_org_created_idx
  on public.pipeline_events (organization_id, created_at desc);

create table private.idempotency_keys (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  scope text not null,
  idempotency_key text not null,
  request_hash text not null,
  response_status integer,
  response_body jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  primary key (organization_id, scope, idempotency_key)
);
create index idempotency_keys_expiry_idx on private.idempotency_keys (expires_at);

create table private.workflow_nonces (
  nonce text primary key,
  workflow_name text not null,
  request_digest text not null,
  received_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index workflow_nonces_expiry_idx on private.workflow_nonces (expires_at);

create or replace function private.consume_workflow_nonce(
  requested_nonce text,
  requested_workflow_name text,
  requested_digest text,
  requested_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  inserted_count integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'Workflow nonce access requires a service request';
  end if;

  if requested_expires_at <= now() then
    return false;
  end if;

  delete from private.workflow_nonces
  where expires_at < now() - interval '1 hour';

  insert into private.workflow_nonces (
    nonce,
    workflow_name,
    request_digest,
    expires_at
  )
  values (
    requested_nonce,
    requested_workflow_name,
    requested_digest,
    requested_expires_at
  )
  on conflict (nonce) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

create or replace function private.ingest_rss_item(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  feed_record public.rss_feeds%rowtype;
  item_id uuid;
  source_id uuid;
  run_id uuid;
  item_was_duplicate boolean := false;
  source_was_duplicate boolean := false;
  canonical_url_value text := nullif(payload ->> 'canonicalUrl', '');
  published_at_value timestamptz := nullif(payload ->> 'publishedAt', '')::timestamptz;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception using
      errcode = '42501',
      message = 'RSS intake requires a service request';
  end if;

  select *
  into feed_record
  from public.rss_feeds
  where id = (payload ->> 'feedId')::uuid
    and active
  for update;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Active RSS feed not found';
  end if;

  insert into public.rss_feed_items (
    organization_id,
    rss_feed_id,
    guid,
    canonical_url,
    title,
    author,
    published_at,
    content_hash
  )
  values (
    feed_record.organization_id,
    feed_record.id,
    payload ->> 'guid',
    canonical_url_value,
    payload ->> 'title',
    nullif(payload ->> 'author', ''),
    published_at_value,
    payload ->> 'contentHash'
  )
  on conflict do nothing
  returning id into item_id;

  if item_id is null then
    item_was_duplicate := true;
    select id, source_document_id
    into item_id, source_id
    from public.rss_feed_items
    where rss_feed_id = feed_record.id
      and (
        guid = payload ->> 'guid'
        or content_hash = payload ->> 'contentHash'
      )
    order by first_seen_at
    limit 1;

    update public.rss_feed_items
    set last_seen_at = now()
    where id = item_id;
  end if;

  if source_id is null then
    insert into public.source_documents (
      organization_id,
      source_type,
      canonical_url,
      title,
      author,
      publisher,
      published_at,
      raw_text,
      content_hash,
      status,
      metadata
    )
    values (
      feed_record.organization_id,
      'rss',
      canonical_url_value,
      payload ->> 'title',
      nullif(payload ->> 'author', ''),
      feed_record.name,
      published_at_value,
      nullif(payload ->> 'summary', ''),
      payload ->> 'contentHash',
      'received',
      jsonb_build_object(
        'rssFeedId', feed_record.id,
        'rssGuid', payload ->> 'guid',
        'contractVersion', payload ->> 'contractVersion'
      )
    )
    on conflict do nothing
    returning id into source_id;

    if source_id is null then
      source_was_duplicate := true;
      select id
      into source_id
      from public.source_documents
      where organization_id = feed_record.organization_id
        and (
          content_hash = payload ->> 'contentHash'
          or (
            canonical_url_value is not null
            and canonical_url = canonical_url_value
          )
        )
      order by created_at
      limit 1;
    end if;

    update public.rss_feed_items
    set source_document_id = source_id
    where id = item_id;
  end if;

  insert into public.source_brand_links (
    organization_id,
    source_document_id,
    brand_id,
    routing_reason
  )
  select
    feed_record.organization_id,
    source_id,
    link.brand_id,
    'RSS feed routing'
  from public.rss_feed_brand_links link
  where link.rss_feed_id = feed_record.id
    and (
      cardinality(link.include_keywords) = 0
      or exists (
        select 1
        from unnest(link.include_keywords) keyword
        where lower(concat_ws(' ', payload ->> 'title', payload ->> 'summary'))
          like '%' || lower(keyword) || '%'
      )
    )
    and not exists (
      select 1
      from unnest(link.exclude_keywords) keyword
      where lower(concat_ws(' ', payload ->> 'title', payload ->> 'summary'))
        like '%' || lower(keyword) || '%'
    )
  on conflict (source_document_id, brand_id) do nothing;

  insert into public.generation_runs (
    organization_id,
    run_type,
    entity_type,
    entity_id,
    workflow_name,
    status,
    correlation_id,
    idempotency_key,
    started_at,
    completed_at
  )
  values (
    feed_record.organization_id,
    'rss_intake',
    'source_document',
    source_id,
    'WF-01 RSS Intake',
    'succeeded',
    (payload ->> 'correlationId')::uuid,
    payload ->> 'idempotencyKey',
    now(),
    now()
  )
  on conflict (organization_id, workflow_name, idempotency_key, attempt)
  do update set completed_at = excluded.completed_at
  returning id into run_id;

  if not item_was_duplicate then
    insert into public.pipeline_events (
      organization_id,
      generation_run_id,
      entity_type,
      entity_id,
      event_type,
      to_status,
      correlation_id,
      metadata
    )
    values (
      feed_record.organization_id,
      run_id,
      'source_document',
      source_id,
      'rss_item_received',
      'received',
      (payload ->> 'correlationId')::uuid,
      jsonb_build_object(
        'rssFeedId', feed_record.id,
        'rssItemId', item_id,
        'sourceWasDuplicate', source_was_duplicate
      )
    );
  end if;

  return jsonb_build_object(
    'rssItemId', item_id,
    'feedId', feed_record.id,
    'sourceDocumentId', source_id,
    'generationRunId', run_id,
    'duplicate', item_was_duplicate or source_was_duplicate,
    'status', 'received'
  );
end;
$$;

create or replace function public.consume_workflow_nonce(
  requested_nonce text,
  requested_workflow_name text,
  requested_digest text,
  requested_expires_at timestamptz
)
returns boolean
language sql
set search_path = ''
as $$
  select private.consume_workflow_nonce(
    requested_nonce,
    requested_workflow_name,
    requested_digest,
    requested_expires_at
  );
$$;

create or replace function public.ingest_rss_item(payload jsonb)
returns jsonb
language sql
set search_path = ''
as $$
  select private.ingest_rss_item(payload);
$$;

revoke all on function private.consume_workflow_nonce(text, text, text, timestamptz) from public;
revoke all on function private.ingest_rss_item(jsonb) from public;
revoke all on function public.consume_workflow_nonce(text, text, text, timestamptz) from public;
revoke all on function public.ingest_rss_item(jsonb) from public;
grant usage on schema private to service_role;
grant execute on function private.consume_workflow_nonce(text, text, text, timestamptz)
  to service_role;
grant execute on function private.ingest_rss_item(jsonb) to service_role;
grant execute on function public.consume_workflow_nonce(text, text, text, timestamptz)
  to service_role;
grant execute on function public.ingest_rss_item(jsonb) to service_role;

create table public.evaluation_scores (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid,
  entity_type text not null,
  entity_id uuid not null,
  evaluator text not null,
  score_type text not null,
  score numeric(5,2) not null check (score between 0 and 100),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade
);

create table public.feedback_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  post_draft_id uuid references public.post_drafts(id) on delete set null,
  event_type text not null,
  reason text,
  user_id uuid references auth.users(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete restrict
);
create index audit_logs_org_created_idx
  on public.audit_logs (organization_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function public.set_updated_at() from public;

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
create trigger brands_set_updated_at before update on public.brands
for each row execute function public.set_updated_at();
create trigger brand_profiles_set_updated_at before update on public.brand_profiles
for each row execute function public.set_updated_at();
create trigger rss_feeds_set_updated_at before update on public.rss_feeds
for each row execute function public.set_updated_at();
create trigger source_documents_set_updated_at before update on public.source_documents
for each row execute function public.set_updated_at();
create trigger content_clusters_set_updated_at before update on public.content_clusters
for each row execute function public.set_updated_at();
create trigger opportunities_set_updated_at before update on public.opportunities
for each row execute function public.set_updated_at();
create trigger post_drafts_set_updated_at before update on public.post_drafts
for each row execute function public.set_updated_at();

create or replace function private.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = (select auth.uid())
  );
$$;

create or replace function private.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = (select auth.uid())
      and member.role = 'administrator'
  );
$$;

create or replace function private.can_contribute_to_organization(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.organization_members member
    where member.organization_id = target_organization_id
      and member.user_id = (select auth.uid())
      and member.role in ('administrator', 'editor')
  )
  or exists (
    select 1
    from public.brand_members brand_member
    join public.brands brand on brand.id = brand_member.brand_id
    where brand.organization_id = target_organization_id
      and brand_member.user_id = (select auth.uid())
      and brand_member.role in ('administrator', 'editor')
  );
$$;

create or replace function private.can_read_brand(target_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.brands brand
    join public.organization_members organization_member
      on organization_member.organization_id = brand.organization_id
     and organization_member.user_id = (select auth.uid())
    left join public.brand_members brand_member
      on brand_member.brand_id = brand.id
     and brand_member.user_id = (select auth.uid())
    where brand.id = target_brand_id
      and (
        organization_member.role = 'administrator'
        or brand_member.user_id is not null
      )
  );
$$;

create or replace function private.can_edit_brand(target_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.brands brand
    join public.organization_members organization_member
      on organization_member.organization_id = brand.organization_id
     and organization_member.user_id = (select auth.uid())
    left join public.brand_members brand_member
      on brand_member.brand_id = brand.id
     and brand_member.user_id = (select auth.uid())
    where brand.id = target_brand_id
      and (
        organization_member.role = 'administrator'
        or brand_member.role in ('administrator', 'editor')
      )
  );
$$;

create or replace function public.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.is_organization_member(target_organization_id);
$$;

create or replace function public.can_manage_organization(target_organization_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.can_manage_organization(target_organization_id);
$$;

create or replace function public.can_contribute_to_organization(target_organization_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.can_contribute_to_organization(target_organization_id);
$$;

create or replace function public.can_read_brand(target_brand_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.can_read_brand(target_brand_id);
$$;

create or replace function public.can_edit_brand(target_brand_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.can_edit_brand(target_brand_id);
$$;

create or replace function private.ingest_manual_input(payload jsonb)
returns table (
  source_document_id uuid,
  opportunity_id uuid,
  generation_run_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  actor_id uuid := (payload ->> 'actorId')::uuid;
  target_brand_id uuid := (payload ->> 'brandId')::uuid;
  requested_source_id uuid := nullif(payload ->> 'sourceDocumentId', '')::uuid;
  target_organization_id uuid;
  source_id uuid;
  opportunity_record_id uuid;
  run_id uuid;
  correlation uuid := gen_random_uuid();
  was_duplicate boolean := false;
  idempotency_record private.idempotency_keys%rowtype;
  request_hash_value text := payload ->> 'requestHash';
  score_value numeric := (payload ->> 'score')::numeric;
  risk_penalty_value numeric := (payload ->> 'riskPenalty')::numeric;
  duplicate_of_id uuid := nullif(payload ->> 'duplicateOfSourceId', '')::uuid;
  cluster_record_id uuid;
  near_duplicate boolean := false;
  source_was_staged boolean := false;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if coalesce(payload ->> 'sourceType', '') not in (
      'plain_text',
      'rss',
      'url',
      'pdf',
      'transcript',
      'social_content'
    )
    or coalesce(payload ->> 'contentHash', '') !~ '^[0-9a-f]{64}$'
    or char_length(coalesce(payload ->> 'title', '')) not between 1 and 1000
    or char_length(coalesce(payload ->> 'cleanText', '')) not between 20 and 500000
    or score_value not between 0 and 100
    or risk_penalty_value not between 0 and 30
    or jsonb_typeof(coalesce(payload -> 'namedEntities', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(payload -> 'namedEntities', '[]'::jsonb)) > 20
    or jsonb_typeof(coalesce(payload -> 'topicTags', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(payload -> 'topicTags', '[]'::jsonb)) > 8
    or coalesce(payload ->> 'recommendedStyle', '') not in (
      'newsworthy_authority',
      'educational_breakdown',
      'perspective_conversation'
    )
  then
    raise exception 'Invalid manual input payload' using errcode = '22023';
  end if;
  if nullif(payload ->> 'clusterKey', '') is not null
    and payload ->> 'clusterKey' !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid deterministic cluster key' using errcode = '22023';
  end if;
  if (
      nullif(payload ->> 'duplicateSimilarity', '') is not null
      and (payload ->> 'duplicateSimilarity')::numeric not between 0 and 1
    )
    or (
      jsonb_array_length(coalesce(payload -> 'clusterSources', '[]'::jsonb)) > 0
      and nullif(payload ->> 'clusterKey', '') is null
    )
    or exists (
      select 1
      from jsonb_array_elements(coalesce(payload -> 'clusterSources', '[]'::jsonb)) item
      where coalesce(item.value ->> 'sourceDocumentId', '')
        !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        or nullif(item.value ->> 'similarity', '') is null
        or (item.value ->> 'similarity')::numeric not between 0 and 1
        or coalesce(item.value ->> 'relationshipType', '') not in (
          'primary',
          'corroborating',
          'duplicate',
          'related'
        )
    )
  then
    raise exception 'Invalid source similarity payload' using errcode = '22023';
  end if;

  select brands.organization_id
  into target_organization_id
  from public.brands
  where brands.id = target_brand_id;

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
          or brand_member.role in ('administrator', 'editor')
        )
    )
  then
    raise exception 'Brand editor permission required' using errcode = '42501';
  end if;

  if duplicate_of_id is not null and not exists (
    select 1
    from public.source_documents duplicate_source
    where duplicate_source.id = duplicate_of_id
      and duplicate_source.organization_id = target_organization_id
  )
  then
    raise exception 'Duplicate source is outside the target organization'
      using errcode = '42501';
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = target_organization_id
    and scope = 'manual_input'
    and idempotency_key = payload ->> 'idempotencyKey';

  if found then
    if idempotency_record.request_hash <> request_hash_value then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'sourceDocumentId')::uuid,
        (idempotency_record.response_body ->> 'opportunityId')::uuid,
        (idempotency_record.response_body ->> 'generationRunId')::uuid,
        (idempotency_record.response_body ->> 'duplicate')::boolean;
      return;
    end if;
  else
    insert into private.idempotency_keys (
      organization_id,
      scope,
      idempotency_key,
      request_hash,
      expires_at
    )
    values (
      target_organization_id,
      'manual_input',
      payload ->> 'idempotencyKey',
      request_hash_value,
      now() + interval '24 hours'
    );
  end if;

  if requested_source_id is not null then
    select documents.id
    into source_id
    from public.source_documents documents
    where documents.id = requested_source_id
      and documents.organization_id = target_organization_id
      and documents.source_type = (payload ->> 'sourceType')::public.source_type
    for update;
    source_was_staged := found;
    if not source_was_staged then
      raise exception 'Staged source is outside the target organization'
        using errcode = '42501';
    end if;
  else
    select documents.id
    into source_id
    from public.source_documents documents
    where documents.organization_id = target_organization_id
      and (
        documents.content_hash = payload ->> 'contentHash'
        or (
          nullif(payload ->> 'canonicalUrl', '') is not null
          and documents.canonical_url = payload ->> 'canonicalUrl'
          and documents.source_type in ('rss', 'url')
        )
      )
    order by
      case when documents.content_hash = payload ->> 'contentHash' then 0 else 1 end
    limit 1;
  end if;

  if source_id is null then
    insert into public.source_documents (
      organization_id,
      source_type,
      canonical_url,
      title,
      author,
      publisher,
      published_at,
      raw_text,
      clean_text,
      language,
      content_hash,
      storage_path,
      extraction_confidence,
      status,
      metadata,
      submitted_by,
      duplicate_of_source_id
    )
    values (
      target_organization_id,
      (payload ->> 'sourceType')::public.source_type,
      nullif(payload ->> 'canonicalUrl', ''),
      payload ->> 'title',
      nullif(payload ->> 'author', ''),
      nullif(payload ->> 'publisher', ''),
      nullif(payload ->> 'publishedAt', '')::timestamptz,
      payload ->> 'rawText',
      payload ->> 'cleanText',
      payload ->> 'language',
      payload ->> 'contentHash',
      nullif(payload ->> 'storagePath', ''),
      coalesce((payload ->> 'extractionConfidence')::numeric, 1),
      case when duplicate_of_id is null
        then 'analyzed'::public.source_status
        else 'duplicate'::public.source_status
      end,
      jsonb_build_object(
        'rightsNotes', payload ->> 'rightsNotes',
        'originalInput', (payload ->> 'sourceType') = 'plain_text',
        'requiresManualReview', coalesce((payload ->> 'requiresManualReview')::boolean, false),
        'reviewReasons', coalesce(payload -> 'reviewReasons', '[]'::jsonb),
        'contractVersion', payload ->> 'contractVersion',
        'duplicateSimilarity', nullif(payload ->> 'duplicateSimilarity', '')::numeric,
        'namedEntities', coalesce(payload -> 'namedEntities', '[]'::jsonb),
        'topicTags', coalesce(payload -> 'topicTags', '[]'::jsonb),
        'classificationReasons', coalesce(payload -> 'classificationReasons', '[]'::jsonb)
      ),
      actor_id,
      duplicate_of_id
    )
    returning id into source_id;
    near_duplicate := duplicate_of_id is not null;
    was_duplicate := near_duplicate;

    insert into public.source_chunks (
      source_document_id,
      chunk_index,
      page_number,
      section,
      content,
      token_count
    )
    select
      source_id,
      (section.value ->> 'index')::integer,
      nullif(section.value ->> 'pageStart', '')::integer,
      section.value ->> 'label',
      section.value ->> 'text',
      greatest(1, ceil(char_length(section.value ->> 'text') / 4.0)::integer)
    from jsonb_array_elements(coalesce(payload -> 'sections', '[]'::jsonb)) section;
  elsif source_was_staged then
    update public.source_documents
    set title = payload ->> 'title',
        raw_text = payload ->> 'rawText',
        clean_text = payload ->> 'cleanText',
        language = payload ->> 'language',
        content_hash = payload ->> 'contentHash',
        extraction_confidence = coalesce((payload ->> 'extractionConfidence')::numeric, 1),
        status = 'analyzed',
        status_reason = null,
        metadata = metadata || jsonb_build_object(
          'requiresManualReview', coalesce((payload ->> 'requiresManualReview')::boolean, false),
          'reviewReasons', coalesce(payload -> 'reviewReasons', '[]'::jsonb),
          'normalizedContractVersion', payload ->> 'contractVersion',
          'namedEntities', coalesce(payload -> 'namedEntities', '[]'::jsonb),
          'topicTags', coalesce(payload -> 'topicTags', '[]'::jsonb),
          'classificationReasons', coalesce(payload -> 'classificationReasons', '[]'::jsonb)
        ),
        updated_at = now()
    where id = source_id;

    insert into public.source_chunks (
      source_document_id,
      chunk_index,
      page_number,
      section,
      content,
      token_count
    )
    select
      source_id,
      (section.value ->> 'index')::integer,
      nullif(section.value ->> 'pageStart', '')::integer,
      section.value ->> 'label',
      section.value ->> 'text',
      greatest(1, ceil(char_length(section.value ->> 'text') / 4.0)::integer)
    from jsonb_array_elements(coalesce(payload -> 'sections', '[]'::jsonb)) section
    on conflict (source_document_id, chunk_index)
    do update set
      page_number = excluded.page_number,
      section = excluded.section,
      content = excluded.content,
      token_count = excluded.token_count;
  else
    was_duplicate := true;
  end if;

  insert into public.source_brand_links (
    organization_id,
    source_document_id,
    brand_id,
    relevance_score,
    routing_reason
  )
  values (
    target_organization_id,
    source_id,
    target_brand_id,
    ((payload -> 'scoreBreakdown' -> 'dimensions' -> 'audienceRelevance' ->> 'score')::numeric / 16) * 100,
    'Manual submission to selected brand'
  )
  on conflict (source_document_id, brand_id) do nothing;

  if jsonb_array_length(coalesce(payload -> 'clusterSources', '[]'::jsonb)) > 0 then
    insert into public.content_clusters (
      organization_id,
      cluster_key,
      canonical_topic
    )
    values (
      target_organization_id,
      payload ->> 'clusterKey',
      payload ->> 'title'
    )
    on conflict (organization_id, cluster_key)
    do update set updated_at = now()
    returning id into cluster_record_id;

    insert into public.cluster_sources (
      organization_id,
      cluster_id,
      source_document_id,
      relationship_type,
      similarity
    )
    values (
      target_organization_id,
      cluster_record_id,
      source_id,
      case when near_duplicate then 'duplicate' else 'corroborating' end,
      coalesce(nullif(payload ->> 'duplicateSimilarity', '')::numeric, 1)
    )
    on conflict (cluster_id, source_document_id)
    do update set
      relationship_type = excluded.relationship_type,
      similarity = excluded.similarity;

    insert into public.cluster_sources (
      organization_id,
      cluster_id,
      source_document_id,
      relationship_type,
      similarity
    )
    select
      target_organization_id,
      cluster_record_id,
      (cluster_source.value ->> 'sourceDocumentId')::uuid,
      coalesce(cluster_source.value ->> 'relationshipType', 'related'),
      (cluster_source.value ->> 'similarity')::numeric
    from jsonb_array_elements(payload -> 'clusterSources') cluster_source
    join public.source_documents existing_source
      on existing_source.id = (cluster_source.value ->> 'sourceDocumentId')::uuid
     and existing_source.organization_id = target_organization_id
    on conflict (cluster_id, source_document_id)
    do update set
      relationship_type = excluded.relationship_type,
      similarity = excluded.similarity;

    update public.opportunities
    set cluster_id = cluster_record_id
    where organization_id = target_organization_id
      and (
        source_document_id = source_id
        or source_document_id in (
          select (cluster_source.value ->> 'sourceDocumentId')::uuid
          from jsonb_array_elements(payload -> 'clusterSources') cluster_source
        )
      );
  end if;

  if near_duplicate then
    select opportunity.id
    into opportunity_record_id
    from public.opportunities opportunity
    where opportunity.brand_id = target_brand_id
      and opportunity.source_document_id = duplicate_of_id
    limit 1;
  end if;

  if opportunity_record_id is null then
    insert into public.opportunities (
    organization_id,
    brand_id,
    source_document_id,
    cluster_id,
    value_nucleus,
    recommended_style,
    opportunity_score,
    risk_penalty,
    score_breakdown,
    status
    )
    values (
    target_organization_id,
    target_brand_id,
    source_id,
    cluster_record_id,
    payload ->> 'valueNucleus',
    (payload ->> 'recommendedStyle')::public.content_style,
    score_value,
    risk_penalty_value,
    payload -> 'scoreBreakdown',
    'candidate'
    )
    on conflict (brand_id, source_document_id) where source_document_id is not null
    do update set
      updated_at = now(),
      cluster_id = coalesce(excluded.cluster_id, public.opportunities.cluster_id),
      value_nucleus = excluded.value_nucleus,
      recommended_style = excluded.recommended_style,
      opportunity_score = excluded.opportunity_score,
      risk_penalty = excluded.risk_penalty,
      score_breakdown = excluded.score_breakdown
    returning id into opportunity_record_id;
  elsif cluster_record_id is not null then
    update public.opportunities
    set cluster_id = cluster_record_id
    where id = opportunity_record_id;
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
    completed_at,
    model_usage
  )
  values (
    target_organization_id,
    target_brand_id,
    case when (payload ->> 'sourceType') = 'rss' then 'rss_analysis' else 'manual_input' end,
    'source_document',
    source_id,
    case
      when (payload ->> 'sourceType') = 'rss' then 'WF-04 Cluster and Score'
      else 'app-manual-input'
    end,
    correlation,
    payload ->> 'idempotencyKey',
    'succeeded',
    now(),
    now(),
    '{}'::jsonb
  )
  on conflict (organization_id, workflow_name, idempotency_key, attempt)
  do update set completed_at = public.generation_runs.completed_at
  returning id into run_id;

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
  )
  values (
    target_organization_id,
    target_brand_id,
    run_id,
    'source_document',
    source_id,
    case
      when near_duplicate then 'source.near_duplicate_clustered'
      when was_duplicate then 'source.duplicate_linked'
      else 'source.normalized'
    end,
    case when was_duplicate and not near_duplicate then 'analyzed' else 'received' end,
    case when near_duplicate then 'duplicate' else 'analyzed' end,
    correlation,
    actor_id,
    jsonb_build_object('opportunityId', opportunity_record_id)
  );

  update private.idempotency_keys
  set response_status = 201,
      response_body = jsonb_build_object(
        'sourceDocumentId', source_id,
        'opportunityId', opportunity_record_id,
        'generationRunId', run_id,
        'duplicate', was_duplicate
      )
  where organization_id = target_organization_id
    and scope = 'manual_input'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select source_id, opportunity_record_id, run_id, was_duplicate;
end;
$$;

create or replace function public.ingest_manual_input(payload jsonb)
returns table (
  source_document_id uuid,
  opportunity_id uuid,
  generation_run_id uuid,
  duplicate boolean
)
language sql
set search_path = ''
as $$
  select * from private.ingest_manual_input(payload);
$$;

create or replace function private.create_mock_draft(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  generation_run_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (payload ->> 'actorId')::uuid;
  target_opportunity_id uuid := (payload ->> 'opportunityId')::uuid;
  target_brand_id uuid;
  target_organization_id uuid;
  draft_id uuid;
  version_id uuid;
  run_id uuid;
  correlation uuid := gen_random_uuid();
  was_duplicate boolean := false;
  idempotency_record private.idempotency_keys%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if coalesce(payload ->> 'contentStyle', '') not in (
      'newsworthy_authority',
      'educational_breakdown',
      'perspective_conversation'
    )
    or coalesce(payload ->> 'tone', '') not in (
      'authoritative',
      'conversational',
      'bold',
      'thoughtful',
      'witty'
    )
    or char_length(coalesce(payload -> 'content' ->> 'hook', '')) not between 1 and 500
    or char_length(coalesce(payload -> 'content' ->> 'body', '')) not between 1 and 8000
    or char_length(coalesce(payload -> 'content' ->> 'fullText', '')) not between 1 and 10000
  then
    raise exception 'Invalid draft payload' using errcode = '22023';
  end if;

  select opportunity.organization_id, opportunity.brand_id
  into target_organization_id, target_brand_id
  from public.opportunities opportunity
  where opportunity.id = target_opportunity_id;

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
          or brand_member.role in ('administrator', 'editor')
        )
    )
  then
    raise exception 'Brand editor permission required' using errcode = '42501';
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = target_organization_id
    and scope = 'draft_generation'
    and idempotency_key = payload ->> 'idempotencyKey';

  if found then
    if idempotency_record.request_hash <> payload ->> 'requestHash' then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'postDraftId')::uuid,
        (idempotency_record.response_body ->> 'postVersionId')::uuid,
        (idempotency_record.response_body ->> 'generationRunId')::uuid,
        (idempotency_record.response_body ->> 'duplicate')::boolean;
      return;
    end if;
  else
    insert into private.idempotency_keys (
      organization_id,
      scope,
      idempotency_key,
      request_hash,
      expires_at
    )
    values (
      target_organization_id,
      'draft_generation',
      payload ->> 'idempotencyKey',
      payload ->> 'requestHash',
      now() + interval '24 hours'
    );
  end if;

  select draft.id, draft.current_version_id
  into draft_id, version_id
  from public.post_drafts draft
  where draft.opportunity_id = target_opportunity_id
    and draft.content_style = (payload ->> 'contentStyle')::public.content_style
    and draft.tone = payload ->> 'tone';

  if draft_id is null then
    insert into public.post_drafts (
      organization_id,
      brand_id,
      opportunity_id,
      content_style,
      tone,
      status,
      quality_score,
      score_breakdown
    )
    values (
      target_organization_id,
      target_brand_id,
      target_opportunity_id,
      (payload ->> 'contentStyle')::public.content_style,
      payload ->> 'tone',
      'drafting',
      78,
      '{"mode":"deterministic_mock","requiresFullEvaluation":true}'::jsonb
    )
    returning id into draft_id;

    insert into public.post_versions (
      post_draft_id,
      version_number,
      hook,
      body,
      closing,
      full_text,
      generation_type,
      model,
      prompt_version,
      created_by
    )
    values (
      draft_id,
      1,
      payload -> 'content' ->> 'hook',
      payload -> 'content' ->> 'body',
      nullif(payload -> 'content' ->> 'closing', ''),
      payload -> 'content' ->> 'fullText',
      'initial',
      payload ->> 'model',
      payload ->> 'promptVersion',
      actor_id
    )
    returning id into version_id;

    update public.post_drafts
    set current_version_id = version_id,
        status = 'ready_for_review'
    where id = draft_id;
  else
    was_duplicate := true;
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
    completed_at,
    model_usage
  )
  values (
    target_organization_id,
    target_brand_id,
    'post_generation',
    'post_draft',
    draft_id,
    'app-fake-draft',
    correlation,
    payload ->> 'idempotencyKey',
    'succeeded',
    now(),
    now(),
    payload -> 'modelRecord'
  )
  on conflict (organization_id, workflow_name, idempotency_key, attempt)
  do update set completed_at = public.generation_runs.completed_at
  returning id into run_id;

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
  )
  values (
    target_organization_id,
    target_brand_id,
    run_id,
    'post_draft',
    draft_id,
    case when was_duplicate then 'draft.reused' else 'draft.ready_for_review' end,
    case when was_duplicate then 'ready_for_review' else 'drafting' end,
    'ready_for_review',
    correlation,
    actor_id,
    jsonb_build_object('postVersionId', version_id)
  );

  insert into public.audit_logs (
    organization_id,
    brand_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    target_brand_id,
    actor_id,
    case when was_duplicate then 'post.draft.reused' else 'post.draft.created' end,
    'post_draft',
    draft_id,
    jsonb_build_object('postVersionId', version_id)
  );

  update private.idempotency_keys
  set response_status = 201,
      response_body = jsonb_build_object(
        'postDraftId', draft_id,
        'postVersionId', version_id,
        'generationRunId', run_id,
        'duplicate', was_duplicate
      )
  where organization_id = target_organization_id
    and scope = 'draft_generation'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select draft_id, version_id, run_id, was_duplicate;
end;
$$;

create or replace function public.create_mock_draft(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  generation_run_id uuid,
  duplicate boolean
)
language sql
set search_path = ''
as $$
  select * from private.create_mock_draft(payload);
$$;

create or replace function private.review_post(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  status public.post_status,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (payload ->> 'actorId')::uuid;
  target_draft_id uuid := (payload ->> 'postDraftId')::uuid;
  expected_version_id uuid := (payload ->> 'expectedVersionId')::uuid;
  action_value text := payload ->> 'action';
  target_organization_id uuid;
  target_brand_id uuid;
  current_version_id uuid;
  current_status public.post_status;
  next_version_id uuid;
  next_status public.post_status;
  next_version_number integer;
  correlation uuid := gen_random_uuid();
  idempotency_record private.idempotency_keys%rowtype;
  can_edit boolean := false;
  can_review boolean := false;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if action_value not in ('edit', 'approve', 'reject', 'request_changes') then
    raise exception 'Invalid post review action' using errcode = '22023';
  end if;

  select draft.organization_id, draft.brand_id, draft.current_version_id, draft.status
  into target_organization_id, target_brand_id, current_version_id, current_status
  from public.post_drafts draft
  where draft.id = target_draft_id
  for update;

  if target_organization_id is null then
    raise exception 'Post draft not found' using errcode = 'P0002';
  end if;

  select
    (
      organization_member.role = 'administrator'
      or brand_member.role in ('administrator', 'editor')
    ),
    (
      organization_member.role = 'administrator'
      or brand_member.role in ('administrator', 'editor', 'reviewer')
    )
  into can_edit, can_review
  from public.organization_members organization_member
  left join public.brand_members brand_member
    on brand_member.brand_id = target_brand_id
   and brand_member.user_id = actor_id
  where organization_member.organization_id = target_organization_id
    and organization_member.user_id = actor_id;

  if (action_value = 'edit' and not coalesce(can_edit, false))
    or (action_value <> 'edit' and not coalesce(can_review, false))
  then
    raise exception 'Post review permission required' using errcode = '42501';
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = target_organization_id
    and scope = 'post_review'
    and idempotency_key = payload ->> 'idempotencyKey';

  if found then
    if idempotency_record.request_hash <> payload ->> 'requestHash' then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'postDraftId')::uuid,
        (idempotency_record.response_body ->> 'postVersionId')::uuid,
        (idempotency_record.response_body ->> 'status')::public.post_status,
        true;
      return;
    end if;
  else
    insert into private.idempotency_keys (
      organization_id,
      scope,
      idempotency_key,
      request_hash,
      expires_at
    )
    values (
      target_organization_id,
      'post_review',
      payload ->> 'idempotencyKey',
      payload ->> 'requestHash',
      now() + interval '24 hours'
    );
  end if;

  if current_version_id is distinct from expected_version_id then
    raise exception 'Post version is stale' using errcode = '40001';
  end if;
  if current_status in ('approved', 'rejected') then
    raise exception 'Post is already in a terminal state' using errcode = '23514';
  end if;

  next_version_id := current_version_id;
  if action_value = 'edit' then
    if current_status not in ('ready_for_review', 'changes_requested') then
      raise exception 'Post cannot be edited from its current state' using errcode = '23514';
    end if;
    if char_length(coalesce(payload -> 'content' ->> 'hook', '')) not between 1 and 500
      or char_length(coalesce(payload -> 'content' ->> 'body', '')) not between 1 and 8000
      or char_length(coalesce(payload -> 'content' ->> 'fullText', '')) not between 1 and 10000
    then
      raise exception 'Invalid post content' using errcode = '22023';
    end if;

    select coalesce(max(version_number), 0) + 1
    into next_version_number
    from public.post_versions version
    where version.post_draft_id = target_draft_id;

    insert into public.post_versions (
      post_draft_id,
      version_number,
      hook,
      body,
      closing,
      full_text,
      generation_type,
      created_by
    )
    values (
      target_draft_id,
      next_version_number,
      payload -> 'content' ->> 'hook',
      payload -> 'content' ->> 'body',
      nullif(payload -> 'content' ->> 'closing', ''),
      payload -> 'content' ->> 'fullText',
      'manual_edit',
      actor_id
    )
    returning id into next_version_id;
    next_status := 'ready_for_review';
  elsif action_value = 'approve' then
    if current_status <> 'ready_for_review' then
      raise exception 'Only a ready post can be approved' using errcode = '23514';
    end if;
    next_status := 'approved';
  elsif action_value = 'reject' then
    if char_length(coalesce(payload ->> 'reason', '')) < 3 then
      raise exception 'Rejection reason required' using errcode = '22023';
    end if;
    next_status := 'rejected';
  else
    if current_status <> 'ready_for_review' then
      raise exception 'Changes can only be requested from review' using errcode = '23514';
    end if;
    if char_length(coalesce(payload ->> 'reason', '')) < 3 then
      raise exception 'Change-request reason required' using errcode = '22023';
    end if;
    next_status := 'changes_requested';
  end if;

  update public.post_drafts
  set current_version_id = next_version_id,
      status = next_status,
      approved_by = case when next_status = 'approved' then actor_id else null end,
      approved_at = case when next_status = 'approved' then now() else null end
  where id = target_draft_id;

  insert into public.feedback_events (
    organization_id,
    brand_id,
    post_draft_id,
    event_type,
    reason,
    user_id,
    metadata
  )
  values (
    target_organization_id,
    target_brand_id,
    target_draft_id,
    action_value,
    nullif(payload ->> 'reason', ''),
    actor_id,
    jsonb_build_object(
      'fromStatus', current_status,
      'toStatus', next_status,
      'fromVersionId', current_version_id,
      'toVersionId', next_version_id
    )
  );

  insert into public.pipeline_events (
    organization_id,
    brand_id,
    entity_type,
    entity_id,
    event_type,
    from_status,
    to_status,
    correlation_id,
    actor_id,
    metadata
  )
  values (
    target_organization_id,
    target_brand_id,
    'post_draft',
    target_draft_id,
    'post.' || action_value,
    current_status,
    next_status,
    correlation,
    actor_id,
    jsonb_build_object(
      'fromVersionId', current_version_id,
      'toVersionId', next_version_id
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
  )
  values (
    target_organization_id,
    target_brand_id,
    actor_id,
    'post.' || action_value,
    'post_draft',
    target_draft_id,
    jsonb_build_object(
      'fromStatus', current_status,
      'toStatus', next_status,
      'fromVersionId', current_version_id,
      'toVersionId', next_version_id,
      'reason', nullif(payload ->> 'reason', '')
    )
  );

  update private.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'postDraftId', target_draft_id,
        'postVersionId', next_version_id,
        'status', next_status
      )
  where organization_id = target_organization_id
    and scope = 'post_review'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select target_draft_id, next_version_id, next_status, false;
end;
$$;

create or replace function public.review_post(payload jsonb)
returns table (
  post_draft_id uuid,
  post_version_id uuid,
  status public.post_status,
  duplicate boolean
)
language sql
set search_path = ''
as $$
  select * from private.review_post(payload);
$$;

create or replace function private.record_source_failure(payload jsonb)
returns table (
  source_document_id uuid,
  generation_run_id uuid,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (payload ->> 'actorId')::uuid;
  target_brand_id uuid := (payload ->> 'brandId')::uuid;
  target_organization_id uuid;
  source_id uuid;
  run_id uuid;
  correlation uuid := gen_random_uuid();
  failure_status public.source_status;
  idempotency_record private.idempotency_keys%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if coalesce(payload ->> 'sourceType', '') not in (
      'url',
      'pdf',
      'transcript',
      'social_content',
      'plain_text'
    )
    or char_length(coalesce(payload ->> 'title', '')) not between 1 and 1000
    or char_length(coalesce(payload ->> 'failureCode', '')) not between 1 and 100
    or char_length(coalesce(payload ->> 'failureMessage', '')) not between 1 and 1000
  then
    raise exception 'Invalid source failure payload' using errcode = '22023';
  end if;

  select brands.organization_id
  into target_organization_id
  from public.brands
  where brands.id = target_brand_id;

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
          or brand_member.role in ('administrator', 'editor')
        )
    )
  then
    raise exception 'Brand editor permission required' using errcode = '42501';
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = target_organization_id
    and scope = 'source_failure'
    and idempotency_key = payload ->> 'idempotencyKey';

  if found then
    if idempotency_record.request_hash <> payload ->> 'requestHash' then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'sourceDocumentId')::uuid,
        (idempotency_record.response_body ->> 'generationRunId')::uuid,
        true;
      return;
    end if;
  else
    insert into private.idempotency_keys (
      organization_id,
      scope,
      idempotency_key,
      request_hash,
      expires_at
    )
    values (
      target_organization_id,
      'source_failure',
      payload ->> 'idempotencyKey',
      payload ->> 'requestHash',
      now() + interval '24 hours'
    );
  end if;

  failure_status := case
    when payload ->> 'failureCode' = 'unsupported_type' then 'unsupported'::public.source_status
    when payload ->> 'failureCode' in ('unsafe_source', 'invalid_input')
      then 'rejected'::public.source_status
    else 'extraction_failed'::public.source_status
  end;

  insert into public.source_documents (
    organization_id,
    source_type,
    canonical_url,
    title,
    storage_path,
    status,
    status_reason,
    metadata,
    submitted_by
  )
  values (
    target_organization_id,
    (payload ->> 'sourceType')::public.source_type,
    nullif(payload ->> 'canonicalUrl', ''),
    payload ->> 'title',
    nullif(payload ->> 'storagePath', ''),
    failure_status,
    payload ->> 'failureMessage',
    jsonb_build_object(
      'failureCode', payload ->> 'failureCode',
      'retryable', coalesce((payload ->> 'retryable')::boolean, false),
      'rawSha256', nullif(payload ->> 'rawSha256', ''),
      'contractVersion', payload ->> 'contractVersion'
    ),
    actor_id
  )
  returning id into source_id;

  insert into public.source_brand_links (
    organization_id,
    source_document_id,
    brand_id,
    routing_reason
  )
  values (
    target_organization_id,
    source_id,
    target_brand_id,
    'Submitted source failed deterministic extraction'
  );

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
    completed_at,
    error
  )
  values (
    target_organization_id,
    target_brand_id,
    'source_extraction',
    'source_document',
    source_id,
    'app-source-extraction',
    correlation,
    payload ->> 'idempotencyKey',
    'failed',
    now(),
    now(),
    jsonb_build_object(
      'code', payload ->> 'failureCode',
      'message', payload ->> 'failureMessage',
      'retryable', coalesce((payload ->> 'retryable')::boolean, false)
    )
  )
  returning id into run_id;

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
  )
  values (
    target_organization_id,
    target_brand_id,
    run_id,
    'source_document',
    source_id,
    'source.extraction_failed',
    'received',
    failure_status::text,
    correlation,
    actor_id,
    jsonb_build_object('failureCode', payload ->> 'failureCode')
  );

  insert into public.audit_logs (
    organization_id,
    brand_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    target_brand_id,
    actor_id,
    'source.extraction_failed',
    'source_document',
    source_id,
    jsonb_build_object(
      'failureCode', payload ->> 'failureCode',
      'generationRunId', run_id
    )
  );

  update private.idempotency_keys
  set response_status = 422,
      response_body = jsonb_build_object(
        'sourceDocumentId', source_id,
        'generationRunId', run_id
      )
  where organization_id = target_organization_id
    and scope = 'source_failure'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select source_id, run_id, false;
end;
$$;

create or replace function public.record_source_failure(payload jsonb)
returns table (
  source_document_id uuid,
  generation_run_id uuid,
  duplicate boolean
)
language sql
set search_path = ''
as $$
  select * from private.record_source_failure(payload);
$$;

create or replace function private.upsert_rss_feed(payload jsonb)
returns table (
  rss_feed_id uuid,
  duplicate boolean,
  active boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := (payload ->> 'actorId')::uuid;
  target_feed_id uuid := nullif(payload ->> 'feedId', '')::uuid;
  target_organization_id uuid;
  route_count integer := jsonb_array_length(coalesce(payload -> 'brandRoutes', '[]'::jsonb));
  idempotency_record private.idempotency_keys%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if route_count < 1
    or char_length(coalesce(payload ->> 'name', '')) not between 1 and 200
    or char_length(coalesce(payload ->> 'feedUrl', '')) not between 1 and 4096
    or (payload ->> 'authorityScore')::numeric not between 0 and 100
  then
    raise exception 'Invalid RSS feed payload' using errcode = '22023';
  end if;

  select brand.organization_id
  into target_organization_id
  from public.brands brand
  where brand.id = (
    select (route.value ->> 'brandId')::uuid
    from jsonb_array_elements(payload -> 'brandRoutes') route
    limit 1
  );

  if target_organization_id is null
    or exists (
      select 1
      from jsonb_array_elements(payload -> 'brandRoutes') route
      left join public.brands brand
        on brand.id = (route.value ->> 'brandId')::uuid
       and brand.organization_id = target_organization_id
      left join public.organization_members organization_member
        on organization_member.organization_id = target_organization_id
       and organization_member.user_id = actor_id
      left join public.brand_members brand_member
        on brand_member.brand_id = brand.id
       and brand_member.user_id = actor_id
      where brand.id is null
        or organization_member.user_id is null
        or not (
          organization_member.role = 'administrator'
          or brand_member.role in ('administrator', 'editor')
        )
        or (route.value ->> 'minimumScore')::numeric not between 60 and 100
        or (route.value ->> 'dailyGenerationLimit')::integer not between 0 and 100
        or coalesce(route.value ->> 'generationPolicy', '') not in (
          'ingest_only',
          'score_then_research'
        )
    )
  then
    raise exception 'RSS feed brand editor permission required' using errcode = '42501';
  end if;

  if target_feed_id is not null and not exists (
    select 1
    from public.rss_feeds feed
    where feed.id = target_feed_id
      and feed.organization_id = target_organization_id
  )
  then
    raise exception 'RSS feed not found in target organization' using errcode = '42501';
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = target_organization_id
    and scope = 'rss_feed_upsert'
    and idempotency_key = payload ->> 'idempotencyKey';

  if found then
    if idempotency_record.request_hash <> payload ->> 'requestHash' then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'feedId')::uuid,
        true,
        (idempotency_record.response_body ->> 'active')::boolean;
      return;
    end if;
  else
    insert into private.idempotency_keys (
      organization_id,
      scope,
      idempotency_key,
      request_hash,
      expires_at
    )
    values (
      target_organization_id,
      'rss_feed_upsert',
      payload ->> 'idempotencyKey',
      payload ->> 'requestHash',
      now() + interval '24 hours'
    );
  end if;

  if target_feed_id is null then
    insert into public.rss_feeds (
      organization_id,
      name,
      feed_url,
      topic_tags,
      authority_score,
      active,
      created_by
    )
    values (
      target_organization_id,
      payload ->> 'name',
      payload ->> 'feedUrl',
      array(
        select jsonb_array_elements_text(coalesce(payload -> 'topicTags', '[]'::jsonb))
      ),
      (payload ->> 'authorityScore')::numeric,
      (payload ->> 'active')::boolean,
      actor_id
    )
    returning id into target_feed_id;
  else
    update public.rss_feeds
    set name = payload ->> 'name',
        feed_url = payload ->> 'feedUrl',
        topic_tags = array(
          select jsonb_array_elements_text(coalesce(payload -> 'topicTags', '[]'::jsonb))
        ),
        authority_score = (payload ->> 'authorityScore')::numeric,
        active = (payload ->> 'active')::boolean
    where id = target_feed_id;

    delete from public.rss_feed_brand_links
    where rss_feed_id = target_feed_id;
  end if;

  insert into public.rss_feed_brand_links (
    organization_id,
    rss_feed_id,
    brand_id,
    generation_policy,
    minimum_score,
    daily_generation_limit,
    topic_tags,
    include_keywords,
    exclude_keywords
  )
  select
    target_organization_id,
    target_feed_id,
    (route.value ->> 'brandId')::uuid,
    route.value ->> 'generationPolicy',
    (route.value ->> 'minimumScore')::numeric,
    (route.value ->> 'dailyGenerationLimit')::integer,
    array(select jsonb_array_elements_text(coalesce(route.value -> 'topicTags', '[]'::jsonb))),
    array(
      select jsonb_array_elements_text(coalesce(route.value -> 'includeKeywords', '[]'::jsonb))
    ),
    array(
      select jsonb_array_elements_text(coalesce(route.value -> 'excludeKeywords', '[]'::jsonb))
    )
  from jsonb_array_elements(payload -> 'brandRoutes') route;

  insert into public.audit_logs (
    organization_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    actor_id,
    'rss_feed.upserted',
    'rss_feed',
    target_feed_id,
    jsonb_build_object(
      'active', (payload ->> 'active')::boolean,
      'brandRouteCount', route_count
    )
  );

  update private.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'feedId', target_feed_id,
        'active', (payload ->> 'active')::boolean
      )
  where organization_id = target_organization_id
    and scope = 'rss_feed_upsert'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select target_feed_id, false, (payload ->> 'active')::boolean;
end;
$$;

create or replace function public.upsert_rss_feed(payload jsonb)
returns table (
  rss_feed_id uuid,
  duplicate boolean,
  active boolean
)
language sql
set search_path = ''
as $$
  select * from private.upsert_rss_feed(payload);
$$;

create or replace function private.reserve_rss_generation(payload jsonb)
returns table (
  eligible boolean,
  reason text,
  generation_run_id uuid,
  used_today integer,
  daily_limit integer,
  duplicate boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  link_record public.rss_feed_brand_links%rowtype;
  run_id uuid;
  used_count integer;
  eligibility_reason text;
  idempotency_record private.idempotency_keys%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;

  select link.*
  into link_record
  from public.rss_feed_brand_links link
  join public.rss_feeds feed
    on feed.id = link.rss_feed_id
   and feed.organization_id = link.organization_id
  where link.rss_feed_id = (payload ->> 'feedId')::uuid
    and link.brand_id = (payload ->> 'brandId')::uuid
    and feed.active
  for update of link;

  if not found then
    return query select false, 'inactive'::text, null::uuid, 0, 0, false;
    return;
  end if;

  select *
  into idempotency_record
  from private.idempotency_keys
  where organization_id = link_record.organization_id
    and scope = 'rss_generation_reservation'
    and idempotency_key = payload ->> 'idempotencyKey';

  if found then
    if idempotency_record.request_hash <> payload ->> 'requestHash' then
      raise exception 'Idempotency key was reused with a different request'
        using errcode = '23505';
    end if;
    if idempotency_record.response_body is not null then
      return query select
        (idempotency_record.response_body ->> 'eligible')::boolean,
        idempotency_record.response_body ->> 'reason',
        nullif(idempotency_record.response_body ->> 'generationRunId', '')::uuid,
        (idempotency_record.response_body ->> 'usedToday')::integer,
        (idempotency_record.response_body ->> 'dailyLimit')::integer,
        true;
      return;
    end if;
  else
    insert into private.idempotency_keys (
      organization_id,
      scope,
      idempotency_key,
      request_hash,
      expires_at
    )
    values (
      link_record.organization_id,
      'rss_generation_reservation',
      payload ->> 'idempotencyKey',
      payload ->> 'requestHash',
      now() + interval '48 hours'
    );
  end if;

  select count(*)::integer
  into used_count
  from public.generation_runs run
  where run.organization_id = link_record.organization_id
    and run.brand_id = link_record.brand_id
    and run.workflow_name = 'WF-04 Cluster and Score'
    and run.model_usage ->> 'rssFeedId' = link_record.rss_feed_id::text
    and run.created_at >= date_trunc('day', now());

  eligibility_reason := case
    when link_record.generation_policy = 'ingest_only' then 'ingest_only'
    when (payload ->> 'opportunityScore')::numeric < link_record.minimum_score
      then 'below_threshold'
    when used_count >= link_record.daily_generation_limit then 'daily_limit'
    else 'reserved'
  end;

  if eligibility_reason = 'reserved' then
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
      model_usage
    )
    values (
      link_record.organization_id,
      link_record.brand_id,
      'rss_opportunity_reservation',
      'opportunity',
      (payload ->> 'opportunityId')::uuid,
      'WF-04 Cluster and Score',
      (payload ->> 'correlationId')::uuid,
      payload ->> 'idempotencyKey',
      'queued',
      jsonb_build_object(
        'rssFeedId', link_record.rss_feed_id,
        'sourceDocumentId', payload ->> 'sourceDocumentId',
        'opportunityScore', (payload ->> 'opportunityScore')::numeric
      )
    )
    returning id into run_id;
    used_count := used_count + 1;
  end if;

  update private.idempotency_keys
  set response_status = 200,
      response_body = jsonb_build_object(
        'eligible', eligibility_reason = 'reserved',
        'reason', eligibility_reason,
        'generationRunId', run_id,
        'usedToday', used_count,
        'dailyLimit', link_record.daily_generation_limit
      )
  where organization_id = link_record.organization_id
    and scope = 'rss_generation_reservation'
    and idempotency_key = payload ->> 'idempotencyKey';

  return query select
    eligibility_reason = 'reserved',
    eligibility_reason,
    run_id,
    used_count,
    link_record.daily_generation_limit,
    false;
end;
$$;

create or replace function public.reserve_rss_generation(payload jsonb)
returns table (
  eligible boolean,
  reason text,
  generation_run_id uuid,
  used_today integer,
  daily_limit integer,
  duplicate boolean
)
language sql
set search_path = ''
as $$
  select * from private.reserve_rss_generation(payload);
$$;

create or replace function private.record_rss_poll(payload jsonb)
returns table (
  rss_feed_id uuid,
  consecutive_failures integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_feed_id uuid := (payload ->> 'feedId')::uuid;
  poll_status text := payload ->> 'status';
  observed_at timestamptz := coalesce((payload ->> 'observedAt')::timestamptz, now());
  failure_code text := nullif(payload ->> 'errorCode', '');
  failure_count integer;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' then
    raise exception 'Service role required' using errcode = '42501';
  end if;
  if poll_status not in ('succeeded', 'failed')
    or (poll_status = 'failed' and failure_code is null)
    or char_length(coalesce(failure_code, '')) > 200
  then
    raise exception 'Invalid RSS poll result' using errcode = '22023';
  end if;

  perform 1
  from public.rss_feeds feed
  where feed.id = target_feed_id
  for update;
  if not found then
    raise exception 'RSS feed not found' using errcode = 'P0002';
  end if;

  if poll_status = 'succeeded' then
    update public.rss_feeds
    set last_polled_at = observed_at,
        last_success_at = observed_at,
        last_error = null,
        consecutive_failures = 0
    where id = target_feed_id
    returning rss_feeds.consecutive_failures into failure_count;
  else
    update public.rss_feeds
    set last_polled_at = observed_at,
        last_error = failure_code,
        consecutive_failures = rss_feeds.consecutive_failures + 1
    where id = target_feed_id
    returning rss_feeds.consecutive_failures into failure_count;
  end if;

  return query select target_feed_id, failure_count;
end;
$$;

create or replace function public.record_rss_poll(payload jsonb)
returns table (
  rss_feed_id uuid,
  consecutive_failures integer
)
language sql
set search_path = ''
as $$
  select * from private.record_rss_poll(payload);
$$;

revoke all on function private.is_organization_member(uuid) from public;
revoke all on function private.can_manage_organization(uuid) from public;
revoke all on function private.can_contribute_to_organization(uuid) from public;
revoke all on function private.can_read_brand(uuid) from public;
revoke all on function private.can_edit_brand(uuid) from public;
revoke all on function private.ingest_manual_input(jsonb) from public;
revoke all on function private.create_mock_draft(jsonb) from public;
revoke all on function private.review_post(jsonb) from public;
revoke all on function private.record_source_failure(jsonb) from public;
revoke all on function private.upsert_rss_feed(jsonb) from public;
revoke all on function private.reserve_rss_generation(jsonb) from public;
revoke all on function private.record_rss_poll(jsonb) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant execute on function private.can_manage_organization(uuid) to authenticated;
grant execute on function private.can_contribute_to_organization(uuid) to authenticated;
grant execute on function private.can_read_brand(uuid) to authenticated;
grant execute on function private.can_edit_brand(uuid) to authenticated;
grant execute on function private.ingest_manual_input(jsonb) to service_role;
grant execute on function private.create_mock_draft(jsonb) to service_role;
grant execute on function private.review_post(jsonb) to service_role;
grant execute on function private.record_source_failure(jsonb) to service_role;
grant execute on function private.upsert_rss_feed(jsonb) to service_role;
grant execute on function private.reserve_rss_generation(jsonb) to service_role;
grant execute on function private.record_rss_poll(jsonb) to service_role;

revoke all on function public.is_organization_member(uuid) from public;
revoke all on function public.can_manage_organization(uuid) from public;
revoke all on function public.can_contribute_to_organization(uuid) from public;
revoke all on function public.can_read_brand(uuid) from public;
revoke all on function public.can_edit_brand(uuid) from public;
revoke all on function public.ingest_manual_input(jsonb) from public;
revoke all on function public.create_mock_draft(jsonb) from public;
revoke all on function public.review_post(jsonb) from public;
revoke all on function public.record_source_failure(jsonb) from public;
revoke all on function public.upsert_rss_feed(jsonb) from public;
revoke all on function public.reserve_rss_generation(jsonb) from public;
revoke all on function public.record_rss_poll(jsonb) from public;
grant execute on function public.is_organization_member(uuid) to authenticated;
grant execute on function public.can_manage_organization(uuid) to authenticated;
grant execute on function public.can_contribute_to_organization(uuid) to authenticated;
grant execute on function public.can_read_brand(uuid) to authenticated;
grant execute on function public.can_edit_brand(uuid) to authenticated;
grant execute on function public.ingest_manual_input(jsonb) to service_role;
grant execute on function public.create_mock_draft(jsonb) to service_role;
grant execute on function public.review_post(jsonb) to service_role;
grant execute on function public.record_source_failure(jsonb) to service_role;
grant execute on function public.upsert_rss_feed(jsonb) to service_role;
grant execute on function public.reserve_rss_generation(jsonb) to service_role;
grant execute on function public.record_rss_poll(jsonb) to service_role;

create or replace function public.protect_brand_lifecycle()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status is distinct from new.status
    and not public.can_manage_organization(old.organization_id)
  then
    raise exception 'Only organization administrators may change brand lifecycle status'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.protect_brand_lifecycle() from public;

create trigger brands_protect_lifecycle before update of status on public.brands
for each row execute function public.protect_brand_lifecycle();

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_members enable row level security;
alter table public.brands enable row level security;
alter table public.brand_members enable row level security;
alter table public.brand_profiles enable row level security;
alter table public.brand_examples enable row level security;
alter table public.brand_assets enable row level security;
alter table public.rss_feeds enable row level security;
alter table public.rss_feed_brand_links enable row level security;
alter table public.rss_feed_items enable row level security;
alter table public.source_documents enable row level security;
alter table public.source_brand_links enable row level security;
alter table public.source_chunks enable row level security;
alter table public.content_clusters enable row level security;
alter table public.cluster_sources enable row level security;
alter table public.opportunities enable row level security;
alter table public.research_runs enable row level security;
alter table public.research_sources enable row level security;
alter table public.claims enable row level security;
alter table public.claim_sources enable row level security;
alter table public.angles enable row level security;
alter table public.post_drafts enable row level security;
alter table public.post_versions enable row level security;
alter table public.post_claims enable row level security;
alter table public.image_assets enable row level security;
alter table public.generation_runs enable row level security;
alter table public.pipeline_events enable row level security;
alter table public.evaluation_scores enable row level security;
alter table public.feedback_events enable row level security;
alter table public.audit_logs enable row level security;

create policy organizations_select on public.organizations for select
  using ((select public.is_organization_member(id)));
create policy organizations_update on public.organizations for update
  using ((select public.can_manage_organization(id)))
  with check ((select public.can_manage_organization(id)));

create policy profiles_select on public.profiles for select
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.organization_members own_membership
      join public.organization_members target_membership
        on target_membership.organization_id = own_membership.organization_id
      where own_membership.user_id = (select auth.uid())
        and target_membership.user_id = profiles.user_id
    )
  );
create policy profiles_update_self on public.profiles for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy organization_members_select on public.organization_members for select
  using ((select public.is_organization_member(organization_id)));
create policy organization_members_insert on public.organization_members for insert
  with check ((select public.can_manage_organization(organization_id)));
create policy organization_members_update on public.organization_members for update
  using ((select public.can_manage_organization(organization_id)))
  with check ((select public.can_manage_organization(organization_id)));
create policy organization_members_delete on public.organization_members for delete
  using (
    (select public.can_manage_organization(organization_id))
    and user_id <> (select auth.uid())
  );

create policy brands_select on public.brands for select
  using ((select public.can_read_brand(id)));
create policy brands_insert on public.brands for insert
  with check ((select public.can_manage_organization(organization_id)));
create policy brands_update on public.brands for update
  using ((select public.can_edit_brand(id)))
  with check (
    (select public.can_edit_brand(id))
    and (select public.is_organization_member(organization_id))
  );

create policy brand_members_select on public.brand_members for select
  using ((select public.can_read_brand(brand_id)));
create policy brand_members_insert on public.brand_members for insert
  with check (
    exists (
      select 1 from public.brands
      where brands.id = brand_members.brand_id
        and (select public.can_manage_organization(brands.organization_id))
    )
  );
create policy brand_members_update on public.brand_members for update
  using (
    exists (
      select 1 from public.brands
      where brands.id = brand_members.brand_id
        and (select public.can_manage_organization(brands.organization_id))
    )
  );
create policy brand_members_delete on public.brand_members for delete
  using (
    exists (
      select 1 from public.brands
      where brands.id = brand_members.brand_id
        and (select public.can_manage_organization(brands.organization_id))
    )
  );

create policy brand_profiles_select on public.brand_profiles for select
  using ((select public.can_read_brand(brand_id)));
create policy brand_profiles_write on public.brand_profiles for all
  using ((select public.can_edit_brand(brand_id)))
  with check ((select public.can_edit_brand(brand_id)));
create policy brand_examples_select on public.brand_examples for select
  using ((select public.can_read_brand(brand_id)));
create policy brand_examples_write on public.brand_examples for all
  using ((select public.can_edit_brand(brand_id)))
  with check ((select public.can_edit_brand(brand_id)));
create policy brand_assets_select on public.brand_assets for select
  using ((select public.can_read_brand(brand_id)));
create policy brand_assets_write on public.brand_assets for all
  using ((select public.can_edit_brand(brand_id)))
  with check ((select public.can_edit_brand(brand_id)));
create policy rss_feeds_select on public.rss_feeds for select
  using (
    (select public.is_organization_member(organization_id))
    and exists (
      select 1
      from public.rss_feed_brand_links
      where rss_feed_brand_links.rss_feed_id = rss_feeds.id
        and (select public.can_read_brand(rss_feed_brand_links.brand_id))
    )
  );
create policy rss_feeds_insert on public.rss_feeds for insert
  with check ((select public.can_contribute_to_organization(organization_id)));
create policy rss_feeds_update on public.rss_feeds for update
  using (
    (select public.can_manage_organization(organization_id))
    or (
      exists (
        select 1 from public.rss_feed_brand_links
        where rss_feed_brand_links.rss_feed_id = rss_feeds.id
      )
      and not exists (
        select 1 from public.rss_feed_brand_links
        where rss_feed_brand_links.rss_feed_id = rss_feeds.id
          and not (select public.can_edit_brand(rss_feed_brand_links.brand_id))
      )
    )
  )
  with check ((select public.can_contribute_to_organization(organization_id)));
create policy rss_feeds_delete on public.rss_feeds for delete
  using (
    (select public.can_manage_organization(organization_id))
    or (
      exists (
        select 1 from public.rss_feed_brand_links
        where rss_feed_brand_links.rss_feed_id = rss_feeds.id
      )
      and not exists (
        select 1 from public.rss_feed_brand_links
        where rss_feed_brand_links.rss_feed_id = rss_feeds.id
          and not (select public.can_edit_brand(rss_feed_brand_links.brand_id))
      )
    )
  );
create policy rss_feed_brand_links_select on public.rss_feed_brand_links for select
  using ((select public.can_read_brand(brand_id)));
create policy rss_feed_brand_links_insert on public.rss_feed_brand_links for insert
  with check (
    (select public.can_edit_brand(brand_id))
    and (select public.can_contribute_to_organization(organization_id))
  );
create policy rss_feed_brand_links_update on public.rss_feed_brand_links for update
  using ((select public.can_edit_brand(brand_id)))
  with check (
    (select public.can_edit_brand(brand_id))
    and (select public.can_contribute_to_organization(organization_id))
  );
create policy rss_feed_brand_links_delete on public.rss_feed_brand_links for delete
  using ((select public.can_edit_brand(brand_id)));
create policy rss_feed_items_select on public.rss_feed_items for select
  using (
    exists (
      select 1
      from public.rss_feed_brand_links
      where rss_feed_brand_links.rss_feed_id = rss_feed_items.rss_feed_id
        and (select public.can_read_brand(rss_feed_brand_links.brand_id))
    )
  );

create policy source_documents_select on public.source_documents for select
  using (
    (select public.is_organization_member(organization_id))
    and exists (
      select 1 from public.source_brand_links
      where source_brand_links.source_document_id = source_documents.id
        and (select public.can_read_brand(source_brand_links.brand_id))
    )
  );
create policy source_documents_insert on public.source_documents for insert
  with check (
    submitted_by = (select auth.uid())
    and (select public.can_contribute_to_organization(organization_id))
  );
create policy source_documents_update on public.source_documents for update
  using (
    (select public.is_organization_member(organization_id))
    and exists (
      select 1 from public.source_brand_links
      where source_brand_links.source_document_id = source_documents.id
        and (select public.can_edit_brand(source_brand_links.brand_id))
    )
  );
create policy source_brand_links_select on public.source_brand_links for select
  using ((select public.can_read_brand(brand_id)));
create policy source_brand_links_write on public.source_brand_links for all
  using ((select public.can_edit_brand(brand_id)))
  with check ((select public.can_edit_brand(brand_id)));
create policy source_chunks_select on public.source_chunks for select
  using (
    exists (
      select 1 from public.source_brand_links
      where source_brand_links.source_document_id = source_chunks.source_document_id
        and (select public.can_read_brand(source_brand_links.brand_id))
    )
  );
create policy source_chunks_write on public.source_chunks for all
  using (
    exists (
      select 1 from public.source_brand_links
      where source_brand_links.source_document_id = source_chunks.source_document_id
        and (select public.can_edit_brand(source_brand_links.brand_id))
    )
  );

create policy clusters_select on public.content_clusters for select
  using ((select public.is_organization_member(organization_id)));
create policy clusters_write on public.content_clusters for all
  using ((select public.is_organization_member(organization_id)))
  with check ((select public.is_organization_member(organization_id)));
create policy cluster_sources_select on public.cluster_sources for select
  using (
    exists (
      select 1 from public.content_clusters
      where content_clusters.id = cluster_sources.cluster_id
        and (select public.is_organization_member(content_clusters.organization_id))
    )
  );
create policy cluster_sources_write on public.cluster_sources for all
  using (
    exists (
      select 1 from public.content_clusters
      where content_clusters.id = cluster_sources.cluster_id
        and (select public.is_organization_member(content_clusters.organization_id))
    )
  );

create policy opportunities_select on public.opportunities for select
  using ((select public.can_read_brand(brand_id)));
create policy opportunities_write on public.opportunities for all
  using ((select public.can_edit_brand(brand_id)))
  with check (
    (select public.can_edit_brand(brand_id))
    and (select public.is_organization_member(organization_id))
  );

create policy research_runs_select on public.research_runs for select
  using (
    exists (
      select 1 from public.opportunities
      where opportunities.id = research_runs.opportunity_id
        and (select public.can_read_brand(opportunities.brand_id))
    )
  );
create policy research_runs_write on public.research_runs for all
  using (
    exists (
      select 1 from public.opportunities
      where opportunities.id = research_runs.opportunity_id
        and (select public.can_edit_brand(opportunities.brand_id))
    )
  );
create policy research_sources_select on public.research_sources for select
  using (
    exists (
      select 1 from public.research_runs
      join public.opportunities on opportunities.id = research_runs.opportunity_id
      where research_runs.id = research_sources.research_run_id
        and (select public.can_read_brand(opportunities.brand_id))
    )
  );
create policy research_sources_write on public.research_sources for all
  using (
    exists (
      select 1 from public.research_runs
      join public.opportunities on opportunities.id = research_runs.opportunity_id
      where research_runs.id = research_sources.research_run_id
        and (select public.can_edit_brand(opportunities.brand_id))
    )
  );
create policy claims_select on public.claims for select
  using (
    exists (
      select 1 from public.research_runs
      join public.opportunities on opportunities.id = research_runs.opportunity_id
      where research_runs.id = claims.research_run_id
        and (select public.can_read_brand(opportunities.brand_id))
    )
  );
create policy claims_write on public.claims for all
  using (
    exists (
      select 1 from public.research_runs
      join public.opportunities on opportunities.id = research_runs.opportunity_id
      where research_runs.id = claims.research_run_id
        and (select public.can_edit_brand(opportunities.brand_id))
    )
  );
create policy claim_sources_select on public.claim_sources for select
  using (
    exists (
      select 1 from public.claims
      join public.research_runs on research_runs.id = claims.research_run_id
      join public.opportunities on opportunities.id = research_runs.opportunity_id
      where claims.id = claim_sources.claim_id
        and (select public.can_read_brand(opportunities.brand_id))
    )
  );
create policy claim_sources_write on public.claim_sources for all
  using (
    exists (
      select 1 from public.claims
      join public.research_runs on research_runs.id = claims.research_run_id
      join public.opportunities on opportunities.id = research_runs.opportunity_id
      where claims.id = claim_sources.claim_id
        and (select public.can_edit_brand(opportunities.brand_id))
    )
  );

create policy angles_select on public.angles for select
  using (
    exists (
      select 1 from public.opportunities
      where opportunities.id = angles.opportunity_id
        and (select public.can_read_brand(opportunities.brand_id))
    )
  );
create policy angles_write on public.angles for all
  using (
    exists (
      select 1 from public.opportunities
      where opportunities.id = angles.opportunity_id
        and (select public.can_edit_brand(opportunities.brand_id))
    )
  );
create policy post_drafts_select on public.post_drafts for select
  using ((select public.can_read_brand(brand_id)));
create policy post_drafts_write on public.post_drafts for all
  using ((select public.can_edit_brand(brand_id)))
  with check (
    (select public.can_edit_brand(brand_id))
    and (select public.is_organization_member(organization_id))
  );
create policy post_versions_select on public.post_versions for select
  using (
    exists (
      select 1 from public.post_drafts
      where post_drafts.id = post_versions.post_draft_id
        and (select public.can_read_brand(post_drafts.brand_id))
    )
  );
create policy post_versions_insert on public.post_versions for insert
  with check (
    exists (
      select 1 from public.post_drafts
      where post_drafts.id = post_versions.post_draft_id
        and (select public.can_edit_brand(post_drafts.brand_id))
    )
  );
create policy post_claims_select on public.post_claims for select
  using (
    exists (
      select 1 from public.post_versions
      join public.post_drafts on post_drafts.id = post_versions.post_draft_id
      where post_versions.id = post_claims.post_version_id
        and (select public.can_read_brand(post_drafts.brand_id))
    )
  );
create policy post_claims_write on public.post_claims for all
  using (
    exists (
      select 1 from public.post_versions
      join public.post_drafts on post_drafts.id = post_versions.post_draft_id
      where post_versions.id = post_claims.post_version_id
        and (select public.can_edit_brand(post_drafts.brand_id))
    )
  );
create policy image_assets_select on public.image_assets for select
  using (
    exists (
      select 1 from public.post_drafts
      where post_drafts.id = image_assets.post_draft_id
        and (select public.can_read_brand(post_drafts.brand_id))
    )
  );
create policy image_assets_write on public.image_assets for all
  using (
    exists (
      select 1 from public.post_drafts
      where post_drafts.id = image_assets.post_draft_id
        and (select public.can_edit_brand(post_drafts.brand_id))
    )
  );

create policy generation_runs_select on public.generation_runs for select
  using (
    case
      when brand_id is null then (select public.is_organization_member(organization_id))
      else (select public.can_read_brand(brand_id))
    end
  );
create policy generation_runs_write on public.generation_runs for all
  using (
    case
      when brand_id is null then (select public.is_organization_member(organization_id))
      else (select public.can_edit_brand(brand_id))
    end
  )
  with check (
    (select public.is_organization_member(organization_id))
    and (brand_id is null or (select public.can_edit_brand(brand_id)))
  );
create policy pipeline_events_select on public.pipeline_events for select
  using (
    (select public.is_organization_member(organization_id))
    and (brand_id is null or (select public.can_read_brand(brand_id)))
  );
create policy pipeline_events_insert on public.pipeline_events for insert
  with check (
    actor_id = (select auth.uid())
    and (select public.is_organization_member(organization_id))
    and (brand_id is null or (select public.can_edit_brand(brand_id)))
  );
create policy evaluation_scores_select on public.evaluation_scores for select
  using (
    case
      when brand_id is null then (select public.is_organization_member(organization_id))
      else (select public.can_read_brand(brand_id))
    end
  );
create policy evaluation_scores_insert on public.evaluation_scores for insert
  with check (
    (select public.is_organization_member(organization_id))
    and (brand_id is null or (select public.can_edit_brand(brand_id)))
  );
create policy feedback_events_select on public.feedback_events for select
  using ((select public.can_read_brand(brand_id)));
create policy feedback_events_insert on public.feedback_events for insert
  with check (
    user_id = (select auth.uid())
    and (select public.can_read_brand(brand_id))
    and (select public.is_organization_member(organization_id))
  );
create policy audit_logs_select on public.audit_logs for select
  using (
    (select public.is_organization_member(organization_id))
    and (brand_id is null or (select public.can_read_brand(brand_id)))
  );
create policy audit_logs_insert on public.audit_logs for insert
  with check (
    actor_id = (select auth.uid())
    and (select public.is_organization_member(organization_id))
    and (brand_id is null or (select public.can_read_brand(brand_id)))
  );

revoke all on all tables in schema public from anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke all on all sequences in schema private from public, anon, authenticated;
grant usage on schema public to authenticated;
grant select on
  public.organizations,
  public.profiles,
  public.organization_members,
  public.brands,
  public.brand_members,
  public.brand_profiles,
  public.brand_examples,
  public.brand_assets,
  public.rss_feeds,
  public.rss_feed_brand_links,
  public.rss_feed_items,
  public.source_documents,
  public.source_brand_links,
  public.source_chunks,
  public.content_clusters,
  public.cluster_sources,
  public.opportunities,
  public.research_runs,
  public.research_sources,
  public.claims,
  public.claim_sources,
  public.angles,
  public.post_drafts,
  public.post_versions,
  public.post_claims,
  public.image_assets,
  public.generation_runs,
  public.pipeline_events,
  public.evaluation_scores,
  public.feedback_events,
  public.audit_logs
to authenticated;
grant update on public.organizations, public.profiles to authenticated;
grant insert, update, delete on
  public.organization_members,
  public.brands,
  public.brand_members,
  public.brand_profiles,
  public.brand_examples,
  public.brand_assets,
  public.rss_feeds,
  public.rss_feed_brand_links
to authenticated;
grant insert on
  public.source_documents,
  public.source_brand_links,
  public.post_versions,
  public.feedback_events,
  public.audit_logs
to authenticated;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'source-originals',
    'source-originals',
    false,
    52428800,
    array[
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/markdown',
      'text/vtt',
      'application/x-subrip'
    ]
  ),
  (
    'brand-assets',
    'brand-assets',
    false,
    20971520,
    array[
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/svg+xml',
      'font/ttf',
      'font/otf',
      'font/woff',
      'font/woff2'
    ]
  ),
  (
    'generated-images',
    'generated-images',
    false,
    20971520,
    array['image/png', 'image/jpeg', 'image/webp']
  )
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_brand_objects_select on storage.objects for select
to authenticated
using (
  bucket_id in ('source-originals', 'brand-assets', 'generated-images')
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (select public.is_organization_member(((storage.foldername(name))[1])::uuid))
  and (select public.can_read_brand(((storage.foldername(name))[2])::uuid))
);
create policy storage_brand_objects_insert on storage.objects for insert
to authenticated
with check (
  bucket_id in ('source-originals', 'brand-assets', 'generated-images')
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (select public.is_organization_member(((storage.foldername(name))[1])::uuid))
  and (select public.can_edit_brand(((storage.foldername(name))[2])::uuid))
  and owner_id = (select auth.uid()::text)
);
create policy storage_brand_objects_update on storage.objects for update
to authenticated
using (
  bucket_id in ('source-originals', 'brand-assets', 'generated-images')
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (select public.is_organization_member(((storage.foldername(name))[1])::uuid))
  and (select public.can_edit_brand(((storage.foldername(name))[2])::uuid))
)
with check (
  bucket_id in ('source-originals', 'brand-assets', 'generated-images')
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (select public.is_organization_member(((storage.foldername(name))[1])::uuid))
  and (select public.can_edit_brand(((storage.foldername(name))[2])::uuid))
);
create policy storage_brand_objects_delete on storage.objects for delete
to authenticated
using (
  bucket_id in ('source-originals', 'brand-assets', 'generated-images')
  and owner_id = (select auth.uid()::text)
  and (storage.foldername(name))[1] ~ '^[0-9a-f-]{36}$'
  and (storage.foldername(name))[2] ~ '^[0-9a-f-]{36}$'
  and (select public.is_organization_member(((storage.foldername(name))[1])::uuid))
  and (select public.can_edit_brand(((storage.foldername(name))[2])::uuid))
);
