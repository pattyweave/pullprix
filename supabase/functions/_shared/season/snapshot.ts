import { calculateStandings, type StandingsInput } from "../standings/v1.ts"
import type { calculateReviewHealth } from "../review-health/v1.ts"
import { seasonAt } from "../scoring/season.ts"
export type ProgressPolicy = {version:string;individualTargetPoints:number;
  teamTargetPointsPerStartingParticipant?:number;lateJoinFloor:number;
  milestones:{id:string;scope:"participant"|"team";threshold:number}[]}
export type SeasonDefinition = {id:string;version:number;name:string;scoringPolicyVersion:"v1";
  themePack:{id:string;version:string;assetBaseUrl:string;integrity:string};progressPolicy:ProgressPolicy}
export type SeasonEntry = {organizationId:string;seasonId:string;eligibleFrom:string;startingRosterSize:number;teamProgressTargetPoints:number|null}
function timestamp(value:string){if(!/(Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value)))throw new Error("Invalid zoned timestamp");return Date.parse(value)}
function calendar(id:string){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(id))throw new Error("Invalid season ID");return seasonAt(`${id}-15T12:00:00Z`)}
function validate(policy:ProgressPolicy){
  if(!Number.isFinite(policy.individualTargetPoints)||policy.individualTargetPoints<=0 || !Number.isFinite(policy.lateJoinFloor)||policy.lateJoinFloor<=0||policy.lateJoinFloor>1 ||
    (policy.teamTargetPointsPerStartingParticipant!==undefined&&(!Number.isFinite(policy.teamTargetPointsPerStartingParticipant)||policy.teamTargetPointsPerStartingParticipant<=0)))throw new Error("Invalid progress target")
  if(new Set(policy.milestones.map(m=>m.id)).size!==policy.milestones.length||policy.milestones.some(m=>!Number.isFinite(m.threshold)||m.threshold<0||m.threshold>1))throw new Error("Invalid milestones")
}
/** Compute once when joining, then retain the returned entry across roster changes. */
export function createSeasonEntry(input:StandingsInput,policy:ProgressPolicy):SeasonEntry {
  validate(policy);const season=calendar(input.seasonId),start=timestamp(season.startsAt),end=timestamp(season.endsAt),entry=Math.max(start,timestamp(input.eligibleFrom))
  if(entry>=end)throw new Error("Entry must precede season end")
  const startingRosterSize=input.participants.filter(p=>p.eligible&&timestamp(p.joinedAt)<=entry&&(p.leftAt===null||timestamp(p.leftAt)>entry)).length
  const fraction=Math.max(policy.lateJoinFloor,(end-entry)/(end-start))
  return {organizationId:input.organizationId,seasonId:input.seasonId,eligibleFrom:new Date(entry).toISOString(),startingRosterSize,
    teamProgressTargetPoints:policy.teamTargetPointsPerStartingParticipant===undefined||startingRosterSize===0?null:Math.ceil(policy.teamTargetPointsPerStartingParticipant*startingRosterSize*fraction)}
}
export function createSeasonSnapshot(input:StandingsInput,definition:SeasonDefinition,entry:SeasonEntry,asOf:string,
  options:{finalized?:boolean;health?:ReturnType<typeof calculateReviewHealth>}={}) {
  validate(definition.progressPolicy)
  if(input.seasonId!==definition.id||entry.seasonId!==definition.id||entry.organizationId!==input.organizationId)throw new Error("Snapshot scope mismatch")
  const season=calendar(definition.id),now=timestamp(asOf),end=timestamp(season.endsAt),start=timestamp(season.startsAt)
  if(timestamp(entry.eligibleFrom)<start||timestamp(entry.eligibleFrom)>=end||entry.startingRosterSize<0||!Number.isInteger(entry.startingRosterSize)||
    (entry.teamProgressTargetPoints!==null&&(!Number.isFinite(entry.teamProgressTargetPoints)||entry.teamProgressTargetPoints<=0)))throw new Error("Invalid locked entry")
  if(options.health&&(options.health.organizationId!==input.organizationId||options.health.season.id!==input.seasonId||timestamp(options.health.asOf)!==now))throw new Error("Health snapshot scope/time mismatch")
  const standings=calculateStandings({...input,eligibleFrom:entry.eligibleFrom},asOf,options.finalized)
  const progress=(points:number,targetPoints:number,scope:"participant"|"team")=>{
    const normalized=Math.min(points/targetPoints,1)
    return {points,targetPoints,normalized,reachedMilestoneIds:definition.progressPolicy.milestones.filter(m=>m.scope===scope&&normalized>=m.threshold).map(m=>m.id).sort()}
  }
  return {contractVersion:"1",generatedAt:asOf,historyBasis:"current_corrected_ledger",
    lifecycleState:options.finalized?"completed":now<start?"scheduled":now>=end?"finalizing":now>=end-72*3600000?"final_stage":"active",
    season:{...definition,...season,finalStageStartsAt:new Date(end-72*3600000).toISOString()},entry,
    standings:standings.standings.map(p=>({participantId:p.participantId,rank:p.rank,tied:p.tied,points:p.points})),
    participants:standings.standings.map(p=>{
      const source=input.participants.find(s=>s.id===p.participantId)!,inactive=source.leftAt!==null&&timestamp(source.leftAt)<=now
      return {participantId:p.participantId,displayName:p.displayName,avatarUrl:p.avatarUrl,status:inactive?"inactive":p.points?"active":"not_started",
        points:p.points,rank:p.rank,tied:p.tied,streak:p.streak,progress:progress(p.points,definition.progressPolicy.individualTargetPoints,"participant"),
        scoreComponents:p.components,achievementIds:p.champion?[p.coChampion?"co_champion":"champion"]:[]}
    }),
    team:{progress:entry.teamProgressTargetPoints===null?null:progress(standings.totalPoints,entry.teamProgressTargetPoints,"team")},
    health:options.health??null,pendingPullRequests:standings.pendingPullRequests}
}
/** UTC daily samples plus exact entry/end cursor; no invented historical health. */
export function sampleSeasonTimeline(input:StandingsInput,definition:SeasonDefinition,entry:SeasonEntry,through:string){
  const end=timestamp(calendar(definition.id).endsAt),limit=Math.min(timestamp(through),end),start=timestamp(entry.eligibleFrom)
  if(limit<start)return []
  const times=[start]
  for(let at=(Math.floor(start/86400000)+1)*86400000;at<limit;at+=86400000)times.push(at)
  if(limit>start)times.push(limit)
  return times.map(at=>createSeasonSnapshot(input,definition,entry,new Date(at).toISOString()))
}
