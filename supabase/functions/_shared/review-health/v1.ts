import { seasonAt } from "../scoring/season.ts"
const DAY = 86_400_000
function time(value: string) {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new Error("Invalid zoned timestamp")
  return Date.parse(value)
}
export type HealthInput = {
  organizationId: string
  eligibleFrom: string
  // Earliest boundary with verified useful-review eligibility, not simply fetched history.
  coverageFrom: string
  pendingPullRequests: number
  participants: { id: string; eligible: boolean; active: boolean; joinedAt: string; leftAt: string | null }[]
  reviews: { id: string; organizationId: string; participantId: string; pullRequestId: string;
    occurredAt: string; readyAt: string | null }[]
  pullRequests: { id: string; organizationId: string; open: boolean; draft: boolean;
    selected: boolean; authorEligible: boolean; readyAt: string | null; waitingForAuthor: boolean }[]
  // Optional verified end-of-day snapshots. Missing days mean unavailable, not zero.
  dailyQueue: { day: string; count: number }[]
}

/** Aggregate verified base-review work; comments and follow-through never enter it. */
export function calculateReviewHealth(input: HealthInput, asOf: string) {
  const now=time(asOf), season=seasonAt(asOf), entry=Math.max(time(season.startsAt),time(input.eligibleFrom))
  const midnight=Math.floor(now/DAY)*DAY, baselineEnd=Math.floor(entry/DAY)*DAY
  const rosterAt=(at:number) => input.participants.filter(p=>p.eligible && time(p.joinedAt)<=at && (p.leftAt===null || time(p.leftAt)>at))
  const eligible=new Set(input.participants.filter(p=>p.eligible).map(p=>p.id))
  const pairs=new Map<string,HealthInput["reviews"][number]>()
  for(const review of input.reviews) {
    if(review.organizationId!==input.organizationId) throw new Error("Cross-organization review")
    if(!eligible.has(review.participantId) || time(review.occurredAt)>now) continue
    const key=JSON.stringify([review.participantId,review.pullRequestId]),old=pairs.get(key)
    if(!old || time(review.occurredAt)<time(old.occurredAt)) pairs.set(key,review)
  }
  const reviews=[...pairs.values()]
  const firstByPr=new Map<string,HealthInput["reviews"][number]>()
  for(const r of reviews) { const old=firstByPr.get(r.pullRequestId);if(!old || time(r.occurredAt)<time(old.occurredAt)) firstByPr.set(r.pullRequestId,r) }
  function aggregate(start:number,end:number,roster:HealthInput["participants"],requireCoverage:boolean) {
    if(end<=start || (requireCoverage && (time(input.coverageFrom)>start || input.pendingPullRequests>0))) return null
    const work=reviews.filter(r=>time(r.occurredAt)>=start && time(r.occurredAt)<end)
    const counts=new Map<string,number>()
    for(const r of work) counts.set(r.participantId,(counts.get(r.participantId)??0)+1)
    const rosterIds=new Set(roster.map(p=>p.id)),reviewers=[...counts.keys()].filter(id=>rosterIds.has(id)).length
    const busiest=[...counts.values()].sort((a,b)=>b-a).slice(0,2).reduce((a,b)=>a+b,0)
    const durations=[...firstByPr.values()].filter(r=>time(r.occurredAt)>=start && time(r.occurredAt)<end && r.readyAt!==null)
      .map(r=>time(r.occurredAt)-time(r.readyAt!)).filter(d=>d>=0).sort((a,b)=>a-b)
    const middle=Math.floor(durations.length/2),median=durations.length===0?null:durations.length%2?durations[middle]!:(durations[middle-1]!+durations[middle]!)/2
    const firstDay=Math.ceil(start/DAY)*DAY,lastDay=Math.floor(end/DAY)*DAY
    const days=new Map(input.dailyQueue.map(s=>[s.day,s.count]))
    let sum=0,complete=lastDay>firstDay
    for(let d=firstDay;d<lastDay;d+=DAY) {const count=days.get(new Date(d).toISOString().slice(0,10));if(count===undefined) complete=false;else sum+=count}
    return {startsAt:new Date(start).toISOString(),endsAt:new Date(end).toISOString(),
      participation:{reviewers,roster:roster.length,percentage:roster.length?100*reviewers/roster.length:null},
      usefulReviews:work.length,weeklyRate:work.length*7*DAY/(end-start),
      loadSpreadPercentage:roster.length>=6 && work.length?100*(work.length-busiest)/work.length:null,
      individualShare:[...new Set([...roster.map(p=>p.id),...counts.keys()])].sort().map(participantId=>({participantId,
        usefulReviews:counts.get(participantId)??0,percentage:work.length?100*(counts.get(participantId)??0)/work.length:null})),
      medianFirstReviewMs:median,firstReviewSamples:durations.length,
      unknownFirstReviewTiming:[...firstByPr.values()].filter(r=>time(r.occurredAt)>=start && time(r.occurredAt)<end && (r.readyAt===null || time(r.readyAt)>time(r.occurredAt))).length,
      averageDailyAgingQueue:complete?sum/((lastDay-firstDay)/DAY):null}
  }
  const aging:string[]=[],unknown:string[]=[]
  for(const pr of input.pullRequests) {
    if(pr.organizationId!==input.organizationId) throw new Error("Cross-organization PR")
    if(!pr.open || pr.draft || !pr.selected || !pr.authorEligible || pr.waitingForAuthor || firstByPr.has(pr.id)) continue
    if(pr.readyAt===null) unknown.push(pr.id)
    else if(now-time(pr.readyAt)>DAY) aging.push(pr.id)
  }
  return {metricVersion:"v1",organizationId:input.organizationId,asOf,season,
    status:input.pendingPullRequests || unknown.length || reviews.some(r=>r.readyAt===null)?"partial":"complete",pendingPullRequests:input.pendingPullRequests,
    current:aggregate(entry,now,rosterAt(now),false),
    baseline:aggregate(baselineEnd-30*DAY,baselineEnd,rosterAt(entry),true),
    recent:aggregate(midnight-7*DAY,midnight,rosterAt(now),true),
    agingQueue:{count:aging.length,pullRequestIds:aging.sort(),unknownReadiness:unknown.sort()}}
}
