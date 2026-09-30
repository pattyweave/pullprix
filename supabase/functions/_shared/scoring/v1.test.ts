import { describe, expect, it } from "vitest"
import { scorePullRequestV1, SCORING_POLICY_V1, type ReviewFact, type ScoringInput } from "./v1.ts"

const time = (day: number, hour = 12) => `2026-09-${String(day).padStart(2,"0")}T${String(hour).padStart(2,"0")}:00:00Z`
function review(id = 1, actor = 2, extra: Partial<ReviewFact> = {}): ReviewFact {
  return { id: `r${id}`, githubReviewId: id, actorGithubUserId: actor, occurredAt: time(10,13), outcome: "approved",
    bodyPresent: false, effective: true, commitId: "sha-a", url: `https://github.com/team/api/pull/1#pullrequestreview-${id}`,
    readiness: { state: "ready", since: time(10) }, creditBeforeReview: "unconfigured", feedbackComplete: true, ...extra }
}
function input(reviews: ReviewFact[] = [review()]): ScoringInput {
  return { policyVersion: "v1", organizationId: "org", season: { id: "2026-09", startsAt: time(7), endsAt: "2026-10-05T12:00:00Z", eligibleFrom: time(7) },
    pullRequest: { id: "pr1", repositoryId: "repo1", number: 1, url: "https://github.com/team/api/pull/1", authorGithubUserId: 1, authorEligible: true },
    repositoryAccess: [{ from: time(7), until: null }],
    participants: [2,3,4,5].map(id => ({ id: `p${id}`, githubUserId: id, eligible: true, scoringFrom: time(7), leftAt: null })),
    reviews, comments: [], headChanges: [], reviewHistoryComplete: true, headHistoryComplete: true }
}
function comment(id: string, reviewId = "r1", extra = {}) {
  return { id, reviewId, actorGithubUserId: 2, bodyPresent: true, effective: true, ...extra }
}

describe("approved policy v1", () => {
  const initialObservation = { openedAt: "2026-09-10T12:59:30Z", observedAt: "2026-09-10T13:00:30Z", headSha: "sha-a" }
  it("scores fast reviews from an explicit initial no-requirements check with the same lifetime cap", () => {
    const data = input([2,3,4].map((actor, i) => review(i+1, actor, {
      creditBeforeReview: "unknown", initialUnconfiguredObservation: initialObservation,
    })))
    const result = scorePullRequestV1(data)
    expect(result.totalPoints).toBe(16)
    expect(result.decisions[2].reason).toBe("fallback_cap")
    expect(result.components[0].creditBasis).toEqual({ kind: "initial_unconfigured", observedAt: initialObservation.observedAt })
    expect(data.reviews[0].creditBeforeReview).toBe("unknown")
    expect(scorePullRequestV1(data)).toEqual(result)
  })

  it("initial fallback cannot override known gates, incomplete history, draft, self-review or deletion", () => {
    for (const [extra, expected] of [
      [{ creditBeforeReview: "satisfied" }, "credit_satisfied"],
      [{ readiness: { state: "draft" } }, "draft_review"],
      [{ actorGithubUserId: 1 }, "self_review"],
      [{ effective: false }, "ineffective_review"],
    ] as const) {
      const result = scorePullRequestV1(input([review(1,2,{ creditBeforeReview: "unknown",
        initialUnconfiguredObservation: initialObservation, ...extra })]))
      expect(result.totalPoints).toBe(0)
      expect(result.decisions[0].reason).toBe(expected)
    }
    const data = input([review(1,2,{ creditBeforeReview: "unknown", initialUnconfiguredObservation: initialObservation })])
    data.reviewHistoryComplete = false
    expect(scorePullRequestV1(data).decisions[0].reason).toBe("history_incomplete")
  })

  it("rejects late observations, changed heads, or timestamps outside the initial PR interval", () => {
    for (const extra of [
      { observedAt: "2026-09-10T13:04:31Z" }, { headSha: "sha-b" },
      { observedAt: "2026-09-10T12:59:59Z" }, { openedAt: "2026-09-10T13:00:01Z" },
    ]) {
      const result = scorePullRequestV1(input([review(1,2,{ creditBeforeReview: "unknown",
        initialUnconfiguredObservation: { ...initialObservation, ...extra } })]))
      expect(result.totalPoints).toBe(0)
      expect(result.decisions[0].reason).toBe("credit_unknown")
    }
  })

  it.each([
    ["approved", false, 8, "approval"], ["approved", true, 10, "approval_with_feedback"],
    ["commented", true, 10, "comment_review_with_feedback"], ["changes_requested", false, 12, "changes_requested"],
  ] as const)("scores %s with summary=%s as %i", (outcome, bodyPresent, points, kind) => {
    const result = scorePullRequestV1(input([review(1,2,{outcome,bodyPresent})]))
    expect(result.totalPoints).toBe(points)
    expect(result.components[0]).toMatchObject({ kind, points, scoringPolicyVersion: "v1", status: "effective",
      reviewOutcome: outcome, pullRequestId: "pr1", participantId: "p2", sourceReference: expect.stringContaining("pullrequestreview-1") })
    expect(result.decisions[0]).toMatchObject({ status: "scored", points })
  })

  it("comment spam never stacks; only own, linked, nonempty, effective inline feedback qualifies", () => {
    const data = input()
    data.comments = Array.from({length:100},(_,i)=>comment(`c${i}`))
    expect(scorePullRequestV1(data).totalPoints).toBe(10)
    data.comments = [comment("deleted","r1",{effective:false}),comment("other","r1",{actorGithubUserId:3}),
      comment("unlinked","r2"),comment("empty","r1",{bodyPresent:false})]
    expect(scorePullRequestV1(data).totalPoints).toBe(8)
    data.reviews = [review(1,2,{outcome:"commented"})]
    expect(scorePullRequestV1(data).decisions[0].reason).toBe("empty_comment_review")
  })

  it("repeated submissions and later manufactured change requests cannot upgrade or multiply a base", () => {
    const data = input(Array.from({length:100},(_,i)=>review(i+1,2,{outcome:i ? "changes_requested":"approved"})))
    expect(scorePullRequestV1(data).totalPoints).toBe(8)
    // Editing the *same* canonical review's feedback changes its one component.
    const before = scorePullRequestV1(input()).components[0]
    const after = scorePullRequestV1(input([review(1,2,{bodyPresent:true})])).components[0]
    expect(before.id).toBe(after.id)
    expect(after.points).toBe(10)
  })

  it("A requests changes and B completes the review: A=12, B=8, no follow-through for A", () => {
    const data = input([review(1,2,{outcome:"changes_requested"}),review(2,3,{commitId:"sha-b",occurredAt:time(10,15)})])
    data.headChanges=[{commitId:"sha-b",occurredAt:time(10,14)}]
    expect(scorePullRequestV1(data).participantTotals).toEqual([{participantId:"p2",points:12},{participantId:"p3",points:8}])
  })

  it("review loops have one follow-through bonus, with proven new commits and open credit", () => {
    const data = input([review(1,2,{outcome:"changes_requested"}),
      review(2,2,{commitId:"sha-b",occurredAt:time(10,15)}),review(3,2,{commitId:"sha-c",occurredAt:time(10,17)})])
    data.headChanges=[{commitId:"sha-b",occurredAt:time(10,14)},{commitId:"sha-c",occurredAt:time(10,16)}]
    const result = scorePullRequestV1(data)
    expect(result.totalPoints).toBe(16)
    expect(result.components.map(c=>c.kind)).toEqual(["changes_requested","follow_through"])
    expect(result.decisions[2].reason).toBe("follow_through_cap")
    data.reviews[1].creditBeforeReview="satisfied"
    data.reviews[2].creditBeforeReview="satisfied"
    expect(scorePullRequestV1(data).totalPoints).toBe(12)
  })

  it("a different commit SHA alone, an earlier push, or a future push cannot prove follow-through", () => {
    const data = input([review(),review(2,2,{commitId:"sha-b",occurredAt:time(10,15)})])
    for(const changes of [[],[{commitId:"sha-b",occurredAt:time(10,12)}],[{commitId:"sha-b",occurredAt:time(10,16)}]]) {
      data.headChanges=changes
      expect(scorePullRequestV1(data).totalPoints).toBe(8)
    }
    data.headHistoryComplete=false
    expect(scorePullRequestV1(data).decisions[1]).toMatchObject({reason:"head_history_unknown",status:"pending"})
  })

  it("fallback blocks a third reviewer, but not the original reviewers' valid follow-through", () => {
    const data = input([review(),review(2,3),review(3,4),review(4,2,{occurredAt:time(10,15),commitId:"sha-b"})])
    data.headChanges=[{occurredAt:time(10,14),commitId:"sha-b"}]
    expect(scorePullRequestV1(data).totalPoints).toBe(20)
    expect(scorePullRequestV1(data).decisions[2].reason).toBe("fallback_cap")
  })

  it("GitHub requirements allow necessary reviewers beyond two and close before redundant ones", () => {
    const data=input([review(1,2,{creditBeforeReview:"required"}),review(2,3,{creditBeforeReview:"required"}),
      review(3,4,{creditBeforeReview:"required"}),review(4,5,{creditBeforeReview:"satisfied"})])
    expect(scorePullRequestV1(data).totalPoints).toBe(24)
    expect(scorePullRequestV1(data).decisions[3].reason).toBe("credit_satisfied")
  })

  it("reopening credit can award follow-through but cannot reset base or fallback caps", () => {
    const data=input([review(1,2,{creditBeforeReview:"required"}),review(2,2,{creditBeforeReview:"satisfied",occurredAt:time(10,14)}),
      review(3,2,{creditBeforeReview:"required",commitId:"sha-b",occurredAt:time(10,16)})])
    data.headChanges=[{commitId:"sha-b",occurredAt:time(10,15)}]
    expect(scorePullRequestV1(data).totalPoints).toBe(12)
    data.reviews=[review(1,2,{creditBeforeReview:"required"}),review(2,3,{creditBeforeReview:"required"}),
      review(3,4,{creditBeforeReview:"required"}),review(4,4,{commitId:"sha-b",occurredAt:time(10,16)})]
    expect(scorePullRequestV1(data).totalPoints).toBe(24)
    expect(scorePullRequestV1(data).decisions[3].reason).toBe("fallback_cap")
  })

  it("retains reviews earned before closure, but not review activity after closure", () => {
    const data=input([review(),review(2,3,{readiness:{state:"closed"}})])
    expect(scorePullRequestV1({...data,currentPrState:"closed",merged:false} as ScoringInput).totalPoints).toBe(8)
    expect(scorePullRequestV1(data).decisions[1].reason).toBe("closed_pr")
  })

  it("recomputing a deleted base or deleted feedback changes the desired components without mutating facts", () => {
    const data=input([review(),review(2,3)])
    data.comments=[comment("c1")]
    expect(scorePullRequestV1(data).totalPoints).toBe(18)
    data.comments=[comment("c1","r1",{effective:false})]
    expect(scorePullRequestV1(data).totalPoints).toBe(16)
    data.reviews[0].effective=false
    const before=structuredClone(data)
    expect(scorePullRequestV1(data).totalPoints).toBe(8)
    expect(scorePullRequestV1(data)).toEqual(scorePullRequestV1(data))
    expect(data).toEqual(before)
  })
  it.each([false,true])("preserves dismissed approval credit, feedback=%s, without reactivating GitHub validity", bodyPresent => {
    const data=input([review(1,2,{bodyPresent})])
    const earned=scorePullRequestV1(data)
    data.reviews[0].effective=false
    data.reviews[0].approvalDismissed=true
    expect(scorePullRequestV1(data).components).toEqual(earned.components)
    expect(data.reviews[0].effective).toBe(false)
  })
  it("dismissal cannot free a fallback slot or farm another base", () => {
    const data=input([review(1,2,{effective:false,approvalDismissed:true}),review(2,3),review(3,4),review(4,2)])
    expect(scorePullRequestV1(data).totalPoints).toBe(16)
    expect(scorePullRequestV1(data).decisions[2].reason).toBe("fallback_cap")
    expect(scorePullRequestV1(data).decisions[3].reason).toBe("no_new_commits")
  })
  it("a dismissed approval can still earn one legitimate follow-through after a push", () => {
    const data=input([review(1,2,{effective:false,approvalDismissed:true}),review(2,2,{commitId:"sha-b",occurredAt:time(10,15)})])
    data.headChanges=[{occurredAt:time(10,14),commitId:"sha-b"}]
    expect(scorePullRequestV1(data).totalPoints).toBe(12)
  })
  it("dismissal does not waive self-review, participant eligibility, or pre-review gate rules", () => {
    for(const change of ["self","actor","gate"]){
      const data=input([review(1,2,{effective:false,approvalDismissed:true})])
      if(change==="self") data.pullRequest.authorGithubUserId=2
      if(change==="actor") data.participants[0].eligible=false
      if(change==="gate") data.reviews[0].creditBeforeReview="satisfied"
      expect(scorePullRequestV1(data).totalPoints).toBe(0)
    }
  })
  it("cannot manufacture an original approval from an unknown dismissed snapshot", () => {
    expect(()=>scorePullRequestV1(input([review(1,2,{outcome:"dismissed",effective:false,approvalDismissed:true})]))).toThrow("Invalid review scoring fact")
  })

  it("equivalent timezone timestamps produce identical output", () => {
    const data=input()
    const expected=scorePullRequestV1(data)
    data.reviews[0].occurredAt="2026-09-10T07:00:00-06:00"
    expect(scorePullRequestV1(data)).toEqual(expected)
  })

  it("rescue is strictly over 24 hours and available only on the first qualifying review", () => {
    const exact = input([review(1,2,{occurredAt:time(11)})])
    expect(scorePullRequestV1(exact).totalPoints).toBe(8)
    exact.reviews[0].occurredAt="2026-09-11T12:00:00.001Z"
    expect(scorePullRequestV1(exact).totalPoints).toBe(11)
    const two = input([review(),review(2,3,{occurredAt:time(12)})])
    expect(scorePullRequestV1(two).totalPoints).toBe(16)
    two.reviews[0].occurredAt=time(12)
    expect(scorePullRequestV1(two).components.filter(c=>c.kind==="aging_pr_rescue")).toHaveLength(1)
  })

  it("draft time and close/reopen cycles do not manufacture another rescue", () => {
    const data=input([review(1,2,{readiness:{state:"draft"}}),review(2,3,{occurredAt:time(12),readiness:{state:"ready",since:time(12,11)}}),
      review(3,4,{occurredAt:time(15),readiness:{state:"ready",since:time(13)}})])
    expect(scorePullRequestV1(data).totalPoints).toBe(16)
    expect(scorePullRequestV1(data).components.some(c=>c.kind==="aging_pr_rescue")).toBe(false)
  })

  it.each(["self","reviewer_bot","author_bot","dismissed","deleted","draft"])("excludes %s without consuming fallback/rescue", scenario => {
    const data=input([review(),review(2,3),review(3,4)])
    if(scenario==="self") data.reviews[0].actorGithubUserId=1
    if(scenario==="reviewer_bot") data.participants[0].eligible=false
    if(scenario==="author_bot") data.pullRequest.authorEligible=false
    if(scenario==="dismissed") data.reviews[0].outcome="dismissed"
    if(scenario==="deleted") data.reviews[0].effective=false
    if(scenario==="draft") data.reviews[0].readiness={state:"draft"}
    const result=scorePullRequestV1(data)
    expect(result.decisions[0].status).toBe("excluded")
    expect(result.totalPoints).toBe(scenario==="author_bot"?0:16)
  })

  it.each(["credit","readiness","author","participant","feedback","history"])("does not guess missing %s or let later reviews steal capped credit", missing => {
    const data=input([review(),review(2,3)])
    if(missing==="credit") data.reviews[0].creditBeforeReview="unknown"
    if(missing==="readiness") data.reviews[0].readiness={state:"unknown"}
    if(missing==="author") data.pullRequest.authorEligible=null
    if(missing==="participant") data.participants=data.participants.slice(1)
    if(missing==="feedback") data.reviews[0].feedbackComplete=false
    if(missing==="history") data.reviewHistoryComplete=false
    const result=scorePullRequestV1(data)
    expect(result.status).toBe("pending")
    expect(result.totalPoints).toBe(0)
  })

  it("known summary feedback or changes-requested value does not require inline comments to finish loading", () => {
    for(const data of [input([review(1,2,{bodyPresent:true,feedbackComplete:false})]),input([review(1,2,{outcome:"changes_requested",feedbackComplete:false})])]) {
      expect(scorePullRequestV1(data).status).toBe("complete")
    }
  })

  it("projects half-open season boundaries by occurrence time, not processing time", () => {
    const data=input([review(1,2,{occurredAt:time(7),readiness:{state:"ready",since:time(7)}}),
      review(2,3,{occurredAt:"2026-10-05T12:00:00Z",readiness:{state:"unknown"}})])
    expect(scorePullRequestV1(data).totalPoints).toBe(8)
    expect(scorePullRequestV1(data).status).toBe("complete")
    expect(scorePullRequestV1(data).decisions[1].reason).toBe("outside_season")
  })

  it("season resets cannot award a second base on the same PR", () => {
    const data=input([review(1,2,{occurredAt:time(6),readiness:{state:"ready",since:time(6)}}),review(2,2)])
    expect(scorePullRequestV1(data).totalPoints).toBe(0)
    expect(scorePullRequestV1(data).decisions.map(d=>d.reason)).toEqual(["outside_season","no_new_commits"])
  })

  it("does not retroactively award imported history, while retaining prior fallback consumption", () => {
    const data=input([review(1,2),review(2,3),review(3,4,{occurredAt:time(12)})])
    data.season.eligibleFrom=time(11)
    expect(scorePullRequestV1(data).totalPoints).toBe(0)
    expect(scorePullRequestV1(data).decisions[2].reason).toBe("fallback_cap")
  })

  it("preserves earned points after repo removal or departure, but excludes subsequent activity", () => {
    const data=input([review(),review(2,3,{occurredAt:time(11,13)})])
    data.repositoryAccess=[{from:time(7),until:time(11)}]
    expect(scorePullRequestV1(data).totalPoints).toBe(8)
    data.repositoryAccess=[{from:time(7),until:null}]
    data.participants[1].leftAt=time(11)
    expect(scorePullRequestV1(data).totalPoints).toBe(8)
    data.participants[0].scoringFrom=time(11)
    expect(scorePullRequestV1(data).totalPoints).toBe(0)
  })

  it("duplicate deliveries and shuffled inputs are deterministic and do not mutate facts", () => {
    const data=input([review(),review(2,3,{bodyPresent:true})])
    const original=structuredClone(data)
    const expected=scorePullRequestV1(data)
    const shuffled={...data,reviews:[...data.reviews].reverse().concat(data.reviews[0]),participants:[...data.participants].reverse()}
    expect(scorePullRequestV1(shuffled)).toEqual(expected)
    expect(data).toEqual(original)
    expect(new Set(expected.components.map(c=>c.id)).size).toBe(expected.components.length)
    expect(expected.totalPoints).toBe(expected.components.reduce((sum,c)=>sum+c.points,0))
    expect(expected.totalPoints).toBe(expected.decisions.reduce((sum,d)=>sum+d.points,0))
    for(const c of expected.components) expect(c.explanation.length).toBeGreaterThan(10)
  })

  it("conflicting duplicate versions are rejected rather than depending on input ordering", () => {
    expect(()=>scorePullRequestV1(input([review(),review(1,2,{bodyPresent:true})]))).toThrow("Conflicting duplicate")
    const data=input();data.comments=[comment("same"),comment("same","r1",{effective:false})]
    expect(()=>scorePullRequestV1(data)).toThrow("Conflicting duplicate")
  })

  it("uses canonical IDs to order simultaneous reviews consistently", () => {
    const data=input([review(3,4),review(1,2),review(2,3)])
    expect(scorePullRequestV1(data).participantTotals).toEqual([{participantId:"p2",points:8},{participantId:"p3",points:8}])
  })

  it("rejects unknown policies, ambiguous timestamps, and impossible readiness", () => {
    const data=input()
    expect(()=>scorePullRequestV1({...data,policyVersion:"v2" as "v1"})).toThrow("Unsupported")
    data.reviews[0].occurredAt="2026-09-10T13:00:00"
    expect(()=>scorePullRequestV1(data)).toThrow("explicit timezone")
    data.reviews[0].occurredAt=time(9)
    expect(()=>scorePullRequestV1(data)).toThrow("predates")
  })

  it("freezes v1 values and exposes no speed, size, diversity, or streak multiplier", () => {
    expect(Object.isFrozen(SCORING_POLICY_V1)).toBe(true)
    const data=input([review(1,2,{outcome:"changes_requested",occurredAt:time(12)}),review(2,2,{occurredAt:time(13),commitId:"sha-b"})])
    data.headChanges=[{occurredAt:time(12,14),commitId:"sha-b"}]
    expect(scorePullRequestV1({...data,streak:999,linesChanged:99999,merged:true} as ScoringInput).totalPoints).toBe(19)
  })

  it("caps fallback farming at 35 total points: two bases, two follow-throughs, one rescue", () => {
    const data=input([review(1,2,{outcome:"changes_requested",occurredAt:time(12)}),
      review(2,3,{outcome:"changes_requested",occurredAt:time(12)}),review(3,4,{outcome:"changes_requested",occurredAt:time(12)}),
      ...Array.from({length:99},(_,i)=>review(i+4,2+i%3,{outcome:"changes_requested",occurredAt:time(13),commitId:"sha-b"}))])
    data.headChanges=[{occurredAt:time(12,14),commitId:"sha-b"}]
    const result=scorePullRequestV1(data)
    expect(result.totalPoints).toBe(35)
    expect(result.components).toHaveLength(5)
    expect(result.participantTotals).toEqual([{participantId:"p2",points:19},{participantId:"p3",points:16}])
  })
})
