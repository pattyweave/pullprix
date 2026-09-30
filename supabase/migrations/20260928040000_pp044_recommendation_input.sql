-- The later authorized endpoint must supply independently verified repository
-- access and refresh stale GitHub gates before invoking the pure recommender.
create function public.get_organization_recommendation_candidates(p_organization_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'organizationId',p.organization_id,
    'repositoryId',p.repository_id,'url',p.html_url,'authorGithubUserId',p.author_github_user_id,
    'authorEligible',exists(select 1 from public.participants a join public.github_users u on u.id=a.github_user_id
      where a.organization_id=p.organization_id and a.eligible and u.github_user_id=p.author_github_user_id),
    'open',p.state='open','draft',p.draft,'selected',r.active and i.status='active','readyAt',p.ready_for_review_at,
    'waitingForAuthor',exists(select 1 from public.review_contributions c where c.pull_request_id=p.id and c.effective and c.review_state='changes_requested'),
    'reviewerGithubIds',coalesce((select jsonb_agg(distinct c.actor_github_user_id) from public.review_contributions c
      where c.pull_request_id=p.id and c.source_type='review'),'[]'::jsonb),
    -- Conservative lifetime occupancy, including pre-entry reviews with no
    -- season points. Never reopen fallback slots just because the ledger is zero.
    'priorReviewerCount',(select count(distinct c.actor_github_user_id) from public.review_contributions c
      where c.pull_request_id=p.id and c.source_type='review' and c.actor_github_user_id<>p.author_github_user_id
      and exists(select 1 from public.participants a join public.github_users u on u.id=a.github_user_id
        where a.organization_id=p.organization_id and a.eligible and u.github_user_id=c.actor_github_user_id)),
    'repositoryUsefulReviews',(select count(*) from public.score_components c join public.pull_requests cp on cp.id=c.pull_request_id
      where cp.repository_id=p.repository_id and c.status='effective' and c.component->>'kind' in ('approval','approval_with_feedback','comment_review_with_feedback','changes_requested')
      and (c.component->>'occurredAt')::timestamptz>=now()-interval '7 days'),
    'gate',case when g.observed_at is null then null else jsonb_build_object('credit',g.credit,'observedAt',g.observed_at,
      'unchanged',g.observed_at>=p.updated_at and not exists(select 1 from public.review_contributions c where c.pull_request_id=p.id and c.updated_at>g.observed_at)
        and not exists(select 1 from public.scoring_events e where e.pull_request_id=p.id and e.occurred_at>g.observed_at)
        and s.status='complete' and s.revision=s.computed_revision) end) order by p.id),'[]'::jsonb)
  from public.pull_requests p join public.repositories r on r.id=p.repository_id
    join public.github_installations i on i.id=r.installation_id
    left join public.pull_request_scoring s on s.pull_request_id=p.id
    left join lateral(select * from public.review_gate_observations g where g.pull_request_id=p.id order by observed_at desc limit 1) g on true
  where p.organization_id=p_organization_id and p.state='open';
$$;
revoke all on function public.get_organization_recommendation_candidates(uuid) from public,anon,authenticated;
grant execute on function public.get_organization_recommendation_candidates(uuid) to service_role;
