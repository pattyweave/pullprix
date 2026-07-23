-- PP-032 makes dismissed review facts reversible without introducing a
-- separate scoring queue. A timestamp on the PR is the handoff to PP-040.

alter table public.pull_requests
add column scoring_recalculation_requested_at timestamptz;

create function private.preserve_review_dismissal()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.source_type = 'review'
    and not old.effective
    and old.metadata_json ? 'dismissal'
    and new.effective
  then
    new.effective := false;
    new.superseded_at := old.superseded_at;
    new.metadata_json := new.metadata_json || jsonb_build_object(
      'dismissal',
      old.metadata_json->'dismissal'
    );
  end if;

  return new;
end;
$$;

revoke all on function private.preserve_review_dismissal() from public;

create trigger review_contributions_preserve_dismissal
before update on public.review_contributions
for each row execute function private.preserve_review_dismissal();

create function public.dismiss_github_review_contribution(
  p_github_installation_id bigint,
  p_github_repository_id bigint,
  p_github_pull_request_id bigint,
  p_dismissal jsonb
)
returns table (
  contribution_id uuid,
  disposition text,
  scoring_recalculation_requested_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_installation public.github_installations;
  selected_repository public.repositories;
  selected_pull_request public.pull_requests;
  selected_contribution public.review_contributions;
  dismissal_at timestamptz;
begin
  if p_github_installation_id is null or p_github_installation_id <= 0
    or p_github_repository_id is null or p_github_repository_id <= 0
    or p_github_pull_request_id is null or p_github_pull_request_id <= 0
    or p_dismissal is null
    or jsonb_typeof(p_dismissal) <> 'object'
    or coalesce(p_dismissal->>'source_github_id', '') !~ '^[1-9][0-9]*$'
    or coalesce(p_dismissal->>'source_version', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_dismissal->>'reviewer_github_user_id', '') !~ '^[1-9][0-9]*$'
    or coalesce(p_dismissal->>'dismissed_by_github_user_id', '') !~ '^[1-9][0-9]*$'
    or nullif(p_dismissal->>'dismissed_at', '') is null
  then
    raise exception 'invalid GitHub review dismissal data'
      using errcode = '22023';
  end if;

  begin
    dismissal_at := (p_dismissal->>'dismissed_at')::timestamptz;
  exception when invalid_datetime_format then
    raise exception 'invalid GitHub review dismissal timestamp'
      using errcode = '22023';
  end;

  select * into selected_installation
  from public.github_installations
  where github_installation_id = p_github_installation_id
    and status = 'active';

  if selected_installation.id is null then
    return query
      select null::uuid, 'ignored_installation'::text, null::timestamptz;
    return;
  end if;

  select * into selected_repository
  from public.repositories
  where installation_id = selected_installation.id
    and github_repository_id = p_github_repository_id
    and active;

  if selected_repository.id is null then
    return query
      select null::uuid, 'ignored_repository'::text, null::timestamptz;
    return;
  end if;

  select * into selected_pull_request
  from public.pull_requests
  where repository_id = selected_repository.id
    and github_pull_request_id = p_github_pull_request_id
  for update;

  if selected_pull_request.id is null then
    raise exception 'GitHub pull request not found' using errcode = 'P0002';
  end if;

  select * into selected_contribution
  from public.review_contributions
  where source_type = 'review'
    and source_github_id = (p_dismissal->>'source_github_id')::bigint
  for update;

  if selected_contribution.id is null then
    raise exception 'GitHub review contribution not found' using errcode = 'P0002';
  end if;

  if selected_contribution.organization_id <>
      selected_installation.organization_id
    or selected_contribution.repository_id <> selected_repository.id
    or selected_contribution.pull_request_id <> selected_pull_request.id
    or selected_contribution.actor_github_user_id <>
      (p_dismissal->>'reviewer_github_user_id')::bigint
  then
    raise exception 'GitHub review dismissal identity conflict'
      using errcode = '23505';
  end if;

  if not selected_contribution.effective
    and selected_contribution.metadata_json->'dismissal'->>'source_version' =
      p_dismissal->>'source_version'
  then
    return query select
      selected_contribution.id,
      'unchanged'::text,
      selected_pull_request.scoring_recalculation_requested_at;
    return;
  end if;

  update public.review_contributions
  set
    effective = false,
    superseded_at = dismissal_at,
    metadata_json = metadata_json || jsonb_build_object(
      'dismissal',
      jsonb_build_object(
        'dismissed_at', dismissal_at,
        'dismissed_by_github_user_id',
          (p_dismissal->>'dismissed_by_github_user_id')::bigint,
        'source_version', p_dismissal->>'source_version'
      )
    )
  where id = selected_contribution.id;

  update public.pull_requests pull_request_record
  set scoring_recalculation_requested_at = greatest(
    coalesce(
      pull_request_record.scoring_recalculation_requested_at,
      dismissal_at
    ),
    dismissal_at
  )
  where pull_request_record.id = selected_pull_request.id
  returning * into selected_pull_request;

  return query select
    selected_contribution.id,
    'dismissed'::text,
    selected_pull_request.scoring_recalculation_requested_at;
end;
$$;

revoke all on function public.dismiss_github_review_contribution(
  bigint,
  bigint,
  bigint,
  jsonb
) from public;
grant execute on function public.dismiss_github_review_contribution(
  bigint,
  bigint,
  bigint,
  jsonb
) to service_role;
