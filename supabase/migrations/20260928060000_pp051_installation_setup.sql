-- Manager claims come only from a live, server-side GitHub owner/admin check.
-- Leases bound stale membership to five minutes; explicit local revocation wins.
alter table public.organization_memberships
  add column installation_verified_id uuid references public.github_installations(id),
  add column installation_verified_until timestamptz;
alter table public.organization_memberships add constraint installation_verification_pair check
 ((installation_verified_id is null) = (installation_verified_until is null));

create or replace function private.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_live_session() and exists(
   select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id
   where m.organization_id=target_organization_id and m.auth_user_id=auth.uid() and m.active and o.status='active'
   and (m.installation_verified_id is null or (m.installation_verified_until>now() and exists(
     select 1 from public.github_installations i where i.id=m.installation_verified_id
       and i.organization_id=m.organization_id and i.status='active'))));
$$;

create function public.get_installation_setup_subject() returns jsonb
language plpgsql security definer set search_path='' as $$
declare identity auth.identities;
begin
 perform public.get_signed_in_access();
 select * into strict identity from auth.identities where user_id=auth.uid() and provider='github';
 return jsonb_build_object('userId',auth.uid(),'sessionId',auth.jwt()->>'session_id',
   'githubUserId',identity.provider_id::bigint,'login',identity.identity_data->>'user_name');
end;
$$;
revoke all on function public.get_installation_setup_subject() from public,anon;
grant execute on function public.get_installation_setup_subject() to authenticated;

create function public.expire_installation_setup_access(p_user_id uuid,p_installation_id bigint)
returns boolean language plpgsql security definer set search_path='' as $$
begin
 update public.organization_memberships m set installation_verified_until=now()
 from public.github_installations i where i.id=m.installation_verified_id
   and i.github_installation_id=p_installation_id and m.auth_user_id=p_user_id;
 return true;
end;
$$;

create function public.complete_installation_setup(p_user_id uuid,p_session_id uuid,
 p_installation_id bigint,p_account_id bigint,p_retry boolean default false)
returns jsonb language plpgsql security definer set search_path='' as $$
declare installation public.github_installations; identity auth.identities; github public.github_users;
 membership public.organization_memberships; organization public.organizations;
begin
 if not exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id
   and (not_after is null or not_after>now())) then raise exception 'session is not active' using errcode='42501'; end if;
 select * into identity from auth.identities where user_id=p_user_id and provider='github';
 if identity.id is null or identity.provider_id !~ '^[1-9][0-9]*$' then raise exception 'GitHub identity required' using errcode='42501'; end if;
 select * into installation from public.github_installations where github_installation_id=p_installation_id for update;
 -- Let signed webhooks establish installation/repositories. Never manufacture them from callback parameters.
 if installation.id is null then return jsonb_build_object('status','waiting_for_webhook'); end if;
 if installation.account_id<>p_account_id or installation.status<>'active' then
   raise exception 'installation is unavailable' using errcode='42501'; end if;
 select * into strict organization from public.organizations where id=installation.organization_id;
 if organization.status<>'active' then raise exception 'organization is unavailable' using errcode='42501'; end if;
 select * into strict github from public.github_users where github_user_id=identity.provider_id::bigint;
 select * into membership from public.organization_memberships
 where organization_id=organization.id and github_user_id=github.id for update;
 if membership.id is not null and (not membership.active or
   (membership.auth_user_id is not null and membership.auth_user_id<>p_user_id)) then
   raise exception 'membership is revoked' using errcode='42501'; end if;
 insert into public.organization_memberships(organization_id,github_user_id,auth_user_id,
   installation_verified_id,installation_verified_until)
 values(organization.id,github.id,p_user_id,installation.id,now()+interval '5 minutes')
 on conflict(organization_id,github_user_id) do update set auth_user_id=excluded.auth_user_id,
   installation_verified_id=excluded.installation_verified_id,installation_verified_until=excluded.installation_verified_until;
 -- Only an explicit retry may resume failed work. Normal refresh never restarts backfill.
 if p_retry then perform public.start_installation_backfills(p_installation_id); end if;
 return jsonb_build_object('status','ready','organization',jsonb_build_object('id',organization.id,'name',organization.name,'slug',organization.slug),
   'repositories',coalesce((select jsonb_agg(jsonb_build_object('name',r.full_name,
      'status',coalesce(b.status,'waiting'),'pagesCompleted',coalesce(b.pages_completed,0)) order by r.full_name)
     from public.repositories r left join public.repository_backfills b on b.repository_id=r.id
     where r.installation_id=installation.id and r.active),'[]'::jsonb));
end;
$$;
revoke all on function public.complete_installation_setup(uuid,uuid,bigint,bigint,boolean) from public,anon,authenticated;
revoke all on function public.expire_installation_setup_access(uuid,bigint) from public,anon,authenticated;
grant execute on function public.complete_installation_setup(uuid,uuid,bigint,bigint,boolean) to service_role;
grant execute on function public.expire_installation_setup_access(uuid,bigint) to service_role;

-- Keep verified setup entry links available on the signed-in account screen.
create or replace function public.get_signed_in_access() returns jsonb language plpgsql security definer set search_path='' as $$
declare identity auth.identities; github public.github_users; result jsonb;
begin
 if not private.has_live_session() then raise exception 'session is not active' using errcode='42501'; end if;
 select * into identity from auth.identities where user_id=auth.uid() and provider='github';
 if identity.id is null or identity.provider_id !~ '^[1-9][0-9]*$' then
   raise exception 'GitHub identity required' using errcode='42501'; end if;
 insert into public.github_users(github_user_id,login,avatar_url,account_type)
 values(identity.provider_id::bigint,coalesce(nullif(identity.identity_data->>'user_name',''),identity.provider_id),
   identity.identity_data->>'avatar_url','User')
 on conflict(github_user_id) do nothing;
 select * into strict github from public.github_users where github_user_id=identity.provider_id::bigint;
 -- Only attach already-authorized memberships. Activity/roster is not authorization.
 update public.organization_memberships set auth_user_id=auth.uid()
 where github_user_id=github.id and auth_user_id is null and active;
 select jsonb_build_object('githubUserId',github.github_user_id,'login',github.login,'avatarUrl',github.avatar_url,
   'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug,'installationId',(select i.github_installation_id from public.organization_memberships m join public.github_installations i on i.id=m.installation_verified_id where m.organization_id=o.id and m.auth_user_id=auth.uid())) order by o.slug)
     from public.organizations o where private.is_organization_member(o.id)),'[]'::jsonb)) into result;
 return result;
end;
$$;
revoke all on function public.get_signed_in_access() from public,anon;
grant execute on function public.get_signed_in_access() to authenticated;
