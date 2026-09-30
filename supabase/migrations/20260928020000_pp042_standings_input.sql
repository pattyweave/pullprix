-- PP-042 server-only read model. Product authorization/endpoints remain PP-060.
-- No aggregate cache: effective score components remain the points authority.
create function public.get_organization_standings_input(p_organization_id uuid,p_season_id text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if p_season_id !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' or p_season_id is null then
    raise exception 'invalid season ID' using errcode='22023';
  end if;
  select jsonb_build_object('organizationId',o.id,'seasonId',p_season_id,
    'eligibleFrom',coalesce((select min(installed_at) from public.github_installations where organization_id=o.id),o.created_at),
    'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,
      'avatarUrl',u.avatar_url,'eligible',p.eligible,'active',p.active,
      'joinedAt',least(p.joined_at,(select min(c.occurred_at) from public.review_contributions c
        where c.organization_id=o.id and c.actor_github_user_id=u.github_user_id)),
      'leftAt',p.left_at) order by p.id)
      from public.participants p join public.github_users u on u.id=p.github_user_id
      where p.organization_id=o.id),'[]'::jsonb),
    'components',coalesce((select jsonb_agg(c.component order by c.id) from public.score_components c
      where c.organization_id=o.id and c.season_id=p_season_id and c.status='effective'),'[]'::jsonb),
    -- Conservatively expose unresolved organization work; never label a partial
    -- ledger as final. Season finalization will narrow this in its own ticket.
    'pendingPullRequests',(select count(*) from public.pull_request_scoring s
      join public.pull_requests pr on pr.id=s.pull_request_id where pr.organization_id=o.id
      and (s.status='pending' or s.revision<>s.computed_revision))) into result
  from public.organizations o where o.id=p_organization_id;
  if result is null then raise exception 'organization not found' using errcode='P0002'; end if;
  return result;
end;
$$;
revoke all on function public.get_organization_standings_input(uuid,text) from public,anon,authenticated;
grant execute on function public.get_organization_standings_input(uuid,text) to service_role;
