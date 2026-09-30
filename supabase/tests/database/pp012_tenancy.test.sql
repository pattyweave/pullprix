begin;

create extension if not exists pgtap with schema extensions;
select plan(24);

select has_table('public', 'organizations', 'organizations table exists');
select has_table('public', 'github_installations', 'GitHub installations table exists');
select has_table('public', 'repositories', 'repositories table exists');
select has_table('public', 'github_users', 'GitHub users table exists');
select has_table('public', 'organization_memberships', 'organization memberships table exists');
select has_table('public', 'participants', 'participants table exists');

select ok(
  (select relrowsecurity from pg_class where oid = 'public.organizations'::regclass),
  'organizations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.github_installations'::regclass),
  'GitHub installations has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.repositories'::regclass),
  'repositories has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.github_users'::regclass),
  'GitHub users has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.organization_memberships'::regclass),
  'organization memberships has RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.participants'::regclass),
  'participants has RLS enabled'
);

insert into auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'driver-a@example.test',
    '',
    now(),
    '{"provider":"github","providers":["github"]}',
    '{}',
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'driver-b@example.test',
    '',
    now(),
    '{"provider":"github","providers":["github"]}',
    '{}',
    now(),
    now()
  );

insert into public.organizations (id, github_account_id, slug, name)
values
  ('a0000000-0000-0000-0000-000000000001', 101, 'team-alpha', 'Team Alpha'),
  ('b0000000-0000-0000-0000-000000000002', 202, 'team-bravo', 'Team Bravo');

insert into public.github_installations (
  id,
  organization_id,
  github_installation_id,
  account_id,
  account_login,
  account_type,
  installed_at
)
values
  (
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    1001,
    101,
    'team-alpha',
    'Organization',
    now()
  ),
  (
    'b1000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    2002,
    202,
    'team-bravo',
    'Organization',
    now()
  );

insert into public.repositories (
  id,
  organization_id,
  installation_id,
  github_repository_id,
  owner,
  name,
  full_name
)
values
  (
    'a2000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    10001,
    'team-alpha',
    'api',
    'team-alpha/api'
  ),
  (
    'b2000000-0000-0000-0000-000000000002',
    'b0000000-0000-0000-0000-000000000002',
    'b1000000-0000-0000-0000-000000000002',
    20002,
    'team-bravo',
    'web',
    'team-bravo/web'
  );

insert into public.github_users (id, github_user_id, login, account_type)
values
  ('a3000000-0000-0000-0000-000000000001', 30001, 'driver-alpha', 'User'),
  ('b3000000-0000-0000-0000-000000000002', 30002, 'driver-bravo', 'User');

insert into public.organization_memberships (
  organization_id,
  github_user_id,
  auth_user_id
)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    '10000000-0000-0000-0000-000000000001'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'b3000000-0000-0000-0000-000000000002',
    '20000000-0000-0000-0000-000000000002'
  );

insert into public.participants (
  organization_id,
  github_user_id,
  display_name
)
values
  (
    'a0000000-0000-0000-0000-000000000001',
    'a3000000-0000-0000-0000-000000000001',
    'Driver Alpha'
  ),
  (
    'b0000000-0000-0000-0000-000000000002',
    'b3000000-0000-0000-0000-000000000002',
    'Driver Bravo'
  );

insert into auth.sessions(id,user_id) values('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001');
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated","session_id":"50000000-0000-0000-0000-000000000001"}',
  true
);

select is((select count(*) from public.organizations), 1::bigint, 'member sees one organization');
select is((select slug from public.organizations), 'team-alpha', 'member sees only their organization');
select is((select count(*) from public.organizations where slug = 'team-bravo'), 0::bigint, 'guessed organization slug grants no access');
select is((select count(*) from public.github_installations), 1::bigint, 'member sees only their installation');
select is((select count(*) from public.repositories), 1::bigint, 'member sees only their repository');
select is((select count(*) from public.github_users), 1::bigint, 'member sees only shared GitHub users');
select is((select count(*) from public.organization_memberships), 1::bigint, 'member sees only their own membership');
select is((select count(*) from public.participants), 1::bigint, 'member sees only their participants');

select throws_ok(
  $$insert into public.organizations (github_account_id, slug, name) values (303, 'team-charlie', 'Team Charlie')$$,
  '42501',
  'permission denied for table organizations',
  'authenticated browser users cannot create organizations'
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok(
  $$select count(*) from public.organizations$$,
  '42501',
  'permission denied for table organizations',
  'anonymous users cannot read organizations'
);
select throws_ok(
  $$select count(*) from public.participants$$,
  '42501',
  'permission denied for table participants',
  'anonymous users cannot read participants'
);
select throws_ok(
  $$select count(*) from public.repositories$$,
  '42501',
  'permission denied for table repositories',
  'anonymous users cannot read repositories'
);

select * from finish();
rollback;
