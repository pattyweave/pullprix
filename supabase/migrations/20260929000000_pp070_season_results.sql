-- Calendar transitions use database UTC time; finalization is independently retryable.
create table public.season_results (
 organization_id uuid not null references public.organizations(id) on delete cascade,
 season_id text not null check(season_id ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
 starts_at timestamptz not null, ends_at timestamptz not null,
 status text not null default 'finalizing' check(status in ('finalizing','completed')),
 definition jsonb not null, standings_input jsonb, snapshot jsonb,
 completed_at timestamptz,
 primary key(organization_id,season_id),
 check(ends_at>starts_at),
 check((status='completed')=(snapshot is not null and standings_input is not null and completed_at is not null))
);
alter table public.season_results enable row level security;
revoke all on public.season_results from anon,authenticated;

create function private.season_start(p_month date) returns timestamptz
language sql immutable set search_path='' as $$
 select (date_trunc('month',p_month)::date + ((8-extract(isodow from date_trunc('month',p_month))::integer)%7) + time '12:00') at time zone 'UTC';
$$;
create function private.protect_completed_season() returns trigger language plpgsql set search_path='' as $$
begin
 if old.status='completed' then raise exception 'completed season is immutable' using errcode='55000'; end if;
 if new.definition is distinct from old.definition or new.starts_at<>old.starts_at or new.ends_at<>old.ends_at then
   raise exception 'season definition is immutable' using errcode='55000'; end if;
 return new;
end;
$$;
create trigger protect_completed_season before update on public.season_results
 for each row execute function private.protect_completed_season();

-- One row per ended team season. ON CONFLICT makes repeated or missed ticks safe.
-- Current season activation remains a pure occurrence-time calendar calculation,
-- so archival failures can never delay the next season.
create function public.prepare_season_results() returns integer
language plpgsql security definer set search_path='' as $$
declare inserted integer;
begin
 insert into public.season_results(organization_id,season_id,starts_at,ends_at,definition)
 select o.id,to_char(month,'YYYY-MM'),private.season_start(month::date),private.season_start((month+interval '1 month')::date),
   jsonb_build_object('definitionVersion',1,'name','Pull Prix Championship','themePack',jsonb_build_object('id','racing','version','1.0.0'),
    'scoringPolicyVersion','v1','progressPolicy',null)
 from public.organizations o
 cross join lateral (select min(installed_at) as entered from public.github_installations where organization_id=o.id) entry
 cross join lateral generate_series(date_trunc('month',entry.entered at time zone 'UTC')-interval '1 month',
   date_trunc('month',now() at time zone 'UTC'),interval '1 month') month
 where o.status='active' and private.season_start((month+interval '1 month')::date)<=now()
   and private.season_start((month+interval '1 month')::date)>entry.entered
 on conflict do nothing;
 get diagnostics inserted=row_count;
 return inserted;
end;
$$;

-- Readiness never fabricates completeness. A failed/unfinished repair or relevant
-- pending PR holds this team's old result open while current scoring continues.
create function private.season_result_ready(p_org uuid,p_start timestamptz,p_end timestamptz)
returns boolean language sql stable security definer set search_path='' as $$
 select now()>=p_end+interval '24 hours'
 and exists(select 1 from public.organizations where id=p_org and status='active')
 and not exists(select 1 from public.repositories r join public.github_installations i on i.id=r.installation_id
   left join public.repository_backfills b on b.repository_id=r.id
   where r.organization_id=p_org and r.active and i.status='active'
     and (b.repository_id is null or b.status<>'completed' or b.completed_at is null or b.completed_at<p_end))
 and not exists(select 1 from public.background_jobs j where j.organization_id=p_org
   and j.job_type in ('github.delivery','github.reconcile-installation','backfill.repository-page')
   and j.status in ('queued','processing','retrying','failed'))
 and not exists(select 1 from public.pull_request_scoring s join public.pull_requests pr on pr.id=s.pull_request_id
   where pr.organization_id=p_org and (s.status='pending' or s.revision<>s.computed_revision)
   and (exists(select 1 from public.review_contributions c where c.pull_request_id=pr.id
       and c.source_type='review' and c.occurred_at>=p_start and c.occurred_at<p_end)
     or exists(select 1 from public.score_components c where c.pull_request_id=pr.id
       and c.season_id=to_char(p_start at time zone 'UTC','YYYY-MM'))));
$$;

create function public.get_season_finalization_inputs() returns jsonb
language plpgsql security definer set search_path='' as $$
declare r public.season_results; inst record; input jsonb; result jsonb:='[]';
begin
 perform public.prepare_season_results();
 -- Request post-boundary reconciliation through the existing repair machinery.
 for inst in select distinct i.github_installation_id from public.season_results s
   join public.github_installations i on i.organization_id=s.organization_id and i.status='active'
   join public.repositories repo on repo.installation_id=i.id and repo.active
   left join public.repository_backfills b on b.repository_id=repo.id
   where s.status='finalizing' and (b.repository_id is null or (b.status='completed' and b.completed_at<s.ends_at))
   limit 10
 loop
   perform public.start_repository_reconciliation(inst.github_installation_id,true);
 end loop;
 for r in select * from public.season_results where status='finalizing'
   and private.season_result_ready(organization_id,starts_at,ends_at)
   order by ends_at,organization_id limit 2
 loop
   if (select count(*) from (select 1 from public.participants where organization_id=r.organization_id limit 1001) x)>1000
     or (select count(*) from (select 1 from public.score_components where organization_id=r.organization_id
       and season_id=r.season_id and status='effective' limit 20001) x)>20000 then continue; end if;
   input:=public.get_organization_standings_input(r.organization_id,r.season_id);
   -- Readiness above is season scoped. New-season pending work does not block it.
   input:=jsonb_set(input,'{pendingPullRequests}','0');
   result:=result||jsonb_build_array(jsonb_build_object('organizationId',r.organization_id,'seasonId',r.season_id,
     'startsAt',r.starts_at,'endsAt',r.ends_at,'definition',r.definition,'input',input,'revision',md5(input::text)));
 end loop;
 return result;
end;
$$;

create function public.commit_season_result(p_organization_id uuid,p_season_id text,p_revision text,p_snapshot jsonb)
returns boolean language plpgsql security definer set search_path='' as $$
declare r public.season_results; input jsonb;
begin
 select * into r from public.season_results where organization_id=p_organization_id and season_id=p_season_id for update;
 if r.organization_id is null then return false; end if;
 if r.status='completed' then return true; end if;
 if not private.season_result_ready(r.organization_id,r.starts_at,r.ends_at) then return false; end if;
 input:=jsonb_set(public.get_organization_standings_input(r.organization_id,r.season_id),'{pendingPullRequests}','0');
 if md5(input::text) is distinct from p_revision then return false; end if;
 if p_snapshot->>'organizationId' is distinct from r.organization_id::text
   or p_snapshot->>'seasonId' is distinct from r.season_id or p_snapshot->>'status' is distinct from 'completed'
   or p_snapshot->>'contractVersion' is distinct from '1' or jsonb_typeof(p_snapshot->'participants') is distinct from 'array'
   or p_snapshot->'definition' is distinct from r.definition then raise exception 'invalid archive scope' using errcode='22023'; end if;
 update public.season_results set status='completed',snapshot=p_snapshot,standings_input=input,completed_at=now()
   where organization_id=r.organization_id and season_id=r.season_id;
 return true;
end;
$$;

create function public.get_season_history(p_installation_id bigint,p_season_id text default null,p_offset integer default 0,p_limit integer default 20)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare org uuid; result jsonb; total integer;
begin
 if not private.has_live_session() then raise exception 'sign_in_again' using errcode='PT401'; end if;
 select organization_id into org from public.github_installations where github_installation_id=p_installation_id and status='active';
 if org is null or not private.is_organization_member(org) then raise exception 'access_denied' using errcode='PT403'; end if;
 if p_offset is null or p_offset<0 or p_offset>20000 or p_limit is null or p_limit<1 or p_limit>100
   or (p_season_id is not null and p_season_id !~ '^[0-9]{4}-(0[1-9]|1[0-2])$') then raise exception 'invalid_request' using errcode='PT400'; end if;
 if p_season_id is not null then
   select jsonb_build_object('contractVersion','1','organizationId',org,'seasonId',season_id,'status',status,
     'completedAt',completed_at,'snapshot',snapshot) into result
   from public.season_results where organization_id=org and season_id=p_season_id;
   if result is null then raise exception 'season_not_found' using errcode='PT404'; end if;
   return result;
 end if;
 select count(*) into total from public.season_results where organization_id=org;
 select jsonb_build_object('contractVersion','1','organizationId',org,'total',total,
   'nextOffset',case when p_offset+p_limit<total then p_offset+p_limit else null end,
   'items',coalesce(jsonb_agg(item order by item->>'seasonId' desc),'[]')) into result from (
     select jsonb_build_object('seasonId',season_id,'startsAt',starts_at,'endsAt',ends_at,'status',status,'completedAt',completed_at) item
     from public.season_results where organization_id=org order by season_id desc offset p_offset limit p_limit) paged;
 return result;
end;
$$;
revoke all on function private.season_start(date),private.protect_completed_season(),private.season_result_ready(uuid,timestamptz,timestamptz) from public;
revoke all on function public.prepare_season_results(),public.get_season_finalization_inputs(),public.commit_season_result(uuid,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.prepare_season_results(),public.get_season_finalization_inputs(),public.commit_season_result(uuid,text,text,jsonb) to service_role;
revoke all on function public.get_season_history(bigint,text,integer,integer) from public,anon,service_role;
grant execute on function public.get_season_history(bigint,text,integer,integer) to authenticated;
