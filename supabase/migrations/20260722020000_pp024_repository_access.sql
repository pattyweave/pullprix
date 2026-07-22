-- PP-024 keeps repository access current without deleting historical tenant
-- records. A transferred repository may therefore have one inactive row under
-- its old installation and a separate active row under its new installation.

alter table public.github_installations
add column repository_selection text
  check (repository_selection in ('all', 'selected')),
add column repository_selection_updated_at timestamptz;

alter table public.repositories
drop constraint repositories_github_repository_id_key;

alter table public.repositories
add column access_updated_at timestamptz,
add column metadata_updated_at timestamptz,
add constraint repositories_installation_github_repository_key
  unique (installation_id, github_repository_id);

create function public.apply_github_repository_changes(
  p_github_installation_id bigint,
  p_event_at timestamptz,
  p_repositories jsonb,
  p_repository_selection text default null
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_installation public.github_installations;
  selected_repository public.repositories;
  repository_data jsonb;
  repository_id bigint;
  repository_active boolean;
  repository_has_active boolean;
  applied_count integer := 0;
begin
  if p_github_installation_id is null or p_github_installation_id <= 0
    or p_event_at is null
    or p_repositories is null
    or jsonb_typeof(p_repositories) <> 'array'
    or (
      p_repository_selection is not null
      and p_repository_selection not in ('all', 'selected')
    )
  then
    raise exception 'invalid GitHub repository change data'
      using errcode = '22023';
  end if;

  select * into selected_installation
  from public.github_installations
  where github_installation_id = p_github_installation_id
  for update;

  if selected_installation.id is null then
    raise exception 'GitHub installation not found' using errcode = 'P0002';
  end if;

  if p_repository_selection is not null
    and (
      selected_installation.repository_selection_updated_at is null
      or selected_installation.repository_selection_updated_at <= p_event_at
    )
  then
    update public.github_installations
    set
      repository_selection = p_repository_selection,
      repository_selection_updated_at = p_event_at
    where id = selected_installation.id;
  end if;

  for repository_data in
    select value from jsonb_array_elements(p_repositories)
  loop
    if jsonb_typeof(repository_data) <> 'object'
      or coalesce(repository_data->>'github_repository_id', '') !~ '^[1-9][0-9]*$'
      or nullif(btrim(repository_data->>'owner'), '') is null
      or nullif(btrim(repository_data->>'name'), '') is null
      or nullif(btrim(repository_data->>'full_name'), '') is null
      or jsonb_typeof(repository_data->'private') <> 'boolean'
      or (
        repository_data ? 'active'
        and jsonb_typeof(repository_data->'active') not in ('boolean', 'null')
      )
    then
      raise exception 'invalid GitHub repository data' using errcode = '22023';
    end if;

    repository_id := (repository_data->>'github_repository_id')::bigint;
    repository_has_active := repository_data ? 'active'
      and jsonb_typeof(repository_data->'active') = 'boolean';
    repository_active := case
      when repository_has_active then (repository_data->>'active')::boolean
      else null
    end;

    select * into selected_repository
    from public.repositories
    where installation_id = selected_installation.id
      and github_repository_id = repository_id
    for update;

    if selected_repository.id is null then
      insert into public.repositories (
        organization_id,
        installation_id,
        github_repository_id,
        owner,
        name,
        full_name,
        private,
        active,
        access_updated_at,
        metadata_updated_at
      )
      values (
        selected_installation.organization_id,
        selected_installation.id,
        repository_id,
        repository_data->>'owner',
        repository_data->>'name',
        repository_data->>'full_name',
        (repository_data->>'private')::boolean,
        coalesce(repository_active, true),
        case when repository_has_active then p_event_at else null end,
        p_event_at
      );
      applied_count := applied_count + 1;
    else
      update public.repositories
      set
        owner = case
          when metadata_updated_at is null or metadata_updated_at <= p_event_at
            then repository_data->>'owner'
          else owner
        end,
        name = case
          when metadata_updated_at is null or metadata_updated_at <= p_event_at
            then repository_data->>'name'
          else name
        end,
        full_name = case
          when metadata_updated_at is null or metadata_updated_at <= p_event_at
            then repository_data->>'full_name'
          else full_name
        end,
        private = case
          when metadata_updated_at is null or metadata_updated_at <= p_event_at
            then (repository_data->>'private')::boolean
          else private
        end,
        metadata_updated_at = case
          when metadata_updated_at is null or metadata_updated_at <= p_event_at
            then p_event_at
          else metadata_updated_at
        end,
        active = case
          when repository_has_active
            and (access_updated_at is null or access_updated_at <= p_event_at)
            then repository_active
          else active
        end,
        access_updated_at = case
          when repository_has_active
            and (access_updated_at is null or access_updated_at <= p_event_at)
            then p_event_at
          else access_updated_at
        end
      where id = selected_repository.id;
      applied_count := applied_count + 1;
    end if;
  end loop;

  return applied_count;
end;
$$;

revoke all on function public.apply_github_repository_changes(
  bigint,
  timestamptz,
  jsonb,
  text
) from public;

grant execute on function public.apply_github_repository_changes(
  bigint,
  timestamptz,
  jsonb,
  text
) to service_role;
