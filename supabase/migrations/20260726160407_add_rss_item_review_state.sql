create table public.rss_item_review_states (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  brand_id uuid not null,
  rss_feed_item_id uuid not null references public.rss_feed_items(id) on delete cascade,
  resurfaced_at timestamptz not null default now(),
  resurfaced_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (brand_id, rss_feed_item_id),
  foreign key (brand_id, organization_id)
    references public.brands(id, organization_id) on delete cascade
);

create index rss_item_review_states_brand_resurfaced_idx
  on public.rss_item_review_states (brand_id, resurfaced_at desc);

create trigger rss_item_review_states_set_updated_at
before update on public.rss_item_review_states
for each row execute function public.set_updated_at();

alter table public.rss_item_review_states enable row level security;

create policy rss_item_review_states_select
on public.rss_item_review_states
for select
to authenticated
using ((select public.can_read_brand(brand_id)));

create policy rss_item_review_states_insert
on public.rss_item_review_states
for insert
to authenticated
with check (
  resurfaced_by = (select auth.uid())
  and (select public.can_read_brand(brand_id))
  and (select public.is_organization_member(organization_id))
  and exists (
    select 1
    from public.rss_feed_items item
    join public.rss_feed_brand_links route
      on route.rss_feed_id = item.rss_feed_id
     and route.brand_id = rss_item_review_states.brand_id
     and route.organization_id = rss_item_review_states.organization_id
    where item.id = rss_item_review_states.rss_feed_item_id
      and item.organization_id = rss_item_review_states.organization_id
  )
);

create policy rss_item_review_states_update
on public.rss_item_review_states
for update
to authenticated
using ((select public.can_read_brand(brand_id)))
with check (
  resurfaced_by = (select auth.uid())
  and (select public.can_read_brand(brand_id))
  and (select public.is_organization_member(organization_id))
  and exists (
    select 1
    from public.rss_feed_items item
    join public.rss_feed_brand_links route
      on route.rss_feed_id = item.rss_feed_id
     and route.brand_id = rss_item_review_states.brand_id
     and route.organization_id = rss_item_review_states.organization_id
    where item.id = rss_item_review_states.rss_feed_item_id
      and item.organization_id = rss_item_review_states.organization_id
  )
);

revoke all on public.rss_item_review_states from anon, authenticated;
grant select, insert, update on public.rss_item_review_states to authenticated;
grant select, insert, update, delete on public.rss_item_review_states to service_role;
