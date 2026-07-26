create index if not exists audit_logs_brand_organization_idx
  on public.audit_logs (brand_id, organization_id)
  where brand_id is not null;

create index if not exists audit_logs_actor_idx
  on public.audit_logs (actor_id)
  where actor_id is not null;
