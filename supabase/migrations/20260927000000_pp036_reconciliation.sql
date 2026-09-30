-- Daily repair reuses the queue and per-repository backfill cursor.
alter table public.repository_backfills add column run_kind text not null default 'initial'
  check (run_kind in ('initial','reconciliation'));

create function public.start_repository_reconciliation(p_github_installation_id bigint, p_force boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare progress public.repository_backfills; queued integer;
begin
  for progress in select b.* from public.repository_backfills b
    join public.repositories r on r.id=b.repository_id
    join public.github_installations i on i.id=r.installation_id
    join public.organizations o on o.id=r.organization_id
    where i.github_installation_id=p_github_installation_id and i.status='active'
      and o.status='active' and r.active and b.status='completed'
      and (p_force or b.completed_at < now()-interval '20 hours')
    for update of b
  loop
    update public.repository_backfills set run_kind='reconciliation',run_id=gen_random_uuid(),
      since_at=greatest(now()-interval '60 days',least(progress.completed_at-interval '1 day',now()-interval '7 days')),
      cursor='{"phase":"pulls","pull_page":1,"page":1,"index":0,"pulls":[],"has_more_pulls":false}',
      cursor_version=0,pages_completed=0,last_job_id=null,last_error=null,status='queued',
      started_at=now(),updated_at=now(),completed_at=null
    where repository_id=progress.repository_id;
  end loop;
  -- New repos still get their initial 60 days; failed runs resume their cursor.
  queued := public.start_installation_backfills(p_github_installation_id);
  return queued;
end;
$$;

create function public.enqueue_github_reconciliation()
returns integer language plpgsql security definer set search_path = '' as $$
declare installation public.github_installations; queued integer := 0;
begin
  for installation in select * from public.github_installations where status<>'deleted' for update loop
    if not exists(select 1 from public.background_jobs where job_type='github.reconcile-installation'
      and payload->>'github_installation_id'=installation.github_installation_id::text
      and status in ('queued','processing','retrying')) then
      perform public.enqueue_background_job('github.reconcile-installation',
        'reconcile:'||installation.github_installation_id||':'||to_char(now() at time zone 'UTC','YYYY-MM-DD'),
        jsonb_build_object('github_installation_id',installation.github_installation_id),installation.organization_id);
      queued := queued+1;
    end if;
  end loop;
  return queued;
end;
$$;

create function public.get_installation_reconciliation_revision(p_github_installation_id bigint)
returns jsonb language sql security definer set search_path = '' as $$
  select jsonb_build_object('installation',i.updated_at,'repositories',
    (select max(r.updated_at) from public.repositories r where r.installation_id=i.id))
  from public.github_installations i where i.github_installation_id=p_github_installation_id and i.status<>'deleted';
$$;

create function public.commit_installation_reconciliation(p_github_installation_id bigint,
  p_revision jsonb, p_snapshot jsonb, p_observed_at timestamptz)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare installation public.github_installations; next_status text; repo_data jsonb; removed jsonb;
  queued integer := 0; changed integer := 0;
begin
  if p_observed_at is null or p_snapshot is null or jsonb_typeof(p_snapshot)<>'object'
    or coalesce(p_snapshot->>'state','') not in ('active','suspended','deleted') then
    raise exception 'invalid installation snapshot' using errcode='22023';
  end if;
  select * into installation from public.github_installations
    where github_installation_id=p_github_installation_id for update;
  if installation.id is null or installation.status='deleted' then return '{"disposition":"stale_or_deleted"}'; end if;
  if p_revision is distinct from public.get_installation_reconciliation_revision(p_github_installation_id) then
    -- A scope webhook committed during the fetch. Retry a fresh snapshot, never
    -- infer removals from old data or overwrite the newer installation state.
    raise exception 'installation scope changed during reconciliation; retry required' using errcode='40001';
  end if;
  next_status := p_snapshot->>'state';
  if next_status<>'deleted' and (
    (p_snapshot->>'account_id')::bigint is distinct from installation.account_id
    or nullif(p_snapshot->>'account_login','') is null
    or coalesce(p_snapshot->>'account_type','') not in ('Organization','User')
    or nullif(p_snapshot->>'github_updated_at','') is null) then
    raise exception 'installation snapshot identity mismatch' using errcode='22023';
  end if;
  if next_status<>'deleted' and (p_snapshot->>'github_updated_at')::timestamptz < installation.github_updated_at then
    raise exception 'older installation snapshot; retry required' using errcode='40001';
  end if;
  -- Serialize shared organization status with lifecycle webhooks.
  perform 1 from public.organizations where id=installation.organization_id for update;
  update public.github_installations set status=next_status,
    account_login=coalesce(p_snapshot->>'account_login',account_login),
    account_type=coalesce(p_snapshot->>'account_type',account_type),
    github_updated_at=greatest(github_updated_at,(p_snapshot->>'github_updated_at')::timestamptz),
    suspended_at=case when next_status='suspended' then (p_snapshot->>'suspended_at')::timestamptz else null end,
    last_lifecycle_action=case next_status when 'deleted' then 'deleted' when 'suspended' then 'suspend' else 'unsuspend' end
  where id=installation.id;
  update public.organizations set status=(select case when bool_or(status='active') then 'active'
    when bool_or(status='suspended') then 'suspended' else 'deleted' end
    from public.github_installations where organization_id=installation.organization_id),
    name=case when next_status='deleted' then name else p_snapshot->>'account_login' end,
    slug=case when next_status='deleted' then slug else lower(p_snapshot->>'account_login') end
  where id=installation.organization_id;

  if next_status='active' then
    repo_data := p_snapshot->'repositories';
    if repo_data is null or jsonb_typeof(repo_data)<>'array'
      or coalesce(p_snapshot->>'repository_selection','') not in ('all','selected') then
      raise exception 'invalid repository snapshot' using errcode='22023';
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('github_repository_id',r.github_repository_id,
      'owner',r.owner,'name',r.name,'full_name',r.full_name,'private',r.private,'active',false)),'[]')
    into removed from public.repositories r where r.installation_id=installation.id and r.active
      and not exists(select 1 from jsonb_array_elements(repo_data) x where (x->>'github_repository_id')::bigint=r.github_repository_id);
    changed := public.apply_github_repository_changes(p_github_installation_id,p_observed_at,repo_data||removed,p_snapshot->>'repository_selection');
    queued := public.start_repository_reconciliation(p_github_installation_id);
  end if;
  return jsonb_build_object('disposition','applied','installation_status',next_status,
    'repositories_checked',changed,'repository_runs_queued',queued);
end;
$$;

-- Preserve PP-035's transaction/cursor implementation. The wrapper adds only
-- authoritative review corrections for reconciliation runs.
alter function public.commit_repository_backfill_page(uuid,uuid,integer,jsonb,jsonb,timestamptz)
  set schema private;
create function public.commit_repository_backfill_page(p_repository_id uuid,p_run_id uuid,p_version integer,
  p_items jsonb,p_next_cursor jsonb,p_observed_at timestamptz)
returns boolean language plpgsql security definer set search_path = '' as $$
declare progress public.repository_backfills; item jsonb; fact jsonb; existing public.review_contributions;
  installation_id bigint; repository_id bigint; pr_id bigint;
begin
  select * into progress from public.repository_backfills where repository_backfills.repository_id=p_repository_id for update;
  if progress.run_id is distinct from p_run_id or progress.cursor_version<>p_version
    or public.get_repository_backfill(p_repository_id,p_run_id,p_version) is null then return false; end if;
  if p_items is null or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)>20 or p_observed_at is null then
    raise exception 'invalid backfill page' using errcode='22023';
  end if;
  if progress.run_kind='reconciliation' then
    for item in select value from jsonb_array_elements(p_items) where value->>'kind'='review' loop
      fact := item->'fact';
      select * into existing from public.review_contributions
        where source_type='review' and source_github_id=(fact->>'source_github_id')::bigint for update;
      -- GitHub reviews have no edited_at. Do not overwrite a webhook received
      -- while this API page was being fetched; the next daily pass retries it.
      if existing.id is not null and existing.updated_at < p_observed_at
        and existing.source_version is distinct from fact->>'source_version'
        and fact->>'review_state'<>'dismissed' then
        if existing.repository_id<>p_repository_id then raise exception 'review snapshot repository mismatch'; end if;
        select i.github_installation_id,r.github_repository_id,p.github_pull_request_id
          into installation_id,repository_id,pr_id from public.repositories r
          join public.github_installations i on i.id=r.installation_id
          join public.pull_requests p on p.id=existing.pull_request_id where r.id=p_repository_id;
        if pr_id is distinct from (item->>'pull_id')::bigint then raise exception 'review snapshot PR mismatch'; end if;
        perform public.apply_github_review_contribution(installation_id,repository_id,pr_id,fact);
        update public.pull_requests set scoring_recalculation_requested_at=now() where id=existing.pull_request_id;
      end if;
    end loop;
  end if;
  return private.commit_repository_backfill_page(p_repository_id,p_run_id,p_version,p_items,p_next_cursor,p_observed_at);
end;
$$;

revoke all on function private.commit_repository_backfill_page(uuid,uuid,integer,jsonb,jsonb,timestamptz) from public,service_role;
revoke all on function public.start_repository_reconciliation(bigint,boolean) from public;
revoke all on function public.enqueue_github_reconciliation() from public;
revoke all on function public.get_installation_reconciliation_revision(bigint) from public;
revoke all on function public.commit_installation_reconciliation(bigint,jsonb,jsonb,timestamptz) from public;
revoke all on function public.commit_repository_backfill_page(uuid,uuid,integer,jsonb,jsonb,timestamptz) from public;
grant execute on function public.start_repository_reconciliation(bigint,boolean) to service_role;
grant execute on function public.enqueue_github_reconciliation() to service_role;
grant execute on function public.get_installation_reconciliation_revision(bigint) to service_role;
grant execute on function public.commit_installation_reconciliation(bigint,jsonb,jsonb,timestamptz) to service_role;
grant execute on function public.commit_repository_backfill_page(uuid,uuid,integer,jsonb,jsonb,timestamptz) to service_role;

select cron.schedule('pull-prix-reconcile-github','17 3 * * *','select public.enqueue_github_reconciliation();');
