-- PP-031 records formal review facts once. Scoring is intentionally deferred
-- so themes and point rules consume the same canonical contribution ledger.

alter table public.pull_requests
add constraint pull_requests_id_organization_key unique (id, organization_id);

create table public.review_contributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  installation_id uuid not null,
  repository_id uuid not null,
  pull_request_id uuid not null,
  source_type text not null check (btrim(source_type) <> ''),
  source_github_id bigint not null check (source_github_id > 0),
  source_version text not null check (source_version ~ '^[0-9a-f]{64}$'),
  actor_github_user_id bigint not null check (actor_github_user_id > 0),
  action text not null check (action = 'formal_review'),
  review_state text not null
    check (review_state in ('approved', 'changes_requested', 'commented')),
  body_present boolean not null,
  occurred_at timestamptz not null,
  effective boolean not null default true,
  superseded_at timestamptz,
  metadata_json jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata_json) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (installation_id, organization_id)
    references public.github_installations(id, organization_id)
    on delete cascade,
  foreign key (repository_id, organization_id)
    references public.repositories(id, organization_id)
    on delete cascade,
  foreign key (pull_request_id, organization_id)
    references public.pull_requests(id, organization_id)
    on delete cascade,
  unique (source_type, source_github_id)
);

create index review_contributions_organization_id_idx
  on public.review_contributions (organization_id);
create index review_contributions_pull_request_id_idx
  on public.review_contributions (pull_request_id);
create index review_contributions_actor_idx
  on public.review_contributions (organization_id, actor_github_user_id);

create trigger review_contributions_set_updated_at
before update on public.review_contributions
for each row execute function private.set_updated_at();

create function public.apply_github_review_contribution(
  p_github_installation_id bigint,
  p_github_repository_id bigint,
  p_github_pull_request_id bigint,
  p_review jsonb
)
returns table (
  contribution_id uuid,
  disposition text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_installation public.github_installations;
  selected_repository public.repositories;
  selected_pull_request public.pull_requests;
  existing_contribution public.review_contributions;
  selected_contribution public.review_contributions;
  review_occurred_at timestamptz;
begin
  if p_github_installation_id is null or p_github_installation_id <= 0
    or p_github_repository_id is null or p_github_repository_id <= 0
    or p_github_pull_request_id is null or p_github_pull_request_id <= 0
    or p_review is null
    or jsonb_typeof(p_review) <> 'object'
    or coalesce(p_review->>'source_github_id', '') !~ '^[1-9][0-9]*$'
    or coalesce(p_review->>'source_version', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_review->>'actor_github_user_id', '') !~ '^[1-9][0-9]*$'
    or p_review->>'review_state'
      not in ('approved', 'changes_requested', 'commented')
    or jsonb_typeof(p_review->'body_present') <> 'boolean'
    or nullif(p_review->>'occurred_at', '') is null
    or nullif(btrim(p_review->>'html_url'), '') is null
    or nullif(btrim(p_review->>'commit_id'), '') is null
    or nullif(btrim(p_review->>'author_association'), '') is null
  then
    raise exception 'invalid GitHub review contribution data'
      using errcode = '22023';
  end if;

  begin
    review_occurred_at := (p_review->>'occurred_at')::timestamptz;
  exception when invalid_datetime_format then
    raise exception 'invalid GitHub review contribution timestamp'
      using errcode = '22023';
  end;

  select * into selected_installation
  from public.github_installations
  where github_installation_id = p_github_installation_id
    and status = 'active';

  if selected_installation.id is null then
    return query select null::uuid, 'ignored_installation'::text;
    return;
  end if;

  select * into selected_repository
  from public.repositories
  where installation_id = selected_installation.id
    and github_repository_id = p_github_repository_id
    and active;

  if selected_repository.id is null then
    return query select null::uuid, 'ignored_repository'::text;
    return;
  end if;

  select * into selected_pull_request
  from public.pull_requests
  where repository_id = selected_repository.id
    and github_pull_request_id = p_github_pull_request_id;

  if selected_pull_request.id is null then
    raise exception 'GitHub pull request not found' using errcode = 'P0002';
  end if;

  select * into existing_contribution
  from public.review_contributions
  where source_type = 'review'
    and source_github_id = (p_review->>'source_github_id')::bigint
  for update;

  if existing_contribution.id is not null
    and existing_contribution.source_version = p_review->>'source_version'
  then
    return query select existing_contribution.id, 'unchanged'::text;
    return;
  end if;

  if existing_contribution.id is null then
    insert into public.review_contributions (
      organization_id,
      installation_id,
      repository_id,
      pull_request_id,
      source_type,
      source_github_id,
      source_version,
      actor_github_user_id,
      action,
      review_state,
      body_present,
      occurred_at,
      effective,
      metadata_json
    )
    values (
      selected_installation.organization_id,
      selected_installation.id,
      selected_repository.id,
      selected_pull_request.id,
      'review',
      (p_review->>'source_github_id')::bigint,
      p_review->>'source_version',
      (p_review->>'actor_github_user_id')::bigint,
      'formal_review',
      p_review->>'review_state',
      (p_review->>'body_present')::boolean,
      review_occurred_at,
      true,
      jsonb_build_object(
        'author_association', p_review->>'author_association',
        'commit_id', p_review->>'commit_id',
        'html_url', p_review->>'html_url'
      )
    )
    returning * into selected_contribution;

    return query select selected_contribution.id, 'inserted'::text;
    return;
  end if;

  if existing_contribution.organization_id <> selected_installation.organization_id
    or existing_contribution.repository_id <> selected_repository.id
    or existing_contribution.pull_request_id <> selected_pull_request.id
    or existing_contribution.actor_github_user_id <>
      (p_review->>'actor_github_user_id')::bigint
  then
    raise exception 'GitHub review identity conflict' using errcode = '23505';
  end if;

  update public.review_contributions
  set
    source_version = p_review->>'source_version',
    review_state = p_review->>'review_state',
    body_present = (p_review->>'body_present')::boolean,
    occurred_at = review_occurred_at,
    effective = true,
    superseded_at = null,
    metadata_json = jsonb_build_object(
      'author_association', p_review->>'author_association',
      'commit_id', p_review->>'commit_id',
      'html_url', p_review->>'html_url'
    )
  where id = existing_contribution.id
  returning * into selected_contribution;

  return query select selected_contribution.id, 'updated'::text;
end;
$$;

revoke all on function public.apply_github_review_contribution(
  bigint,
  bigint,
  bigint,
  jsonb
) from public;
grant execute on function public.apply_github_review_contribution(
  bigint,
  bigint,
  bigint,
  jsonb
) to service_role;

alter table public.review_contributions enable row level security;
create policy "Members can read their review contributions"
on public.review_contributions for select to authenticated
using ((select private.is_organization_member(organization_id)));

revoke all on table public.review_contributions from anon, authenticated;
grant select on table public.review_contributions to authenticated;
