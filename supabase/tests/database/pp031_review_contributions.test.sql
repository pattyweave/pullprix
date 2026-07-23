begin;

create extension if not exists pgtap with schema extensions;
select plan(32);

select has_table(
  'public',
  'review_contributions',
  'canonical review contribution table exists'
);
select has_function(
  'public',
  'apply_github_review_contribution',
  array['bigint', 'bigint', 'bigint', 'jsonb'],
  'review contribution RPC exists'
);
select ok(
  (select relrowsecurity
   from pg_class
   where oid = 'public.review_contributions'::regclass),
  'review contributions have RLS enabled'
);
select hasnt_column(
  'public',
  'review_contributions',
  'points',
  'canonical review facts do not calculate points'
);

create function pg_temp.review_payload(
  review_id bigint,
  version_character text,
  actor_id bigint,
  review_state text,
  body_present boolean,
  occurred_at timestamptz,
  commit_id text,
  html_url text
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'source_github_id', review_id,
    'source_version', repeat(version_character, 64),
    'actor_github_user_id', actor_id,
    'review_state', review_state,
    'body_present', body_present,
    'occurred_at', occurred_at,
    'commit_id', commit_id,
    'html_url', html_url,
    'author_association', 'MEMBER'
  );
$$;

create temporary table alpha_installation as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-alpha',
  'Organization',
  'created',
  '2026-07-20T10:00:00Z',
  '2026-07-20T10:00:00Z'
);
select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-20T10:00:00Z',
    '[{"github_repository_id":1001,"owner":"pull-prix-alpha","name":"api","full_name":"pull-prix-alpha/api","private":true,"active":true}]'::jsonb,
    'selected'
  ),
  1,
  'active repository is prepared'
);
create temporary table alpha_pr as
select * from public.apply_github_pull_request_lifecycle(
  12345,
  1001,
  'opened',
  '{
    "github_pull_request_id":9001,
    "number":42,
    "author_github_user_id":7001,
    "title":"Add telemetry",
    "html_url":"https://github.com/pull-prix-alpha/api/pull/42",
    "state":"open",
    "draft":false,
    "requested_reviewer_github_ids":[7002],
    "created_at":"2026-07-20T12:00:00Z",
    "updated_at":"2026-07-20T12:00:00Z",
    "closed_at":null,
    "merged_at":null
  }'::jsonb
);

create temporary table approval_result as
select * from public.apply_github_review_contribution(
  12345,
  1001,
  9001,
  pg_temp.review_payload(
    5001,
    'a',
    7002,
    'approved',
    false,
    '2026-07-20T14:00:00Z',
    '1111111111111111111111111111111111111111',
    'https://github.com/pull-prix-alpha/api/pull/42#pullrequestreview-5001'
  )
);
select is((select disposition from approval_result), 'inserted', 'approval is inserted');
select is((select count(*) from public.review_contributions), 1::bigint, 'one contribution exists');
select is(
  (select source_github_id from public.review_contributions),
  5001::bigint,
  'stable GitHub review identity is retained'
);
select is(
  (select source_version from public.review_contributions),
  repeat('a', 64),
  'stable source version is retained'
);
select is(
  (select review_state from public.review_contributions),
  'approved',
  'approval state is retained'
);
select is(
  (select occurred_at from public.review_contributions),
  '2026-07-20T14:00:00Z'::timestamptz,
  'review submission time is retained'
);
select is(
  (select body_present from public.review_contributions),
  false,
  'body presence is retained without requiring review text'
);
select is(
  (select effective from public.review_contributions),
  true,
  'new formal review is effective'
);

create temporary table changes_result as
select * from public.apply_github_review_contribution(
  12345,
  1001,
  9001,
  pg_temp.review_payload(
    5002,
    'b',
    7003,
    'changes_requested',
    true,
    '2026-07-20T15:00:00Z',
    '2222222222222222222222222222222222222222',
    'https://github.com/pull-prix-alpha/api/pull/42#pullrequestreview-5002'
  )
);
select is(
  (select review_state
   from public.review_contributions
   where source_github_id = 5002),
  'changes_requested',
  'changes-requested state is retained'
);
select is(
  (select body_present
   from public.review_contributions
   where source_github_id = 5002),
  true,
  'changes-requested feedback presence is retained'
);

create temporary table comment_result as
select * from public.apply_github_review_contribution(
  12345,
  1001,
  9001,
  pg_temp.review_payload(
    5003,
    'c',
    7004,
    'commented',
    true,
    '2026-07-20T16:00:00Z',
    '3333333333333333333333333333333333333333',
    'https://github.com/pull-prix-alpha/api/pull/42#pullrequestreview-5003'
  )
);
select is(
  (select review_state
   from public.review_contributions
   where source_github_id = 5003),
  'commented',
  'comment-only formal review state is retained'
);

create temporary table edit_result as
select * from public.apply_github_review_contribution(
  12345,
  1001,
  9001,
  pg_temp.review_payload(
    5001,
    'd',
    7002,
    'approved',
    true,
    '2026-07-20T14:00:00Z',
    '1111111111111111111111111111111111111111',
    'https://github.com/pull-prix-alpha/api/pull/42#pullrequestreview-5001'
  )
);
select is((select disposition from edit_result), 'updated', 'review edit updates its contribution');
select is(
  (select contribution_id from edit_result),
  (select contribution_id from approval_result),
  'review edit retains the canonical contribution identity'
);
select is((select count(*) from public.review_contributions), 3::bigint, 'edit creates no duplicate credit');
select is(
  (select source_version
   from public.review_contributions
   where source_github_id = 5001),
  repeat('d', 64),
  'edit replaces the source version'
);
select is(
  (select body_present
   from public.review_contributions
   where source_github_id = 5001),
  true,
  'edit updates feedback presence'
);
select is(
  (select occurred_at
   from public.review_contributions
   where source_github_id = 5001),
  '2026-07-20T14:00:00Z'::timestamptz,
  'edit retains the original review timestamp'
);

select is(
  (select disposition
   from public.apply_github_review_contribution(
     12345,
     1001,
     9001,
     pg_temp.review_payload(
       5001,
       'd',
       7002,
       'approved',
       true,
       '2026-07-20T14:00:00Z',
       '1111111111111111111111111111111111111111',
       'https://github.com/pull-prix-alpha/api/pull/42#pullrequestreview-5001'
     )
   )),
  'unchanged',
  'duplicate review version is idempotent'
);
select is((select count(*) from public.review_contributions), 3::bigint, 'duplicate delivery creates no row');
select ok(
  not (select metadata_json ? 'body'
       from public.review_contributions
       where source_github_id = 5001),
  'review body is not copied into contribution metadata'
);

select throws_ok(
  $$select * from public.apply_github_review_contribution(
    12345,
    1001,
    9001,
    pg_temp.review_payload(
      5001,
      'e',
      7999,
      'approved',
      true,
      '2026-07-20T14:00:00Z',
      '1111111111111111111111111111111111111111',
      'https://github.com/pull-prix-alpha/api/pull/42#pullrequestreview-5001'
    )
  )$$,
  '23505',
  'GitHub review identity conflict',
  'stable review identity cannot move to a different actor'
);

create temporary table bravo_installation as
select * from public.apply_github_installation_lifecycle(
  54321,
  6789,
  'pull-prix-bravo',
  'Organization',
  'created',
  '2026-07-20T10:00:00Z',
  '2026-07-20T10:00:00Z'
);
select is(
  public.apply_github_repository_changes(
    54321,
    '2026-07-20T10:00:00Z',
    '[{"github_repository_id":2001,"owner":"pull-prix-bravo","name":"web","full_name":"pull-prix-bravo/web","private":true,"active":true}]'::jsonb,
    'selected'
  ),
  1,
  'second organization repository is prepared'
);
create temporary table bravo_pr as
select * from public.apply_github_pull_request_lifecycle(
  54321,
  2001,
  'opened',
  '{
    "github_pull_request_id":9002,
    "number":7,
    "author_github_user_id":8001,
    "title":"Private roadmap",
    "html_url":"https://github.com/pull-prix-bravo/web/pull/7",
    "state":"open",
    "draft":false,
    "requested_reviewer_github_ids":[],
    "created_at":"2026-07-21T12:00:00Z",
    "updated_at":"2026-07-21T12:00:00Z",
    "closed_at":null,
    "merged_at":null
  }'::jsonb
);
create temporary table bravo_review as
select * from public.apply_github_review_contribution(
  54321,
  2001,
  9002,
  pg_temp.review_payload(
    6001,
    'f',
    8002,
    'approved',
    false,
    '2026-07-21T14:00:00Z',
    '4444444444444444444444444444444444444444',
    'https://github.com/pull-prix-bravo/web/pull/7#pullrequestreview-6001'
  )
);
select is(
  (select count(*) from public.review_contributions),
  4::bigint,
  'both organizations retain their review facts'
);

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '10000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'driver-alpha@example.test',
  '',
  now(),
  '{"provider":"github","providers":["github"]}',
  '{}',
  now(),
  now()
);
insert into public.github_users (id, github_user_id, login, account_type)
values ('a3000000-0000-0000-0000-000000000001', 7001, 'driver-alpha', 'User');
insert into public.organization_memberships (
  organization_id,
  github_user_id,
  auth_user_id
) values (
  (select organization_id from alpha_installation),
  'a3000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select is(
  (select count(*) from public.review_contributions),
  3::bigint,
  'member sees only their organization review contributions'
);
select is(
  (select count(*)
   from public.review_contributions
   where source_github_id = 6001),
  0::bigint,
  'member cannot guess another organization review'
);
select throws_ok(
  $$select * from public.apply_github_review_contribution(
    12345,
    1001,
    9001,
    '{}'::jsonb
  )$$,
  '42501',
  'permission denied for function apply_github_review_contribution',
  'browser users cannot write canonical review facts'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select count(*) from public.review_contributions$$,
  '42501',
  'permission denied for table review_contributions',
  'anonymous users cannot read review contributions'
);

select * from finish();
rollback;
