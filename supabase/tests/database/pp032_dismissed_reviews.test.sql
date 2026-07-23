begin;

create extension if not exists pgtap with schema extensions;
select plan(19);

select has_column(
  'public',
  'pull_requests',
  'scoring_recalculation_requested_at',
  'PR has a lightweight scoring recalculation marker'
);
select has_function(
  'public',
  'dismiss_github_review_contribution',
  array['bigint', 'bigint', 'bigint', 'jsonb'],
  'review dismissal RPC exists'
);

create temporary table installation_setup as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-sandbox',
  'Organization',
  'created',
  '2026-07-20T10:00:00Z',
  '2026-07-20T10:00:00Z'
);
select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-20T10:00:00Z',
    '[{"github_repository_id":1001,"owner":"pull-prix-sandbox","name":"api","full_name":"pull-prix-sandbox/api","private":true,"active":true}]'::jsonb,
    'selected'
  ),
  1,
  'active repository is prepared'
);
create temporary table pr_setup as
select * from public.apply_github_pull_request_lifecycle(
  12345,
  1001,
  'opened',
  '{
    "github_pull_request_id":9001,
    "number":42,
    "author_github_user_id":7001,
    "title":"Add telemetry",
    "html_url":"https://github.com/pull-prix-sandbox/api/pull/42",
    "state":"open",
    "draft":false,
    "requested_reviewer_github_ids":[7002],
    "created_at":"2026-07-20T12:00:00Z",
    "updated_at":"2026-07-20T12:00:00Z",
    "closed_at":null,
    "merged_at":null
  }'::jsonb
);
create temporary table review_setup as
select * from public.apply_github_review_contribution(
  12345,
  1001,
  9001,
  '{
    "source_github_id":5001,
    "source_version":"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "actor_github_user_id":7002,
    "review_state":"approved",
    "body_present":false,
    "occurred_at":"2026-07-20T14:00:00Z",
    "commit_id":"1111111111111111111111111111111111111111",
    "html_url":"https://github.com/pull-prix-sandbox/api/pull/42#pullrequestreview-5001",
    "author_association":"MEMBER"
  }'::jsonb
);

create temporary table dismissal_result as
select * from public.dismiss_github_review_contribution(
  12345,
  1001,
  9001,
  '{
    "source_github_id":5001,
    "source_version":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "reviewer_github_user_id":7002,
    "dismissed_by_github_user_id":7010,
    "dismissed_at":"2026-07-20T17:00:00Z"
  }'::jsonb
);
select is(
  (select disposition from dismissal_result),
  'dismissed',
  'review dismissal is applied'
);
select is(
  (select effective
   from public.review_contributions
   where source_github_id = 5001),
  false,
  'dismissed review becomes ineffective'
);
select is(
  (select superseded_at
   from public.review_contributions
   where source_github_id = 5001),
  '2026-07-20T17:00:00Z'::timestamptz,
  'dismissal time is retained'
);
select is(
  (select (metadata_json->'dismissal'->>'dismissed_by_github_user_id')::bigint
   from public.review_contributions
   where source_github_id = 5001),
  7010::bigint,
  'dismissal actor is retained for audit'
);
select is(
  (select metadata_json->'dismissal'->>'source_version'
   from public.review_contributions
   where source_github_id = 5001),
  repeat('b', 64),
  'dismissal source version is retained for audit'
);
select is(
  (select scoring_recalculation_requested_at from public.pull_requests),
  '2026-07-20T17:00:00Z'::timestamptz,
  'dismissal marks the PR for downstream recalculation'
);
select is(
  (select scoring_recalculation_requested_at from dismissal_result),
  '2026-07-20T17:00:00Z'::timestamptz,
  'worker result exposes the recalculation marker'
);
select is(
  (select count(*) from public.background_jobs),
  0::bigint,
  'dismissal does not create an unimplemented scoring job'
);

create temporary table duplicate_result as
select * from public.dismiss_github_review_contribution(
  12345,
  1001,
  9001,
  '{
    "source_github_id":5001,
    "source_version":"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    "reviewer_github_user_id":7002,
    "dismissed_by_github_user_id":7010,
    "dismissed_at":"2026-07-20T17:00:00Z"
  }'::jsonb
);
select is(
  (select disposition from duplicate_result),
  'unchanged',
  'duplicate dismissal is idempotent'
);
select is(
  (select count(*) from public.review_contributions),
  1::bigint,
  'duplicate dismissal creates no contribution'
);
select is(
  (select scoring_recalculation_requested_at from public.pull_requests),
  '2026-07-20T17:00:00Z'::timestamptz,
  'duplicate dismissal does not move the scoring marker'
);

create temporary table stale_edit as
select * from public.apply_github_review_contribution(
  12345,
  1001,
  9001,
  '{
    "source_github_id":5001,
    "source_version":"cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
    "actor_github_user_id":7002,
    "review_state":"approved",
    "body_present":true,
    "occurred_at":"2026-07-20T14:00:00Z",
    "commit_id":"1111111111111111111111111111111111111111",
    "html_url":"https://github.com/pull-prix-sandbox/api/pull/42#pullrequestreview-5001",
    "author_association":"MEMBER"
  }'::jsonb
);
select is(
  (select effective
   from public.review_contributions
   where source_github_id = 5001),
  false,
  'a late review edit cannot restore dismissed credit'
);
select is(
  (select superseded_at
   from public.review_contributions
   where source_github_id = 5001),
  '2026-07-20T17:00:00Z'::timestamptz,
  'late edit preserves dismissal time'
);
select is(
  (select metadata_json->'dismissal'->>'source_version'
   from public.review_contributions
   where source_github_id = 5001),
  repeat('b', 64),
  'late edit preserves dismissal audit metadata'
);

select throws_ok(
  $$select * from public.dismiss_github_review_contribution(
    12345,
    1001,
    9001,
    '{
      "source_github_id":5001,
      "source_version":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      "reviewer_github_user_id":7999,
      "dismissed_by_github_user_id":7010,
      "dismissed_at":"2026-07-20T18:00:00Z"
    }'::jsonb
  )$$,
  '23505',
  'GitHub review dismissal identity conflict',
  'dismissal cannot target a different review actor'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.dismiss_github_review_contribution(
    12345,
    1001,
    9001,
    '{}'::jsonb
  )$$,
  '42501',
  'permission denied for function dismiss_github_review_contribution',
  'browser users cannot dismiss canonical review facts'
);

select * from finish();
rollback;
