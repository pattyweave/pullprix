begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select * from public.apply_github_installation_lifecycle(12345,9876,'repair-team','Organization','created',now()-interval '2 days',now()-interval '2 days');
select * from public.apply_github_installation_lifecycle(54321,6789,'other-team','Organization','created',now(),now());
select public.apply_github_repository_changes(12345,now()-interval '2 days',
  '[{"github_repository_id":1001,"owner":"repair-team","name":"api","full_name":"repair-team/api","private":true,"active":true},
    {"github_repository_id":1002,"owner":"repair-team","name":"removed","full_name":"repair-team/removed","private":true,"active":true}]','selected');

select is(public.enqueue_github_reconciliation(),2,'independent jobs for two installations');
select is(public.enqueue_github_reconciliation(),0,'scheduler does not duplicate pending jobs');
select is((select count(*) from public.background_jobs where job_type='github.reconcile-installation'),2::bigint,'one job per installation');
select is((select schedule from cron.job where jobname='pull-prix-reconcile-github'),'17 3 * * *','daily UTC reconciliation scheduled');

create function pg_temp.snapshot(state text default 'active') returns jsonb language sql as $$
  select jsonb_build_object('state',state,'account_id',9876,'account_login','repair-team','account_type','Organization',
    'github_updated_at',now(),'suspended_at',case when state='suspended' then now() else null end,
    'repository_selection','selected','repositories',
    '[{"github_repository_id":1001,"owner":"repair-team","name":"renamed","full_name":"repair-team/renamed","private":true,"active":true},
      {"github_repository_id":1003,"owner":"repair-team","name":"added","full_name":"repair-team/added","private":true,"active":true}]'::jsonb);
$$;
create function pg_temp.reconcile(snapshot jsonb) returns jsonb language sql as $$
  select public.commit_installation_reconciliation(12345,public.get_installation_reconciliation_revision(12345),snapshot,now());
$$;
select is(pg_temp.reconcile(pg_temp.snapshot())->>'disposition','applied','snapshot repairs missed repository events');
select is((select name from public.repositories where github_repository_id=1001),'renamed','missed rename repaired');
select is((select active from public.repositories where github_repository_id=1002),false,'missed removal repaired without deleting history');
select is((select active from public.repositories where github_repository_id=1003),true,'missed addition repaired');
select is((select count(*) from public.repository_backfills),2::bigint,'new active repositories get initial backfills');

create temporary table old_revision as select public.get_installation_reconciliation_revision(12345) as value;
-- Emulate a separate transaction's later timestamp: now() is fixed throughout
-- this rollback-only test transaction, so temporarily bypass its timestamp trigger.
alter table public.repositories disable trigger repositories_set_updated_at;
update public.repositories set updated_at=now()+interval '1 second' where github_repository_id=1001;
alter table public.repositories enable trigger repositories_set_updated_at;
select throws_ok($$select public.commit_installation_reconciliation(12345,(select value from old_revision),pg_temp.snapshot(),now())$$,
  '40001','installation scope changed during reconciliation; retry required','new scope webhook invalidates in-flight snapshot');
update public.repositories set updated_at=now() where github_repository_id=1001;
select throws_ok($$select pg_temp.reconcile(pg_temp.snapshot()||jsonb_build_object('account_id',6789))$$,
  '22023','installation snapshot identity mismatch','snapshot cannot cross tenants');
select throws_ok($$select pg_temp.reconcile(pg_temp.snapshot()||jsonb_build_object('github_updated_at',now()-interval '3 days'))$$,
  '40001','older installation snapshot; retry required','older GitHub snapshot cannot revert current lifecycle');

-- Start with a finished initial import; no webhook exists for PR/review below.
update public.repository_backfills set status='completed',completed_at=now()-interval '2 days';
select is(public.start_repository_reconciliation(12345),2,'completed imports start bounded repair runs');
select is(public.start_repository_reconciliation(12345),0,'running repair never restarts mid-page');
select is((select count(*) from public.repository_backfills where run_kind='reconciliation'),2::bigint,'repair runs identifiable in existing progress table');
select ok((select bool_and(since_at<=now()-interval '7 days' and since_at>=now()-interval '60 days') from public.repository_backfills),'overlapping lookback remains bounded');

create function pg_temp.commit_page(items jsonb, next_cursor jsonb default '{"phase":"reviews"}', observed timestamptz default now()+interval '1 second')
returns boolean language sql as $$
  select public.commit_repository_backfill_page(b.repository_id,b.run_id,b.cursor_version,items,next_cursor,observed)
  from public.repository_backfills b join public.repositories r on r.id=b.repository_id where r.github_repository_id=1001;
$$;
create function pg_temp.actor(actor_id bigint) returns jsonb language sql as $$
  select jsonb_build_object('id',actor_id,'login','dev-'||actor_id,'type','User');
$$;
create function pg_temp.review(state text default 'approved', version text default 'a') returns jsonb language sql as $$
  select jsonb_build_object('source_github_id',5001,'source_version',repeat(version,64),'actor_github_user_id',7002,
    'review_state',state,'body_present',true,'occurred_at',now()-interval '1 hour','commit_id',repeat('1',40),
    'html_url','https://github.com/repair-team/renamed/pull/1#pullrequestreview-5001','author_association','COLLABORATOR');
$$;
select pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','pull','user',pg_temp.actor(7001),'fact',
  jsonb_build_object('github_pull_request_id',9001,'number',1,'author_github_user_id',7001,'title','Omitted webhook',
    'html_url','https://github.com/repair-team/renamed/pull/1','state','closed','draft',false,
    'requested_reviewer_github_ids','[]'::jsonb,'created_at',now()-interval '1 day','updated_at',now(),'closed_at',now(),'merged_at',now()))));
select ok(pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','review','pull_id',9001,'user',pg_temp.actor(7002),'fact',pg_temp.review()))),
  'missing review webhook repaired by normalized API facts');
select is((select count(*) from public.webhook_deliveries),0::bigint,'omitted webhooks were not fabricated');
select is((select count(*) from public.review_contributions),1::bigint,'one canonical contribution recovered');
select is((select count(*) from public.participants),2::bigint,'recovered history resolves roster');
select pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','review','pull_id',9001,'user',pg_temp.actor(7002),'fact',pg_temp.review())));
select is((select count(*) from public.review_contributions),1::bigint,'repeat snapshots cannot duplicate contributions');

select pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','review','pull_id',9001,'user',pg_temp.actor(7002),'fact',pg_temp.review('changes_requested','b'))));
select is((select review_state from public.review_contributions),'changes_requested','authoritative review correction repairs missed edit');
select ok((select scoring_recalculation_requested_at is not null from public.pull_requests),'review correction requests future scoring recalculation');
alter table public.review_contributions disable trigger review_contributions_set_updated_at;
update public.review_contributions set updated_at=now()+interval '2 seconds';
alter table public.review_contributions enable trigger review_contributions_set_updated_at;
select pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','review','pull_id',9001,'user',pg_temp.actor(7002),'fact',pg_temp.review('approved','c'))));
select is((select review_state from public.review_contributions),'changes_requested','webhook received during fetch wins');

select pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','review','pull_id',9001,'user',pg_temp.actor(7002),'fact',pg_temp.review('dismissed','d'))));
select is((select effective from public.review_contributions),false,'missed dismissal repaired');
update public.review_contributions set updated_at=now()-interval '1 second';
select pg_temp.commit_page(jsonb_build_array(jsonb_build_object('kind','review','pull_id',9001,'user',pg_temp.actor(7002),'fact',pg_temp.review('approved','e'))));
select is((select effective from public.review_contributions),false,'later reconciliation cannot revive dismissed review');
select pg_temp.commit_page('[]',null);
select is(public.start_repository_reconciliation(12345),0,'fresh completed repair waits for next daily interval');

select is(pg_temp.reconcile(pg_temp.snapshot('suspended'))->>'installation_status','suspended','missed suspension repaired');
select is((select status from public.organizations where github_account_id=9876),'suspended','organization state follows suspension');
select is(pg_temp.reconcile(pg_temp.snapshot())->>'installation_status','active','missed unsuspension repaired even with equal GitHub timestamp');
select is(pg_temp.reconcile('{"state":"deleted"}')->>'installation_status','deleted','missing installation becomes terminal');
select is(public.get_installation_reconciliation_revision(12345),null::jsonb,'deleted installation skipped');
select is(pg_temp.reconcile(pg_temp.snapshot())->>'disposition','stale_or_deleted','snapshot cannot resurrect deleted installation');
select is((select status from public.github_installations where github_installation_id=54321),'active','other installation remains unaffected');

select ok(not has_function_privilege('authenticated','public.enqueue_github_reconciliation()','EXECUTE'),'browser cannot schedule server jobs');
select ok(not has_function_privilege('authenticated','public.commit_installation_reconciliation(bigint,jsonb,jsonb,timestamptz)','EXECUTE'),'browser cannot change tenant scope');
select ok(not has_function_privilege('service_role','private.commit_repository_backfill_page(uuid,uuid,integer,jsonb,jsonb,timestamptz)','EXECUTE'),'old implementation cannot bypass wrapper');
select ok(has_function_privilege('service_role','public.commit_repository_backfill_page(uuid,uuid,integer,jsonb,jsonb,timestamptz)','EXECUTE'),'worker retains canonical page API');
select * from finish();
rollback;
