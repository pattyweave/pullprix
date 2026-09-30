-- The caller's JWT is forwarded to this boundary; service credentials never
-- substitute for organization authorization. No membership is created here.
create function public.get_product_api_input(p_installation_id bigint,p_season_id text,p_health boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' set statement_timeout='10s' as $$
declare target_org uuid; standings jsonb; health jsonb;
begin
 if not private.has_live_session() then
   raise exception 'sign_in_again' using errcode='PT401';
 end if;
 select organization_id into target_org from public.github_installations
 where github_installation_id=p_installation_id and status='active';
 if target_org is null or not private.is_organization_member(target_org) then
   raise exception 'access_denied' using errcode='PT403';
 end if;
 if p_season_id is null or p_season_id !~ '^[0-9]{4}-(0[1-9]|1[0-2])$' then
   raise exception 'invalid_request' using errcode='PT400';
 end if;
 -- Explicit pilot processing bounds: never silently truncate input and publish
 -- incorrect totals. Count at most limit+1 before invoking the existing loaders.
 if (select count(*) from (select 1 from public.participants where organization_id=target_org limit 1001) s)>1000
 or (select count(*) from (select 1 from public.score_components where organization_id=target_org
     and season_id=p_season_id and status='effective' limit 20001) s)>20000 then
   raise exception 'capacity_exceeded' using errcode='PT503';
 end if;
 standings := public.get_organization_standings_input(target_org,p_season_id);
 if p_health then
   if (select count(*) from (select 1 from public.pull_requests where organization_id=target_org limit 20001) s)>20000
   or (select count(*) from (select 1 from public.score_components where organization_id=target_org
       and status='effective' limit 20001) s)>20000 then
     raise exception 'capacity_exceeded' using errcode='PT503';
   end if;
   health := public.get_organization_review_health_input(target_org);
 end if;
 return jsonb_build_object('standings',standings,'health',health);
end;
$$;
revoke all on function public.get_product_api_input(bigint,text,boolean) from public,anon,service_role;
grant execute on function public.get_product_api_input(bigint,text,boolean) to authenticated;
