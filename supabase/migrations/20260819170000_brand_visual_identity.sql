-- Brand-level visual identity + image direction settings.
--
-- Additive and safe: a single jsonb column with a default, so existing rows are
-- backfilled with '{}' (which the app parses to the default visual identity).
-- The app also reads this column defensively, so it works whether or not this
-- migration has been applied yet.

alter table public.brand_profiles
  add column if not exists visual_identity jsonb not null default '{}'::jsonb;

comment on column public.brand_profiles.visual_identity is
  'Brand image direction: palette, primary medium, mood, do/dont, art direction, enabled concept ids, preferred style, and custom concepts. Shape validated by brandVisualIdentitySchema in @content-engine/brand-memory.';
