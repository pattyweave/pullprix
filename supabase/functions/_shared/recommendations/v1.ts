export type RecommendationInput = {
  organizationId: string
  participant: { id: string; githubUserId: number; eligible: boolean; active: boolean }
  // Supplied by the authorized caller; organization membership alone is not repo access.
  accessibleRepositoryIds: string[]
  candidates: { id: string; organizationId: string; repositoryId: string; url: string;
    authorGithubUserId: number; authorEligible: boolean; open: boolean; draft: boolean;
    selected: boolean; readyAt: string | null; waitingForAuthor: boolean;
    reviewerGithubIds: number[]; priorReviewerCount: number; repositoryUsefulReviews: number;
    gate: { credit: "required" | "satisfied" | "unconfigured" | "unknown"; observedAt: string; unchanged: boolean } | null }[]
}
const parse=(s:string)=>/(Z|[+-]\d{2}:\d{2})$/.test(s)?Date.parse(s):NaN
/** Conservative base-review suggestions; follow-through suggestions are deferred. */
export function recommendNextReview(input:RecommendationInput,asOf:string) {
  const now=parse(asOf)
  if(!Number.isFinite(now)) throw new Error("Invalid recommendation timestamp")
  if(!input.participant.eligible || !input.participant.active) return null
  const candidates=input.candidates.filter(c=>{
    if(c.organizationId!==input.organizationId) throw new Error("Cross-organization candidate")
    if(!c.open || c.draft || !c.selected || !c.authorEligible || c.waitingForAuthor || c.authorGithubUserId===input.participant.githubUserId ||
      !input.accessibleRepositoryIds.includes(c.repositoryId) || c.reviewerGithubIds.includes(input.participant.githubUserId)) return false
    if(!c.readyAt || !Number.isFinite(parse(c.readyAt)) || parse(c.readyAt)>now) return false
    const gate=c.gate,observed=gate?parse(gate.observedAt):NaN
    if(!gate || !gate.unchanged || !Number.isFinite(observed) || observed>now || now-observed>5*60_000) return false
    if(gate.credit!=="required" && !(gate.credit==="unconfigured" && c.priorReviewerCount<2)) return false
    try {const url=new URL(c.url);return url.protocol==="https:" && url.hostname==="github.com" && /^\/[^/]+\/[^/]+\/pull\/\d+$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash} catch{return false}
  }).map(c=>({...c,ageMs:now-parse(c.readyAt!)}))
  candidates.sort((a,b)=>Number(b.ageMs>86_400_000)-Number(a.ageMs>86_400_000) ||
    a.repositoryUsefulReviews-b.repositoryUsefulReviews || b.ageMs-a.ageMs || a.id.localeCompare(b.id))
  const selected=candidates[0]
  if(!selected) return null
  return {pullRequestId:selected.id,repositoryId:selected.repositoryId,url:selected.url,ageMs:selected.ageMs,
    reasons:[...(selected.ageMs>86_400_000?[{code:"aging_pr",explanation:"This ready PR has waited more than 24 hours."}]:[]),
      {code:"repository_coverage",explanation:"Prioritized repositories with fewer useful reviews in the recent window."},
      {code:"review_needed",explanation:selected.gate!.credit==="required"?"GitHub reports that review work is still required.":"An unconfigured-review fallback slot is still available."}],
    gateObservedAt:selected.gate!.observedAt}
}
