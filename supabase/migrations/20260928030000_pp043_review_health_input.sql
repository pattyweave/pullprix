-- Verified useful review work comes from effective base components, not raw
-- review counts. Historical GitHub snapshots alone cannot prove credit windows.
create function public.get_organization_review_health_input(p_organization_id uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object('organizationId',o.id,
    'eligibleFrom',coalesce((select min(installed_at) from public.github_installations where organization_id=o.id),o.created_at),
    'coverageFrom',coalesce((select min(starts_at) from public.repository_scoring_access a join public.repositories r on r.id=a.repository_id where r.organization_id=o.id),now()),
    'pendingPullRequests',(select count(*) from public.pull_request_scoring s join public.pull_requests p on p.id=s.pull_request_id
      where p.organization_id=o.id and (s.status='pending' or s.revision<>s.computed_revision)),
    'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'eligible',p.eligible,'active',p.active,
      'joinedAt',least(p.joined_at,(select min(c.occurred_at) from public.review_contributions c where c.organization_id=o.id and c.actor_github_user_id=u.github_user_id)),
      'leftAt',p.left_at) order by p.id) from public.participants p join public.github_users u on u.id=p.github_user_id where p.organization_id=o.id),'[]'::jsonb),
    'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',c.review_id,'organizationId',o.id,
      'participantId',c.participant_id,'pullRequestId',c.pull_request_id,'occurredAt',c.component->>'occurredAt',
      'readyAt',(select e.occurred_at from public.scoring_events e where e.pull_request_id=c.pull_request_id
        and e.event_name='pull_request' and e.action in ('opened','ready_for_review','reopened','converted_to_draft','closed')
        and e.occurred_at<=(c.component->>'occurredAt')::timestamptz order by e.occurred_at desc limit 1)) order by c.id)
      from public.score_components c join public.pull_requests pr on pr.id=c.pull_request_id
      join public.review_contributions review on review.id=c.review_id
      where c.organization_id=o.id and c.status='effective'
        and (review.effective or private.dismissed_approval_retains_credit(review))
        and not review.metadata_json ? 'deletion_observed_at'
        and review.actor_github_user_id<>pr.author_github_user_id
        and c.component->>'kind' in ('approval','approval_with_feedback','comment_review_with_feedback','changes_requested')
        and exists(select 1 from public.participants p join public.github_users u on u.id=p.github_user_id
          where p.organization_id=o.id and p.eligible and u.github_user_id=pr.author_github_user_id)),'[]'::jsonb),
    'pullRequests',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'organizationId',o.id,
      'open',p.state='open','draft',p.draft,'selected',r.active and i.status='active',
      'authorEligible',exists(select 1 from public.participants a join public.github_users u on u.id=a.github_user_id
        where a.organization_id=o.id and a.eligible and u.github_user_id=p.author_github_user_id),
      'readyAt',p.ready_for_review_at,
      'waitingForAuthor',exists(select 1 from public.review_contributions c where c.pull_request_id=p.id
        and c.source_type='review' and c.effective and c.review_state='changes_requested'
        and c.actor_github_user_id<>p.author_github_user_id
        and exists(select 1 from public.participants a join public.github_users u on u.id=a.github_user_id
          where a.organization_id=o.id and a.eligible and u.github_user_id=c.actor_github_user_id)
        and not exists(select 1 from public.review_contributions newer where newer.pull_request_id=p.id
          and newer.source_type='review' and newer.actor_github_user_id=c.actor_github_user_id
          and newer.effective and (newer.occurred_at,newer.source_github_id)>(c.occurred_at,c.source_github_id)))) order by p.id)
      from public.pull_requests p join public.repositories r on r.id=p.repository_id
      join public.github_installations i on i.id=r.installation_id where p.organization_id=o.id),'[]'::jsonb),
    'dailyQueue','[]'::jsonb) into result from public.organizations o where o.id=p_organization_id;
  if result is null then raise exception 'organization not found' using errcode='P0002'; end if;
  return result;
end;
$$;
revoke all on function public.get_organization_review_health_input(uuid) from public,anon,authenticated;
grant execute on function public.get_organization_review_health_input(uuid) to service_role;
