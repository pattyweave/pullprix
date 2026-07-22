begin;

create extension if not exists pgtap with schema extensions;
select plan(28);

select has_table('public', 'webhook_deliveries', 'webhook delivery ledger exists');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.webhook_deliveries'::regclass),
  'webhook deliveries has RLS enabled'
);
select has_function(
  'public',
  'accept_github_delivery',
  array['uuid', 'text', 'jsonb', 'text', 'bigint'],
  'delivery acceptance RPC exists'
);
select has_function(
  'public',
  'replay_webhook_delivery',
  array['uuid', 'integer'],
  'delivery replay RPC exists'
);

create temporary table first_accept as
select * from public.accept_github_delivery(
  p_github_delivery_id := '72d3162e-cc78-11e3-81ab-4c9367dc0958',
  p_event_name := 'pull_request_review',
  p_payload := '{"action":"submitted","installation":{"id":12345}}'::jsonb,
  p_action := 'submitted',
  p_github_installation_id := 12345
);

select is((select duplicate from first_accept), false, 'first delivery is new');
select is((select delivery_status from first_accept), 'queued', 'new delivery is queued');
select is(
  (select count(*) from public.webhook_deliveries),
  1::bigint,
  'first delivery creates one ledger record'
);
select is(
  (select count(*) from public.background_jobs where job_type = 'github.delivery'),
  1::bigint,
  'first delivery creates one background job'
);
select is(
  (select queue_length from pgmq.metrics('pull_prix_jobs')),
  1::bigint,
  'first delivery creates one queue message'
);

create temporary table duplicate_accept as
select * from public.accept_github_delivery(
  p_github_delivery_id := '72d3162e-cc78-11e3-81ab-4c9367dc0958',
  p_event_name := 'pull_request_review',
  p_payload := '{"action":"different"}'::jsonb,
  p_action := 'different'
);

select is(
  (select delivery_id from duplicate_accept),
  (select delivery_id from first_accept),
  'redelivery returns the stable internal delivery identity'
);
select is((select duplicate from duplicate_accept), true, 'redelivery is identified');
select is(
  (select count(*) from public.webhook_deliveries),
  1::bigint,
  'redelivery creates no delivery duplicate'
);
select is(
  (select count(*) from public.background_jobs where job_type = 'github.delivery'),
  1::bigint,
  'redelivery creates no job duplicate'
);
select is(
  (select queue_length from pgmq.metrics('pull_prix_jobs')),
  1::bigint,
  'redelivery creates no queue duplicate'
);
select is(
  (select payload->>'action' from public.webhook_deliveries),
  'submitted',
  'redelivery does not overwrite the verified original payload'
);

create temporary table claimed_delivery_job as
select * from public.claim_background_jobs(1, 30);

select is(
  (select count(*) from claimed_delivery_job),
  1::bigint,
  'delivery job can be claimed asynchronously'
);
select is(
  (select status from public.webhook_deliveries),
  'processing',
  'delivery reflects processing state'
);
select is(
  (select attempt_count from public.webhook_deliveries),
  1,
  'delivery reflects processing attempts'
);

update public.background_jobs
set max_attempts = 1
where id = (select job_id from claimed_delivery_job);

select is(
  public.fail_background_job(
    (select job_id from claimed_delivery_job),
    (select queue_message_id from claimed_delivery_job),
    'unsupported event fixture',
    0
  ),
  'failed',
  'final processing failure is recorded'
);
select is(
  (select status from public.webhook_deliveries),
  'failed',
  'delivery reflects failed job state'
);
select is(
  (select last_error from public.webhook_deliveries),
  'unsupported event fixture',
  'delivery exposes a concise failure reason to operators'
);

create temporary table replayed_delivery as
select * from public.replay_webhook_delivery(
  '72d3162e-cc78-11e3-81ab-4c9367dc0958'
);

select is(
  (select id from replayed_delivery),
  (select delivery_id from first_accept),
  'replay preserves the delivery identity'
);
select is((select status from replayed_delivery), 'queued', 'replay queues the delivery');
select is(
  (select attempt_count from replayed_delivery),
  0,
  'replay resets attempts for the same job'
);
select is(
  (select count(*) from public.background_jobs where job_type = 'github.delivery'),
  1::bigint,
  'replay does not create a second background job'
);
select is(
  (select queue_length from pgmq.metrics('pull_prix_jobs')),
  1::bigint,
  'replay creates one fresh queue message'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"10000000-0000-0000-0000-000000000001","role":"authenticated"}',
  true
);
select throws_ok(
  $$select count(*) from public.webhook_deliveries$$,
  '42501',
  'permission denied for table webhook_deliveries',
  'browser users cannot inspect webhook payloads'
);
select throws_ok(
  $$select public.accept_github_delivery(
    '82d3162e-cc78-11e3-81ab-4c9367dc0958',
    'ping',
    '{}'::jsonb
  )$$,
  '42501',
  'permission denied for function accept_github_delivery',
  'browser users cannot accept webhook deliveries'
);

select * from finish();
rollback;
