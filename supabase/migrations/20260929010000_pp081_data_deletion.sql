-- Content-free suppression records prevent delayed events from restoring erased data.
create table private.deleted_installations (
 github_installation_id bigint primary key, deleted_at timestamptz not null default now()
);
create table private.deleted_accounts (
 github_account_id bigint primary key, deleted_at timestamptz not null default now()
);
create table private.deletion_audit (
 organization_id uuid primary key, reason text not null check(reason in ('uninstalled','verified_request')),
 completed_at timestamptz not null default now()
);
revoke all on private.deleted_installations,private.deleted_accounts,private.deletion_audit from public,anon,authenticated,service_role;

-- Keep the existing implementation behind a serialized, non-bypassable gate.
alter function public.apply_github_installation_lifecycle(bigint,bigint,text,text,text,timestamptz,timestamptz,timestamptz) set schema private;
revoke all on function private.apply_github_installation_lifecycle(bigint,bigint,text,text,text,timestamptz,timestamptz,timestamptz) from public,anon,authenticated,service_role;
create function public.apply_github_installation_lifecycle(
 p_github_installation_id bigint,p_account_id bigint,p_account_login text,p_account_type text,
 p_action text,p_github_updated_at timestamptz,p_installed_at timestamptz,p_suspended_at timestamptz default null
) returns table(disposition text,organization_id uuid,installation_id uuid,installation_status text)
language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended('deletion-account:'||p_account_id,0));
 perform pg_advisory_xact_lock(hashtextextended('deletion-installation:'||p_github_installation_id,0));
 if exists(select 1 from private.deleted_installations where github_installation_id=p_github_installation_id)
 or exists(select 1 from private.deleted_accounts where github_account_id=p_account_id and p_installed_at<=deleted_at) then
  return query select 'stale'::text,null::uuid,null::uuid,'deleted'::text;
  return;
 end if;
 return query select * from private.apply_github_installation_lifecycle(p_github_installation_id,p_account_id,p_account_login,
  p_account_type,p_action,p_github_updated_at,p_installed_at,p_suspended_at);
end;
$$;

alter function public.accept_github_delivery(uuid,text,jsonb,text,bigint) set schema private;
revoke all on function private.accept_github_delivery(uuid,text,jsonb,text,bigint) from public,anon,authenticated,service_role;
create function public.accept_github_delivery(p_github_delivery_id uuid,p_event_name text,p_payload jsonb,
 p_action text default null,p_github_installation_id bigint default null)
returns table(delivery_id uuid,duplicate boolean,delivery_status text)
language plpgsql security definer set search_path='' as $$
declare account_id text;
begin
 account_id:=coalesce(p_payload->'installation'->'account'->>'id',p_payload->'organization'->>'id',p_payload->'repository'->'owner'->>'id');
 if account_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('deletion-account:'||account_id,0));
  if exists(select 1 from private.deleted_accounts a where a.github_account_id::text=account_id
   and not exists(select 1 from public.github_installations i where i.github_installation_id=p_github_installation_id and i.installed_at>a.deleted_at)
   and (p_payload->'installation'->>'created_at' is null or (p_payload->'installation'->>'created_at')::timestamptz<=a.deleted_at)) then
   return query select p_github_delivery_id,false,'ignored'::text; return;
  end if;
 end if;
 if p_github_installation_id is not null then
  perform pg_advisory_xact_lock(hashtextextended('deletion-installation:'||p_github_installation_id,0));
  if exists(select 1 from private.deleted_installations where github_installation_id=p_github_installation_id) then
   -- Acknowledge without persisting the payload or creating work.
   return query select p_github_delivery_id,false,'ignored'::text; return;
  end if;
 end if;
 return query select * from private.accept_github_delivery(p_github_delivery_id,p_event_name,p_payload,p_action,p_github_installation_id);
end;
$$;

-- Concierge support invokes only after verifying the requesting org administrator.
-- Both the UUID and GitHub account ID must match; no browser mutation grant.
create function public.delete_organization_data(p_organization_id uuid,p_confirm_github_account_id bigint,p_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org public.organizations; installation_ids bigint[]; job_ids uuid[]; user_ids uuid[]; inst bigint;
begin
 if p_reason is null or p_reason not in ('uninstalled','verified_request') then
  raise exception 'invalid deletion reason' using errcode='22023'; end if;
 perform pg_advisory_xact_lock(hashtextextended('deletion-account:'||p_confirm_github_account_id,0));
 select * into org from public.organizations where id=p_organization_id;
 if org.id is null then
  return jsonb_build_object('deleted',exists(select 1 from private.deletion_audit where organization_id=p_organization_id));
 end if;
 if org.github_account_id is distinct from p_confirm_github_account_id then
  raise exception 'deletion confirmation mismatch' using errcode='22023'; end if;
 select array_agg(github_installation_id order by github_installation_id) into installation_ids
  from (
   select github_installation_id from public.github_installations where organization_id=org.id
   union select github_installation_id from public.webhook_deliveries where github_installation_id is not null
    and coalesce(payload->'installation'->'account'->>'id',payload->'organization'->>'id',payload->'repository'->'owner'->>'id')=org.github_account_id::text
  ) installations;
 foreach inst in array coalesce(installation_ids,'{}'::bigint[]) loop
  perform pg_advisory_xact_lock(hashtextextended('deletion-installation:'||inst,0));
 end loop;
 select * into org from public.organizations where id=p_organization_id for update;
 if p_reason='uninstalled' and (org.status<>'deleted' or exists(select 1 from public.github_installations where organization_id=org.id and status<>'deleted')) then
  raise exception 'organization still installed' using errcode='22023'; end if;
 insert into private.deleted_accounts values(org.github_account_id,now())
  on conflict(github_account_id) do update set deleted_at=excluded.deleted_at;
 insert into private.deleted_installations select unnest(installation_ids),now() on conflict do nothing;
 select array_agg(id) into user_ids from public.github_users u where
  exists(select 1 from public.participants where organization_id=org.id and github_user_id=u.id)
  or exists(select 1 from public.organization_memberships where organization_id=org.id and github_user_id=u.id);
 select array_agg(id) into job_ids from public.background_jobs j where organization_id=org.id
  or exists(select 1 from public.webhook_deliveries d where d.github_installation_id=any(installation_ids) and (d.background_job_id=j.id or j.payload->>'delivery_id'=d.id::text))
  or j.payload->>'github_installation_id'=any(select x::text from unnest(installation_ids) x);
 -- Queue and archive contain job IDs only, but remove them as well as their ledgers.
 delete from pgmq.q_pull_prix_jobs where message->>'job_id'=any(select x::text from unnest(job_ids) x);
 delete from pgmq.a_pull_prix_jobs where message->>'job_id'=any(select x::text from unnest(job_ids) x);
 delete from public.webhook_deliveries where github_installation_id=any(installation_ids);
 delete from public.repository_backfills where organization_id=org.id;
 delete from public.background_jobs where id=any(job_ids);
 delete from public.score_components where organization_id=org.id;
 -- Cascades remove repositories, PRs, reviews, scoring, backfills, memberships and archives.
 delete from public.organizations where id=org.id;
 -- Shared identities belong to other teams/sign-in independently; delete only unshared roster identities.
 delete from public.github_users u where u.id=any(user_ids)
  and not exists(select 1 from public.participants where github_user_id=u.id)
  and not exists(select 1 from public.organization_memberships where github_user_id=u.id)
  and not exists(select 1 from public.pull_requests where author_github_user_id=u.github_user_id)
  and not exists(select 1 from public.review_contributions where actor_github_user_id=u.github_user_id)
  and not exists(select 1 from auth.identities where provider='github' and provider_id=u.github_user_id::text);
 insert into private.deletion_audit(organization_id,reason) values(org.id,p_reason) on conflict do nothing;
 return jsonb_build_object('deleted',true);
end;
$$;

create function public.process_data_deletions() returns integer
language plpgsql security definer set search_path='' as $$
declare org record; total integer:=0;
begin
 for org in select id,github_account_id from public.organizations where status='deleted' order by updated_at limit 5 loop
  perform public.delete_organization_data(org.id,org.github_account_id,'uninstalled'); total:=total+1;
 end loop;
 return total;
end;
$$;
revoke all on function public.apply_github_installation_lifecycle(bigint,bigint,text,text,text,timestamptz,timestamptz,timestamptz),
 public.accept_github_delivery(uuid,text,jsonb,text,bigint),public.delete_organization_data(uuid,bigint,text),public.process_data_deletions() from public,anon,authenticated;
grant execute on function public.apply_github_installation_lifecycle(bigint,bigint,text,text,text,timestamptz,timestamptz,timestamptz),
 public.accept_github_delivery(uuid,text,jsonb,text,bigint),public.delete_organization_data(uuid,bigint,text),public.process_data_deletions() to service_role;
