-- A first requirements check can follow a fast review during the minute worker
-- interval. Explicit v1 fallback: a new, unchanged PR first observed without
-- enforced requirements within five minutes may use the two-reviewer cap.
-- Preserve creditBeforeReview=unknown and the actual observation timestamp.
create or replace function public.get_pull_request_scoring_input(p_pull_request_id uuid)
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_set(bundle,'{input,reviews}',coalesce((
    select jsonb_agg(review || jsonb_build_object(
      'approvalDismissed',private.dismissed_approval_retains_credit(c),
      'initialUnconfiguredObservation',case when
        review->>'creditBeforeReview'='unknown' and first_gate.credit='unconfigured'
        and first_gate.observed_at>=c.occurred_at
        and c.occurred_at>=p.opened_at
        and first_gate.observed_at<=p.opened_at+interval '5 minutes'
        and first_gate.head_sha=c.metadata_json->>'commit_id'
        and first_gate.latest_review_github_id=(select latest.source_github_id
          from public.review_contributions latest where latest.pull_request_id=p.id
            and latest.source_type='review' and latest.occurred_at<=first_gate.observed_at
          order by latest.occurred_at desc,latest.source_github_id desc limit 1)
        and exists(select 1 from public.scoring_events opened where opened.pull_request_id=p.id
          and opened.event_name='pull_request' and opened.action='opened'
          and opened.occurred_at=p.opened_at and opened.state='open' and not opened.draft
          and opened.head_sha=first_gate.head_sha)
        and not exists(select 1 from public.scoring_events changed where changed.pull_request_id=p.id
          and changed.occurred_at>=p.opened_at and changed.occurred_at<=first_gate.observed_at
          and changed.action in ('synchronize','edited','dismissed','closed','converted_to_draft','ready_for_review','reopened'))
      then jsonb_build_object('openedAt',p.opened_at,'observedAt',first_gate.observed_at,'headSha',first_gate.head_sha)
      else null end) order by position)
    from jsonb_array_elements(bundle->'input'->'reviews') with ordinality as r(review,position)
    join public.review_contributions c on c.id=(review->>'id')::uuid and c.pull_request_id=p_pull_request_id
    join public.pull_requests p on p.id=c.pull_request_id
    left join lateral (select obs.* from public.review_gate_observations obs
      where obs.pull_request_id=p.id order by obs.observed_at limit 1) first_gate on true
  ),'[]'::jsonb))
  from (select private.get_pull_request_scoring_input(p_pull_request_id) as bundle) data;
$$;
revoke all on function public.get_pull_request_scoring_input(uuid) from public;
grant execute on function public.get_pull_request_scoring_input(uuid) to service_role;

-- Schedule only pending PRs newly covered by this clarification. The usual
-- revision guard, worker and ledger writer apply; no points are inserted here.
select private.dirty_pr_score(s.pull_request_id)
from public.pull_request_scoring s
where s.status='pending' and exists (
  select 1 from jsonb_array_elements(public.get_pull_request_scoring_input(s.pull_request_id)->'input'->'reviews') r
  where jsonb_typeof(r->'initialUnconfiguredObservation')='object'
);
