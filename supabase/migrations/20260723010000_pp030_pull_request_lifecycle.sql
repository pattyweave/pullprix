-- PP-030 stores the current lifecycle snapshot needed for review aging and
-- later review normalization. GitHub remains the source of truth.

alter table public.repositories
add constraint repositories_id_organization_key unique (id, organization_id);

create table public.pull_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  repository_id uuid not null,
  github_pull_request_id bigint not null check (github_pull_request_id > 0),
  number integer not null check (number > 0),
  author_github_user_id bigint not null check (author_github_user_id > 0),
  title text not null check (btrim(title) <> ''),
  html_url text not null check (btrim(html_url) <> ''),
  state text not null check (state in ('open', 'closed')),
  draft boolean not null,
  requested_reviewer_github_ids bigint[] not null default array[]::bigint[],
  opened_at timestamptz not null,
  ready_for_review_at timestamptz,
  closed_at timestamptz,
  merged_at timestamptz,
  last_activity_at timestamptz not null,
  github_updated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (repository_id, organization_id)
    references public.repositories(id, organization_id)
    on delete cascade,
  unique (repository_id, github_pull_request_id),
  unique (repository_id, number),
  check (not draft or ready_for_review_at is null),
  check (
    (state = 'open' and closed_at is null and merged_at is null)
    or (state = 'closed' and closed_at is not null)
  ),
  check (merged_at is null or closed_at is not null)
);

create index pull_requests_organization_id_idx
  on public.pull_requests (organization_id);
create index pull_requests_repository_id_idx
  on public.pull_requests (repository_id);
create index pull_requests_open_ready_idx
  on public.pull_requests (organization_id, ready_for_review_at)
  where state = 'open' and not draft;

create trigger pull_requests_set_updated_at
before update on public.pull_requests
for each row execute function private.set_updated_at();

create function public.apply_github_pull_request_lifecycle(
  p_github_installation_id bigint,
  p_github_repository_id bigint,
  p_action text,
  p_pull_request jsonb
)
returns table (
  disposition text,
  pull_request_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_repository public.repositories;
  existing_pull_request public.pull_requests;
  selected_pull_request public.pull_requests;
  reviewer_ids bigint[];
  pull_request_updated_at timestamptz;
  pull_request_created_at timestamptz;
  pull_request_closed_at timestamptz;
  pull_request_merged_at timestamptz;
  pull_request_draft boolean;
begin
  if p_github_installation_id is null or p_github_installation_id <= 0
    or p_github_repository_id is null or p_github_repository_id <= 0
    or p_action not in (
      'opened',
      'reopened',
      'converted_to_draft',
      'ready_for_review',
      'edited',
      'closed',
      'review_requested',
      'review_request_removed'
    )
    or p_pull_request is null
    or jsonb_typeof(p_pull_request) <> 'object'
    or coalesce(p_pull_request->>'github_pull_request_id', '') !~ '^[1-9][0-9]*$'
    or coalesce(p_pull_request->>'number', '') !~ '^[1-9][0-9]*$'
    or coalesce(p_pull_request->>'author_github_user_id', '') !~ '^[1-9][0-9]*$'
    or nullif(btrim(p_pull_request->>'title'), '') is null
    or nullif(btrim(p_pull_request->>'html_url'), '') is null
    or p_pull_request->>'state' not in ('open', 'closed')
    or jsonb_typeof(p_pull_request->'draft') <> 'boolean'
    or nullif(p_pull_request->>'created_at', '') is null
    or nullif(p_pull_request->>'updated_at', '') is null
    or jsonb_typeof(p_pull_request->'requested_reviewer_github_ids') <> 'array'
    or exists (
      select 1
      from jsonb_array_elements(p_pull_request->'requested_reviewer_github_ids') reviewer
      where jsonb_typeof(reviewer) <> 'number'
        or reviewer #>> '{}' !~ '^[1-9][0-9]*$'
    )
  then
    raise exception 'invalid GitHub pull request lifecycle data'
      using errcode = '22023';
  end if;

  begin
    pull_request_updated_at := (p_pull_request->>'updated_at')::timestamptz;
    pull_request_created_at := (p_pull_request->>'created_at')::timestamptz;
    pull_request_closed_at := nullif(p_pull_request->>'closed_at', '')::timestamptz;
    pull_request_merged_at := nullif(p_pull_request->>'merged_at', '')::timestamptz;
  exception when invalid_datetime_format then
    raise exception 'invalid GitHub pull request lifecycle timestamps'
      using errcode = '22023';
  end;

  pull_request_draft := (p_pull_request->>'draft')::boolean;
  if (
    (p_pull_request->>'state' = 'open'
      and (pull_request_closed_at is not null or pull_request_merged_at is not null))
    or (p_pull_request->>'state' = 'closed' and pull_request_closed_at is null)
  ) then
    raise exception 'invalid GitHub pull request lifecycle state'
      using errcode = '22023';
  end if;

  select repository.* into selected_repository
  from public.repositories repository
  join public.github_installations installation
    on installation.id = repository.installation_id
  where installation.github_installation_id = p_github_installation_id
    and installation.status = 'active'
    and repository.github_repository_id = p_github_repository_id
    and repository.active
  for update of repository;

  if selected_repository.id is null then
    return query select 'ignored_repository'::text, null::uuid;
    return;
  end if;

  select coalesce(array_agg(value::bigint order by value::bigint), array[]::bigint[])
  into reviewer_ids
  from (
    select distinct reviewer #>> '{}' as value
    from jsonb_array_elements(
      p_pull_request->'requested_reviewer_github_ids'
    ) reviewer
  ) reviewers;

  select * into existing_pull_request
  from public.pull_requests
  where repository_id = selected_repository.id
    and github_pull_request_id =
      (p_pull_request->>'github_pull_request_id')::bigint
  for update;

  if existing_pull_request.id is not null
    and existing_pull_request.github_updated_at > pull_request_updated_at
  then
    return query select 'stale'::text, existing_pull_request.id;
    return;
  end if;

  if existing_pull_request.id is null then
    insert into public.pull_requests (
      organization_id,
      repository_id,
      github_pull_request_id,
      number,
      author_github_user_id,
      title,
      html_url,
      state,
      draft,
      requested_reviewer_github_ids,
      opened_at,
      ready_for_review_at,
      closed_at,
      merged_at,
      last_activity_at,
      github_updated_at
    )
    values (
      selected_repository.organization_id,
      selected_repository.id,
      (p_pull_request->>'github_pull_request_id')::bigint,
      (p_pull_request->>'number')::integer,
      (p_pull_request->>'author_github_user_id')::bigint,
      p_pull_request->>'title',
      p_pull_request->>'html_url',
      p_pull_request->>'state',
      pull_request_draft,
      reviewer_ids,
      pull_request_created_at,
      case
        when pull_request_draft then null
        when p_action in ('ready_for_review', 'reopened')
          then pull_request_updated_at
        else pull_request_created_at
      end,
      pull_request_closed_at,
      pull_request_merged_at,
      pull_request_updated_at,
      pull_request_updated_at
    )
    returning * into selected_pull_request;

    return query select 'inserted'::text, selected_pull_request.id;
    return;
  end if;

  update public.pull_requests
  set
    number = (p_pull_request->>'number')::integer,
    author_github_user_id = (p_pull_request->>'author_github_user_id')::bigint,
    title = p_pull_request->>'title',
    html_url = p_pull_request->>'html_url',
    state = p_pull_request->>'state',
    draft = pull_request_draft,
    requested_reviewer_github_ids = reviewer_ids,
    opened_at = pull_request_created_at,
    ready_for_review_at = case
      when pull_request_draft then null
      when p_action in ('ready_for_review', 'reopened')
        then pull_request_updated_at
      when existing_pull_request.ready_for_review_at is not null
        then existing_pull_request.ready_for_review_at
      else pull_request_created_at
    end,
    closed_at = pull_request_closed_at,
    merged_at = pull_request_merged_at,
    last_activity_at = pull_request_updated_at,
    github_updated_at = pull_request_updated_at
  where id = existing_pull_request.id
  returning * into selected_pull_request;

  return query select 'updated'::text, selected_pull_request.id;
end;
$$;

revoke all on function public.apply_github_pull_request_lifecycle(
  bigint,
  bigint,
  text,
  jsonb
) from public;
grant execute on function public.apply_github_pull_request_lifecycle(
  bigint,
  bigint,
  text,
  jsonb
) to service_role;

alter table public.pull_requests enable row level security;
create policy "Members can read their pull requests"
on public.pull_requests for select to authenticated
using ((select private.is_organization_member(organization_id)));

revoke all on table public.pull_requests from anon, authenticated;
grant select on table public.pull_requests to authenticated;
