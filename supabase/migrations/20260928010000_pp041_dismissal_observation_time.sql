-- GitHub has no dismissal timestamp. Use durable webhook receipt time as the
-- observation boundary, never the possibly unchanged PR snapshot timestamp.
create or replace function private.capture_scoring_event(p_delivery public.webhook_deliveries)
returns void language plpgsql security definer set search_path='' as $$
declare pr public.pull_requests; snapshot jsonb; happened timestamptz;
begin
  if p_delivery.status<>'processed' or p_delivery.event_name not in ('pull_request','pull_request_review') then return; end if;
  snapshot:=p_delivery.payload->'pull_request';
  if snapshot->>'id' is null or snapshot->>'state' not in ('open','closed') or snapshot->>'draft' is null then return; end if;
  select p.* into pr from public.pull_requests p join public.repositories r on r.id=p.repository_id
    join public.github_installations i on i.id=r.installation_id
    where p.github_pull_request_id=(snapshot->>'id')::bigint
      and r.github_repository_id=(p_delivery.payload->'repository'->>'id')::bigint
      and i.github_installation_id=p_delivery.github_installation_id;
  if pr.id is null then return; end if;
  happened:=case when p_delivery.event_name='pull_request_review' and p_delivery.action='submitted'
    then (p_delivery.payload->'review'->>'submitted_at')::timestamptz
    when p_delivery.event_name='pull_request_review' and p_delivery.action='dismissed'
      then p_delivery.received_at
    when p_delivery.action='opened' then (snapshot->>'created_at')::timestamptz
    else (snapshot->>'updated_at')::timestamptz end;
  if happened is null then return; end if;
  insert into public.scoring_events(delivery_id,pull_request_id,event_name,action,occurred_at,state,draft,head_sha,review_github_id)
    values(p_delivery.id,pr.id,p_delivery.event_name,p_delivery.action,happened,snapshot->>'state',
      (snapshot->>'draft')::boolean,snapshot->'head'->>'sha',
      case when p_delivery.event_name='pull_request_review' then (p_delivery.payload->'review'->>'id')::bigint end)
    on conflict do nothing;
end;
$$;

-- Repair only retained dismissal evidence, leaving original submissions intact.
with repaired as (
  update public.scoring_events e set occurred_at=d.received_at
  from public.webhook_deliveries d
  where e.delivery_id=d.id and e.event_name='pull_request_review' and e.action='dismissed'
    and e.occurred_at is distinct from d.received_at
  returning e.pull_request_id
)
select private.dirty_pr_score(pull_request_id) from (select distinct pull_request_id from repaired) affected;

-- Match the canonical dismissal to its recorded snapshot and actor. Keep source
-- version and earned credit; dismissed_at here is an observation, not GitHub time.
-- The replay guard preserves old dismissal metadata; bypass it only for this
-- atomic repair. ALTER TABLE holds its lock until the migration commits.
alter table public.review_contributions disable trigger review_contributions_preserve_dismissal;
update public.review_contributions c set
  superseded_at=d.received_at,
  metadata_json=jsonb_set(c.metadata_json,'{dismissal,dismissed_at}',to_jsonb(d.received_at))
from public.scoring_events e join public.webhook_deliveries d on d.id=e.delivery_id
where e.event_name='pull_request_review' and e.action='dismissed'
  and c.pull_request_id=e.pull_request_id and c.source_type='review' and c.source_github_id=e.review_github_id
  and c.metadata_json ? 'dismissal'
  and (c.metadata_json->'dismissal'->>'dismissed_at')::timestamptz=(d.payload->'pull_request'->>'updated_at')::timestamptz
  and (c.metadata_json->'dismissal'->>'dismissed_by_github_user_id')::bigint=(d.payload->'sender'->>'id')::bigint;
alter table public.review_contributions enable trigger review_contributions_preserve_dismissal;
