-- Expose the existing activity-derived roster only after PP-051 live authorization.
-- No membership creation from roster activity and no new roster mutation path.
create or replace function public.complete_installation_setup(p_user_id uuid,p_session_id uuid,
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
   'roster',coalesce((select jsonb_agg(jsonb_build_object(
     'id',p.id,'githubUserId',u.github_user_id,'login',u.login,
     'displayName',coalesce(nullif(btrim(p.display_name),''),u.login),
     'avatarUrl',case when u.avatar_url ~ '^https://avatars[.]githubusercontent[.]com/' then u.avatar_url else null end,
     'active',p.active and (p.left_at is null or p.left_at>now()),'joinedAt',p.joined_at)
     order by lower(coalesce(nullif(btrim(p.display_name),''),u.login)),p.id)
     from public.participants p join public.github_users u on u.id=p.github_user_id
     where p.organization_id=organization.id and p.eligible
       and private.github_user_exclusion(u) is null),'[]'::jsonb),
   'repositories',coalesce((select jsonb_agg(jsonb_build_object('name',r.full_name,
      'status',coalesce(b.status,'waiting'),'pagesCompleted',coalesce(b.pages_completed,0)) order by r.full_name)
     from public.repositories r left join public.repository_backfills b on b.repository_id=r.id
     where r.installation_id=installation.id and r.active),'[]'::jsonb));
end;
$$;
revoke all on function public.complete_installation_setup(uuid,uuid,bigint,bigint,boolean) from public,anon,authenticated;
grant execute on function public.complete_installation_setup(uuid,uuid,bigint,bigint,boolean) to service_role;
