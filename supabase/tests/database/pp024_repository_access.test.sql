begin;

create extension if not exists pgtap with schema extensions;
select plan(37);

select has_column(
  'public',
  'github_installations',
  'repository_selection',
  'installation records all or selected repository access'
);
select has_column(
  'public',
  'repositories',
  'access_updated_at',
  'repository access ordering time exists'
);
select has_column(
  'public',
  'repositories',
  'metadata_updated_at',
  'repository metadata ordering time exists'
);
select has_function(
  'public',
  'apply_github_repository_changes',
  array['bigint', 'timestamp with time zone', 'jsonb', 'text'],
  'repository change RPC exists'
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
    '[{"github_repository_id":1001,"owner":"pull-prix-sandbox","name":"api","full_name":"pull-prix-sandbox/api","private":true,"active":true}]'::jsonb,
    'selected'
  ),
  1,
  'initial repository snapshot is applied'
);
select is((select repository_selection from public.github_installations), 'selected', 'selected access is recorded');
select is((select count(*) from public.repositories), 1::bigint, 'initial snapshot creates one repository');
select is((select active from public.repositories where github_repository_id = 1001), true, 'initial repository is active');
select is((select owner from public.repositories where github_repository_id = 1001), 'pull-prix-sandbox', 'repository owner is recorded');

select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-21T12:00:00Z',
    '[{"github_repository_id":1002,"owner":"pull-prix-sandbox","name":"web","full_name":"pull-prix-sandbox/web","private":true,"active":true}]'::jsonb,
    'selected'
  ),
  1,
  'added repository is applied'
);
select is((select count(*) from public.repositories), 2::bigint, 'added repository creates one row');
select is((select active from public.repositories where github_repository_id = 1002), true, 'added repository becomes eligible');

select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-22T12:00:00Z',
    '[{"github_repository_id":1001,"owner":"pull-prix-sandbox","name":"api","full_name":"pull-prix-sandbox/api","private":true,"active":false}]'::jsonb,
    'selected'
  ),
  1,
  'repository removal is applied'
);
select is((select active from public.repositories where github_repository_id = 1001), false, 'removed repository stops contributing');
select is((select count(*) from public.repositories), 2::bigint, 'removed repository history is retained');

select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-21T18:00:00Z',
    '[{"github_repository_id":1001,"owner":"pull-prix-sandbox","name":"api-old","full_name":"pull-prix-sandbox/api-old","private":true,"active":true}]'::jsonb,
    'selected'
  ),
  1,
  'stale repository change is safely consumed'
);
select is((select active from public.repositories where github_repository_id = 1001), false, 'stale add cannot reactivate removed repository');
select is(
  (select access_updated_at from public.repositories where github_repository_id = 1001),
  '2026-07-22T12:00:00Z'::timestamptz,
  'stale add cannot replace access ordering time'
);

select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-23T12:00:00Z',
    '[{"github_repository_id":1002,"owner":"pull-prix-sandbox","name":"frontend","full_name":"pull-prix-sandbox/frontend","private":true,"active":null}]'::jsonb
  ),
  1,
  'repository rename is applied'
);
select is((select name from public.repositories where github_repository_id = 1002), 'frontend', 'rename updates repository name');
select is((select full_name from public.repositories where github_repository_id = 1002), 'pull-prix-sandbox/frontend', 'rename updates full name');
select is((select active from public.repositories where github_repository_id = 1002), true, 'rename preserves access');

select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-24T12:00:00Z',
    '[{"github_repository_id":1002,"owner":"new-owner","name":"frontend","full_name":"new-owner/frontend","private":true,"active":false}]'::jsonb
  ),
  1,
  'repository transfer is applied'
);
select is((select active from public.repositories where github_repository_id = 1002), false, 'transfer stops access under old installation');
select is((select owner from public.repositories where github_repository_id = 1002), 'new-owner', 'transfer records new repository owner');
select is((select count(*) from public.repositories where github_repository_id = 1002), 1::bigint, 'transferred historical row remains');

select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-25T12:00:00Z',
    '[]'::jsonb,
    'all'
  ),
  0,
  'all-repository selection can update without an inline repository'
);
select is((select repository_selection from public.github_installations), 'all', 'all-repository access is recorded');
select is(
  (select repository_selection_updated_at from public.github_installations),
  '2026-07-25T12:00:00Z'::timestamptz,
  'repository selection ordering time is recorded'
);

select is(
  public.apply_github_repository_changes(
    12345,
    '2026-07-22T12:00:00Z',
    '[{"github_repository_id":1001,"owner":"pull-prix-sandbox","name":"api","full_name":"pull-prix-sandbox/api","private":true,"active":false}]'::jsonb,
    'selected'
  ),
  1,
  'duplicate removal is safely consumed'
);
select is((select count(*) from public.repositories), 2::bigint, 'duplicate change creates no repository duplicate');

create temporary table second_installation_setup as
select * from public.apply_github_installation_lifecycle(
  54321,
  6789,
  'new-owner',
  'Organization',
  'created',
  '2026-07-26T12:00:00Z',
  '2026-07-26T12:00:00Z'
);
select is(
  public.apply_github_repository_changes(
    54321,
    '2026-07-26T12:00:00Z',
    '[{"github_repository_id":1002,"owner":"new-owner","name":"frontend","full_name":"new-owner/frontend","private":true,"active":true}]'::jsonb,
    'selected'
  ),
  1,
  'transferred repository is applied under new installation'
);

select is((select count(*) from public.repositories where github_repository_id = 1002), 2::bigint, 'transfer can create a row under new installation');
select is(
  (select active from public.repositories repository join public.github_installations installation on installation.id = repository.installation_id where repository.github_repository_id = 1002 and installation.github_installation_id = 12345),
  false,
  'old tenant transfer row remains inactive'
);
select is(
  (select active from public.repositories repository join public.github_installations installation on installation.id = repository.installation_id where repository.github_repository_id = 1002 and installation.github_installation_id = 54321),
  true,
  'new tenant transfer row is active'
);
select isnt(
  (select repository.organization_id from public.repositories repository join public.github_installations installation on installation.id = repository.installation_id where repository.github_repository_id = 1002 and installation.github_installation_id = 12345),
  (select repository.organization_id from public.repositories repository join public.github_installations installation on installation.id = repository.installation_id where repository.github_repository_id = 1002 and installation.github_installation_id = 54321),
  'transfer does not move history across tenants'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.apply_github_repository_changes(
    12345,
    now(),
    '[]'::jsonb,
    'selected'
  )$$,
  '42501',
  'permission denied for function apply_github_repository_changes',
  'browser users cannot apply repository access changes'
);

select * from finish();
rollback;
