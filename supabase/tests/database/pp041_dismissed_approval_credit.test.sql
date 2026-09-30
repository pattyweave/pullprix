begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select * from public.apply_github_installation_lifecycle(12345,9876,'credit-team','Organization','created',now()-interval '3 days',now()-interval '3 days');
select public.apply_github_repository_changes(12345,now()-interval '3 days',
  '[{"github_repository_id":1001,"owner":"credit-team","name":"api","full_name":"credit-team/api","private":true,"active":true}]','selected');
select * from public.apply_github_pull_request_lifecycle(12345,1001,'opened',jsonb_build_object(
  'github_pull_request_id',9001,'number',1,'author_github_user_id',7001,'title','Credit test','html_url','https://github.com/credit-team/api/pull/1',
  'state','open','draft',false,'requested_reviewer_github_ids','[]'::jsonb,'created_at',now()-interval '2 days',
  'updated_at',now()-interval '2 days','closed_at',null,'merged_at',null));
select private.resolve_activity_participant((select id from public.organizations),'{"id":7002,"login":"reviewer","type":"User"}',now()-interval '1 day',now());
select public.apply_github_review_contribution(12345,1001,9001,jsonb_build_object('source_github_id',5001,'source_version',repeat('a',64),
  'actor_github_user_id',7002,'review_state','approved','body_present',false,'occurred_at',now()-interval '1 day','commit_id',repeat('1',40),
  'html_url','https://github.com/credit-team/api/pull/1#pullrequestreview-5001','author_association','COLLABORATOR'));
create function pg_temp.input() returns jsonb language sql as $$
  select public.get_pull_request_scoring_input(id) from public.pull_requests;
$$;
create function pg_temp.award() returns boolean language sql as $$
  select public.commit_pull_request_scores(p.id,s.revision,jsonb_build_object('status','complete','decisions','[]'::jsonb,'components',
    jsonb_build_array(jsonb_build_object('id','["v1","'||p.organization_id||'","'||p.id||'","'||a.id||'","base"]',
      'organizationId',p.organization_id,'pullRequestId',p.id,'participantId',a.id,'reviewId',r.id,'seasonId',to_char(now(),'YYYY-MM'),
      'points',8,'kind','approval','occurredAt',r.occurred_at,'status','effective','scoringPolicyVersion','v1'))))
  from public.pull_requests p join public.pull_request_scoring s on s.pull_request_id=p.id
    join public.review_contributions r on r.pull_request_id=p.id cross join public.participants a;
$$;
select ok(pg_temp.award(),'original approval earns its base');
select public.dismiss_github_review_contribution(12345,1001,9001,jsonb_build_object('source_github_id',5001,'source_version',repeat('d',64),
  'reviewer_github_user_id',7002,'dismissed_by_github_user_id',7001,'dismissed_at',now()));
select is((select effective from public.review_contributions),false,'GitHub approval validity remains false');
select is(pg_temp.input()->'input'->'reviews'->0->>'approvalDismissed','true','scoring separately recognizes dismissed original approval');
select ok(pg_temp.award(),'dismissed approval keeps its earned score');
select ok(pg_temp.award(),'recomputing a dismissed approval is idempotent');
select is((select count(*) from public.score_component_changes),1::bigint,'dismissal creates neither a reversal nor a second award');
select is((select sum(points) from public.score_components where status='effective'),8::bigint,'reviewer retains eight points');
update public.participants set eligible=false;
select throws_ok($$select pg_temp.award()$$,'22023','invalid score component scope or policy','dismissal does not override eligibility corrections');
update public.participants set eligible=true;
-- API-only dismissal evidence also preserves a previously known approval.
insert into public.review_contributions(organization_id,installation_id,repository_id,pull_request_id,source_type,source_github_id,
  source_version,actor_github_user_id,action,review_state,body_present,occurred_at,effective,metadata_json)
  select organization_id,installation_id,repository_id,pull_request_id,source_type,5002,repeat('b',64),actor_github_user_id,action,
    'approved',false,occurred_at,false,jsonb_build_object('dismissal_observed_at',now()) from public.review_contributions where source_github_id=5001;
select ok((select private.dismissed_approval_retains_credit(c) from public.review_contributions c where source_github_id=5002),'API dismissal preserves known original approval');
update public.review_contributions set review_state='dismissed' where source_github_id=5002;
select ok(not (select private.dismissed_approval_retains_credit(c) from public.review_contributions c where source_github_id=5002),'unknown original outcome is never fabricated as an approval');
update public.review_contributions set review_state='changes_requested' where source_github_id=5002;
select ok(not (select private.dismissed_approval_retains_credit(c) from public.review_contributions c where source_github_id=5002),'clarification is scoped to approvals, not every possible review outcome');
select ok(public.enrich_pull_request_scoring((select id from public.pull_requests),(select revision from public.pull_request_scoring),
  '[]',now()+interval '1 second',null),'complete API history detects deletion even after GitHub validity was already false');
select ok(not (select private.dismissed_approval_retains_credit(c) from public.review_contributions c where source_github_id=5001),'deletion overrides prior dismissal preservation');
select ok(not has_function_privilege('service_role','private.get_pull_request_scoring_input(uuid)','EXECUTE'),'worker cannot bypass the updated loader');
select ok(not has_function_privilege('authenticated','public.get_pull_request_scoring_input(uuid)','EXECUTE'),'scoring context remains private');
select * from finish();
rollback;
