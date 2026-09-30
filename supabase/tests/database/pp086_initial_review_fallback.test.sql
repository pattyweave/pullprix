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


update public.pull_requests set opened_at=now()-interval '90 seconds';
update public.review_contributions set occurred_at=now()-interval '60 seconds';
insert into public.scoring_events(delivery_id,pull_request_id,event_name,action,occurred_at,state,draft,head_sha)
  select gen_random_uuid(),id,'pull_request','opened',opened_at,'open',false,repeat('1',40) from public.pull_requests;
insert into public.review_gate_observations(pull_request_id,observed_at,head_sha,latest_review_github_id,credit)
  select id,now()-interval '30 seconds',repeat('1',40),5001,'unconfigured' from public.pull_requests;
update public.pull_request_scoring set history_checked_at=now();
select is(pg_temp.input()->'input'->'reviews'->0->>'creditBeforeReview','unknown','does not fabricate historical gate');
select is(pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation'->>'headSha',repeat('1',40),'first post-review check supports initial fallback');
select is((pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation'->>'observedAt')::timestamptz,now()-interval '30 seconds','retains real observation time');
update public.review_gate_observations set credit='unknown';
select is(pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation','null'::jsonb,'unreadable rules do not grant fallback');
insert into public.review_gate_observations(pull_request_id,observed_at,head_sha,latest_review_github_id,credit)
  select id,now()-interval '20 seconds',repeat('1',40),5001,'unconfigured' from public.pull_requests;
select is(pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation','null'::jsonb,'later no-rules check cannot replace first unknown check');
delete from public.review_gate_observations where observed_at=now()-interval '20 seconds';
update public.review_gate_observations set credit='satisfied';
select is(pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation','null'::jsonb,'satisfied requirements do not grant fallback');
update public.review_gate_observations set credit='required';
select is(pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation','null'::jsonb,'required reviews need historical evidence');
update public.review_gate_observations set credit='unconfigured',head_sha=repeat('2',40);
select is(pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation','null'::jsonb,'changed commit does not grant fallback');
update public.review_gate_observations set head_sha=repeat('1',40),latest_review_github_id=9999;
select is(pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation','null'::jsonb,'incomplete observed review history does not grant fallback');
update public.review_gate_observations set latest_review_github_id=5001,observed_at=now()+interval '211 seconds';
select is(pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation','null'::jsonb,'check after first five minutes cannot grant fallback');
update public.review_gate_observations set observed_at=now()-interval '30 seconds';
insert into public.scoring_events(delivery_id,pull_request_id,event_name,action,occurred_at,state,draft,head_sha)
  select gen_random_uuid(),id,'pull_request','edited',now()-interval '45 seconds','open',false,repeat('1',40) from public.pull_requests;
select is(pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation','null'::jsonb,'intervening PR edit blocks fallback');
delete from public.scoring_events where action='edited';
delete from public.scoring_events where action='opened';
select is(pg_temp.input()->'input'->'reviews'->0->'initialUnconfiguredObservation','null'::jsonb,'backfill without opening evidence cannot grant fallback');
select ok(not has_function_privilege('authenticated','public.get_pull_request_scoring_input(uuid)','execute'),'browser cannot read scoring evidence');
select * from finish();
rollback;
