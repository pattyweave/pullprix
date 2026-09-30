-- GitHub can reuse installation.updated_at in a deletion event. Deletion is
-- terminal for an installation ID, regardless of the payload timestamp.
-- A new installation on the same organization has a different ID.
create or replace function public.apply_github_installation_lifecycle(
  p_github_installation_id bigint,
  p_account_id bigint,
  p_account_login text,
  p_account_type text,
  p_action text,
  p_github_updated_at timestamptz,
  p_installed_at timestamptz,
  p_suspended_at timestamptz default null
)
returns table (
  disposition text,
  organization_id uuid,
  installation_id uuid,
  installation_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_installation public.github_installations;
  selected_organization public.organizations;
  next_status text;
  normalized_login text;
begin
  normalized_login := lower(btrim(p_account_login));

  if p_github_installation_id is null or p_github_installation_id <= 0
    or p_account_id is null or p_account_id <= 0
    or normalized_login is null
    or normalized_login !~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$'
    or p_account_type not in ('Organization', 'User')
    or p_action not in (
      'created', 'deleted', 'new_permissions_accepted', 'renamed',
      'suspend', 'unsuspend'
    )
    or p_github_updated_at is null
    or p_installed_at is null
  then
    raise exception 'invalid GitHub installation lifecycle data'
      using errcode = '22023';
  end if;

  select * into selected_installation
  from public.github_installations
  where github_installation_id = p_github_installation_id
  for update;

  if selected_installation.id is not null
    and selected_installation.account_id <> p_account_id
  then
    raise exception 'GitHub installation account identity changed unexpectedly'
      using errcode = '22023';
  end if;

  if selected_installation.id is not null
    and (
      selected_installation.status = 'deleted'
      or (
        p_action <> 'deleted'
        and selected_installation.github_updated_at is not null
        and selected_installation.github_updated_at >= p_github_updated_at
      )
    )
  then
    return query select
      'stale'::text,
      selected_installation.organization_id,
      selected_installation.id,
      selected_installation.status;
    return;
  end if;

  next_status := case p_action
    when 'deleted' then 'deleted'
    when 'suspend' then 'suspended'
    when 'renamed' then coalesce(
      selected_installation.status,
      case when p_suspended_at is null then 'active' else 'suspended' end
    )
    else 'active'
  end;

  if selected_installation.id is not null then
    -- Serialize changes to the shared organization before deriving its status.
    select * into strict selected_organization
    from public.organizations
    where id = selected_installation.organization_id
    for update;

    -- An old deletion must not revert the current organization's identity.
    if p_action <> 'deleted' then
      update public.organizations
      set github_account_id = p_account_id,
        slug = normalized_login,
        name = p_account_login
      where id = selected_organization.id;
    end if;

    update public.github_installations
    set
      account_login = p_account_login,
      account_type = p_account_type,
      status = next_status,
      suspended_at = case
        when p_action = 'suspend' then coalesce(p_suspended_at, p_github_updated_at)
        when p_action in ('created', 'new_permissions_accepted', 'unsuspend') then null
        else suspended_at
      end,
      github_updated_at = greatest(github_updated_at, p_github_updated_at),
      last_lifecycle_action = p_action
    where id = selected_installation.id
    returning * into selected_installation;
  else
    insert into public.organizations (
      github_account_id, slug, name, status
    )
    values (p_account_id, normalized_login, p_account_login, next_status)
    on conflict (github_account_id) do update
    set
      slug = case when p_action = 'deleted' then organizations.slug else excluded.slug end,
      name = case when p_action = 'deleted' then organizations.name else excluded.name end
    returning * into selected_organization;

    insert into public.github_installations (
      organization_id,
      github_installation_id,
      account_id,
      account_login,
      account_type,
      status,
      installed_at,
      suspended_at,
      github_updated_at,
      last_lifecycle_action
    )
    values (
      selected_organization.id,
      p_github_installation_id,
      p_account_id,
      p_account_login,
      p_account_type,
      next_status,
      p_installed_at,
      case
        when next_status = 'suspended' then coalesce(p_suspended_at, p_github_updated_at)
        else null
      end,
      p_github_updated_at,
      p_action
    )
    returning * into selected_installation;
  end if;

  -- Removing an old app must not disable a replacement installation. The
  -- organization remains usable while any of its installations is active.
  update public.organizations
  set status = (
    select case
      when bool_or(installation.status = 'active') then 'active'
      when bool_or(installation.status = 'suspended') then 'suspended'
      else 'deleted'
    end
    from public.github_installations installation
    where installation.organization_id = selected_organization.id
  )
  where id = selected_organization.id;

  return query select
    'applied'::text,
    selected_organization.id,
    selected_installation.id,
    selected_installation.status;
end;
$$;
