begin;

create extension if not exists pgtap with schema extensions;
select plan(33);

select has_function(
  'public',
  'apply_github_review_comment',
  array['bigint', 'bigint', 'bigint', 'text', 'jsonb'],
  'review comment RPC exists'
);
select hasnt_column(
  'public',
  'review_contributions',
  'points',
  'comment facts do not store points'
);
select hasnt_column(
  'public',
  'review_contributions',
  'body',
  'comment bodies are not retained in the canonical ledger'
);
select hasnt_column(
  'public',
  'review_contributions',
  'body_length',
  'comment length is not treated as quality'
);
select hasnt_column(
  'public',
  'review_contributions',
  'comment_count',
  'raw comment count is not treated as quality'
);

create function pg_temp.comment_payload(
  comment_id bigint,
  version_character text,
  actor_id bigint,
  actor_type text,
  is_bot boolean,
  is_self_authored boolean,
  body_present boolean,
  created_at timestamptz,
  updated_at timestamptz,
  linked_review_id bigint default null,
  in_reply_to_id bigint default null
)
returns jsonb
language sql
as $$
  select jsonb_build_object(
    'source_github_id', comment_id,
    'source_version', repeat(version_character, 64),
    'actor_github_user_id', actor_id,
    'actor_type', actor_type,
    'is_bot', is_bot,
    'is_self_authored', is_self_authored,
    'body_present', body_present,
    'created_at', created_at,
    'updated_at', updated_at,
    'linked_review_github_id', linked_review_id,
    'in_reply_to_github_id', in_reply_to_id,
    'html_url',
      'https://github.com/pull-prix-sandbox/api/pull/42#discussion_r' ||
        comment_id::text,
    'author_association', 'MEMBER'
  );
$$;

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

create temporary table created_result as
select * from public.apply_github_review_comment(
  12345,
  1001,
  9001,
  'created',
  pg_temp.comment_payload(
    6001,
    'b',
    7002,
    'User',
    false,
    false,
    true,
    '2026-07-20T14:00:00Z',
    '2026-07-20T14:00:00Z',
    5001
  )
);
select is((select disposition from created_result), 'inserted', 'comment is inserted');
select is(
  (select source_type
   from public.review_contributions
   where source_github_id = 6001),
  'review_comment',
  'comment uses a distinct stable source type'
);
select is(
  (select action
   from public.review_contributions
   where source_github_id = 6001),
  'inline_comment',
  'comment is a theme-independent inline-comment fact'
);
select is(
  (select review_state
   from public.review_contributions
   where source_github_id = 6001),
  null::text,
  'comment does not invent a formal review state'
);
select is(
  (select body_present
   from public.review_contributions
   where source_github_id = 6001),
  true,
  'non-empty feedback presence is retained'
);
select is(
  (select (metadata_json->>'linked_review_github_id')::bigint
   from public.review_contributions
   where source_github_id = 6001),
  5001::bigint,
  'comment is associated with its formal review'
);
select is(
  (select metadata_json->>'is_bot'
   from public.review_contributions
   where source_github_id = 6001),
  'false',
  'human comment is not marked as a bot'
);
select is(
  (select metadata_json->>'is_self_authored'
   from public.review_contributions
   where source_github_id = 6001),
  'false',
  'reviewer comment is not self-authored'
);
select ok(
  not (select metadata_json ?| array['body', 'body_length', 'path', 'diff_hunk', 'comment_count', 'quality']
       from public.review_contributions
       where source_github_id = 6001),
  'comment metadata retains no text, diff, path, count, or quality proxy'
);
select is(
  (select scoring_recalculation_requested_at from created_result),
  '2026-07-20T14:00:00Z'::timestamptz,
  'new feedback marks the PR for later scoring recalculation'
);

select is(
  (select disposition
   from public.apply_github_review_comment(
     12345,
     1001,
     9001,
     'created',
     pg_temp.comment_payload(
       6001,
       'b',
       7002,
       'User',
       false,
       false,
       true,
       '2026-07-20T14:00:00Z',
       '2026-07-20T14:00:00Z',
       5001
     )
   )),
  'unchanged',
  'duplicate comment delivery is idempotent'
);
select is(
  (select count(*)
   from public.review_contributions
   where source_type = 'review_comment'),
  1::bigint,
  'duplicate delivery creates no comment row'
);

create temporary table edited_result as
select * from public.apply_github_review_comment(
  12345,
  1001,
  9001,
  'edited',
  pg_temp.comment_payload(
    6001,
    'c',
    7002,
    'User',
    false,
    false,
    false,
    '2026-07-20T14:00:00Z',
    '2026-07-20T15:00:00Z',
    5001
  )
);
select is((select disposition from edited_result), 'updated', 'comment edit updates one record');
select is(
  (select contribution_id from edited_result),
  (select contribution_id from created_result),
  'comment edit retains canonical identity'
);
select is(
  (select body_present
   from public.review_contributions
   where source_github_id = 6001),
  false,
  'comment edit updates body presence'
);
select is(
  (select count(*)
   from public.review_contributions
   where source_type = 'review_comment'),
  1::bigint,
  'comment edit creates no duplicate'
);
select is(
  (select disposition
   from public.apply_github_review_comment(
     12345,
     1001,
     9001,
     'created',
     pg_temp.comment_payload(
       6001,
       'b',
       7002,
       'User',
       false,
       false,
       true,
       '2026-07-20T14:00:00Z',
       '2026-07-20T14:00:00Z',
       5001
     )
   )),
  'stale',
  'out-of-order create cannot replace an edit'
);

create temporary table deleted_result as
select * from public.apply_github_review_comment(
  12345,
  1001,
  9001,
  'deleted',
  pg_temp.comment_payload(
    6001,
    'd',
    7002,
    'User',
    false,
    false,
    false,
    '2026-07-20T14:00:00Z',
    '2026-07-20T16:00:00Z',
    5001
  )
);
select is((select disposition from deleted_result), 'updated', 'comment deletion updates one record');
select is(
  (select effective
   from public.review_contributions
   where source_github_id = 6001),
  false,
  'deleted comment becomes ineffective'
);
select is(
  (select superseded_at
   from public.review_contributions
   where source_github_id = 6001),
  '2026-07-20T16:00:00Z'::timestamptz,
  'comment deletion time is retained'
);
select is(
  (select disposition
   from public.apply_github_review_comment(
     12345,
     1001,
     9001,
     'edited',
     pg_temp.comment_payload(
       6001,
       'c',
       7002,
       'User',
       false,
       false,
       false,
       '2026-07-20T14:00:00Z',
       '2026-07-20T15:00:00Z',
       5001
     )
   )),
  'stale',
  'late edit cannot restore a deleted comment'
);

create temporary table bot_result as
select * from public.apply_github_review_comment(
  12345,
  1001,
  9001,
  'created',
  pg_temp.comment_payload(
    6002,
    'e',
    7999,
    'Bot',
    true,
    false,
    true,
    '2026-07-20T14:30:00Z',
    '2026-07-20T14:30:00Z'
  )
);
select is(
  (select metadata_json->>'is_bot'
   from public.review_contributions
   where source_github_id = 6002),
  'true',
  'bot comment remains auditable and flagged'
);
select is(
  (select effective
   from public.review_contributions
   where source_github_id = 6002),
  true,
  'bot fact remains present for PP-034 eligibility handling'
);

create temporary table self_result as
select * from public.apply_github_review_comment(
  12345,
  1001,
  9001,
  'created',
  pg_temp.comment_payload(
    6003,
    'f',
    7001,
    'User',
    false,
    true,
    true,
    '2026-07-20T15:30:00Z',
    '2026-07-20T15:30:00Z',
    5004,
    6001
  )
);
select is(
  (select metadata_json->>'is_self_authored'
   from public.review_contributions
   where source_github_id = 6003),
  'true',
  'self-authored comment remains auditable and flagged'
);
select is(
  (select (metadata_json->>'in_reply_to_github_id')::bigint
   from public.review_contributions
   where source_github_id = 6003),
  6001::bigint,
  'reply identity is retained without comment text'
);
select is(
  (select count(*)
   from public.review_contributions
   where source_type = 'review_comment'),
  3::bigint,
  'each GitHub comment has one canonical row'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.apply_github_review_comment(
    12345,
    1001,
    9001,
    'created',
    '{}'::jsonb
  )$$,
  '42501',
  'permission denied for function apply_github_review_comment',
  'browser users cannot write review comments'
);

select * from finish();
rollback;
