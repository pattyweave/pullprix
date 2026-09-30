begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id) values('10000000-0000-0000-0000-000000000001');
insert into auth.identities(id,user_id,provider,provider_id,identity_data) values(gen_random_uuid(),'10000000-0000-0000-0000-000000000001','github','7001','{"sub":"7001","user_name":"owner"}');
insert into auth.sessions(id,user_id) values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
insert into public.github_users(github_user_id,login,account_type) values(7001,'owner','User');
insert into public.organizations(github_account_id,slug,name) values(9001,'allowed','Allowed'),(9002,'other','Other');
insert into public.github_installations(organization_id,github_installation_id,account_id,account_login,account_type,installed_at)
 select id,8001,9001,'allowed','Organization',now() from public.organizations where slug='allowed';
insert into public.repositories(organization_id,installation_id,github_repository_id,owner,name,full_name)
 select organization_id,id,6001,'allowed','repo','allowed/repo' from public.github_installations;
insert into public.repository_backfills(repository_id,organization_id,status,pages_completed,last_error)
 select id,organization_id,'running',4,'private diagnostic' from public.repositories;

create function pg_temp.access(p_admin boolean,p_retry boolean default false,p_repo bigint default null)
returns jsonb language sql as $$ select public.complete_team_access(
 '10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001',8001,9001,p_retry,p_admin,p_repo); $$;
select is(pg_temp.access(false)->>'role','spectator','authorized noncoding member gets spectator access');
select is((select count(*) from public.participants),0::bigint,'viewing does not create a roster entry');
select is(pg_temp.access(true)->>'role','administrator','owner is administrator');
select is(pg_temp.access(false,true)->>'error','administrator_required','former admin cannot retry work');
select is((select access_role from public.organization_memberships),'spectator','denied retry still persists role downgrade');
select is((select count(*) from public.background_jobs),0::bigint,'unauthorized retry enqueues nothing');
select private.resolve_activity_participant(id,'{"id":7001,"login":"owner","type":"User"}',now(),now()) from public.organizations where slug='allowed';
select is(pg_temp.access(false)->>'role','participant','qualifying activity gives participant presentation after access verification');
select is(pg_temp.access(false)->>'canManage','false','participant has no installation powers');
select is(pg_temp.access(false,false,6001)->>'role','participant','selected collaborator proof is recorded');
select set_config('request.jwt.claims','{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"50000000-0000-0000-0000-000000000001"}',true);
set local role authenticated;
select is((select count(*) from public.organizations),1::bigint,'participant access remains tenant scoped');
select ok(not has_table_privilege('authenticated','public.organization_memberships','UPDATE'),'cannot forge stored role');
select ok(not has_function_privilege('authenticated','public.complete_team_access(uuid,uuid,bigint,bigint,boolean,boolean,bigint)','EXECUTE'),'cannot forge server verification');
select ok(not has_function_privilege('authenticated','public.start_installation_backfills(bigint)','EXECUTE'),'cannot bypass retry authorization');
reset role;
select ok(not has_function_privilege('service_role','public.complete_installation_setup(uuid,uuid,bigint,bigint,boolean)','EXECUTE'),'old role-unaware HTTP entry point is closed');
update public.repositories set active=false;
set local role authenticated;
select is((select count(*) from public.organizations),0::bigint,'selected-repository removal invalidates collaborator lease immediately');
reset role;
select throws_ok($$select pg_temp.access(false,false,6001)$$,'42501','repository access unavailable','removed repository cannot grant new access');
update public.repositories set active=true;
select throws_ok($$select pg_temp.access(false,false,9999)$$,'42501','repository access unavailable','unknown or other-installation repository cannot grant access');
select pg_temp.access(false);
select public.expire_installation_setup_access('10000000-0000-0000-0000-000000000001',8001);
set local role authenticated;
select is((select count(*) from public.organizations),0::bigint,'failed GitHub recheck immediately denies access');
reset role;
update public.organization_memberships set active=false;
select throws_ok($$select pg_temp.access(true)$$,'42501','membership is revoked','owner status does not undo explicit local revocation');
select * from finish();
rollback;
