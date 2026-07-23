-- PP-033 records whether an inline review comment contains feedback without
-- retaining its body, diff, path, length, or treating comment count as quality.

alter table public.review_contributions
  alter column review_state drop not null,
  drop constraint review_contributions_action_check,
  drop constraint review_contributions_review_state_check,
  add constraint review_contributions_source_shape_check check (
    (
      source_type = 'review'
      and action = 'formal_review'
      and review_state in ('approved', 'changes_requested', 'commented')
    )
    or (
      source_type = 'review_comment'
      and action = 'inline_comment'
      and review_state is null
    )
  );

create function public.apply_github_review_comment(
  p_github_installation_id bigint,
  p_github_repository_id bigint,
  p_github_pull_request_id bigint,
  p_action text,
  p_comment jsonb
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
  existing_contribution public.review_contributions;
  selected_contribution public.review_contributions;
  comment_created_at timestamptz;
  comment_updated_at timestamptz;
  existing_source_updated_at timestamptz;
  linked_review_github_id bigint;
  in_reply_to_github_id bigint;
begin
  if p_github_installation_id is null or p_github_installation_id <= 0
    or p_github_repository_id is null or p_github_repository_id <= 0
    or p_github_pull_request_id is null or p_github_pull_request_id <= 0
    or p_action not in ('created', 'edited', 'deleted')
    or p_comment is null
    or jsonb_typeof(p_comment) <> 'object'
    or coalesce(p_comment->>'source_github_id', '') !~ '^[1-9][0-9]*$'
    or coalesce(p_comment->>'source_version', '') !~ '^[0-9a-f]{64}$'
    or coalesce(p_comment->>'actor_github_user_id', '') !~ '^[1-9][0-9]*$'
    or nullif(btrim(p_comment->>'actor_type'), '') is null
    or jsonb_typeof(p_comment->'is_bot') <> 'boolean'
    or jsonb_typeof(p_comment->'is_self_authored') <> 'boolean'
    or jsonb_typeof(p_comment->'body_present') <> 'boolean'
    or nullif(p_comment->>'created_at', '') is null
    or nullif(p_comment->>'updated_at', '') is null
    or nullif(btrim(p_comment->>'html_url'), '') is null
    or nullif(btrim(p_comment->>'author_association'), '') is null
    or (
      p_comment->>'linked_review_github_id' is not null
      and p_comment->>'linked_review_github_id' !~ '^[1-9][0-9]*$'
    )
    or (
      p_comment->>'in_reply_to_github_id' is not null
      and p_comment->>'in_reply_to_github_id' !~ '^[1-9][0-9]*$'
    )
  then
    raise exception 'invalid GitHub review comment data'
      using errcode = '22023';
  end if;

  begin
    comment_created_at := (p_comment->>'created_at')::timestamptz;
    comment_updated_at := (p_comment->>'updated_at')::timestamptz;
    linked_review_github_id :=
      nullif(p_comment->>'linked_review_github_id', '')::bigint;
    in_reply_to_github_id :=
      nullif(p_comment->>'in_reply_to_github_id', '')::bigint;
  exception when invalid_datetime_format or numeric_value_out_of_range then
    raise exception 'invalid GitHub review comment values'
      using errcode = '22023';
  end;

  if comment_updated_at < comment_created_at then
    raise exception 'invalid GitHub review comment timestamps'
      using errcode = '22023';
  end if;

  select * into selected_installation
  from public.github_installations
  where github_installation_id = p_github_installation_id
    and status = 'active';

  if selected_installation.id is null then
    return query select
      null::uuid,
      'ignored_installation'::text,
      null::timestamptz;
    return;
  end if;

  select * into selected_repository
  from public.repositories
  where installation_id = selected_installation.id
    and github_repository_id = p_github_repository_id
    and active;

  if selected_repository.id is null then
    return query select
      null::uuid,
      'ignored_repository'::text,
      null::timestamptz;
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

  select * into existing_contribution
  from public.review_contributions
  where source_type = 'review_comment'
    and source_github_id = (p_comment->>'source_github_id')::bigint
  for update;

  if existing_contribution.id is not null then
    existing_source_updated_at :=
      (existing_contribution.metadata_json->>'source_updated_at')::timestamptz;

    if existing_source_updated_at > comment_updated_at
      or (
        existing_source_updated_at = comment_updated_at
        and not existing_contribution.effective
        and p_action <> 'deleted'
      )
    then
      return query select
        existing_contribution.id,
        'stale'::text,
        selected_pull_request.scoring_recalculation_requested_at;
      return;
    end if;

    if existing_contribution.source_version = p_comment->>'source_version' then
      return query select
        existing_contribution.id,
        'unchanged'::text,
        selected_pull_request.scoring_recalculation_requested_at;
      return;
    end if;

    if existing_contribution.organization_id <>
        selected_installation.organization_id
      or existing_contribution.repository_id <> selected_repository.id
      or existing_contribution.pull_request_id <> selected_pull_request.id
      or existing_contribution.actor_github_user_id <>
        (p_comment->>'actor_github_user_id')::bigint
    then
      raise exception 'GitHub review comment identity conflict'
        using errcode = '23505';
    end if;
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
      superseded_at,
      metadata_json
    )
    values (
      selected_installation.organization_id,
      selected_installation.id,
      selected_repository.id,
      selected_pull_request.id,
      'review_comment',
      (p_comment->>'source_github_id')::bigint,
      p_comment->>'source_version',
      (p_comment->>'actor_github_user_id')::bigint,
      'inline_comment',
      null,
      (p_comment->>'body_present')::boolean,
      comment_created_at,
      p_action <> 'deleted',
      case when p_action = 'deleted' then comment_updated_at else null end,
      jsonb_build_object(
        'actor_type', p_comment->>'actor_type',
        'author_association', p_comment->>'author_association',
        'html_url', p_comment->>'html_url',
        'in_reply_to_github_id', in_reply_to_github_id,
        'is_bot', (p_comment->>'is_bot')::boolean,
        'is_self_authored', (p_comment->>'is_self_authored')::boolean,
        'linked_review_github_id', linked_review_github_id,
        'source_updated_at', comment_updated_at
      )
    )
    returning * into selected_contribution;
  else
    update public.review_contributions
    set
      source_version = p_comment->>'source_version',
      body_present = (p_comment->>'body_present')::boolean,
      occurred_at = comment_created_at,
      effective = p_action <> 'deleted',
      superseded_at =
        case when p_action = 'deleted' then comment_updated_at else null end,
      metadata_json = jsonb_build_object(
        'actor_type', p_comment->>'actor_type',
        'author_association', p_comment->>'author_association',
        'html_url', p_comment->>'html_url',
        'in_reply_to_github_id', in_reply_to_github_id,
        'is_bot', (p_comment->>'is_bot')::boolean,
        'is_self_authored', (p_comment->>'is_self_authored')::boolean,
        'linked_review_github_id', linked_review_github_id,
        'source_updated_at', comment_updated_at
      )
    where id = existing_contribution.id
    returning * into selected_contribution;
  end if;

  update public.pull_requests pull_request_record
  set scoring_recalculation_requested_at = greatest(
    coalesce(
      pull_request_record.scoring_recalculation_requested_at,
      comment_updated_at
    ),
    comment_updated_at
  )
  where pull_request_record.id = selected_pull_request.id
  returning * into selected_pull_request;

  return query select
    selected_contribution.id,
    case when existing_contribution.id is null
      then 'inserted'::text
      else 'updated'::text
    end,
    selected_pull_request.scoring_recalculation_requested_at;
end;
$$;

revoke all on function public.apply_github_review_comment(
  bigint,
  bigint,
  bigint,
  text,
  jsonb
) from public;
grant execute on function public.apply_github_review_comment(
  bigint,
  bigint,
  bigint,
  text,
  jsonb
) to service_role;
