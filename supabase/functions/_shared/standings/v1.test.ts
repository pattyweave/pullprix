import { describe, expect, it } from "vitest"
import { calculateStandings, type StandingsInput } from "./v1.ts"
import type { ScoreComponent } from "../scoring/v1.ts"

function fixture(): StandingsInput {
  return { organizationId: "org", seasonId: "2026-09", eligibleFrom: "2026-09-07T12:00:00Z",
    participants: ["a", "b", "c", "zero"].map(id => ({ id, displayName: id, avatarUrl: null,
      active: true, eligible: true, joinedAt: "2026-09-07T12:00:00Z", leftAt: null })),
    components: [], pendingPullRequests: 0 }
}
function award(id: string, participantId = "a", occurredAt = "2026-09-28T12:00:00Z", points = 8): ScoreComponent {
  return { id, participantId, occurredAt, points, organizationId: "org", seasonId: "2026-09",
    pullRequestId: id, pullRequestNumber: 1, pullRequestUrl: "https://github.com/test/repo/pull/1",
    reviewId: id, reviewOutcome: "approved", kind: "approval", explanation: "Earned approval",
    sourceReference: "review", scoringPolicyVersion: "v1", status: "effective" }
}
const compute = (input: StandingsInput, asOf = "2026-09-28T20:00:00Z", finalized = false) => calculateStandings(input, asOf, finalized)
const first = (input: StandingsInput, asOf?: string) => compute(input, asOf).standings[0]!

describe("PP-042 standings", () => {
  it("uses competition ranks, with unranked zero-point participants", () => {
    const input=fixture(); input.components=[award("1","a"),award("2","b"),award("3","c",undefined,4)]
    expect(compute(input).standings.map(p=>[p.rank,p.tied,p.points])).toEqual([[1,true,8],[1,true,8],[3,false,4],[null,false,0]])
    expect(compute(input).standings[3]?.status).toBe("not_started")
    expect(first(input).champion).toBe(false)
  })
  it("declares shared champions only after explicit finalization", () => {
    const input=fixture();input.components=[award("1","a"),award("2","b")]
    expect(compute(input,"2026-10-05T12:00:00Z",true).standings.filter(p=>p.coChampion).length).toBe(2)
    expect(()=>compute(input,undefined,true)).toThrow("not ready")
    input.pendingPullRequests=1
    expect(()=>compute(input,"2026-10-05T12:00:00Z",true)).toThrow("not ready")
  })
  it("does not crown an empty season", () => {
    expect(compute(fixture(),"2026-10-05T12:00:00Z",true).standings.some(p=>p.champion)).toBe(false)
  })
  it("counts consecutive UTC days once and allows today to remain unfinished", () => {
    const input=fixture();input.components=[award("1","a","2026-09-26T23:00:00Z"),
      award("2","a","2026-09-27T01:00:00Z"),award("3","a","2026-09-27T22:00:00Z")]
    expect(first(input).streak).toEqual({current:2,best:2})
    expect(first(input,"2026-09-29T00:00:00Z").streak).toEqual({current:0,best:2})
    expect(first(input).points).toBe(24)
  })
  it("uses UTC across offsets and midnight", () => {
    const input=fixture();input.components=[award("1","a","2026-09-26T20:00:00-06:00"),award("2","a","2026-09-27T20:00:00-06:00")]
    expect(first(input).streak).toEqual({current:2,best:2})
    expect(()=>compute(input,"2026-09-28T20:00:00")).toThrow("timezone")
  })
  it("preserves best streak when a new run begins", () => {
    const input=fixture();input.components=[24,25,26,28].map(d=>award(String(d),"a",`2026-09-${d}T12:00:00Z`))
    expect(first(input).streak).toEqual({current:1,best:3})
  })
  it("preserves historical closing streaks instead of aging them against today", () => {
    const input=fixture();input.components=[award("last","a","2026-10-04T23:00:00Z")]
    expect(first(input,"2026-12-01T12:00:00Z").streak).toEqual({current:1,best:1})
  })
  it("keeps component explanations and totals without bonus-created streak days", () => {
    const input=fixture();input.components=[award("base"),{...award("rescue","a","2026-09-27T12:00:00Z",3),kind:"aging_pr_rescue"}]
    expect(first(input)).toMatchObject({points:11,breakdown:{approval:8,aging_pr_rescue:3},streak:{current:1,best:1}})
    expect(first(input).components).toHaveLength(2)
  })
  it("excludes wrong-season, pre-entry, end-boundary and future activity", () => {
    const input=fixture();input.eligibleFrom="2026-09-20T12:00:00Z"
    input.components=[award("early","a","2026-09-20T11:59:59Z"),award("yes","a","2026-09-20T12:00:00Z"),
      award("end","a","2026-10-05T12:00:00Z"),{...award("old"),seasonId:"2026-08"},award("future","a","2026-09-29T12:00:00Z")]
    expect(first(input).points).toBe(8)
    expect(compute(input).eligibleFrom).toBe("2026-09-20T12:00:00.000Z")
  })
  it("resets streaks at the noon season boundary", () => {
    const input=fixture();input.components=[award("before","a","2026-09-07T11:59:59Z"),award("at","a","2026-09-07T12:00:00Z")]
    expect(first(input,"2026-09-07T12:00:00Z").streak).toEqual({current:1,best:1})
    input.seasonId="2026-10"
    expect(first(input,"2026-10-05T12:00:00Z").streak).toEqual({current:0,best:0})
  })
  it("keeps earned points after departure and excludes ineligible participants", () => {
    const input=fixture();input.components=[award("1","a"),award("2","b")]
    input.participants[0]!.active=false;input.participants[0]!.leftAt="2026-09-28T13:00:00Z"
    input.participants[1]!.eligible=false
    expect(compute(input).totalPoints).toBe(8)
    expect(first(input).active).toBe(false)
  })
  it("does not invent roster membership before joining", () => {
    const input=fixture();input.participants[0]!.joinedAt="2026-09-29T12:00:00Z"
    expect(compute(input).standings.some(p=>p.participantId==="a")).toBe(false)
  })
  it("is deterministic and deduplicates identical ledger components", () => {
    const input=fixture();input.components=[award("1"),award("1")];const before=structuredClone(input)
    expect(first(input).points).toBe(8)
    expect(compute({...input,participants:[...input.participants].reverse()})).toEqual(compute(input))
    expect(input).toEqual(before)
    input.components[1]!.points=10
    expect(()=>compute(input)).toThrow("Conflicting")
  })
  it("rejects mixed organization inputs and invalid season IDs", () => {
    const input=fixture();input.components=[{...award("1"),organizationId:"other"}]
    expect(()=>compute(input)).toThrow("Cross-organization")
    expect(()=>compute({...fixture(),seasonId:"2026-13"})).toThrow("Invalid season")
  })
  it("exposes pending work and never changes component points", () => {
    const input=fixture();input.pendingPullRequests=2;input.components=[award("1")]
    expect(compute(input)).toMatchObject({status:"provisional",pendingPullRequests:2,totalPoints:8})
  })
})
