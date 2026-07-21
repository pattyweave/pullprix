-- PP-012 establishes the smallest durable organization boundary required for
-- GitHub installation ingestion and private browser reads.

create schema if not exists private;
revoke all on schema private from public;

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  github_account_id bigint not null unique check (github_account_id > 0),
  slug text not null check (slug = lower(slug) and slug ~ '^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$'),
  name text not null check (btrim(name) <> ''),
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index organizations_slug_lower_idx
  on public.organizations (lower(slug));

create table public.github_installations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  github_installation_id bigint not null unique check (github_installation_id > 0),
  account_id bigint not null check (account_id > 0),
  account_login text not null check (btrim(account_login) <> ''),
  account_type text not null check (account_type in ('Organization', 'User')),
  status text not null default 'active' check (status in ('active', 'suspended', 'deleted')),
  installed_at timestamptz not null,
  suspended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create index github_installations_organization_id_idx
  on public.github_installations (organization_id);

create table public.repositories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  installation_id uuid not null,
  github_repository_id bigint not null unique check (github_repository_id > 0),
  owner text not null check (btrim(owner) <> ''),
  name text not null check (btrim(name) <> ''),
  full_name text not null check (btrim(full_name) <> ''),
  private boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (installation_id, organization_id)
    references public.github_installations(id, organization_id)
    on delete cascade
);

create index repositories_organization_id_idx
  on public.repositories (organization_id);
create index repositories_installation_id_idx
  on public.repositories (installation_id);

create table public.github_users (
  id uuid primary key default gen_random_uuid(),
  github_user_id bigint not null unique check (github_user_id > 0),
  login text not null check (btrim(login) <> ''),
  avatar_url text,
  account_type text not null check (account_type in ('User', 'Bot', 'Organization')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index github_users_login_lower_idx
  on public.github_users (lower(login));

-- Membership grants private-team access. It is deliberately separate from the
-- participant roster so an authorized noncoding manager need not appear in
-- standings. auth_user_id is attached after a verified GitHub sign-in.
create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  github_user_id uuid not null references public.github_users(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, github_user_id),
  unique (organization_id, auth_user_id)
);

create index organization_memberships_auth_user_id_idx
  on public.organization_memberships (auth_user_id)
  where active;

create table public.participants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  github_user_id uuid not null references public.github_users(id) on delete restrict,
  display_name text not null check (btrim(display_name) <> ''),
  eligible boolean not null default true,
  active boolean not null default true,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, github_user_id),
  check ((active and left_at is null) or not active)
);

create index participants_organization_id_idx
  on public.participants (organization_id);
create index participants_github_user_id_idx
  on public.participants (github_user_id);

create function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function private.set_updated_at();

create trigger github_installations_set_updated_at
before update on public.github_installations
for each row execute function private.set_updated_at();

create trigger repositories_set_updated_at
before update on public.repositories
for each row execute function private.set_updated_at();

create trigger github_users_set_updated_at
before update on public.github_users
for each row execute function private.set_updated_at();

create trigger organization_memberships_set_updated_at
before update on public.organization_memberships
for each row execute function private.set_updated_at();

create trigger participants_set_updated_at
before update on public.participants
for each row execute function private.set_updated_at();

-- SECURITY DEFINER avoids recursive RLS checks against the membership table.
-- The function returns one boolean and cannot expose membership rows.
create function private.is_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.organization_memberships membership
      where membership.organization_id = target_organization_id
        and membership.auth_user_id = (select auth.uid())
        and membership.active
    );
$$;

create function private.can_access_github_user(target_github_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from public.participants participant
      join public.organization_memberships membership
        on membership.organization_id = participant.organization_id
      where participant.github_user_id = target_github_user_id
        and membership.auth_user_id = (select auth.uid())
        and membership.active
    );
$$;

revoke all on function private.set_updated_at() from public;
revoke all on function private.is_organization_member(uuid) from public;
revoke all on function private.can_access_github_user(uuid) from public;
grant usage on schema private to authenticated;
grant execute on function private.is_organization_member(uuid) to authenticated;
grant execute on function private.can_access_github_user(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.github_installations enable row level security;
alter table public.repositories enable row level security;
alter table public.github_users enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.participants enable row level security;

create policy "Members can read their organization"
on public.organizations for select to authenticated
using ((select private.is_organization_member(id)));

create policy "Members can read their GitHub installations"
on public.github_installations for select to authenticated
using ((select private.is_organization_member(organization_id)));

create policy "Members can read their repositories"
on public.repositories for select to authenticated
using ((select private.is_organization_member(organization_id)));

create policy "Members can read shared GitHub identities"
on public.github_users for select to authenticated
using ((select private.can_access_github_user(id)));

create policy "Members can read their own membership"
on public.organization_memberships for select to authenticated
using (
  (select auth.uid()) is not null
  and auth_user_id = (select auth.uid())
  and active
);

create policy "Members can read their participants"
on public.participants for select to authenticated
using ((select private.is_organization_member(organization_id)));

revoke all on table public.organizations from anon, authenticated;
revoke all on table public.github_installations from anon, authenticated;
revoke all on table public.repositories from anon, authenticated;
revoke all on table public.github_users from anon, authenticated;
revoke all on table public.organization_memberships from anon, authenticated;
revoke all on table public.participants from anon, authenticated;

grant select on table public.organizations to authenticated;
grant select on table public.github_installations to authenticated;
grant select on table public.repositories to authenticated;
grant select on table public.github_users to authenticated;
grant select on table public.organization_memberships to authenticated;
grant select on table public.participants to authenticated;
