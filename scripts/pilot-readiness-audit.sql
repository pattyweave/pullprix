-- Read-only operator audit. Run with: supabase db query --linked --file scripts/pilot-readiness-audit.sql
-- Output can contain private team metadata; keep results out of public issue trackers.
begin read only;
select jsonb_build_object(
'seasons',(select jsonb_agg(t) from (select o.slug,r.season_id,r.status,r.ends_at,r.completed_at,r.snapshot->>'totalPoints' as saved_points,private.season_result_ready(o.id,r.starts_at,r.ends_at) as ready_now from public.season_results r join public.organizations o on o.id=r.organization_id)t),
'ledger',(select jsonb_agg(t) from (select o.slug,c.season_id,sum(c.points) as effective_points from public.score_components c join public.organizations o on o.id=c.organization_id where c.status='effective' group by o.slug,c.season_id)t),
'unsettled_jobs',(select count(*) from public.background_jobs where status in ('queued','processing','retrying','failed')),
'scoring_blockers',(select jsonb_agg(t) from (
 select distinct o.slug,r.season_id,pr.number as pull_request_number,pr.state,
 s.revision,s.computed_revision,
 (select jsonb_agg(distinct d->>'reason') from jsonb_array_elements(s.decisions) d where d->>'status'='pending') as pending_reasons
 from public.season_results r join public.organizations o on o.id=r.organization_id
 join public.pull_requests pr on pr.organization_id=o.id
 join public.pull_request_scoring s on s.pull_request_id=pr.id
 where r.status='finalizing' and (s.status='pending' or s.revision<>s.computed_revision)
 and (exists(select 1 from public.review_contributions c where c.pull_request_id=pr.id and c.source_type='review' and c.occurred_at>=r.starts_at and c.occurred_at<r.ends_at)
 or exists(select 1 from public.score_components c where c.pull_request_id=pr.id and c.season_id=r.season_id))
)t),
'calendar',jsonb_build_object('now',now(),'this_month_boundary',private.season_start(date_trunc('month',now() at time zone 'UTC')::date),'next_month_boundary',private.season_start((date_trunc('month',now() at time zone 'UTC')+interval '1 month')::date))
) as audit;
rollback;
