begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select * from public.apply_github_installation_lifecycle(12345,9876,'score-team','Organization','created',now()-interval '3 days',now()-interval '3 days');
select public.apply_github_repository_changes(12345,now()-interval '3 days',
  '[{"github_repository_id":1001,"owner":"score-team","name":"api","full_name":"score-team/api","private":true,"active":true}]','selected');
select * from public.apply_github_pull_request_lifecycle(12345,1001,'opened',jsonb_build_object(
  'github_pull_request_id',9001,'number',1,'author_github_user_id',7001,'title','Score test','html_url','https://github.com/score-team/api/pull/1',
  'state','open','draft',false,'requested_reviewer_github_ids','[]'::jsonb,'created_at',now()-interval '2 days',
  'updated_at',now()-interval '2 days','closed_at',null,'merged_at',null));
select private.resolve_activity_participant((select id from public.organizations),'{"id":7001,"login":"author","type":"User"}',now()-interval '2 days',now());
select private.resolve_activity_participant((select id from public.organizations),'{"id":7002,"login":"reviewer","type":"User"}',now()-interval '1 day',now());
create function pg_temp.review() returns jsonb language sql as $$
  select jsonb_build_object('source_github_id',5001,'source_version',repeat('a',64),'actor_github_user_id',7002,
    'review_state','approved','body_present',false,'occurred_at',now()-interval '1 day','commit_id',repeat('1',40),
    'html_url','https://github.com/score-team/api/pull/1#pullrequestreview-5001','author_association','COLLABORATOR');
$$;
select public.apply_github_review_contribution(12345,1001,9001,pg_temp.review());
create function pg_temp.input() returns jsonb language sql as $$
  select public.get_pull_request_scoring_input(id) from public.pull_requests;
$$;
create function pg_temp.component(points integer default 8) returns jsonb language sql as $$
  select jsonb_build_object('id','["v1","'||p.organization_id||'","'||p.id||'","'||a.id||'","base"]',
    'organizationId',p.organization_id,'pullRequestId',p.id,'participantId',a.id,'reviewId',r.id,
    'seasonId',to_char(now(),'YYYY-MM'),'points',points,'kind',case when points=10 then 'approval_with_feedback' else 'approval' end,
    'occurredAt',r.occurred_at,'status','effective','scoringPolicyVersion','v1','reviewOutcome','approved',
    'pullRequestNumber',p.number,'pullRequestUrl',p.html_url,'sourceReference',r.metadata_json->>'html_url','explanation','Test award')
  from public.pull_requests p join public.review_contributions r on r.pull_request_id=p.id
    join public.github_users u on u.github_user_id=r.actor_github_user_id
    join public.participants a on a.github_user_id=u.id and a.organization_id=p.organization_id;
$$;
create function pg_temp.commit(components jsonb, result_status text default 'complete', expected_revision bigint default null) returns boolean language sql as $$
  select public.commit_pull_request_scores(pull_request_id,coalesce(expected_revision,s.revision),
    jsonb_build_object('status',result_status,'components',components,'decisions','[]'::jsonb,'retainedComponentIds','[]'::jsonb)) from public.pull_request_scoring s;
$$;

select ok(pg_temp.commit(jsonb_build_array(pg_temp.component())),'fixture award commits');
create function pg_temp.standings() returns jsonb language sql as $$
  select public.get_organization_standings_input(id,to_char(now(),'YYYY-MM')) from public.organizations where slug='score-team';
$$;
select is(pg_temp.standings()->>'organizationId',(select id::text from public.organizations),'loader scopes organization');
select is(jsonb_array_length(pg_temp.standings()->'participants'),2,'activity roster includes zero-point author');
select is(jsonb_array_length(pg_temp.standings()->'components'),1,'one effective component loaded');
select is(pg_temp.standings()->'components'->0->>'points','8','ledger points preserved');
select is(pg_temp.standings()->>'pendingPullRequests','0','complete fixture has no pending work');
select public.request_score_recomputation((select id from public.pull_requests));
select is(pg_temp.standings()->>'pendingPullRequests','1','dirty revisions are exposed even before processing');
select ok(not has_function_privilege('anon','public.get_organization_standings_input(uuid,text)','EXECUTE'),'anonymous caller cannot read standings');
select ok(not has_function_privilege('authenticated','public.get_organization_standings_input(uuid,text)','EXECUTE'),'browser cannot bypass future organization authorization');
select ok(has_function_privilege('service_role','public.get_organization_standings_input(uuid,text)','EXECUTE'),'server can read standings');
insert into public.organizations(github_account_id,slug,name) values(9999,'other-team','Other team');
select is(jsonb_array_length(public.get_organization_standings_input((select id from public.organizations where slug='other-team'),to_char(now(),'YYYY-MM'))->'components'),0,'other organization cannot inherit score components');
select is(jsonb_array_length(public.get_organization_standings_input((select id from public.organizations where slug='other-team'),to_char(now(),'YYYY-MM'))->'participants'),0,'other organization cannot inherit roster');
select is(jsonb_array_length(public.get_organization_standings_input((select id from public.organizations where slug='score-team'),'2000-01')->'components'),0,'other season has no components');
update public.score_components set status='reversed';
select is(jsonb_array_length(pg_temp.standings()->'components'),0,'reversed awards never enter standings or streaks');
select throws_ok($$select public.get_organization_standings_input(gen_random_uuid(),'2026-13')$$,'22023','invalid season ID','invalid season rejected');
select throws_ok($$select public.get_organization_standings_input(gen_random_uuid(),'2026-09')$$,'P0002','organization not found','missing organization rejected');
select * from finish();
rollback;
