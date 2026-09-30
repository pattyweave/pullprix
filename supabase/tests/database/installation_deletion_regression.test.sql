begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

create function pg_temp.apply_lifecycle(
  installation bigint, action text, event_at timestamptz,
  login text default 'deletion-test'
)
returns text language sql as $$
  select disposition from public.apply_github_installation_lifecycle(
    installation, 789001, login, 'Organization', action,
    event_at, '2026-09-01T12:00:00Z'
  );
$$;

select pg_temp.apply_lifecycle(789101, 'created', '2026-09-25T12:00:00Z');
select is(pg_temp.apply_lifecycle(789101, 'deleted', '2026-09-25T12:00:00Z'),
  'applied', 'deletion wins over an equal installation timestamp');
select is((select status from public.github_installations where github_installation_id = 789101),
  'deleted', 'installation becomes a deletion tombstone');
select is(public.is_github_installation_active(789101), false,
  'deleted installation cannot ingest work');
select is((select status from public.organizations where github_account_id = 789001),
  'deleted', 'organization with no other installations becomes deleted');
select is(pg_temp.apply_lifecycle(789101, 'deleted', '2026-09-25T12:00:00Z'),
  'stale', 'duplicate deletion is idempotent');
select is(pg_temp.apply_lifecycle(789101, 'created', '2026-09-26T12:00:00Z'),
  'stale', 'even a later created timestamp cannot resurrect a deleted ID');
select is(pg_temp.apply_lifecycle(789101, 'unsuspend', '2026-09-26T12:00:00Z'),
  'stale', 'unsuspend cannot resurrect a deleted ID');
select is(pg_temp.apply_lifecycle(789101, 'new_permissions_accepted', '2026-09-26T12:00:00Z'),
  'stale', 'permissions acceptance cannot resurrect a deleted ID');
select is((select last_lifecycle_action from public.github_installations where github_installation_id = 789101),
  'deleted', 'late events preserve the deletion action');

select is(pg_temp.apply_lifecycle(789102, 'created', '2026-09-26T12:00:00Z', 'replacement-team'),
  'applied', 'a replacement installation gets its own active record');
select is((select status from public.organizations where github_account_id = 789001),
  'active', 'replacement reactivates the organization');
select is(pg_temp.apply_lifecycle(789101, 'created', '2026-09-25T12:00:00Z'),
  'stale', 'same-timestamp created replay remains stale after replacement');

-- A deleted installation may be discovered after the replacement. Its old
-- account name and terminal state must not overwrite the replacement team.
select is(pg_temp.apply_lifecycle(789103, 'deleted', '2026-09-24T12:00:00Z'),
  'applied', 'deletion arriving before its created event creates a tombstone');
select is((select status from public.organizations where github_account_id = 789001),
  'active', 'late old deletion leaves the replacement organization active');
select is((select slug from public.organizations where github_account_id = 789001),
  'replacement-team', 'old deletion cannot revert current organization identity');
select is(pg_temp.apply_lifecycle(789103, 'created', '2026-09-24T12:00:00Z'),
  'stale', 'created arriving after deletion cannot resurrect the ID');

select pg_temp.apply_lifecycle(789104, 'created', '2026-09-27T12:00:00Z', 'replacement-team');
select is(pg_temp.apply_lifecycle(789104, 'deleted', '2026-09-23T12:00:00Z'),
  'applied', 'deletion also wins over a newer stored timestamp');
select is((select github_updated_at from public.github_installations where github_installation_id = 789104),
  '2026-09-27T12:00:00Z'::timestamptz, 'deletion does not rewind the stored timestamp');
select is(pg_temp.apply_lifecycle(789102, 'suspend', '2026-09-28T12:00:00Z', 'replacement-team'),
  'applied', 'replacement can still be suspended');
select is((select status from public.organizations where github_account_id = 789001),
  'suspended', 'remaining suspended installation determines organization status');
select is(pg_temp.apply_lifecycle(789104, 'deleted', '2026-09-29T12:00:00Z'),
  'stale', 'duplicate deletion with a newer timestamp is still idempotent');
select is((select status from public.organizations where github_account_id = 789001),
  'suspended', 'duplicate old deletion preserves replacement suspension');
select is(pg_temp.apply_lifecycle(789102, 'deleted', '2026-09-28T12:00:00Z', 'replacement-team'),
  'applied', 'equal-timestamp deletion also overrides suspension');
select is((select status from public.organizations where github_account_id = 789001),
  'deleted', 'organization becomes deleted when the last live installation is deleted');

select * from finish();
rollback;
