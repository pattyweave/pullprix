-- Product clarification: every dismissal preserves earned approval work credit.
-- GitHub validity stays false; deletion and eligibility corrections still apply.
create function private.dismissed_approval_retains_credit(c public.review_contributions)
returns boolean language sql immutable set search_path='' as $$
  select coalesce(c.source_type='review' and c.review_state='approved'
    and (c.metadata_json ? 'dismissal' or c.metadata_json ? 'dismissal_observed_at')
    and not c.metadata_json ? 'deletion_observed_at',false);
$$;
revoke all on function private.dismissed_approval_retains_credit(public.review_contributions) from public;

-- Keep the existing canonical loader and add the explicit scoring-only flag.
alter function public.get_pull_request_scoring_input(uuid) set schema private;
create function public.get_pull_request_scoring_input(p_pull_request_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_set(bundle,'{input,reviews}',coalesce((
    select jsonb_agg(review||jsonb_build_object('approvalDismissed',private.dismissed_approval_retains_credit(c)) order by position)
    from jsonb_array_elements(bundle->'input'->'reviews') with ordinality as r(review,position)
      join public.review_contributions c on c.id=(review->>'id')::uuid and c.pull_request_id=p_pull_request_id
  ),'[]'::jsonb))
  from (select private.get_pull_request_scoring_input(p_pull_request_id) as bundle) data;
$$;
revoke all on function private.get_pull_request_scoring_input(uuid) from public,service_role;
revoke all on function public.get_pull_request_scoring_input(uuid) from public;
grant execute on function public.get_pull_request_scoring_input(uuid) to service_role;

create or replace function public.commit_pull_request_scores(p_pull_request_id uuid,p_revision bigint,p_result jsonb)
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
    if actor.id is null or source.id is null
      or (not source.effective and not private.dismissed_approval_retains_credit(source)) or source.review_state='dismissed'
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
  return true;
end;
$$;

-- Previously dismissed approvals are already effective=false in GitHub facts.
-- A later deletion must still be detected by a complete API history snapshot.
alter function public.enrich_pull_request_scoring(uuid,bigint,jsonb,timestamptz,jsonb) set schema private;
create function public.enrich_pull_request_scoring(p_pull_request_id uuid,p_revision bigint,p_items jsonb,
  p_observed_at timestamptz,p_gate jsonb default null)
returns boolean language plpgsql security definer set search_path='' as $$
begin
  if not private.enrich_pull_request_scoring(p_pull_request_id,p_revision,p_items,p_observed_at,p_gate) then return false; end if;
  update public.review_contributions c set effective=false,superseded_at=p_observed_at,
    metadata_json=c.metadata_json||jsonb_build_object('deletion_observed_at',p_observed_at)
    where c.pull_request_id=p_pull_request_id and private.dismissed_approval_retains_credit(c)
      and c.updated_at<p_observed_at and not exists(select 1 from jsonb_array_elements(p_items) item
        where item->>'kind'='review' and (item->'fact'->>'source_github_id')::bigint=c.source_github_id);
  return true;
end;
$$;
revoke all on function private.enrich_pull_request_scoring(uuid,bigint,jsonb,timestamptz,jsonb) from public,service_role;
revoke all on function public.enrich_pull_request_scoring(uuid,bigint,jsonb,timestamptz,jsonb) from public;
grant execute on function public.enrich_pull_request_scoring(uuid,bigint,jsonb,timestamptz,jsonb) to service_role;

-- Revisit affected history under the clarified rule, without resetting caps.
select private.dirty_pr_score(pull_request_id) from public.review_contributions
  where private.dismissed_approval_retains_credit(review_contributions);
