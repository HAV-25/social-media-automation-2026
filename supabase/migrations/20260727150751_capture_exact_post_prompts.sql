alter table public.post_versions
  add column if not exists prompt_snapshot jsonb;

alter table public.post_versions
  add constraint post_versions_prompt_snapshot_shape
  check (
    prompt_snapshot is null
    or (
      jsonb_typeof(prompt_snapshot) = 'object'
      and coalesce(jsonb_typeof(prompt_snapshot -> 'systemPrompt') = 'string', false)
      and coalesce(jsonb_typeof(prompt_snapshot -> 'userPrompt') = 'string', false)
      and coalesce(prompt_snapshot ->> 'promptVersion', '') <> ''
      and coalesce((prompt_snapshot ->> 'checksum') ~ '^[a-f0-9]{64}$', false)
    )
  ) not valid;

alter table public.post_versions
  validate constraint post_versions_prompt_snapshot_shape;

create or replace function private.capture_post_prompt_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.entity_type = 'post_draft'
    and new.run_type = 'post_generation'
    and jsonb_typeof(new.model_usage -> 'promptSnapshot') = 'object'
  then
    update public.post_versions as version
    set prompt_snapshot = new.model_usage -> 'promptSnapshot'
    from public.post_drafts as draft
    where draft.id = new.entity_id
      and version.id = draft.current_version_id
      and version.post_draft_id = draft.id
      and version.prompt_snapshot is null;
  end if;
  return new;
end;
$$;

revoke all on function private.capture_post_prompt_snapshot() from public;
revoke all on function private.capture_post_prompt_snapshot() from anon;
revoke all on function private.capture_post_prompt_snapshot() from authenticated;

drop trigger if exists capture_post_prompt_snapshot on public.generation_runs;
create trigger capture_post_prompt_snapshot
after insert on public.generation_runs
for each row execute function private.capture_post_prompt_snapshot();

comment on column public.post_versions.prompt_snapshot is
  'Immutable exact system/user prompt snapshot, prompt version, and SHA-256 checksum used to generate this version.';

create or replace function private.protect_post_prompt_snapshot()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if old.prompt_snapshot is not null
    and new.prompt_snapshot is distinct from old.prompt_snapshot
  then
    raise exception 'Post prompt snapshot is immutable' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function private.protect_post_prompt_snapshot() from public;
revoke all on function private.protect_post_prompt_snapshot() from anon;
revoke all on function private.protect_post_prompt_snapshot() from authenticated;

drop trigger if exists protect_post_prompt_snapshot on public.post_versions;
create trigger protect_post_prompt_snapshot
before update of prompt_snapshot on public.post_versions
for each row execute function private.protect_post_prompt_snapshot();
