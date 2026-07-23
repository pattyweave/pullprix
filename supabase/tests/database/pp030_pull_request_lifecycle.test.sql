begin;

create extension if not exists pgtap with schema extensions;
select plan(33);

select has_table('public', 'pull_requests', 'pull requests table exists');
select has_function(
  'public',
  'apply_github_pull_request_lifecycle',
  array['bigint', 'bigint', 'text', 'jsonb'],
  'pull request lifecycle RPC exists'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.pull_requests'::regclass),
  'pull requests have RLS enabled'
);

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

create temporary table draft_result as
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
    "draft":true,
    "requested_reviewer_github_ids":[],
    "created_at":"2026-07-20T12:00:00Z",
    "updated_at":"2026-07-20T12:00:00Z",
    "closed_at":null,
    "merged_at":null
  }'::jsonb
);
select is((select disposition from draft_result), 'inserted', 'draft PR is inserted');
select is((select count(*) from public.pull_requests), 1::bigint, 'one PR row exists');
select is((select draft from public.pull_requests), true, 'draft state is stored');
select is(
  (select ready_for_review_at from public.pull_requests),
  null::timestamptz,
  'draft has no ready-for-review time'
);

create temporary table ready_result as
select * from public.apply_github_pull_request_lifecycle(
  12345,
  1001,
  'ready_for_review',
  '{
    "github_pull_request_id":9001,
    "number":42,
    "author_github_user_id":7001,
    "title":"Add telemetry",
    "html_url":"https://github.com/pull-prix-alpha/api/pull/42",
    "state":"open",
    "draft":false,
    "requested_reviewer_github_ids":[7003,7002,7003],
    "created_at":"2026-07-20T12:00:00Z",
    "updated_at":"2026-07-20T14:00:00Z",
    "closed_at":null,
    "merged_at":null
  }'::jsonb
);
select is((select disposition from ready_result), 'updated', 'ready event updates the PR');
select is(
  (select ready_for_review_at from public.pull_requests),
  '2026-07-20T14:00:00Z'::timestamptz,
  'ready-for-review time supports aging calculations'
);
select is(
  (select requested_reviewer_github_ids from public.pull_requests),
  array[7002::bigint, 7003::bigint],
  'requested reviewers are sorted and deduplicated'
);

create temporary table redraft_result as
select * from public.apply_github_pull_request_lifecycle(
  12345,
  1001,
  'converted_to_draft',
  '{
    "github_pull_request_id":9001,
    "number":42,
    "author_github_user_id":7001,
    "title":"Add telemetry",
    "html_url":"https://github.com/pull-prix-alpha/api/pull/42",
    "state":"open",
    "draft":true,
    "requested_reviewer_github_ids":[],
    "created_at":"2026-07-20T12:00:00Z",
    "updated_at":"2026-07-20T14:30:00Z",
    "closed_at":null,
    "merged_at":null
  }'::jsonb
);
select is((select draft from public.pull_requests), true, 'converted-to-draft state is stored');
select is(
  (select ready_for_review_at from public.pull_requests),
  null::timestamptz,
  'converting to draft clears the review-aging clock'
);

create temporary table reready_result as
select * from public.apply_github_pull_request_lifecycle(
  12345,
  1001,
  'ready_for_review',
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
    "updated_at":"2026-07-20T14:45:00Z",
    "closed_at":null,
    "merged_at":null
  }'::jsonb
);
select is((select draft from public.pull_requests), false, 'ready transition clears draft state');
select is(
  (select ready_for_review_at from public.pull_requests),
  '2026-07-20T14:45:00Z'::timestamptz,
  'a new ready transition restarts the review-aging clock'
);

create temporary table edit_result as
select * from public.apply_github_pull_request_lifecycle(
  12345,
  1001,
  'edited',
  '{
    "github_pull_request_id":9001,
    "number":42,
    "author_github_user_id":7001,
    "title":"Add useful telemetry",
    "html_url":"https://github.com/pull-prix-alpha/api/pull/42",
    "state":"open",
    "draft":false,
    "requested_reviewer_github_ids":[7002],
    "created_at":"2026-07-20T12:00:00Z",
    "updated_at":"2026-07-20T15:00:00Z",
    "closed_at":null,
    "merged_at":null
  }'::jsonb
);
select is((select title from public.pull_requests), 'Add useful telemetry', 'edits update PR metadata');
select is(
  (select ready_for_review_at from public.pull_requests),
  '2026-07-20T14:45:00Z'::timestamptz,
  'ordinary edits preserve ready time'
);

create temporary table stale_result as
select * from public.apply_github_pull_request_lifecycle(
  12345,
  1001,
  'closed',
  '{
    "github_pull_request_id":9001,
    "number":42,
    "author_github_user_id":7001,
    "title":"Old title",
    "html_url":"https://github.com/pull-prix-alpha/api/pull/42",
    "state":"closed",
    "draft":false,
    "requested_reviewer_github_ids":[],
    "created_at":"2026-07-20T12:00:00Z",
    "updated_at":"2026-07-20T13:00:00Z",
    "closed_at":"2026-07-20T13:00:00Z",
    "merged_at":null
  }'::jsonb
);
select is((select disposition from stale_result), 'stale', 'out-of-order event is rejected');
select is((select state from public.pull_requests), 'open', 'stale close cannot replace current state');
select is((select title from public.pull_requests), 'Add useful telemetry', 'stale metadata cannot replace current data');

create temporary table close_result as
select * from public.apply_github_pull_request_lifecycle(
  12345,
  1001,
  'closed',
  '{
    "github_pull_request_id":9001,
    "number":42,
    "author_github_user_id":7001,
    "title":"Add useful telemetry",
    "html_url":"https://github.com/pull-prix-alpha/api/pull/42",
    "state":"closed",
    "draft":false,
    "requested_reviewer_github_ids":[],
    "created_at":"2026-07-20T12:00:00Z",
    "updated_at":"2026-07-20T16:00:00Z",
    "closed_at":"2026-07-20T16:00:00Z",
    "merged_at":null
  }'::jsonb
);
select is((select state from public.pull_requests), 'closed', 'close state is stored');
select is(
  (select closed_at from public.pull_requests),
  '2026-07-20T16:00:00Z'::timestamptz,
  'close time is stored'
);

create temporary table reopen_result as
select * from public.apply_github_pull_request_lifecycle(
  12345,
  1001,
  'reopened',
  '{
    "github_pull_request_id":9001,
    "number":42,
    "author_github_user_id":7001,
    "title":"Add useful telemetry",
    "html_url":"https://github.com/pull-prix-alpha/api/pull/42",
    "state":"open",
    "draft":false,
    "requested_reviewer_github_ids":[7002],
    "created_at":"2026-07-20T12:00:00Z",
    "updated_at":"2026-07-20T17:00:00Z",
    "closed_at":null,
    "merged_at":null
  }'::jsonb
);
select is((select state from public.pull_requests), 'open', 'reopen restores open state');
select is((select closed_at from public.pull_requests), null::timestamptz, 'reopen clears close time');
select is(
  (select ready_for_review_at from public.pull_requests),
  '2026-07-20T17:00:00Z'::timestamptz,
  'reopen restarts the current review-aging clock'
);

create temporary table merge_result as
select * from public.apply_github_pull_request_lifecycle(
  12345,
  1001,
  'closed',
  '{
    "github_pull_request_id":9001,
    "number":42,
    "author_github_user_id":7001,
    "title":"Add useful telemetry",
    "html_url":"https://github.com/pull-prix-alpha/api/pull/42",
    "state":"closed",
    "draft":false,
    "requested_reviewer_github_ids":[],
    "created_at":"2026-07-20T12:00:00Z",
    "updated_at":"2026-07-20T18:00:00Z",
    "closed_at":"2026-07-20T18:00:00Z",
    "merged_at":"2026-07-20T18:00:00Z"
  }'::jsonb
);
select is(
  (select merged_at from public.pull_requests),
  '2026-07-20T18:00:00Z'::timestamptz,
  'merge time is stored'
);
select is(
  (select disposition from public.apply_github_pull_request_lifecycle(
    12345,
    1001,
    'closed',
    '{
      "github_pull_request_id":9001,
      "number":42,
      "author_github_user_id":7001,
      "title":"Add useful telemetry",
      "html_url":"https://github.com/pull-prix-alpha/api/pull/42",
      "state":"closed",
      "draft":false,
      "requested_reviewer_github_ids":[],
      "created_at":"2026-07-20T12:00:00Z",
      "updated_at":"2026-07-20T18:00:00Z",
      "closed_at":"2026-07-20T18:00:00Z",
      "merged_at":"2026-07-20T18:00:00Z"
    }'::jsonb
  )),
  'updated',
  'duplicate event is idempotently applied'
);
select is((select count(*) from public.pull_requests), 1::bigint, 'duplicate event creates no duplicate PR');

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
select is((select count(*) from public.pull_requests), 2::bigint, 'both organizations retain their PRs');

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
select is((select count(*) from public.pull_requests), 1::bigint, 'member sees only their organization PRs');
select is(
  (select count(*) from public.pull_requests where title = 'Private roadmap'),
  0::bigint,
  'member cannot guess another organization private PR'
);
select throws_ok(
  $$select * from public.apply_github_pull_request_lifecycle(
    12345,
    1001,
    'opened',
    '{}'::jsonb
  )$$,
  '42501',
  'permission denied for function apply_github_pull_request_lifecycle',
  'browser users cannot apply PR lifecycle changes'
);

select * from finish();
rollback;
