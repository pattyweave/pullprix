begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
select * from public.apply_github_installation_lifecycle(98101,98101,'erase-test','Organization','created',now(),now()-interval '1 day');
select * from public.apply_github_installation_lifecycle(98102,98102,'keep-test','Organization','created',now(),now()-interval '1 day');
create temporary table erased_org as select id from public.organizations where github_account_id=98101;
insert into public.repositories(organization_id,installation_id,github_repository_id,owner,name,full_name)
 select organization_id,id,98101,'erase-test','repo','erase-test/repo' from public.github_installations where github_installation_id=98101;
insert into public.github_users(github_user_id,login,account_type) values(98101,'erase-person','User'),(98102,'shared-person','User');
insert into public.participants(organization_id,github_user_id,display_name)
 select o.id,u.id,u.login from public.organizations o cross join public.github_users u
 where o.github_account_id=98101 or (o.github_account_id=98102 and u.github_user_id=98102);
select * from public.accept_github_delivery('98100000-0000-0000-0000-000000000001','pull_request','{"private":"secret"}',null,98101);
select * from public.enqueue_background_job('github.reconcile-installation','deletion-test-job','{"github_installation_id":98101}');
select public.start_installation_backfills(98101);
insert into public.pull_requests(organization_id,repository_id,github_pull_request_id,number,author_github_user_id,title,html_url,state,draft,opened_at,last_activity_at,github_updated_at)
 select organization_id,id,98101,1,98101,'Private title','https://github.com/erase-test/repo/pull/1','open',false,now(),now(),now() from public.repositories where github_repository_id=98101;
insert into public.review_contributions(organization_id,installation_id,repository_id,pull_request_id,source_type,source_github_id,source_version,actor_github_user_id,action,review_state,body_present,occurred_at)
 select pr.organization_id,r.installation_id,r.id,pr.id,'review',98101,repeat('a',64),98102,'formal_review','approved',false,now()
 from public.pull_requests pr join public.repositories r on r.id=pr.repository_id where pr.github_pull_request_id=98101;
insert into public.score_components(id,organization_id,pull_request_id,participant_id,review_id,season_id,points,status,component)
 select 'deletion-component',c.organization_id,c.pull_request_id,p.id,c.id,'2026-09',8,'effective','{}'
 from public.review_contributions c join public.participants p on p.organization_id=c.organization_id
 join public.github_users u on u.id=p.github_user_id where c.source_github_id=98101 and u.github_user_id=98102;
insert into public.season_results(organization_id,season_id,starts_at,ends_at,definition,status,standings_input,snapshot,completed_at)
 select id,'2026-08','2026-08-03T12:00:00Z','2026-09-07T12:00:00Z','{}','completed','{}','{}',now() from erased_org;
select throws_ok($$select public.delete_organization_data((select id from erased_org),98102,'verified_request')$$,'22023','deletion confirmation mismatch','wrong confirmation cannot erase data');
select throws_ok($$select public.delete_organization_data((select id from erased_org),98101,'uninstalled')$$,'22023','organization still installed','automatic purge cannot delete active installation');
select is(public.delete_organization_data((select id from erased_org),98101,'verified_request')->>'deleted','true','verified support request deletes organization');
select is((select count(*)::integer from public.organizations where github_account_id=98101),0,'organization removed');
select is((select count(*)::integer from public.repositories where github_repository_id=98101),0,'repositories removed');
select is((select count(*)::integer from public.webhook_deliveries where github_installation_id=98101),0,'raw delivery payloads removed');
select is((select count(*)::integer from public.background_jobs where idempotency_key='deletion-test-job'),0,'unscoped reconciliation job removed');
select is((select count(*)::integer from public.github_users where github_user_id=98101),0,'unshared roster identity removed');
select is((select count(*)::integer from public.github_users where github_user_id=98102),1,'other team identity preserved');
select is((select count(*)::integer from public.organizations where github_account_id=98102),1,'other organization preserved');
select is((select count(*)::integer from public.pull_requests where github_pull_request_id=98101),0,'private PR facts erased');
select is((select count(*)::integer from public.review_contributions where source_github_id=98101),0,'review facts erased');
select is((select count(*)::integer from public.score_components where id='deletion-component'),0,'score ledger erased');
select is((select count(*)::integer from public.season_results where organization_id=(select id from erased_org)),0,'immutable sporting archive yields to deletion');
select is((select count(*)::integer from public.repository_backfills where organization_id=(select id from erased_org)),0,'backfill cursors erased');
select is(public.delete_organization_data((select id from erased_org),98101,'verified_request')->>'deleted','true','repeat purge is idempotent');
select is((select installation_status from public.apply_github_installation_lifecycle(98101,98101,'erase-test','Organization','created',now()+interval '1 hour',now()-interval '1 day')),'deleted','old installation cannot resurrect');
select is((select installation_status from public.apply_github_installation_lifecycle(98103,98101,'erase-test','Organization','created',now()+interval '1 hour',now()-interval '1 day')),'deleted','delayed unknown pre-deletion installation cannot resurrect');
select is((select delivery_status from public.accept_github_delivery('98100000-0000-0000-0000-000000000002','pull_request','{"private":"new secret"}',null,98101)),'ignored','late payload acknowledged without persistence');
select is((select count(*)::integer from public.webhook_deliveries where github_installation_id=98101),0,'late payload not stored');
select is((select delivery_status from public.accept_github_delivery('98100000-0000-0000-0000-000000000003','installation','{"installation":{"account":{"id":98101},"created_at":"2026-01-01T00:00:00Z"}}','created',98103)),'ignored','unknown old installation delivery discarded');
select is((select installation_status from public.apply_github_installation_lifecycle(98104,98101,'erase-test','Organization','created',now()+interval '1 hour',now()+interval '1 second')),'active','intentional later reinstall starts fresh');
select * from public.apply_github_installation_lifecycle(98104,98101,'erase-test','Organization','deleted',now()+interval '2 hours',now()+interval '1 second');
select is(public.process_data_deletions(),1,'uninstall is swept automatically');
select ok(not has_function_privilege('authenticated','public.delete_organization_data(uuid,bigint,text)','execute'),'browser cannot erase a team');
select ok(not has_function_privilege('service_role','private.apply_github_installation_lifecycle(bigint,bigint,text,text,text,timestamptz,timestamptz,timestamptz)','execute'),'service cannot bypass suppression wrapper');
select ok(not has_function_privilege('anon','public.process_data_deletions()','execute'),'anonymous maintenance denied');
select * from finish();
rollback;
