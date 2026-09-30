-- One durable cursor per repository, using the existing queue and canonical RPCs.
create table public.repository_backfills (
  repository_id uuid primary key references public.repositories(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  run_id uuid not null default gen_random_uuid(),
  status text not null default 'queued' check (status in ('queued','running','completed','failed','cancelled')),
  since_at timestamptz not null default now() - interval '60 days',
  cursor jsonb not null default '{"phase":"pulls","pull_page":1,"page":1,"index":0,"pulls":[],"has_more_pulls":false}',
  cursor_version integer not null default 0,
  pages_completed integer not null default 0,
  last_job_id uuid references public.background_jobs(id),
  last_error text,
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (repository_id,organization_id) references public.repositories(id,organization_id)
);
alter table public.repository_backfills enable row level security;
revoke all on public.repository_backfills from anon, authenticated;
grant select on public.repository_backfills to authenticated;
create policy "Members can read backfill progress" on public.repository_backfills
  for select to authenticated using ((select private.is_organization_member(organization_id)));

create function public.start_installation_backfills(p_github_installation_id bigint)
returns integer language plpgsql security definer set search_path = '' as $$
declare repo public.repositories; progress public.repository_backfills; job public.background_jobs; count_started integer := 0;
begin
  for repo in select r.* from public.repositories r
    join public.github_installations i on i.id=r.installation_id and i.status='active'
    join public.organizations o on o.id=r.organization_id and o.status='active'
    where i.github_installation_id=p_github_installation_id and r.active
  loop
    insert into public.repository_backfills(repository_id,organization_id)
    values(repo.id,repo.organization_id) on conflict do nothing;
    select * into progress from public.repository_backfills where repository_id=repo.id for update;
    if progress.status='cancelled' then
      update public.repository_backfills set run_id=gen_random_uuid(),last_job_id=null,status='queued',last_error=null
      where repository_id=repo.id returning * into progress;
    end if;
    if progress.status='failed' and progress.last_job_id is not null then
      perform public.replay_background_job(progress.last_job_id);
      update public.repository_backfills set status='queued',last_error=null,updated_at=now() where repository_id=repo.id;
      count_started := count_started + 1;
    elsif progress.last_job_id is null then
      select * into job from public.enqueue_background_job('backfill.repository-page',
        'backfill:'||progress.run_id||':'||progress.cursor_version,
        jsonb_build_object('repository_id',repo.id,'run_id',progress.run_id,'version',progress.cursor_version),repo.organization_id);
      update public.repository_backfills set last_job_id=job.id where repository_id=repo.id;
      count_started := count_started + 1;
    end if;
  end loop;
  return count_started;
end;
$$;

create function public.get_repository_backfill(p_repository_id uuid, p_run_id uuid, p_version integer)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare progress public.repository_backfills; repo public.repositories; installation public.github_installations;
begin
  select * into progress from public.repository_backfills where repository_id=p_repository_id;
  if progress.run_id is distinct from p_run_id or progress.cursor_version <> p_version
    or progress.status in ('completed','cancelled') then return null; end if;
  select * into repo from public.repositories where id=p_repository_id;
  select * into installation from public.github_installations where id=repo.installation_id;
  if not repo.active or installation.status <> 'active'
    or not exists(select 1 from public.organizations where id=repo.organization_id and status='active') then
    update public.repository_backfills set status='cancelled',updated_at=now() where repository_id=p_repository_id;
    return null;
  end if;
  return jsonb_build_object('repository_id',repo.id,'github_repository_id',repo.github_repository_id,
    'github_installation_id',installation.github_installation_id,'owner',repo.owner,'name',repo.name,
    'run_id',progress.run_id,'version',progress.cursor_version,'cursor',progress.cursor,'since_at',progress.since_at);
end;
$$;

alter table public.review_contributions drop constraint review_contributions_source_shape_check;
alter table public.review_contributions add constraint review_contributions_source_shape_check check (
  (source_type='review' and action='formal_review' and review_state in ('approved','changes_requested','commented','dismissed'))
  or (source_type='review_comment' and action='inline_comment' and review_state is null)
);

-- A dismissed REST snapshot is also terminal, even if its older submitted
-- webhook arrives later. Preserve the observation without inventing a date.
create or replace function private.preserve_review_dismissal()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.source_type='review' and not old.effective
    and (old.metadata_json ? 'dismissal' or old.metadata_json ? 'dismissal_observed_at') then
    if new.effective then
      new.effective := false;
      new.superseded_at := old.superseded_at;
    end if;
    if old.metadata_json ? 'dismissal' and not new.metadata_json ? 'dismissal' then
      new.metadata_json := new.metadata_json || jsonb_build_object('dismissal',old.metadata_json->'dismissal');
    end if;
    if old.metadata_json ? 'dismissal_observed_at' then
      new.metadata_json := new.metadata_json || jsonb_build_object('dismissal_observed_at',old.metadata_json->'dismissal_observed_at');
    end if;
  end if;
  return new;
end;
$$;

create function public.commit_repository_backfill_page(
  p_repository_id uuid, p_run_id uuid, p_version integer,
  p_items jsonb, p_next_cursor jsonb, p_observed_at timestamptz
)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  progress public.repository_backfills; repo public.repositories; installation public.github_installations;
  item jsonb; fact jsonb; pr public.pull_requests; existing public.review_contributions;
  job public.background_jobs; next_version integer;
begin
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>20
    or p_observed_at is null or (p_next_cursor is not null and jsonb_typeof(p_next_cursor)<>'object') then
    raise exception 'invalid backfill page' using errcode='22023';
  end if;
  select * into progress from public.repository_backfills where repository_id=p_repository_id for update;
  if progress.run_id is distinct from p_run_id or progress.cursor_version <> p_version
    or progress.status in ('completed','cancelled') then return false; end if;
  -- Recheck authorization at commit, not only before the GitHub request.
  if public.get_repository_backfill(p_repository_id,p_run_id,p_version) is null then return false; end if;
  select * into strict repo from public.repositories where id=p_repository_id;
  select * into strict installation from public.github_installations where id=repo.installation_id;

  for item in select value from jsonb_array_elements(p_items) loop
    fact := item->'fact';
    if item->>'kind'='pull' then
      perform public.apply_github_pull_request_lifecycle(installation.github_installation_id,
        repo.github_repository_id,'edited',fact);
      if (item->'user'->>'id')::bigint is distinct from (fact->>'author_github_user_id')::bigint then
        raise exception 'backfill author identity mismatch';
      end if;
      perform private.resolve_activity_participant(repo.organization_id,item->'user',
        (fact->>'created_at')::timestamptz,p_observed_at);
    else
      select * into pr from public.pull_requests where repository_id=repo.id
        and github_pull_request_id=(item->>'pull_id')::bigint;
      if pr.id is null then raise exception 'backfill pull request missing'; end if;
      if item->>'kind'='review' then
        if (item->'user'->>'id')::bigint is distinct from (fact->>'actor_github_user_id')::bigint then
          raise exception 'backfill reviewer identity mismatch';
        end if;
        select * into existing from public.review_contributions
        where source_type='review' and source_github_id=(fact->>'source_github_id')::bigint for update;
        if existing.id is not null and (existing.pull_request_id<>pr.id or
          existing.actor_github_user_id<>(fact->>'actor_github_user_id')::bigint) then
          raise exception 'backfill review identity conflict';
        end if;
        if fact->>'review_state'='dismissed' then
          -- REST lacks the original outcome and dismissal actor/time. Record
          -- the actual snapshot state, never invent an approval or dismissor.
          insert into public.review_contributions(organization_id,installation_id,repository_id,pull_request_id,
            source_type,source_github_id,source_version,actor_github_user_id,action,review_state,
            body_present,occurred_at,effective,metadata_json)
          values(repo.organization_id,repo.installation_id,repo.id,pr.id,'review',
            (fact->>'source_github_id')::bigint,fact->>'source_version',(fact->>'actor_github_user_id')::bigint,
            'formal_review','dismissed',(fact->>'body_present')::boolean,(fact->>'occurred_at')::timestamptz,false,
            jsonb_build_object('html_url',fact->>'html_url','commit_id',fact->>'commit_id',
              'author_association',fact->>'author_association','dismissal_observed_at',p_observed_at))
          on conflict(source_type,source_github_id) do update set effective=false,
            metadata_json=review_contributions.metadata_json||jsonb_build_object('dismissal_observed_at',p_observed_at);
          update public.pull_requests set scoring_recalculation_requested_at=now() where id=pr.id;
        elsif existing.id is null then
          -- Never overwrite a webhook's newer review/edit with a fetched snapshot.
          perform public.apply_github_review_contribution(installation.github_installation_id,
            repo.github_repository_id,pr.github_pull_request_id,fact);
        end if;
        perform private.resolve_activity_participant(repo.organization_id,item->'user',
          (fact->>'occurred_at')::timestamptz,p_observed_at);
      elsif item->>'kind'='comment' then
        perform public.apply_github_review_comment(installation.github_installation_id,
          repo.github_repository_id,pr.github_pull_request_id,'created',fact);
      else raise exception 'invalid backfill item kind'; end if;
    end if;
  end loop;

  next_version := p_version+1;
  if p_next_cursor is not null then
    select * into job from public.enqueue_background_job('backfill.repository-page',
      'backfill:'||p_run_id||':'||next_version,
      jsonb_build_object('repository_id',repo.id,'run_id',p_run_id,'version',next_version),repo.organization_id);
  end if;
  update public.repository_backfills set cursor=coalesce(p_next_cursor,cursor),cursor_version=next_version,
    pages_completed=pages_completed+1,status=case when p_next_cursor is null then 'completed' else 'running' end,
    last_job_id=coalesce(job.id,last_job_id),last_error=null,updated_at=now(),
    completed_at=case when p_next_cursor is null then now() else null end
  where repository_id=repo.id;
  return true;
end;
$$;

create function private.sync_backfill_job_status()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.job_type='backfill.repository-page' then
    update public.repository_backfills set
      status=case when new.status='failed' then 'failed' else 'running' end,
      last_error=new.last_error,updated_at=now()
    where last_job_id=new.id and status not in ('completed','cancelled');
  end if;
  return new;
end;
$$;
create trigger background_jobs_sync_backfill after update of status on public.background_jobs
for each row execute function private.sync_backfill_job_status();

revoke all on function public.start_installation_backfills(bigint) from public;
revoke all on function public.get_repository_backfill(uuid,uuid,integer) from public;
revoke all on function public.commit_repository_backfill_page(uuid,uuid,integer,jsonb,jsonb,timestamptz) from public;
revoke all on function private.sync_backfill_job_status() from public;
grant execute on function public.start_installation_backfills(bigint) to service_role;
grant execute on function public.get_repository_backfill(uuid,uuid,integer) to service_role;
grant execute on function public.commit_repository_backfill_page(uuid,uuid,integer,jsonb,jsonb,timestamptz) to service_role;
