-- Only supplies server-side queue context. Repo access is checked separately at GitHub.
create or replace function public.get_review_queue_context(p_installation_id bigint)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare target_org uuid; subject jsonb; repos jsonb; repo_count integer;
begin
 if not private.has_live_session() then raise exception 'sign_in_again' using errcode='PT401'; end if;
 select organization_id into target_org from public.github_installations
 where github_installation_id=p_installation_id and status='active';
 if target_org is null or not private.is_organization_member(target_org) then
   raise exception 'access_denied' using errcode='PT403'; end if;
 -- Keep this STABLE RPC read-only: the setup helper also writes identity rows.
 select jsonb_build_object('githubUserId',provider_id::bigint,'login',identity_data->>'user_name') into subject
 from auth.identities where user_id=auth.uid() and provider='github' and provider_id ~ '^[1-9][0-9]*$';
 if subject is null then raise exception 'sign_in_again' using errcode='PT401'; end if;
 select count(*) into repo_count from public.repositories r join public.github_installations i on i.id=r.installation_id
 where r.organization_id=target_org and r.active and i.github_installation_id=p_installation_id and i.status='active';
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',full_name,'githubId',github_repository_id) order by full_name),'[]'::jsonb)
 into repos from (select r.id,r.full_name,r.github_repository_id from public.repositories r
 join public.github_installations i on i.id=r.installation_id
 where r.organization_id=target_org and r.active and i.github_installation_id=p_installation_id and i.status='active'
 order by r.full_name limit 10) selected;
 return jsonb_build_object('organizationId',target_org,'subject',subject,'repositories',repos,'truncated',repo_count>10);
end;
$$;
revoke all on function public.get_review_queue_context(bigint) from public,anon,service_role;
grant execute on function public.get_review_queue_context(bigint) to authenticated;
