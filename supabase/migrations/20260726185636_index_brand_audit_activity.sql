create index if not exists audit_logs_brand_created_idx
  on public.audit_logs (brand_id, created_at desc)
  where brand_id is not null;
