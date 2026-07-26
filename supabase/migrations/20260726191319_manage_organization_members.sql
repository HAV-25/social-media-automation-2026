alter table public.profiles
  add column if not exists email text;

update public.profiles profile
set email = lower(auth_user.email)
from auth.users auth_user
where auth_user.id = profile.user_id
  and auth_user.email is not null
  and profile.email is distinct from lower(auth_user.email);

alter table public.profiles
  add constraint profiles_email_check check (
    email is null
    or (
      email = lower(btrim(email))
      and char_length(email) between 3 and 254
      and email ~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$'
    )
  );

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

    insert into public.profiles (user_id, display_name, email)
    values (p_user_id, left(v_display_name, 120), v_email)
    on conflict (user_id)
    do update set email = excluded.email;

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

create or replace function public.protect_last_organization_administrator()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.role = 'administrator'
    and (
      tg_op = 'DELETE'
      or new.role is distinct from 'administrator'::public.organization_role
    )
    and not exists (
      select 1
      from public.organization_members other_member
      where other_member.organization_id = old.organization_id
        and other_member.user_id <> old.user_id
        and other_member.role = 'administrator'
    )
  then
    raise exception 'The organization must retain at least one administrator'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_last_organization_administrator()
  from public, anon, authenticated;

create trigger organization_members_protect_last_administrator
before update of role or delete on public.organization_members
for each row execute function public.protect_last_organization_administrator();

create index if not exists organization_members_org_role_idx
  on public.organization_members (organization_id, role);

create or replace function public.manage_organization_member_access(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  actor_id uuid := (select auth.uid());
  target_organization_id uuid;
  target_user_id uuid;
  target_role public.organization_role;
  assignments jsonb;
  assignment_count integer;
  matched_brand_count integer;
begin
  if jsonb_typeof(payload) <> 'object'
    or coalesce(payload ->> 'organizationId', '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload ->> 'userId', '') !~
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    or coalesce(payload ->> 'organizationRole', '') not in (
      'administrator',
      'editor',
      'reviewer',
      'viewer'
    )
    or jsonb_typeof(coalesce(payload -> 'brandAssignments', '[]'::jsonb)) <> 'array'
    or jsonb_array_length(coalesce(payload -> 'brandAssignments', '[]'::jsonb)) > 20
  then
    raise exception 'Invalid member access payload' using errcode = '22023';
  end if;

  target_organization_id := (payload ->> 'organizationId')::uuid;
  target_user_id := (payload ->> 'userId')::uuid;
  target_role := (payload ->> 'organizationRole')::public.organization_role;
  assignments := coalesce(payload -> 'brandAssignments', '[]'::jsonb);
  assignment_count := jsonb_array_length(assignments);

  if actor_id is null
    or not public.can_manage_organization(target_organization_id)
  then
    raise exception 'Organization administrator permission required'
      using errcode = '42501';
  end if;

  perform 1
  from public.organization_members membership
  where membership.organization_id = target_organization_id
    and membership.user_id = target_user_id
  for update;
  if not found then
    raise exception 'Organization member not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(assignments) assignment
    where jsonb_typeof(assignment.value) <> 'object'
      or coalesce(assignment.value ->> 'brandId', '') !~
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or coalesce(assignment.value ->> 'role', '') not in (
        'administrator',
        'editor',
        'reviewer',
        'viewer'
      )
  )
  or (
    select count(*) <> count(distinct assignment.value ->> 'brandId')
    from jsonb_array_elements(assignments) assignment
  )
  then
    raise exception 'Invalid brand assignments' using errcode = '22023';
  end if;

  select count(*)
  into matched_brand_count
  from public.brands brand
  where brand.organization_id = target_organization_id
    and brand.status = 'active'
    and brand.id in (
      select (assignment.value ->> 'brandId')::uuid
      from jsonb_array_elements(assignments) assignment
    );

  if matched_brand_count <> assignment_count then
    raise exception 'A brand assignment is outside the organization or inactive'
      using errcode = '42501';
  end if;

  delete from public.brand_members brand_member
  using public.brands brand
  where brand.id = brand_member.brand_id
    and brand.organization_id = target_organization_id
    and brand_member.user_id = target_user_id;

  insert into public.brand_members (brand_id, user_id, role)
  select
    (assignment.value ->> 'brandId')::uuid,
    target_user_id,
    (assignment.value ->> 'role')::public.organization_role
  from jsonb_array_elements(assignments) assignment;

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
    null,
    actor_id,
    'organization_member.access_updated',
    'organization_member',
    target_user_id,
    jsonb_build_object(
      'organizationRole', target_role,
      'brandAssignments', assignments
    )
  );

  update public.organization_members membership
  set role = target_role
  where membership.organization_id = target_organization_id
    and membership.user_id = target_user_id;

  return jsonb_build_object(
    'userId', target_user_id,
    'organizationRole', target_role,
    'brandAssignmentCount', assignment_count
  );
end;
$$;

revoke all on function public.manage_organization_member_access(jsonb)
  from public, anon;
grant execute on function public.manage_organization_member_access(jsonb)
  to authenticated;

comment on function public.manage_organization_member_access(jsonb) is
  'Atomically updates one existing organization member role and active-brand assignments as an authenticated organization administrator.';
