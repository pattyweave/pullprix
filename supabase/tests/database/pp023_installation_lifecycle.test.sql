begin;

create extension if not exists pgtap with schema extensions;
select plan(30);

select has_column(
  'public',
  'github_installations',
  'github_updated_at',
  'installations retain GitHub lifecycle ordering time'
);
select has_column(
  'public',
  'github_installations',
  'last_lifecycle_action',
  'installations retain the last lifecycle action'
);
select has_function(
  'public',
  'apply_github_installation_lifecycle',
  array['bigint', 'bigint', 'text', 'text', 'text', 'timestamp with time zone', 'timestamp with time zone', 'timestamp with time zone'],
  'installation lifecycle apply RPC exists'
);
select has_function(
  'public',
  'get_github_delivery_for_processing',
  array['uuid'],
  'private delivery reader RPC exists'
);

create temporary table created_result as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-sandbox',
  'Organization',
  'created',
  '2026-07-20T12:00:00Z',
  '2026-07-20T12:00:00Z'
);

select is((select disposition from created_result), 'applied', 'created is applied');
select is((select installation_status from created_result), 'active', 'created activates installation');
select is((select count(*) from public.organizations), 1::bigint, 'created makes one organization');
select is((select count(*) from public.github_installations), 1::bigint, 'created makes one installation');
select is((select status from public.organizations), 'active', 'created activates organization');

create temporary table suspended_result as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-sandbox',
  'Organization',
  'suspend',
  '2026-07-22T12:00:00Z',
  '2026-07-20T12:00:00Z',
  '2026-07-22T12:00:00Z'
);

select is((select installation_status from suspended_result), 'suspended', 'suspend stops installation');
select is((select status from public.organizations), 'suspended', 'suspend stops organization work');
select is(
  (select suspended_at from public.github_installations),
  '2026-07-22T12:00:00Z'::timestamptz,
  'suspension time is retained'
);

create temporary table stale_unsuspend_result as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-sandbox',
  'Organization',
  'unsuspend',
  '2026-07-21T12:00:00Z',
  '2026-07-20T12:00:00Z'
);

select is((select disposition from stale_unsuspend_result), 'stale', 'older unsuspend is ignored');
select is((select status from public.github_installations), 'suspended', 'older event cannot reactivate installation');
select is((select last_lifecycle_action from public.github_installations), 'suspend', 'stale event cannot replace last action');

create temporary table renamed_result as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-racing',
  'Organization',
  'renamed',
  '2026-07-23T12:00:00Z',
  '2026-07-20T12:00:00Z'
);

select is((select disposition from renamed_result), 'applied', 'account rename is applied');
select is((select slug from public.organizations), 'pull-prix-racing', 'rename updates private team slug');
select is((select account_login from public.github_installations), 'pull-prix-racing', 'rename updates installation login');
select is((select status from public.github_installations), 'suspended', 'rename preserves suspension state');

create temporary table unsuspended_result as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-racing',
  'Organization',
  'unsuspend',
  '2026-07-24T12:00:00Z',
  '2026-07-20T12:00:00Z'
);

select is((select installation_status from unsuspended_result), 'active', 'newer unsuspend reactivates installation');
select is((select status from public.organizations), 'active', 'newer unsuspend reactivates organization');
select is((select suspended_at from public.github_installations), null::timestamptz, 'unsuspend clears suspension time');

create temporary table deleted_result as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-racing',
  'Organization',
  'deleted',
  '2026-07-25T12:00:00Z',
  '2026-07-20T12:00:00Z'
);

select is((select installation_status from deleted_result), 'deleted', 'delete stops installation');
select is((select status from public.organizations), 'deleted', 'delete enters organization deletion state');
select is(
  public.is_github_installation_active(12345),
  false,
  'deleted installation rejects later ingestion work'
);

create temporary table stale_created_result as
select * from public.apply_github_installation_lifecycle(
  12345,
  9876,
  'pull-prix-sandbox',
  'Organization',
  'created',
  '2026-07-20T12:00:00Z',
  '2026-07-20T12:00:00Z'
);

select is((select disposition from stale_created_result), 'stale', 'delayed created is ignored after delete');
select is((select status from public.github_installations), 'deleted', 'delayed created cannot resurrect installation');
select is((select count(*) from public.organizations), 1::bigint, 'replayed lifecycle events do not duplicate organization');
select is((select count(*) from public.github_installations), 1::bigint, 'replayed lifecycle events do not duplicate installation');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select public.apply_github_installation_lifecycle(
    99999,
    8888,
    'browser-team',
    'Organization',
    'created',
    now(),
    now()
  )$$,
  '42501',
  'permission denied for function apply_github_installation_lifecycle',
  'browser users cannot apply installation lifecycle changes'
);

select * from finish();
rollback;
