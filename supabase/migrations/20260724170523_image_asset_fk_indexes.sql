create index image_assets_brand_organization_idx
  on public.image_assets (brand_id, organization_id);

create index image_assets_organization_idx
  on public.image_assets (organization_id);

create index image_assets_post_version_idx
  on public.image_assets (post_version_id);

create index image_assets_created_by_idx
  on public.image_assets (created_by);

create index image_assets_human_override_by_idx
  on public.image_assets (human_override_by);
