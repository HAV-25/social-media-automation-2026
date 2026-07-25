create table private.approved_internal_users (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  role public.organization_role not null default 'administrator',
  active boolean not null default true,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (organization_id, email),
  check (email = lower(btrim(email))),
  check (char_length(email) between 3 and 254),
  check (email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$')
);

alter table private.approved_internal_users enable row level security;
revoke all on private.approved_internal_users from public, anon, authenticated;

create index approved_internal_users_email_active_idx
  on private.approved_internal_users (email)
  where active;

create index approved_internal_users_approved_by_idx
  on private.approved_internal_users (approved_by)
  where approved_by is not null;

create or replace function private.provision_approved_internal_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  v_display_name text;
  v_approval record;
  v_was_member boolean;
begin
  select
    lower(u.email),
    coalesce(
      nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
      split_part(lower(u.email), '@', 1)
    )
  into v_email, v_display_name
  from auth.users u
  where u.id = p_user_id
    and u.email is not null
    and u.email_confirmed_at is not null;

  if v_email is null then
    return;
  end if;

  for v_approval in
    select approved.organization_id, approved.role
    from private.approved_internal_users approved
    where approved.email = v_email
      and approved.active
  loop
    select exists (
      select 1
      from public.organization_members membership
      where membership.organization_id = v_approval.organization_id
        and membership.user_id = p_user_id
    )
    into v_was_member;

    insert into public.profiles (user_id, display_name)
    values (p_user_id, left(v_display_name, 120))
    on conflict (user_id) do nothing;

    insert into public.organization_members (organization_id, user_id, role)
    values (v_approval.organization_id, p_user_id, v_approval.role)
    on conflict (organization_id, user_id)
    do update set role = excluded.role;

    insert into public.brand_members (brand_id, user_id, role)
    select brand.id, p_user_id, v_approval.role
    from public.brands brand
    where brand.organization_id = v_approval.organization_id
      and brand.status = 'active'
    on conflict (brand_id, user_id)
    do update set role = excluded.role;

    if not v_was_member then
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
        v_approval.organization_id,
        null,
        null,
        'approved_user_provisioned',
        'profile',
        p_user_id,
        jsonb_build_object(
          'role', v_approval.role,
          'brand_scope', 'all_active',
          'provisioning_mode', 'private_email_allowlist'
        )
      );
    end if;
  end loop;
end;
$$;

revoke all on function private.provision_approved_internal_user(uuid)
  from public, anon, authenticated;

create or replace function private.provision_user_from_auth_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.provision_approved_internal_user(new.id);
  return new;
end;
$$;

revoke all on function private.provision_user_from_auth_event()
  from public, anon, authenticated;

create trigger approved_internal_user_auth_event
after insert or update of email, email_confirmed_at
on auth.users
for each row
when (new.email_confirmed_at is not null)
execute function private.provision_user_from_auth_event();

create or replace function private.provision_user_from_allowlist_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  if new.active then
    for v_user_id in
      select auth_user.id
      from auth.users auth_user
      where lower(auth_user.email) = new.email
        and auth_user.email_confirmed_at is not null
    loop
      perform private.provision_approved_internal_user(v_user_id);
    end loop;
  end if;
  return new;
end;
$$;

revoke all on function private.provision_user_from_allowlist_event()
  from public, anon, authenticated;

create trigger approved_internal_user_allowlist_event
after insert or update of email, role, active
on private.approved_internal_users
for each row
execute function private.provision_user_from_allowlist_event();

create or replace function private.provision_approved_users_for_brand()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'active' then
    insert into public.brand_members (brand_id, user_id, role)
    select new.id, auth_user.id, approved.role
    from private.approved_internal_users approved
    join auth.users auth_user
      on lower(auth_user.email) = approved.email
     and auth_user.email_confirmed_at is not null
    where approved.organization_id = new.organization_id
      and approved.active
    on conflict (brand_id, user_id)
    do update set role = excluded.role;
  end if;
  return new;
end;
$$;

revoke all on function private.provision_approved_users_for_brand()
  from public, anon, authenticated;

create trigger approved_internal_users_new_brand
after insert or update of status
on public.brands
for each row
execute function private.provision_approved_users_for_brand();

comment on table private.approved_internal_users is
  'Private, server-managed allowlist for approved internal workspace identities.';
comment on function private.provision_approved_internal_user(uuid) is
  'Idempotently provisions one confirmed allowlisted identity into its organization and active brands.';
