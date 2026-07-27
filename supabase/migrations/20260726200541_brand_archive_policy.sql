alter table public.brand_profiles
  add column rss_inbox_window_hours smallint not null default 24,
  add column rss_resurface_window_hours smallint not null default 24;

alter table public.brand_profiles
  add constraint brand_profiles_rss_inbox_window_hours_check
    check (rss_inbox_window_hours between 6 and 168),
  add constraint brand_profiles_rss_resurface_window_hours_check
    check (rss_resurface_window_hours between 6 and 168);

comment on column public.brand_profiles.rss_inbox_window_hours is
  'Rolling active-inbox visibility window for RSS items. Older records remain durably archived.';
comment on column public.brand_profiles.rss_resurface_window_hours is
  'Review visibility window applied after a reviewer resurfaces an archived RSS item.';

create or replace function public.audit_brand_archive_policy_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_organization_id uuid;
begin
  if new.rss_inbox_window_hours is not distinct from old.rss_inbox_window_hours
    and new.rss_resurface_window_hours is not distinct from old.rss_resurface_window_hours
  then
    return new;
  end if;

  select brand.organization_id
  into strict target_organization_id
  from public.brands brand
  where brand.id = new.brand_id;

  insert into public.audit_logs (
    organization_id,
    brand_id,
    actor_id,
    action,
    entity_type,
    entity_id,
    metadata
  )
  values (
    target_organization_id,
    new.brand_id,
    (select auth.uid()),
    'brand.archive_policy_updated',
    'brand_profile',
    new.brand_id,
    jsonb_build_object(
      'archiveMode', 'non_destructive',
      'previous', jsonb_build_object(
        'rssInboxWindowHours', old.rss_inbox_window_hours,
        'rssResurfaceWindowHours', old.rss_resurface_window_hours
      ),
      'current', jsonb_build_object(
        'rssInboxWindowHours', new.rss_inbox_window_hours,
        'rssResurfaceWindowHours', new.rss_resurface_window_hours
      )
    )
  );

  return new;
end;
$$;

revoke all on function public.audit_brand_archive_policy_change()
  from public, anon, authenticated;

create trigger brand_profiles_audit_archive_policy_change
after update of rss_inbox_window_hours, rss_resurface_window_hours
on public.brand_profiles
for each row execute function public.audit_brand_archive_policy_change();
