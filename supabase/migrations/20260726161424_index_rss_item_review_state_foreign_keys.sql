create index rss_item_review_states_organization_idx
  on public.rss_item_review_states (organization_id);

create index rss_item_review_states_item_idx
  on public.rss_item_review_states (rss_feed_item_id);

create index rss_item_review_states_actor_idx
  on public.rss_item_review_states (resurfaced_by);
