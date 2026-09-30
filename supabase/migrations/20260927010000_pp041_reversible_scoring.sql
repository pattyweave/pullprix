-- One source of truth for points. No cached totals or second worker service.
create table public.pull_request_scoring (
  pull_request_id uuid primary key references public.pull_requests(id) on delete cascade,
  revision bigint not null default 1,
  computed_revision bigint not null default 0,
  status text not null default 'pending' check (status in ('pending','complete')),
  decisions jsonb not null default '[]',
  computed_at timestamptz,
  history_checked_at timestamptz
);
create table public.score_components (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  pull_request_id uuid not null references public.pull_requests(id) on delete cascade,
  participant_id uuid not null references public.participants(id) on delete cascade,
  review_id uuid not null references public.review_contributions(id),
  season_id text not null check (season_id ~ '^[0-9]{4}-[0-9]{2}$'),
  points integer not null check (points in (3,4,8,10,12)),
  status text not null check (status in ('effective','reversed')),
  component jsonb not null,
  updated_at timestamptz not null default now()
);
create index score_components_standings on public.score_components(organization_id,season_id,participant_id)
  where status='effective';
create table public.score_component_changes (
  id bigint generated always as identity primary key,
  component_id text not null references public.score_components(id) on delete cascade,
  revision bigint not null,
  previous_component jsonb,
  next_component jsonb,
  points_delta integer not null,
  created_at timestamptz not null default now()
);
-- Small immutable metadata extracts survive eventual raw-delivery retention.
create table public.scoring_events (
  delivery_id uuid primary key,
  pull_request_id uuid not null references public.pull_requests(id) on delete cascade,
  event_name text not null,
  action text not null,
  occurred_at timestamptz not null,
  state text not null,
  draft boolean not null,
  head_sha text,
  review_github_id bigint
);
create index scoring_events_pr on public.scoring_events(pull_request_id,occurred_at);
create table public.repository_scoring_access (
  repository_id uuid not null references public.repositories(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz,
  primary key(repository_id,starts_at),
  check (ends_at is null or ends_at>=starts_at)
);
create table public.review_gate_observations (
  pull_request_id uuid not null references public.pull_requests(id) on delete cascade,
  observed_at timestamptz not null,
  head_sha text not null,
  latest_review_github_id bigint,
  credit text not null check (credit in ('required','satisfied','unconfigured','unknown')),
  primary key(pull_request_id,observed_at)
);
do $$ declare name text; begin
  foreach name in array array['pull_request_scoring','score_components','score_component_changes',
    'scoring_events','repository_scoring_access','review_gate_observations'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('revoke all on public.%I from anon, authenticated',name);
  end loop;
end $$;

create function private.dirty_pr_score(p_id uuid) returns void language sql security definer set search_path='' as $$
  insert into public.pull_request_scoring(pull_request_id) select id from public.pull_requests where id=p_id
  on conflict(pull_request_id) do update set revision=pull_request_scoring.revision+1;
$$;
create function private.dirty_scoring_facts() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='pull_requests' then
    if tg_op='INSERT' or (to_jsonb(new)-'updated_at'-'scoring_recalculation_requested_at') is distinct from
      (to_jsonb(old)-'updated_at'-'scoring_recalculation_requested_at') or
      new.scoring_recalculation_requested_at is distinct from old.scoring_recalculation_requested_at
    then perform private.dirty_pr_score(new.id); end if;
  elsif tg_table_name='review_contributions' then
    if tg_op<>'UPDATE' or (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
      perform private.dirty_pr_score(coalesce(new.pull_request_id,old.pull_request_id));
    end if;
  elsif tg_table_name='participants' then
    if tg_op='INSERT' or (new.eligible,new.joined_at,new.left_at) is distinct from (old.eligible,old.joined_at,old.left_at) then
      perform private.dirty_pr_score(p.id) from public.pull_requests p
        where p.organization_id=new.organization_id;
    end if;
  else perform private.dirty_pr_score(new.pull_request_id);
  end if;
  return coalesce(new,old);
end;
$$;
create trigger pull_requests_dirty_score after insert or update on public.pull_requests
  for each row execute function private.dirty_scoring_facts();
create trigger contributions_dirty_score after insert or update or delete on public.review_contributions
  for each row execute function private.dirty_scoring_facts();
create trigger participants_dirty_score after insert or update on public.participants
  for each row execute function private.dirty_scoring_facts();
create trigger scoring_events_dirty_score after insert on public.scoring_events
  for each row execute function private.dirty_scoring_facts();

create function private.capture_scoring_event(p_delivery public.webhook_deliveries)
returns void language plpgsql security definer set search_path='' as $$
declare pr public.pull_requests; snapshot jsonb; happened timestamptz;
begin
  if p_delivery.status<>'processed' or p_delivery.event_name not in ('pull_request','pull_request_review') then return; end if;
  snapshot:=p_delivery.payload->'pull_request';
  if snapshot->>'id' is null or snapshot->>'state' not in ('open','closed') or snapshot->>'draft' is null then return; end if;
  select p.* into pr from public.pull_requests p join public.repositories r on r.id=p.repository_id
    join public.github_installations i on i.id=r.installation_id
    where p.github_pull_request_id=(snapshot->>'id')::bigint
      and r.github_repository_id=(p_delivery.payload->'repository'->>'id')::bigint
      and i.github_installation_id=p_delivery.github_installation_id;
  if pr.id is null then return; end if;
  happened:=case when p_delivery.event_name='pull_request_review' and p_delivery.action='submitted'
    then (p_delivery.payload->'review'->>'submitted_at')::timestamptz
    when p_delivery.action='opened' then (snapshot->>'created_at')::timestamptz
    else (snapshot->>'updated_at')::timestamptz end;
  if happened is null then return; end if;
  insert into public.scoring_events(delivery_id,pull_request_id,event_name,action,occurred_at,state,draft,head_sha,review_github_id)
    values(p_delivery.id,pr.id,p_delivery.event_name,p_delivery.action,happened,snapshot->>'state',
      (snapshot->>'draft')::boolean,snapshot->'head'->>'sha',
      case when p_delivery.event_name='pull_request_review' then (p_delivery.payload->'review'->>'id')::bigint end)
    on conflict do nothing;
end;
$$;
create function private.capture_processed_scoring_event() returns trigger language plpgsql security definer set search_path='' as $$
begin perform private.capture_scoring_event(new); return new; end;
$$;
create trigger deliveries_scoring_evidence after insert or update of status on public.webhook_deliveries
  for each row execute function private.capture_processed_scoring_event();

create function private.track_scoring_access() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_op='UPDATE' and old.installation_id<>new.installation_id then
    update public.repository_scoring_access set ends_at=greatest(starts_at,coalesce(new.access_updated_at,now()))
      where repository_id=new.id and ends_at is null;
  end if;
  if new.active and (tg_op='INSERT' or not old.active or old.installation_id<>new.installation_id) then
    insert into public.repository_scoring_access(repository_id,starts_at) values(new.id,coalesce(new.access_updated_at,new.created_at))
      on conflict do nothing;
  elsif not new.active and old.active then
    update public.repository_scoring_access set ends_at=greatest(starts_at,coalesce(new.access_updated_at,now()))
      where repository_id=new.id and ends_at is null;
  end if;
  if tg_op='INSERT' or new.active is distinct from old.active then
    perform private.dirty_pr_score(id) from public.pull_requests where repository_id=new.id;
  end if;
  return new;
end;
$$;
create trigger repositories_scoring_access after insert or update on public.repositories
  for each row execute function private.track_scoring_access();
-- Existing rows: only authorize from an observed boundary, never pretend the
-- latest mutable access timestamp was the original installation timestamp.
insert into public.repository_scoring_access(repository_id,starts_at)
  select id,coalesce(access_updated_at,created_at) from public.repositories where active;
select private.dirty_pr_score(id) from public.pull_requests;
select private.capture_scoring_event(d) from public.webhook_deliveries d where status='processed';

create function public.request_score_recomputation(p_pull_request_id uuid default null)
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
  perform private.dirty_pr_score(id) from public.pull_requests where p_pull_request_id is null or id=p_pull_request_id;
  get diagnostics changed=row_count; return changed;
end;
$$;
create function public.enqueue_scoring_jobs() returns integer language plpgsql security definer set search_path='' as $$
declare s record; queued integer:=0;
begin
  for s in select ps.*,p.organization_id from public.pull_request_scoring ps
    join public.pull_requests p on p.id=ps.pull_request_id
    where revision>computed_revision and not exists(select 1 from public.background_jobs j
      where j.job_type='scoring.pull-request' and j.payload->>'pull_request_id'=ps.pull_request_id::text
      and j.status in ('queued','processing','retrying'))
    order by ps.computed_at nulls first limit 10 for update of ps skip locked
  loop
    perform public.enqueue_background_job('scoring.pull-request','score:'||s.pull_request_id||':'||s.revision,
      jsonb_build_object('pull_request_id',s.pull_request_id),s.organization_id);
    queued:=queued+1;
  end loop;
  return queued;
end;
$$;

create function public.commit_pull_request_scores(p_pull_request_id uuid,p_revision bigint,p_result jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare state public.pull_request_scoring; pr public.pull_requests; c jsonb; existing public.score_components;
  next_ids text[]:='{}'; actor public.participants; source public.review_contributions; expected_id text; slot text;
begin
  perform 1 from public.pull_requests where id=p_pull_request_id for update;
  select * into state from public.pull_request_scoring where pull_request_id=p_pull_request_id for update;
  if state.revision is distinct from p_revision then return false; end if;
  select * into strict pr from public.pull_requests where id=p_pull_request_id;
  if coalesce(p_result->>'status','') not in ('complete','pending') or jsonb_typeof(p_result->'components') is distinct from 'array'
    or jsonb_typeof(p_result->'decisions') is distinct from 'array' then raise exception 'invalid score result' using errcode='22023'; end if;
  for c in select value from jsonb_array_elements(p_result->'components') loop
    select * into actor from public.participants where id=(c->>'participantId')::uuid and organization_id=pr.organization_id;
    select * into source from public.review_contributions where id=(c->>'reviewId')::uuid
      and pull_request_id=pr.id and source_type='review';
    slot:=case c->>'kind' when 'follow_through' then 'follow-through' when 'aging_pr_rescue' then 'rescue' else 'base' end;
    expected_id:='["v1","'||pr.organization_id||'","'||pr.id||'","'||actor.id||'","'||slot||'"]';
    if actor.id is null or source.id is null or not source.effective or source.review_state='dismissed'
      or not actor.eligible or not exists(select 1 from public.github_users u where u.id=actor.github_user_id and u.github_user_id=source.actor_github_user_id)
      or c->>'organizationId' is distinct from pr.organization_id::text or c->>'pullRequestId' is distinct from pr.id::text
      or c->>'id' is distinct from expected_id or c->>'scoringPolicyVersion' is distinct from 'v1'
      or c->>'status' is distinct from 'effective' or date_trunc('milliseconds',(c->>'occurredAt')::timestamptz) is distinct from date_trunc('milliseconds',source.occurred_at)
      or (c->>'points')::integer is distinct from (case c->>'kind' when 'approval' then 8 when 'approval_with_feedback' then 10
        when 'comment_review_with_feedback' then 10 when 'changes_requested' then 12 when 'follow_through' then 4 when 'aging_pr_rescue' then 3 end)
      or c->>'id'=any(next_ids) then raise exception 'invalid score component scope or policy' using errcode='22023'; end if;
    next_ids:=array_append(next_ids,c->>'id');
    select * into existing from public.score_components where id=c->>'id' for update;
    if existing.id is null or existing.status<>'effective' or existing.component is distinct from c then
      insert into public.score_components(id,organization_id,pull_request_id,participant_id,review_id,season_id,points,status,component)
        values(c->>'id',pr.organization_id,pr.id,actor.id,source.id,c->>'seasonId',(c->>'points')::integer,'effective',c)
        on conflict(id) do update set review_id=excluded.review_id,season_id=excluded.season_id,points=excluded.points,
          status='effective',component=excluded.component,updated_at=now();
      insert into public.score_component_changes(component_id,revision,previous_component,next_component,points_delta)
        values(c->>'id',p_revision,case when existing.status='effective' then existing.component end,c,
          (c->>'points')::integer-case when existing.status='effective' then existing.points else 0 end);
    end if;
  end loop;
  for existing in select * from public.score_components where pull_request_id=pr.id and status='effective' and not(id=any(next_ids)) for update loop
    update public.score_components set status='reversed',updated_at=now() where id=existing.id;
    insert into public.score_component_changes(component_id,revision,previous_component,next_component,points_delta)
      values(existing.id,p_revision,existing.component,null,-existing.points);
  end loop;
  update public.pull_request_scoring set computed_revision=p_revision,status=p_result->>'status',decisions=p_result->'decisions',computed_at=now()
    where pull_request_id=pr.id;
  -- This marker is legacy. Revision is the concurrency guard; clearing it must
  -- not itself dirty a successfully computed PR.
  return true;
end;
$$;

revoke all on function private.dirty_pr_score(uuid),private.dirty_scoring_facts(),
  private.capture_scoring_event(public.webhook_deliveries),private.capture_processed_scoring_event(),private.track_scoring_access() from public;
revoke all on function public.request_score_recomputation(uuid),public.enqueue_scoring_jobs(),
  public.commit_pull_request_scores(uuid,bigint,jsonb) from public;
grant execute on function public.request_score_recomputation(uuid),public.enqueue_scoring_jobs(),
  public.commit_pull_request_scores(uuid,bigint,jsonb) to service_role;

create function public.get_pull_request_scoring_input(p_pull_request_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object('revision',s.revision,'eligibleFrom',i.installed_at,
    'scope',jsonb_build_object('active',r.active and i.status='active' and o.status='active',
      'githubInstallationId',i.github_installation_id,'githubRepositoryId',r.github_repository_id,
      'githubPullRequestId',p.github_pull_request_id,'owner',r.owner,'name',r.name,'number',p.number),
    'components',coalesce((select jsonb_agg(c.component order by c.id) from public.score_components c
      where c.pull_request_id=p.id and c.status='effective'),'[]'),
    'input',jsonb_build_object('policyVersion','v1','organizationId',p.organization_id,
      'pullRequest',jsonb_build_object('id',p.id,'repositoryId',r.id,'number',p.number,'url',p.html_url,
        'authorGithubUserId',p.author_github_user_id,'authorEligible',
          (select private.github_user_exclusion(u) is null from public.github_users u where u.github_user_id=p.author_github_user_id)),
      'repositoryAccess',coalesce((select jsonb_agg(jsonb_build_object('from',a.starts_at,'until',a.ends_at) order by a.starts_at)
        from public.repository_scoring_access a where a.repository_id=r.id and (a.ends_at is null or a.ends_at>a.starts_at)),'[]'),
      'participants',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'githubUserId',u.github_user_id,
        'eligible',a.eligible and private.github_user_exclusion(u) is null,'leftAt',a.left_at,
        'scoringFrom',least(a.joined_at,
          (select min(rc.occurred_at) from public.review_contributions rc where rc.organization_id=p.organization_id and rc.actor_github_user_id=u.github_user_id),
          (select min(authored.opened_at) from public.pull_requests authored where authored.organization_id=p.organization_id and authored.author_github_user_id=u.github_user_id))) order by a.id)
        from public.participants a join public.github_users u on u.id=a.github_user_id where a.organization_id=p.organization_id),'[]'),
      'reviews',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'githubReviewId',c.source_github_id,
        'actorGithubUserId',c.actor_github_user_id,'occurredAt',c.occurred_at,'outcome',c.review_state,
        'bodyPresent',c.body_present,'effective',c.effective,'commitId',coalesce(c.metadata_json->>'commit_id','unknown'),
        'url',c.metadata_json->>'html_url','feedbackComplete',coalesce(s.history_checked_at>=c.updated_at,false),
        'readiness',case when latest.state='closed' then '{"state":"closed"}'::jsonb
          when latest.draft then '{"state":"draft"}'::jsonb
          when ready.occurred_at is not null and latest.state='open' and not latest.draft
            then jsonb_build_object('state','ready','since',ready.occurred_at)
          else '{"state":"unknown"}'::jsonb end,
        'creditBeforeReview',coalesce(g.credit,'unknown')) order by c.occurred_at,c.source_github_id)
        from public.review_contributions c
        left join lateral (select e.* from public.scoring_events e where e.pull_request_id=p.id and e.occurred_at<=c.occurred_at
          and (e.event_name='pull_request' or (e.action='submitted' and e.review_github_id=c.source_github_id))
          order by e.occurred_at desc,e.review_github_id nulls last limit 1) latest on true
        left join lateral (select e.* from public.scoring_events e where e.pull_request_id=p.id and e.event_name='pull_request'
          and e.action in ('opened','ready_for_review','reopened','converted_to_draft','closed') and e.occurred_at<=c.occurred_at
          order by e.occurred_at desc limit 1) ready on ready.state='open' and not ready.draft
        left join lateral (select obs.* from public.review_gate_observations obs
          where obs.pull_request_id=p.id and obs.observed_at<c.occurred_at and obs.head_sha=c.metadata_json->>'commit_id'
          and obs.latest_review_github_id is not distinct from (select prev.source_github_id from public.review_contributions prev
            where prev.pull_request_id=p.id and prev.source_type='review' and (prev.occurred_at,prev.source_github_id)<(c.occurred_at,c.source_github_id)
            order by prev.occurred_at desc,prev.source_github_id desc limit 1)
          and not exists(select 1 from public.scoring_events changed where changed.pull_request_id=p.id
            and changed.occurred_at>obs.observed_at and changed.occurred_at<=c.occurred_at
            and changed.action in ('synchronize','edited','dismissed','closed','converted_to_draft','ready_for_review','reopened'))
          order by obs.observed_at desc limit 1) g on true
        where c.pull_request_id=p.id and c.source_type='review'),'[]'),
      'comments',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'reviewId',review.id,'actorGithubUserId',c.actor_github_user_id,
        'bodyPresent',c.body_present,'effective',c.effective) order by c.id) from public.review_contributions c
        join public.review_contributions review on review.pull_request_id=c.pull_request_id and review.source_type='review'
          and review.source_github_id=(c.metadata_json->>'linked_review_github_id')::bigint
        where c.pull_request_id=p.id and c.source_type='review_comment'),'[]'),
      'headChanges',coalesce((select jsonb_agg(jsonb_build_object('occurredAt',e.occurred_at,'commitId',e.head_sha) order by e.occurred_at)
        from public.scoring_events e where e.pull_request_id=p.id and e.action='synchronize' and e.head_sha is not null),'[]'),
      'reviewHistoryComplete',s.history_checked_at is not null and s.history_checked_at>=coalesce(
        (select max(c.created_at) from public.review_contributions c where c.pull_request_id=p.id and c.source_type='review'),p.created_at),
      'headHistoryComplete',false))
  from public.pull_requests p join public.pull_request_scoring s on s.pull_request_id=p.id
    join public.repositories r on r.id=p.repository_id join public.github_installations i on i.id=r.installation_id
    join public.organizations o on o.id=p.organization_id where p.id=p_pull_request_id;
$$;
revoke all on function public.get_pull_request_scoring_input(uuid) from public;
grant execute on function public.get_pull_request_scoring_input(uuid) to service_role;

create function public.enrich_pull_request_scoring(p_pull_request_id uuid,p_revision bigint,p_items jsonb,
  p_observed_at timestamptz,p_gate jsonb default null)
returns boolean language plpgsql security definer set search_path='' as $$
declare s public.pull_request_scoring; pr public.pull_requests; repo public.repositories;
  installation public.github_installations; item jsonb; fact jsonb; existing public.review_contributions;
begin
  perform 1 from public.pull_requests where id=p_pull_request_id for update;
  select * into s from public.pull_request_scoring where pull_request_id=p_pull_request_id for update;
  if s.revision is distinct from p_revision then return false; end if;
  select * into strict pr from public.pull_requests where id=p_pull_request_id;
  select * into strict repo from public.repositories where id=pr.repository_id;
  select * into strict installation from public.github_installations where id=repo.installation_id;
  if not repo.active or installation.status<>'active' then return false; end if;
  if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items)>200 or p_observed_at is null then
    raise exception 'invalid scoring history snapshot' using errcode='22023'; end if;
  for item in select value from jsonb_array_elements(p_items) loop
    fact:=item->'fact';
    select * into existing from public.review_contributions where source_type=case item->>'kind' when 'review' then 'review' else 'review_comment' end
      and source_github_id=(fact->>'source_github_id')::bigint for update;
    if existing.id is not null and existing.pull_request_id<>pr.id then raise exception 'scoring history scope mismatch' using errcode='22023'; end if;
    if item->>'kind'='review' then
      if (item->'user'->>'id')::bigint is distinct from (fact->>'actor_github_user_id')::bigint then
        raise exception 'scoring reviewer identity mismatch' using errcode='22023'; end if;
      if fact->>'review_state'='dismissed' then
        insert into public.review_contributions(organization_id,installation_id,repository_id,pull_request_id,
          source_type,source_github_id,source_version,actor_github_user_id,action,review_state,body_present,occurred_at,effective,metadata_json)
        values(pr.organization_id,repo.installation_id,repo.id,pr.id,'review',(fact->>'source_github_id')::bigint,
          fact->>'source_version',(fact->>'actor_github_user_id')::bigint,'formal_review','dismissed',
          (fact->>'body_present')::boolean,(fact->>'occurred_at')::timestamptz,false,
          jsonb_build_object('html_url',fact->>'html_url','commit_id',fact->>'commit_id','dismissal_observed_at',p_observed_at))
        on conflict(source_type,source_github_id) do update set effective=false,
          metadata_json=review_contributions.metadata_json||jsonb_build_object('dismissal_observed_at',p_observed_at)
          where review_contributions.effective;
      elsif existing.id is null or (existing.updated_at<p_observed_at and existing.source_version is distinct from fact->>'source_version') then
        perform public.apply_github_review_contribution(installation.github_installation_id,repo.github_repository_id,pr.github_pull_request_id,fact);
      end if;
      perform private.resolve_activity_participant(pr.organization_id,item->'user',(fact->>'occurred_at')::timestamptz,p_observed_at);
    elsif item->>'kind'='comment' then
      perform public.apply_github_review_comment(installation.github_installation_id,repo.github_repository_id,pr.github_pull_request_id,'created',fact);
    else raise exception 'invalid scoring history kind' using errcode='22023'; end if;
  end loop;
  -- Absence is authoritative only because the worker supplied complete lists,
  -- and only for facts older than the fetch. Keep rows for audit/replay.
  update public.review_contributions c set effective=false,superseded_at=p_observed_at,
    metadata_json=c.metadata_json||jsonb_build_object('deletion_observed_at',p_observed_at)||
      case when c.source_type='review_comment' then jsonb_build_object('source_updated_at',p_observed_at) else '{}'::jsonb end
    where c.pull_request_id=pr.id and c.effective and c.updated_at<p_observed_at
      and not exists(select 1 from jsonb_array_elements(p_items) x where (x->'fact'->>'source_github_id')::bigint=c.source_github_id
        and x->>'kind'=case c.source_type when 'review' then 'review' else 'comment' end);
  if p_gate is not null then
    if coalesce(p_gate->>'credit','') not in ('required','satisfied','unconfigured','unknown')
      or nullif(p_gate->>'headSha','') is null or (p_gate->>'observedAt')::timestamptz<p_observed_at then
      raise exception 'invalid review gate observation' using errcode='22023'; end if;
    insert into public.review_gate_observations(pull_request_id,observed_at,head_sha,latest_review_github_id,credit)
      values(pr.id,(p_gate->>'observedAt')::timestamptz,p_gate->>'headSha',(p_gate->>'latestReviewGithubId')::bigint,p_gate->>'credit') on conflict do nothing;
  end if;
  -- Use transaction time for rows imported in this transaction. A later webhook
  -- invalidates feedback completeness again via its newer updated_at.
  update public.pull_request_scoring set history_checked_at=greatest(now(),p_observed_at),revision=revision+1 where pull_request_id=pr.id;
  return true;
end;
$$;
revoke all on function public.enrich_pull_request_scoring(uuid,bigint,jsonb,timestamptz,jsonb) from public;
grant execute on function public.enrich_pull_request_scoring(uuid,bigint,jsonb,timestamptz,jsonb) to service_role;

create function private.scoring_installation_boundary() returns trigger language plpgsql security definer set search_path='' as $$
declare boundary timestamptz;
begin
  if new.status is not distinct from old.status then return new; end if;
  boundary:=case when new.status='suspended' then coalesce(new.suspended_at,now()) else now() end;
  if new.status<>'active' then
    update public.repository_scoring_access a set ends_at=greatest(a.starts_at,boundary)
      from public.repositories r where r.id=a.repository_id and r.installation_id=new.id and a.ends_at is null;
  else
    insert into public.repository_scoring_access(repository_id,starts_at)
      select id,boundary from public.repositories where installation_id=new.id and active on conflict do nothing;
  end if;
  perform private.dirty_pr_score(p.id) from public.pull_requests p join public.repositories r on r.id=p.repository_id where r.installation_id=new.id;
  return new;
end;
$$;
create trigger installation_scoring_boundary after update of status on public.github_installations
  for each row execute function private.scoring_installation_boundary();
revoke all on function private.scoring_installation_boundary() from public;

-- An observed deletion/dismissal cannot be undone by replaying an old review.
create or replace function private.preserve_review_dismissal()
returns trigger language plpgsql set search_path='' as $$
begin
  if old.source_type='review' and not old.effective and
    (old.metadata_json ? 'dismissal' or old.metadata_json ? 'dismissal_observed_at' or old.metadata_json ? 'deletion_observed_at') then
    new.effective:=false;
    new.superseded_at:=old.superseded_at;
    new.metadata_json:=new.metadata_json||jsonb_strip_nulls(jsonb_build_object('dismissal',old.metadata_json->'dismissal',
      'dismissal_observed_at',old.metadata_json->'dismissal_observed_at','deletion_observed_at',old.metadata_json->'deletion_observed_at'));
  end if;
  return new;
end;
$$;
