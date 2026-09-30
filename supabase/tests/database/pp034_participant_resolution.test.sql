begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select * from public.apply_github_installation_lifecycle(
  12345, 9876, 'participant-test', 'Organization', 'created', now(), now()
);
select public.apply_github_repository_changes(12345, now(),
  '[{"github_repository_id":1001,"owner":"participant-test","name":"api","full_name":"participant-test/api","private":true,"active":true}]', 'selected');

create function pg_temp.actor(actor_id bigint, login text default null, kind text default 'User')
returns jsonb language sql as $$
  select jsonb_build_object('id', actor_id, 'login', coalesce(login, 'dev-' || actor_id),
    'type', kind, 'avatar_url', 'https://avatars.githubusercontent.com/u/' || actor_id);
$$;

create function pg_temp.pr(pr_id bigint, author_id bigint, age interval default interval '1 day')
returns uuid language sql as $$
  select pull_request_id from public.apply_github_pull_request_lifecycle(12345, 1001, 'opened',
    jsonb_build_object('github_pull_request_id',pr_id,'number',pr_id,'author_github_user_id',author_id,
      'title','Participant test','html_url','https://github.com/participant-test/api/pull/'||pr_id,
      'state','open','draft',false,'requested_reviewer_github_ids',jsonb_build_array(9999),
      'created_at',now()-age,'updated_at',now()-age,'closed_at',null,'merged_at',null));
$$;

create function pg_temp.review(pr_id bigint, review_id bigint, actor_id bigint)
returns uuid language sql as $$
  select contribution_id from public.apply_github_review_contribution(12345,1001,pr_id,
    jsonb_build_object('source_github_id',review_id,'source_version',repeat('a',64),
      'actor_github_user_id',actor_id,'review_state','approved','body_present',false,
      'occurred_at',now()-interval '1 hour','commit_id',repeat('1',40),
      'html_url','https://github.com/participant-test/api/pull/'||pr_id||'#pullrequestreview-'||review_id,
      'author_association','COLLABORATOR'));
$$;

create function pg_temp.delivery(pr_id bigint, author jsonb, reviewer jsonb default null,
  review_id bigint default null, event_name text default null)
returns uuid language sql as $$
  select delivery_id from public.accept_github_delivery(gen_random_uuid(),
    coalesce(event_name,case when reviewer is null then 'pull_request' else 'pull_request_review' end),
    jsonb_build_object('repository',jsonb_build_object('id',1001),
      'pull_request',jsonb_build_object('id',pr_id,'user',author),
      'review',jsonb_build_object('id',review_id,'user',reviewer),
      'sender',pg_temp.actor(9998)),
    case when reviewer is null then 'opened' else 'submitted' end,12345);
$$;

create temporary table fixture(pr uuid, review uuid, opened uuid, submitted uuid);
insert into fixture values (pg_temp.pr(9001,7001),pg_temp.review(9001,5001,7002),
  pg_temp.delivery(9001,pg_temp.actor(7001)),
  pg_temp.delivery(9001,pg_temp.actor(7001),pg_temp.actor(7002),5001));

select is(public.resolve_github_delivery_participants((select opened from fixture)),1,
  'PR author resolves from a stored delivery');
select is((select count(*) from public.participants),1::bigint,'author joins without reviewing');
select is(public.resolve_github_delivery_participants((select submitted from fixture)),2,
  'formal review resolves author and reviewer');
select is((select count(*) from public.participants),2::bigint,'outside collaborator joins automatically');
select is((select count(*) from public.github_users),2::bigint,'sender and requested reviewer do not join');
select is((select count(*) from public.organization_memberships),0::bigint,'roster never grants login access');
select is(public.review_participant_exclusion_reason((select review from fixture)),null::text,
  'human peer review passes participant gate');
select is(public.resolve_github_delivery_participants((select submitted from fixture)),2,'delivery replay succeeds');
select is((select count(*) from public.participants),2::bigint,'replay cannot duplicate participants');
select is((select count(*) from public.review_contributions),1::bigint,'resolution does not duplicate reviews');

select pg_temp.review(9001,5002,7001);
select is(public.review_participant_exclusion_reason((select id from public.review_contributions where source_github_id=5002)),
  'self_review','self-review cannot pass participant gate');
select ok((select effective from public.review_contributions where source_github_id=5002),
  'self-review remains an auditable canonical fact');

select pg_temp.pr(9002,7003);
select public.resolve_github_delivery_participants(pg_temp.delivery(9002,pg_temp.actor(7003,'dependabot[bot]','Bot')));
select is((select count(*) from public.participants),2::bigint,'bot author does not occupy standings');
select ok(exists(select 1 from public.github_users where github_user_id=7003),'bot identity is retained');
select pg_temp.review(9002,5003,7002);
select is(public.review_participant_exclusion_reason((select id from public.review_contributions where source_github_id=5003)),
  'author_excluded','human review of bot PR is excluded');
select pg_temp.review(9001,5004,7003);
select public.resolve_github_delivery_participants(pg_temp.delivery(9001,pg_temp.actor(7001),pg_temp.actor(7003,'dependabot[bot]','Bot'),5004));
select is(public.review_participant_exclusion_reason((select id from public.review_contributions where source_github_id=5004)),
  'reviewer_excluded','bot reviewer is excluded without deleting its review');

select pg_temp.pr(9003,7004);
select public.resolve_github_delivery_participants(pg_temp.delivery(9003,pg_temp.actor(7004,'pull-prix-dev[bot]')));
select pg_temp.pr(9004,7005);
select public.resolve_github_delivery_participants(pg_temp.delivery(9004,pg_temp.actor(7005,'ghost')));
select pg_temp.pr(9005,7006);
select public.resolve_github_delivery_participants(pg_temp.delivery(9005,pg_temp.actor(7006)||jsonb_build_object('suspended_at',now())));
select pg_temp.pr(9006,7007);
select public.resolve_github_delivery_participants(pg_temp.delivery(9006,pg_temp.actor(7007,'test-org','Organization')));
select is((select count(*) from public.participants),2::bigint,
  'app bot suffix, ghost, suspended, and organization accounts stay off roster');

select public.set_github_user_exclusion(7002,'service_account','Confirmed automation account');
select is((select eligible from public.participants p join public.github_users u on u.id=p.github_user_id where u.github_user_id=7002),
  false,'operator service-account correction removes score eligibility');
select is(public.review_participant_exclusion_reason((select review from fixture)),'reviewer_excluded','correction is consumed by gate');
select is((select count(*) from public.review_contributions),4::bigint,'correction preserves every review');
select ok((select scoring_recalculation_requested_at is not null from public.pull_requests where github_pull_request_id=9001),
  'correction requests later score recalculation');
select public.resolve_github_delivery_participants(pg_temp.delivery(9001,pg_temp.actor(7001),pg_temp.actor(7002),5001));
select is((select exclusion_override from public.github_users where github_user_id=7002),'service_account','webhooks cannot clear correction');
select public.set_github_user_exclusion(7002,null,'Correction reverted after verification');
select is(public.review_participant_exclusion_reason((select review from fixture)),null::text,'correction is reversible');
select is((select count(*) from public.participants),2::bigint,'correction preserves stable participant identity');

-- Private helper tests isolate the exact lookback and metadata ordering rules.
select private.resolve_activity_participant((select organization_id from public.github_installations where github_installation_id=12345),
  pg_temp.actor(7010),now()-interval '60 days',now());
select ok(exists(select 1 from public.participants p join public.github_users u on u.id=p.github_user_id where u.github_user_id=7010),
  '60-day boundary is inclusive');
select pg_temp.pr(9007,7011,interval '61 days');
select public.resolve_github_delivery_participants(pg_temp.delivery(9007,pg_temp.actor(7011)));
select ok(not exists(select 1 from public.participants p join public.github_users u on u.id=p.github_user_id where u.github_user_id=7011),
  'old PR does not add new roster member');
select ok(exists(select 1 from public.github_users where github_user_id=7011),'old author identity is still retained');
select pg_temp.review(9007,5005,7011);
select public.resolve_github_delivery_participants(pg_temp.delivery(9007,pg_temp.actor(7011),pg_temp.actor(7011),5005));
select ok(exists(select 1 from public.participants p join public.github_users u on u.id=p.github_user_id where u.github_user_id=7011),
  'new formal activity adds previously absent human');

select private.resolve_activity_participant((select organization_id from public.github_installations where github_installation_id=12345),
  pg_temp.actor(7002,'renamed-dev'),now(),now()+interval '1 minute');
select public.resolve_github_delivery_participants((select submitted from fixture));
select is((select login from public.github_users where github_user_id=7002),'renamed-dev','old replay cannot undo newer identity');
select is((select display_name from public.participants p join public.github_users u on u.id=p.github_user_id where u.github_user_id=7002),
  'renamed-dev','participant display name follows current identity');

update public.participants set active=false,left_at=now()-interval '2 hours'
where github_user_id=(select id from public.github_users where github_user_id=7002);
select public.resolve_github_delivery_participants((select submitted from fixture));
select is(public.review_participant_exclusion_reason((select review from fixture)),
  'participant_inactive','review after departure is excluded and replay cannot reactivate');
update public.participants set left_at=now()
where github_user_id=(select id from public.github_users where github_user_id=7002);
select is(public.review_participant_exclusion_reason((select review from fixture)),null::text,
  'departure does not erase prior review eligibility');

create temporary table count_before as select count(*) as n from public.participants;
select is(public.resolve_github_delivery_participants(pg_temp.delivery(9001,pg_temp.actor(7001),pg_temp.actor(7999),null,'pull_request_review_comment')),0,
  'inline commenter alone cannot enter roster');
select is((select count(*) from public.participants),(select n from count_before),'comment event adds no participant');
select throws_ok($$select public.resolve_github_delivery_participants(pg_temp.delivery(9001,pg_temp.actor(7999)))$$,
  '22023','PR author does not match stored identity','mismatched author is rejected');
select throws_ok($$select public.resolve_github_delivery_participants(pg_temp.delivery(9001,pg_temp.actor(7001),pg_temp.actor(7999),5001))$$,
  '22023','reviewer does not match stored identity','mismatched reviewer is rejected');

update public.repositories set active=false where github_repository_id=1001;
select is(public.resolve_github_delivery_participants((select submitted from fixture)),0,'removed repository cannot resolve new roster activity');
update public.repositories set active=true where github_repository_id=1001;
update public.github_installations set status='suspended' where github_installation_id=12345;
select is(public.resolve_github_delivery_participants((select submitted from fixture)),0,'suspended installation cannot resolve activity');
update public.github_installations set status='active' where github_installation_id=12345;
update public.organizations set status='suspended' where github_account_id=9876;
select is(public.resolve_github_delivery_participants((select submitted from fixture)),0,'suspended organization cannot resolve activity');
update public.organizations set status='active' where github_account_id=9876;

select * from public.apply_github_installation_lifecycle(54321,6789,'other-team','Organization','created',now(),now());
create temporary table other_delivery as select pg_temp.delivery(9001,pg_temp.actor(7001)) as id;
update public.webhook_deliveries set github_installation_id=54321 where id=(select id from other_delivery);
select is(public.resolve_github_delivery_participants((select id from other_delivery)),0,'another tenant cannot claim this PR');
select is((select count(*) from public.participants p join public.organizations o on o.id=p.organization_id where o.github_account_id=6789),
  0::bigint,'no participants leak into another tenant');

select throws_ok($$select public.set_github_user_exclusion(7002,'service_account','')$$,
  '22023','invalid participant correction','correction requires explanatory note');
select throws_ok($$select public.set_github_user_exclusion(7002,'human','unsupported')$$,
  '22023','invalid participant correction','correction cannot force a bot into standings');
select is(public.review_participant_exclusion_reason(gen_random_uuid()),'contribution_missing','unknown review fails closed');

select ok(not has_function_privilege('anon','public.resolve_github_delivery_participants(uuid)','EXECUTE'),'anonymous cannot resolve participants');
select ok(not has_function_privilege('authenticated','public.resolve_github_delivery_participants(uuid)','EXECUTE'),'browser cannot resolve participants');
select ok(not has_function_privilege('authenticated','public.set_github_user_exclusion(bigint,text,text)','EXECUTE'),'browser cannot override eligibility');
select ok(not has_function_privilege('authenticated','public.review_participant_exclusion_reason(uuid)','EXECUTE'),'browser cannot probe another team review');
select ok(has_function_privilege('service_role','public.resolve_github_delivery_participants(uuid)','EXECUTE'),'worker can resolve participants');
select ok(not has_function_privilege('authenticated','private.resolve_activity_participant(uuid,jsonb,timestamptz,timestamptz)','EXECUTE'),
  'private helper cannot bypass organization scope');

select * from finish();
rollback;
