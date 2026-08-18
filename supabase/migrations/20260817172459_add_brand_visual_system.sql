-- Brand visual identity consumed by the lightweight image stage
-- (lightweight-stage-worker imageStage reads profile.visual_system.primaryColor / accentColor).
-- Additive and nullable-safe: defaults to an empty object so existing rows keep the code's
-- built-in fallback colours until a brand palette is provided.
alter table public.brand_profiles
  add column if not exists visual_system jsonb not null default '{}'::jsonb;

comment on column public.brand_profiles.visual_system is
  'Brand visual identity for image generation, e.g. {"primaryColor":"#RRGGBB","accentColor":"#RRGGBB"}. Consumed by lightweight-stage-worker imageStage.';
