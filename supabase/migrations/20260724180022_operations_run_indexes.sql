create index generation_runs_brand_created_cursor_idx
  on public.generation_runs (brand_id, created_at desc, id desc)
  where brand_id is not null;

create index generation_runs_brand_status_created_cursor_idx
  on public.generation_runs (brand_id, status, created_at desc, id desc)
  where brand_id is not null;

create index generation_runs_brand_type_created_cursor_idx
  on public.generation_runs (brand_id, run_type, created_at desc, id desc)
  where brand_id is not null;

create index pipeline_events_run_created_idx
  on public.pipeline_events (generation_run_id, created_at desc, id desc)
  where generation_run_id is not null;
