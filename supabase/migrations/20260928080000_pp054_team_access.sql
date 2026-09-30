-- Role and proof are assigned by the verified server, never browser input.
alter table public.organization_memberships
 add column access_role text not null default 'spectator' check(access_role in ('administrator','participant','spectator')),
 add column verification_repository_id uuid references public.repositories(id) on delete cascade;

create or replace function private.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_live_session() and exists(
   select 1 from public.organization_memberships m join public.organizations o on o.id=m.organization_id
   where m.organization_id=target_organization_id and m.auth_user_id=auth.uid() and m.active and o.status='active'
   and (m.installation_verified_id is null or (m.installation_verified_until>now() and exists(
     select 1 from public.github_installations i where i.id=m.installation_verified_id
       and i.organization_id=m.organization_id and i.status='active')))
   and (m.verification_repository_id is null or exists(select 1 from public.repositories r
     where r.id=m.verification_repository_id and r.organization_id=m.organization_id
       and r.installation_id=m.installation_verified_id and r.active)));
$$;

create function public.complete_team_access(p_user_id uuid,p_session_id uuid,p_installation_id bigint,
 p_account_id bigint,p_retry boolean,p_is_admin boolean,p_repository_id bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb; target_org uuid; proof_repository uuid; participant boolean; assigned_role text;
begin
 if p_is_admin is null or (p_is_admin and p_repository_id is not null) then
   raise exception 'invalid access proof' using errcode='42501'; end if;
 -- Local repository removal takes effect even before the five-minute lease ends.
 if p_repository_id is not null then
   select r.id into proof_repository from public.repositories r
   join public.github_installations i on i.id=r.installation_id
   where i.github_installation_id=p_installation_id and i.account_id=p_account_id
     and i.status='active' and r.active and r.github_repository_id=p_repository_id for share of r;
   if proof_repository is null then raise exception 'repository access unavailable' using errcode='42501'; end if;
 end if;
 -- Reuse live session, account, local revocation and idempotent setup checks.
 result := public.complete_installation_setup(p_user_id,p_session_id,p_installation_id,p_account_id,false);
 if result->>'status'<>'ready' then return result; end if;
 target_org := (result->'organization'->>'id')::uuid;
 select exists(select 1 from public.participants p join public.github_users u on u.id=p.github_user_id
   join auth.identities a on a.provider='github' and a.provider_id=u.github_user_id::text and a.user_id=p_user_id
   where p.organization_id=target_org and p.eligible and p.active
     and (p.left_at is null or p.left_at>now()) and private.github_user_exclusion(u) is null) into participant;
 assigned_role := case when p_is_admin then 'administrator' when participant then 'participant' else 'spectator' end;
 update public.organization_memberships set access_role=assigned_role,verification_repository_id=proof_repository
 where organization_id=target_org and auth_user_id=p_user_id;
 if p_retry and not p_is_admin then
   -- Persist the role downgrade, but do not start/retry any job.
   return jsonb_build_object('status','forbidden','error','administrator_required');
 end if;
 if p_retry then
   perform public.start_installation_backfills(p_installation_id);
   result := public.complete_installation_setup(p_user_id,p_session_id,p_installation_id,p_account_id,false);
 end if;
 return result || jsonb_build_object('role',assigned_role,'canManage',p_is_admin,'isParticipant',participant);
end;
$$;
revoke all on function public.complete_team_access(uuid,uuid,bigint,bigint,boolean,boolean,bigint) from public,anon,authenticated;
grant execute on function public.complete_team_access(uuid,uuid,bigint,bigint,boolean,boolean,bigint) to service_role;
-- The old core is now an implementation detail; clients and service HTTP callers
-- must use the role-aware entry point. Its owner can invoke it from that function.
revoke all on function public.complete_installation_setup(uuid,uuid,bigint,bigint,boolean) from service_role;
