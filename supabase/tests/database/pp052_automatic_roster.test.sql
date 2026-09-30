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

create function pg_temp.roster() returns jsonb language sql as $$
 select public.complete_installation_setup('10000000-0000-0000-0000-000000000001',
  '50000000-0000-0000-0000-000000000001',8001,9001)->'roster';
$$;
select is(jsonb_array_length(pg_temp.roster()),0,'signing in as manager does not manufacture a participant');
select private.resolve_activity_participant(id,'{"id":7101,"login":"author","type":"User"}',now()-interval '30 days',now()) from public.organizations where slug='allowed';
select private.resolve_activity_participant(id,'{"id":7102,"login":"reviewer","type":"User","avatar_url":"https://avatars.githubusercontent.com/u/7102"}',now(),now()) from public.organizations where slug='allowed';
select private.resolve_activity_participant(id,'{"id":7103,"login":"old-human","type":"User"}',now()-interval '61 days',now()) from public.organizations where slug='allowed';
select private.resolve_activity_participant(id,'{"id":7104,"login":"robot[bot]","type":"Bot"}',now(),now()) from public.organizations where slug='allowed';
select private.resolve_activity_participant(id,'{"id":7105,"login":"service","type":"User"}',now(),now()) from public.organizations where slug='allowed';
select public.set_github_user_exclusion(7105,'service_account','Private operator diagnostic');
select private.resolve_activity_participant(id,'{"id":7199,"login":"other-team-person","type":"User"}',now(),now()) from public.organizations where slug='other';
select is(jsonb_array_length(pg_temp.roster()),2,'roster exposes eligible humans from activity only');
select is(pg_temp.roster()->0->>'login','author','author without reviews is included');
select is(pg_temp.roster()->1->>'avatarUrl','https://avatars.githubusercontent.com/u/7102','GitHub avatar is available');
select ok(not (pg_temp.roster()::text like '%other-team-person%'),'other tenant roster does not leak');
select ok(not (pg_temp.roster()::text like '%Private operator diagnostic%'),'operator correction notes remain private');
select private.resolve_activity_participant(id,'{"id":7102,"login":"reviewer","type":"User"}',now(),now()) from public.organizations where slug='allowed';
select is(jsonb_array_length(pg_temp.roster()),2,'replayed activity does not duplicate people');
select private.resolve_activity_participant(id,'{"id":7106,"login":"mid-season","type":"User","avatar_url":"https://tracking.example/image"}',now(),now()) from public.organizations where slug='allowed';
select is(jsonb_array_length(pg_temp.roster()),3,'new contributor appears automatically during season');
select is((select value->>'avatarUrl' from jsonb_array_elements(pg_temp.roster()) where value->>'login'='mid-season'),null,'untrusted avatar falls back');
update public.participants set active=false,left_at=now() where github_user_id=(select id from public.github_users where github_user_id=7101);
select is(pg_temp.roster()->0->>'active','false','departed people remain visible and inactive');
select private.resolve_activity_participant(id,'{"id":7101,"login":"author","type":"User"}',now(),now()) from public.organizations where slug='allowed';
select is(pg_temp.roster()->0->>'active','false','replayed activity cannot reactivate departed participant');
select public.set_github_user_exclusion(7105,null,'Verified human');
select is(jsonb_array_length(pg_temp.roster()),4,'clearing mistaken service classification restores roster identity');
select is((select count(*) from public.organization_memberships),1::bigint,'roster activity grants no additional login access');
select ok(not has_function_privilege('authenticated','public.set_github_user_exclusion(bigint,text,text)','EXECUTE'),'operator correction unavailable to managers');
select ok(not has_function_privilege('authenticated','public.complete_installation_setup(uuid,uuid,bigint,bigint,boolean)','EXECUTE'),'roster endpoint cannot bypass server verification');
select * from finish();
rollback;
