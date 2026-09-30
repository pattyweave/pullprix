-- Session liveness makes revoked browser tokens fail even before JWT expiry.
create function private.has_live_session() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from auth.sessions s where s.user_id=auth.uid()
    and s.id::text=auth.jwt()->>'session_id' and (s.not_after is null or s.not_after>now()));
$$;
revoke all on function private.has_live_session() from public;
grant execute on function private.has_live_session() to authenticated;
create or replace function private.is_organization_member(target_organization_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select private.has_live_session() and exists(select 1 from public.organization_memberships m
   join public.organizations o on o.id=m.organization_id where m.organization_id=target_organization_id
   and m.auth_user_id=auth.uid() and m.active and o.status='active');
$$;
create or replace function private.can_access_github_user(target_github_user_id uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.participants p where p.github_user_id=target_github_user_id
   and private.is_organization_member(p.organization_id));
$$;
drop policy "Members can read their own membership" on public.organization_memberships;
create policy "Members can read their own membership" on public.organization_memberships for select to authenticated
using(auth_user_id=auth.uid() and private.has_live_session());

-- Provider identity is Auth-controlled. Never map by email or mutable user_metadata.
create function public.get_signed_in_access() returns jsonb language plpgsql security definer set search_path='' as $$
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
   'organizations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'slug',o.slug) order by o.slug)
     from public.organizations o where private.is_organization_member(o.id)),'[]'::jsonb)) into result;
 return result;
end;
$$;
revoke all on function public.get_signed_in_access() from public,anon;
grant execute on function public.get_signed_in_access() to authenticated;
