create index if not exists generation_runs_brand_created_idx
  on public.generation_runs (brand_id, created_at desc)
  where brand_id is not null;
