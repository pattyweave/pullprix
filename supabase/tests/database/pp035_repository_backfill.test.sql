begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select * from public.apply_github_installation_lifecycle(12345,9876,'backfill-test','Organization','created',now(),now());
select public.apply_github_repository_changes(12345,now(),
  '[{"github_repository_id":1001,"owner":"backfill-test","name":"api","full_name":"backfill-test/api","private":true,"active":true},
    {"github_repository_id":1002,"owner":"backfill-test","name":"web","full_name":"backfill-test/web","private":true,"active":true}]','selected');
select is(public.start_installation_backfills(12345),2,'each authorized repository gets an independent job');
select is(public.start_installation_backfills(12345),0,'starting twice does not duplicate work');
select is((select count(*) from public.background_jobs where job_type='backfill.repository-page'),2::bigint,'two initial page jobs');

create temporary table fixture as select b.* from public.repository_backfills b
  join public.repositories r on r.id=b.repository_id where r.github_repository_id=1001;
create function pg_temp.commit_page(items jsonb, next_cursor jsonb default '{"phase":"reviews"}') returns boolean language sql as $$
  select public.commit_repository_backfill_page(repository_id,run_id,cursor_version,items,next_cursor,now())
  from public.repository_backfills where repository_id=(select repository_id from fixture);
$$;
create function pg_temp.actor(actor_id bigint) returns jsonb language sql as $$
  select jsonb_build_object('id',actor_id,'login','dev-'||actor_id,'type','User');
$$;
create function pg_temp.review(review_id bigint, state text default 'approved') returns jsonb language sql as $$
  select jsonb_build_object('source_github_id',review_id,'source_version',repeat('a',64),'actor_github_user_id',7002,
    'review_state',state,'body_present',true,'occurred_at',now()-interval '1 hour','commit_id',repeat('1',40),
    'html_url','https://github.com/backfill-test/api/pull/1#pullrequestreview-'||review_id,'author_association','COLLABORATOR');
$$;
create function pg_temp.pr(pr_id bigint) returns jsonb language sql as $$
  select jsonb_build_object('github_pull_request_id',pr_id,'number',pr_id,'author_github_user_id',7001,
    'title','Backfill test','html_url','https://github.com/backfill-test/api/pull/'||pr_id,
    'state','closed','draft',false,'requested_reviewer_github_ids','[]'::jsonb,
    'created_at',now()-interval '1 day','updated_at',now(),'closed_at',now(),'merged_at',now());
$$;

select ok((select public.get_repository_backfill(repository_id,run_id,0) is not null from fixture),'worker can load current scope');
select ok(pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','pull','fact',pg_temp.pr(9001),'user',pg_temp.actor(7001)))),
  'PR page writes canonical merged PR and saves next cursor');
select is((select state from public.pull_requests where github_pull_request_id=9001),'closed','merge state retained');
select is((select pages_completed from public.repository_backfills where repository_id=(select repository_id from fixture)),1,'one page recorded');
select is((select public.commit_repository_backfill_page(repository_id,run_id,0,'[]',null,now()) from fixture),false,'duplicate old page cannot advance cursor');
select is((select count(*) from public.pull_requests),1::bigint,'duplicate page cannot duplicate facts');

select throws_ok($$select pg_temp.commit_page(jsonb_build_array(
  jsonb_build_object('kind','pull','fact',pg_temp.pr(9002),'user',pg_temp.actor(7001)),
  jsonb_build_object('kind','invalid','pull_id',9002)))$$,'P0001','invalid backfill item kind','invalid page is transactional');
select ok(not exists(select 1 from public.pull_requests where github_pull_request_id=9002),'partial page facts rolled back');
select is((select cursor_version from public.repository_backfills where repository_id=(select repository_id from fixture)),1,'failed page does not advance');

select ok(pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','review','pull_id',9001,'fact',pg_temp.review(5001),'user',pg_temp.actor(7002)))),
  'review snapshot uses canonical facts');
select is((select count(*) from public.participants),2::bigint,'author and reviewer enter activity roster');
select is((select count(*) from public.organization_memberships),0::bigint,'history grants no authentication membership');
select pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','review','pull_id',9001,
  'fact',pg_temp.review(5001,'changes_requested'),'user',pg_temp.actor(7002))));
select is((select review_state from public.review_contributions where source_github_id=5001),'approved','snapshot cannot overwrite an existing webhook fact');

select pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','review','pull_id',9001,
  'fact',pg_temp.review(5002,'dismissed'),'user',pg_temp.actor(7002))));
select is((select effective from public.review_contributions where source_github_id=5002),false,'dismissed snapshot is ineffective');
select is((select superseded_at from public.review_contributions where source_github_id=5002),null::timestamptz,'unknown dismissal time is not invented');
select * from public.apply_github_review_contribution(12345,1001,9001,pg_temp.review(5002)||jsonb_build_object('source_version',repeat('b',64)));
select is((select effective from public.review_contributions where source_github_id=5002),false,'late submitted webhook cannot revive dismissed snapshot');
select ok((select metadata_json ? 'dismissal_observed_at' from public.review_contributions where source_github_id=5002),'dismissal observation survives webhook');

-- Terminal failure is visible and restart preserves the saved page cursor.
update public.background_jobs set status='failed',failed_at=now(),last_error='GitHub request failed'
where id=(select last_job_id from public.repository_backfills where repository_id=(select repository_id from fixture));
select is((select status from public.repository_backfills where repository_id=(select repository_id from fixture)),'failed','job failure visible in progress');
select is(public.start_installation_backfills(12345),1,'only the failed repository is restarted');
select is((select cursor_version from public.repository_backfills where repository_id=(select repository_id from fixture)),4,'restart preserves cursor');
select is((select status from public.repository_backfills where repository_id=(select repository_id from fixture)),'queued','restart queues work');

select public.commit_repository_backfill_page(b.repository_id,b.run_id,b.cursor_version,'[]',null,now())
from public.repository_backfills b join public.repositories r on r.id=b.repository_id where r.github_repository_id=1002;
select is((select b.status from public.repository_backfills b join public.repositories r on r.id=b.repository_id where r.github_repository_id=1002),
  'completed','independent repository can complete');

update public.repositories set active=false where github_repository_id=1001;
select ok((select public.get_repository_backfill(repository_id,run_id,cursor_version) is null
  from public.repository_backfills where repository_id=(select repository_id from fixture)),'revoked access stops API work');
select is((select status from public.repository_backfills where repository_id=(select repository_id from fixture)),'cancelled','revoked scope cancels progress');
update public.repositories set active=true where github_repository_id=1001;
select is(public.start_installation_backfills(12345),1,'restored access resumes cancelled repository');
select ok((select b.run_id<>f.run_id from public.repository_backfills b join fixture f using(repository_id)),'new run makes old queued work stale');
select is((select cursor_version from public.repository_backfills where repository_id=(select repository_id from fixture)),4,'restored scope keeps progress');
select ok(pg_temp.commit_page('[]',null),'final page completes');
select is(public.start_installation_backfills(12345),0,'completed runs are not accidentally repeated');

select ok(not has_function_privilege('authenticated','public.start_installation_backfills(bigint)','EXECUTE'),'browser cannot start cross-tenant jobs');
select ok(not has_function_privilege('anon','public.get_repository_backfill(uuid,uuid,integer)','EXECUTE'),'anonymous cannot fetch private progress');
select ok(not has_function_privilege('authenticated','public.commit_repository_backfill_page(uuid,uuid,integer,jsonb,jsonb,timestamptz)','EXECUTE'),'browser cannot import facts');
select ok(has_table_privilege('authenticated','public.repository_backfills','SELECT'),'team UI can read progress through RLS');
select ok(not has_table_privilege('authenticated','public.repository_backfills','UPDATE'),'progress is read only for browsers');
set local role authenticated;
select is((select count(*) from public.repository_backfills),0::bigint,'non-member cannot see another team progress');
reset role;
select * from finish();
rollback;
