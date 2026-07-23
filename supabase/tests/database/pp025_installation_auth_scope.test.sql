begin;

create extension if not exists pgtap with schema extensions;
select plan(11);

select has_function(
  'public',
  'get_github_installation_auth_scope',
  array['bigint'],
  'installation authentication scope RPC exists'
);

create temporary table installation_setup as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-sandbox',
  'Organization',
  'created',
  '2026-07-20T12:00:00Z',
  '2026-07-20T12:00:00Z'
);

select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-20T12:00:00Z',
    '[
      {"github_repository_id":1002,"owner":"pull-prix-sandbox","name":"web","full_name":"pull-prix-sandbox/web","private":true,"active":true},
      {"github_repository_id":1001,"owner":"pull-prix-sandbox","name":"api","full_name":"pull-prix-sandbox/api","private":true,"active":true}
    ]'::jsonb,
    'selected'
  ),
  2,
  'selected repository access is applied'
);
select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-21T12:00:00Z',
    '[{"github_repository_id":1002,"owner":"pull-prix-sandbox","name":"web","full_name":"pull-prix-sandbox/web","private":true,"active":false}]'::jsonb,
    'selected'
  ),
  1,
  'removed repository is made inactive'
);
select is(
  (select repository_selection from public.get_github_installation_auth_scope(12345)),
  'selected',
  'scope reports selected access'
);
select is(
  (select repository_ids from public.get_github_installation_auth_scope(12345)),
  array[1001::bigint],
  'scope contains only active repositories in stable order'
);
select is(
  (select count(*) from public.get_github_installation_auth_scope(99999)),
  0::bigint,
  'unknown installations have no authentication scope'
);

select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-22T12:00:00Z',
    '[]'::jsonb,
    'all'
  ),
  0,
  'installation can switch to all-repository access'
);
select is(
  (select repository_selection from public.get_github_installation_auth_scope(12345)),
  'all',
  'scope reports all-repository access'
);

create temporary table suspension as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-sandbox',
  'Organization',
  'suspend',
  '2026-07-23T12:00:00Z',
  '2026-07-23T12:00:00Z'
);
select is(
  (select count(*) from public.get_github_installation_auth_scope(12345)),
  0::bigint,
  'suspended installations have no authentication scope'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select * from public.get_github_installation_auth_scope(12345)$$,
  '42501',
  'permission denied for function get_github_installation_auth_scope',
  'browser users cannot read installation authentication scope'
);

reset role;
select hasnt_column(
  'public',
  'github_installations',
  'access_token',
  'installation tokens are not persisted'
);

select * from finish();
rollback;
