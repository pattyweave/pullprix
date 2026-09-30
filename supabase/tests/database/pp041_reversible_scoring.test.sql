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

select is(pg_temp.input()->'input'->'reviews'->0->>'creditBeforeReview','unknown','historical credit is never guessed from current approval');
select is(pg_temp.input()->'input'->'reviews'->0->'readiness'->>'state','unknown','current non-draft state is not historical readiness evidence');
select is(pg_temp.input()->'input'->'reviews'->0->>'feedbackComplete','false','unknown feedback has a boolean false, not null');
select is(public.enqueue_scoring_jobs(),1,'dirty PR schedules scoring in the existing queue');
select is(public.enqueue_scoring_jobs(),0,'scheduler deduplicates in-flight recomputations');
select ok(pg_temp.commit(jsonb_build_array(pg_temp.component())),'initial score commits');
select is((select sum(points) from public.score_components where status='effective'),8::bigint,'total is component sum');
select is((select count(*) from public.score_component_changes),1::bigint,'one explainable award recorded');
select ok(pg_temp.commit(jsonb_build_array(pg_temp.component())),'identical recomputation succeeds');
select is((select count(*) from public.score_component_changes),1::bigint,'identical recomputation adds no transactions');
select ok(pg_temp.commit(jsonb_build_array(pg_temp.component()),'pending'),'pending retains explicitly preserved award');
select is((select sum(points) from public.score_components where status='effective'),8::bigint,'missing context does not blind-zero the retained ledger');
select ok(pg_temp.commit(jsonb_build_array(pg_temp.component(10))),'same slot can receive corrected feedback score');
select is((select count(*) from public.score_components),1::bigint,'correction does not duplicate slot');
select is((select points_delta from public.score_component_changes order by id desc limit 1),2,'correction records delta, not a second ten-point award');

create temporary table old_revision as select revision from public.pull_request_scoring;
update public.review_contributions set effective=false;
select ok(not pg_temp.commit(jsonb_build_array(pg_temp.component()),'complete',(select revision from old_revision)),'stale in-flight result is rejected');
select throws_ok($$select pg_temp.commit(jsonb_build_array(pg_temp.component()))$$,'22023','invalid score component scope or policy','ineffective source without preserved approval evidence cannot receive new score');
select ok(pg_temp.commit('[]','pending'),'explicit invalidation can reverse while other context is pending');
select is((select status from public.score_components),'reversed','invalidation reverses rather than deleting score history');
select is((select points_delta from public.score_component_changes order by id desc limit 1),-10,'reversal records the negative correction');
select is((select count(*) from public.review_contributions),1::bigint,'canonical contribution remains intact');
select is((select sum(points_delta) from public.score_component_changes),0::bigint,'audit deltas reconcile with effective ledger');
select ok(pg_temp.commit('[]'),'repeated reversal is safe');
select is((select count(*) from public.score_component_changes),3::bigint,'repeated reversal adds no audit noise');

-- Event-time readiness and gate evidence; no source-body retention.
insert into public.scoring_events(delivery_id,pull_request_id,event_name,action,occurred_at,state,draft,head_sha)
  select gen_random_uuid(),id,'pull_request','opened',opened_at,'open',false,repeat('1',40) from public.pull_requests;
insert into public.review_gate_observations(pull_request_id,observed_at,head_sha,credit)
  select id,opened_at+interval '1 minute',repeat('1',40),'unconfigured' from public.pull_requests;
select is(pg_temp.input()->'input'->'reviews'->0->'readiness'->>'state','ready','verified open event establishes readiness at review time');
select is(pg_temp.input()->'input'->'reviews'->0->>'creditBeforeReview','unconfigured','pre-review rule observation opens fallback');
insert into public.review_gate_observations(pull_request_id,observed_at,head_sha,latest_review_github_id,credit)
  select id,now(),repeat('1',40),5001,'satisfied' from public.pull_requests;
select is(pg_temp.input()->'input'->'reviews'->0->>'creditBeforeReview','unconfigured','post-approval satisfied gate cannot erase approving review');
update public.pull_requests set state='closed',closed_at=now(),merged_at=now();
select is(pg_temp.input()->'input'->'reviews'->0->'readiness'->>'state','ready','later PR closure preserves historical readiness');
select ok(public.enrich_pull_request_scoring((select id from public.pull_requests),
  (select revision from public.pull_request_scoring),
  jsonb_build_array(jsonb_build_object('kind','review','fact',pg_temp.review(),'user','{"id":7002,"login":"reviewer","type":"User"}'::jsonb)),now(),null),
  'complete normalized API history uses the existing facts and identities');
select is(pg_temp.input()->'input'->>'reviewHistoryComplete','true','complete API history establishes lifetime-cap evidence');
select is(pg_temp.input()->'input'->'reviews'->0->>'feedbackComplete','true','complete API comment list establishes feedback evidence');
select is((select count(*) from public.review_contributions),1::bigint,'history enrichment cannot duplicate canonical review');
select ok(not public.enrich_pull_request_scoring((select id from public.pull_requests),0,'[]',now(),null),'stale API snapshot cannot erase newer webhook facts');
update public.review_contributions set effective=true;
select ok(public.enrich_pull_request_scoring((select id from public.pull_requests),(select revision from public.pull_request_scoring),
  '[]',now()+interval '1 second',null),'complete list absence records missing-review deletion');
select is((select effective from public.review_contributions),false,'deleted review loses effect');
select ok((select metadata_json ? 'deletion_observed_at' from public.review_contributions),'deletion evidence retained');
select public.apply_github_review_contribution(12345,1001,9001,pg_temp.review()||jsonb_build_object('source_version',repeat('b',64)));
select is((select effective from public.review_contributions),false,'stale replay cannot resurrect a deleted review');
select throws_ok($$select public.enrich_pull_request_scoring((select id from public.pull_requests),(select revision from public.pull_request_scoring),
  '[{"kind":"review","fact":{"source_github_id":5001,"actor_github_user_id":7002},"user":{"id":7777}}]',now(),null)$$,
  '22023','scoring reviewer identity mismatch','snapshot cannot swap reviewer identity');
update public.participants set eligible=false where github_user_id=(select id from public.github_users where github_user_id=7002);
select is(pg_temp.input()->'input'->'participants' @> '[{"githubUserId":7002,"eligible":false}]',true,'eligibility corrections feed recomputation');
select ok((select revision>computed_revision from public.pull_request_scoring),'eligibility change marks computed results stale');
select public.apply_github_repository_changes(12345,now(),
  '[{"github_repository_id":1001,"owner":"score-team","name":"api","full_name":"score-team/api","private":true,"active":false}]','selected');
select is((select ends_at from public.repository_scoring_access),now(),'removal closes the historical access interval');
select ok((pg_temp.input()->'input'->'repositoryAccess'->0->>'from')::timestamptz<now()-interval '1 day','old authorization boundary is retained');
select is(public.request_score_recomputation(),1,'full recompute marks all PRs');
select is(public.request_score_recomputation((select id from public.pull_requests)),1,'targeted recompute marks one PR');
select ok(not has_function_privilege('authenticated','public.commit_pull_request_scores(uuid,bigint,jsonb)','EXECUTE'),'browser cannot award itself points');
select ok(not has_function_privilege('anon','public.get_pull_request_scoring_input(uuid)','EXECUTE'),'anonymous callers cannot read private scoring context');
select ok(not has_table_privilege('authenticated','public.score_components','SELECT'),'private ledger is not exposed before standings access policy');
select ok(has_function_privilege('service_role','public.enrich_pull_request_scoring(uuid,bigint,jsonb,timestamptz,jsonb)','EXECUTE'),'worker can commit verified context');
select * from finish();
rollback;
