-- PP-034: identities and roster membership are derived from canonical activity,
-- not invitations or organization-auth memberships. No scores are awarded here.
alter table public.github_users
  add column metadata_observed_at timestamptz,
  add column account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'deleted')),
  add column exclusion_override text
    check (exclusion_override in ('service_account', 'suspended', 'deleted')),
  add column correction_note text;

alter table public.participants
  add column last_qualifying_activity_at timestamptz;

create function private.github_user_exclusion(p_user public.github_users)
returns text language sql stable set search_path = '' as $$
  select case
    when p_user.exclusion_override is not null then p_user.exclusion_override
    when p_user.account_status <> 'active' then p_user.account_status
    when lower(p_user.login) = 'ghost' then 'deleted'
    when p_user.account_type = 'Bot' or lower(p_user.login) like '%[bot]' then 'bot'
    when p_user.account_type <> 'User' then 'nonhuman'
    else null
  end;
$$;

-- Identity corrections update eligibility, never the canonical PR/review facts.
create function private.refresh_participant_identity()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  update public.participants
  set eligible = private.github_user_exclusion(new) is null,
      display_name = new.login
  where github_user_id = new.id;

  if private.github_user_exclusion(old) is distinct from private.github_user_exclusion(new) then
    update public.pull_requests pr
    set scoring_recalculation_requested_at = now()
    where pr.author_github_user_id = new.github_user_id
      or exists (
        select 1 from public.review_contributions contribution
        where contribution.pull_request_id = pr.id
          and contribution.actor_github_user_id = new.github_user_id
      );
  end if;
  return new;
end;
$$;

create trigger github_users_refresh_participants
after update on public.github_users
for each row execute function private.refresh_participant_identity();

create function private.resolve_activity_participant(
  p_organization_id uuid, p_user jsonb, p_activity_at timestamptz,
  p_observed_at timestamptz
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  identity_row public.github_users;
  observed_status text;
begin
  if p_user is null or jsonb_typeof(p_user) <> 'object'
    or coalesce(p_user->>'id', '') !~ '^[1-9][0-9]*$'
    or nullif(btrim(p_user->>'login'), '') is null
    or coalesce(p_user->>'type', '') not in ('User', 'Bot', 'Organization')
    or p_activity_at is null or p_observed_at is null
  then
    raise exception 'invalid GitHub participant identity' using errcode = '22023';
  end if;

  observed_status := case
    when lower(p_user->>'login') = 'ghost' then 'deleted'
    when p_user->>'suspended_at' is not null then 'suspended'
    else 'active'
  end;

  insert into public.github_users (
    github_user_id, login, avatar_url, account_type, account_status, metadata_observed_at
  ) values (
    (p_user->>'id')::bigint, p_user->>'login', p_user->>'avatar_url',
    p_user->>'type', observed_status, p_observed_at
  )
  on conflict (github_user_id) do update
    set login = excluded.login,
        avatar_url = excluded.avatar_url,
        account_type = excluded.account_type,
        account_status = excluded.account_status,
        metadata_observed_at = excluded.metadata_observed_at
    where github_users.metadata_observed_at is null
      or github_users.metadata_observed_at < excluded.metadata_observed_at
  returning * into identity_row;

  if identity_row.id is null then
    select * into strict identity_row from public.github_users
    where github_user_id = (p_user->>'id')::bigint;
  end if;

  -- Keep existing history; old backfill/replay cannot add a new roster member.
  -- Existing inactive participants are deliberately not reactivated by replay.
  update public.participants
  set last_qualifying_activity_at = greatest(last_qualifying_activity_at, p_activity_at)
  where organization_id = p_organization_id and github_user_id = identity_row.id;

  if private.github_user_exclusion(identity_row) is null
    and p_activity_at >= now() - interval '60 days' and p_activity_at <= now()
  then
    insert into public.participants (
      organization_id, github_user_id, display_name, joined_at,
      last_qualifying_activity_at
    ) values (
      p_organization_id, identity_row.id, identity_row.login, p_activity_at,
      p_activity_at
    )
    on conflict (organization_id, github_user_id) do nothing;
  end if;
end;
$$;

-- Read the original signed delivery and match it to persisted facts, so callers
-- cannot accidentally resolve the sender, requested reviewers, or another team.
create function public.resolve_github_delivery_participants(p_delivery_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  delivery public.webhook_deliveries;
  pr public.pull_requests;
  review public.review_contributions;
begin
  select * into strict delivery from public.webhook_deliveries where id = p_delivery_id;
  if not (
    delivery.event_name = 'pull_request'
    or (delivery.event_name = 'pull_request_review' and delivery.action in ('submitted', 'edited'))
  ) then return 0; end if;

  select request.* into pr
  from public.pull_requests request
  join public.repositories repo on repo.id = request.repository_id and repo.active
  join public.github_installations installation on installation.id = repo.installation_id
    and installation.status = 'active'
  join public.organizations organization on organization.id = repo.organization_id
    and organization.status = 'active'
  where installation.github_installation_id = delivery.github_installation_id
    and repo.github_repository_id = (delivery.payload->'repository'->>'id')::bigint
    and request.github_pull_request_id = (delivery.payload->'pull_request'->>'id')::bigint;
  if pr.id is null then return 0; end if;

  if (delivery.payload->'pull_request'->'user'->>'id')::bigint
    is distinct from pr.author_github_user_id then
    raise exception 'PR author does not match stored identity' using errcode = '22023';
  end if;
  perform private.resolve_activity_participant(
    pr.organization_id, delivery.payload->'pull_request'->'user',
    pr.opened_at, delivery.received_at
  );

  if delivery.event_name = 'pull_request_review' then
    select * into review from public.review_contributions
    where pull_request_id = pr.id and source_type = 'review'
      and source_github_id = (delivery.payload->'review'->>'id')::bigint;
    if review.id is null then
      raise exception 'review not found for participant resolution' using errcode = 'P0002';
    end if;
    if (delivery.payload->'review'->'user'->>'id')::bigint
      is distinct from review.actor_github_user_id then
      raise exception 'reviewer does not match stored identity' using errcode = '22023';
    end if;
    perform private.resolve_activity_participant(
      pr.organization_id, delivery.payload->'review'->'user',
      review.occurred_at, delivery.received_at
    );
    return 2;
  end if;
  return 1;
end;
$$;

-- Concierge correction only: no manager UI or browser write access. Explicit
-- correction is necessary for automation that GitHub reports as a normal User.
create function public.set_github_user_exclusion(
  p_github_user_id bigint, p_exclusion text, p_note text
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if (p_exclusion is not null and p_exclusion not in ('service_account', 'suspended', 'deleted'))
    or nullif(btrim(p_note), '') is null then
    raise exception 'invalid participant correction' using errcode = '22023';
  end if;
  update public.github_users
  set exclusion_override = p_exclusion, correction_note = p_note
  where github_user_id = p_github_user_id;
  if not found then raise exception 'GitHub user not found' using errcode = 'P0002'; end if;
end;
$$;

-- A participant-policy gate for the future scorer, NOT a complete scoring
-- decision. Season windows, draft timing, caps and points remain PP-040 work.
create function public.review_participant_exclusion_reason(p_contribution_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case
    when contribution.id is null then 'contribution_missing'
    when contribution.source_type <> 'review' then 'not_formal_review'
    when not contribution.effective then 'review_ineffective'
    when contribution.actor_github_user_id = pr.author_github_user_id then 'self_review'
    when author.id is null then 'author_unresolved'
    when private.github_user_exclusion(author) is not null then 'author_excluded'
    when reviewer.id is null then 'reviewer_unresolved'
    when private.github_user_exclusion(reviewer) is not null then 'reviewer_excluded'
    when participant.id is null then 'participant_missing'
    when not participant.eligible then 'participant_ineligible'
    when not participant.active and
      (participant.left_at is null or contribution.occurred_at >= participant.left_at)
      then 'participant_inactive'
    else null
  end
  from (select p_contribution_id as id) requested
  left join public.review_contributions contribution on contribution.id = requested.id
  left join public.pull_requests pr on pr.id = contribution.pull_request_id
  left join public.github_users author on author.github_user_id = pr.author_github_user_id
  left join public.github_users reviewer on reviewer.github_user_id = contribution.actor_github_user_id
  left join public.participants participant on participant.github_user_id = reviewer.id
    and participant.organization_id = contribution.organization_id;
$$;

revoke all on function private.github_user_exclusion(public.github_users) from public;
revoke all on function private.refresh_participant_identity() from public;
revoke all on function private.resolve_activity_participant(uuid, jsonb, timestamptz, timestamptz) from public;
revoke all on function public.resolve_github_delivery_participants(uuid) from public;
revoke all on function public.set_github_user_exclusion(bigint, text, text) from public;
revoke all on function public.review_participant_exclusion_reason(uuid) from public;
grant execute on function public.resolve_github_delivery_participants(uuid) to service_role;
grant execute on function public.set_github_user_exclusion(bigint, text, text) to service_role;
grant execute on function public.review_participant_exclusion_reason(uuid) to service_role;
