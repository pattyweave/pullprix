-- Remember previously connected teams independently of the five-minute data
-- access lease. This directory exposes only names and entry links. Opening a
-- dashboard still verifies GitHub access; private.is_organization_member and
-- all data RLS rules are unchanged. Local revocations and disabled installations
-- or collaborator repositories still remove directory entries immediately.
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
     from public.organizations o where o.status='active' and exists (
       select 1 from public.organization_memberships m
       where m.organization_id=o.id and m.auth_user_id=auth.uid() and m.active
         and (m.installation_verified_id is null or exists (
           select 1 from public.github_installations i where i.id=m.installation_verified_id
             and i.organization_id=o.id and i.status='active'))
         and (m.verification_repository_id is null or exists (
           select 1 from public.repositories r where r.id=m.verification_repository_id
             and r.organization_id=o.id and r.installation_id=m.installation_verified_id and r.active))
     )),'[]'::jsonb)) into result;
 return result;
end;
$$;
revoke all on function public.get_signed_in_access() from public,anon;
grant execute on function public.get_signed_in_access() to authenticated;
