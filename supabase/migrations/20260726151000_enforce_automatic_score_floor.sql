-- Automatic preparation must never select opportunities below 60.
-- Scores below a brand threshold remain available for manual review or storage.
alter table public.brand_profiles
  drop constraint if exists brand_profiles_minimum_opportunity_score_check;

alter table public.brand_profiles
  add constraint brand_profiles_minimum_opportunity_score_check
  check (minimum_opportunity_score between 60 and 100);

alter table public.rss_feed_brand_links
  drop constraint if exists rss_feed_brand_links_minimum_score_check;

alter table public.rss_feed_brand_links
  add constraint rss_feed_brand_links_minimum_score_check
  check (minimum_score between 60 and 100);

comment on constraint brand_profiles_minimum_opportunity_score_check on public.brand_profiles is
  'Prevents automatic opportunity policies from selecting content below the global score floor of 60.';

comment on constraint rss_feed_brand_links_minimum_score_check on public.rss_feed_brand_links is
  'Keeps legacy per-feed thresholds at or above the global automatic preparation score floor.';
