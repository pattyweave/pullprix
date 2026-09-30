// Rollback-only integration of the real SQL loader, TypeScript engine, and SQL
// ledger writer. Uses the same local fixture as pgTAP; no hosted credentials.
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { spawn } from "node:child_process"
import { createInterface } from "node:readline"
import { createSeasonEntry, createSeasonSnapshot, sampleSeasonTimeline } from "../functions/_shared/season/snapshot.ts"
import { calculateReviewHealth } from "../functions/_shared/review-health/v1.ts"
import { calculateStandings } from "../functions/_shared/standings/v1.ts"
import { recomputeScores } from "../functions/process-jobs/scoring.ts"

const fixture = readFileSync(new URL("./database/pp041_reversible_scoring.test.sql", import.meta.url), "utf8").split("select is(pg_temp.input()")[0]
const fastReview = process.argv.includes("--initial-fallback")
const dismissalRepair = readFileSync(new URL("../migrations/20260928010000_pp041_dismissal_observation_time.sql", import.meta.url), "utf8")
const db = spawn("docker", ["exec", "-i", "supabase_db_pullprix", "psql", "-U", "postgres", "-At", "-q", "-v", "ON_ERROR_STOP=1"], { stdio: ["pipe", "pipe", "inherit"] })
let verified = false, failed = false
const lines = createInterface({ input: db.stdout })
const readInput = tag => `select '${tag}'||pg_temp.input()::text;\n`
function commit(bundle, result) {
  return `select public.commit_pull_request_scores('${bundle.input.pullRequest.id}',${bundle.revision},$score$${JSON.stringify(result)}$score$::jsonb);\n`
}
lines.on("line", line => {
  try {
    if (line.startsWith("AWARD:")) {
      const bundle = JSON.parse(line.slice(6)), result = recomputeScores(bundle)
      assert.equal(result.status, "complete")
      assert.equal(result.components.reduce((sum, c) => sum + c.points, 0), 8)
      if (fastReview) {
        assert.equal(bundle.input.reviews[0].creditBeforeReview, "unknown")
        assert.equal(result.components[0].creditBasis.kind, "initial_unconfigured")
      }
      db.stdin.write(commit(bundle, result) + commit(bundle, result) + `
        insert into public.webhook_deliveries(github_delivery_id,event_name,action,github_installation_id,status,received_at,payload)
        values(gen_random_uuid(),'pull_request_review','dismissed',12345,'processed',now(),jsonb_build_object(
          'repository',jsonb_build_object('id',1001),
          'review',jsonb_build_object('id',5001,'submitted_at',now()-interval '1 day'),
          'sender',jsonb_build_object('id',7001),
          'pull_request',jsonb_build_object('id',9001,'state','open','draft',false,
            'updated_at',now()-interval '1 day','head',jsonb_build_object('sha',repeat('1',40)))));
        select 'DISMISS_TIME:'||(occurred_at=now())::text from public.scoring_events where action='dismissed';
        ` +
        "select 'REPLAY:'||count(*) from public.score_component_changes;\n" +
        "select public.dismiss_github_review_contribution(12345,1001,9001,jsonb_build_object('source_github_id',5001,'source_version',repeat('d',64),'reviewer_github_user_id',7002,'dismissed_by_github_user_id',7001,'dismissed_at',now()-interval '1 day'));\n" +
        "update public.scoring_events set occurred_at=now()-interval '1 day' where action='dismissed';\n" +
        dismissalRepair + "\n" +
        "select 'REPAIRED:'||(superseded_at=now() and (metadata_json->'dismissal'->>'dismissed_at')::timestamptz=now())::text from public.review_contributions;\n" + readInput("DISMISS:"))
    } else if (line.startsWith("REPAIRED:")) {
      assert.equal(line, "REPAIRED:true")
    } else if (line.startsWith("DISMISS_TIME:")) {
      assert.equal(line, "DISMISS_TIME:true")
    } else if (line.startsWith("REPLAY:")) {
      assert.equal(line, "REPLAY:1")
    } else if (line.startsWith("DISMISS:")) {
      const bundle = JSON.parse(line.slice(8)), result = recomputeScores(bundle)
      assert.equal(result.status, "complete")
      assert.equal(bundle.input.reviews[0].creditBeforeReview, fastReview ? "unknown" : "unconfigured")
      assert.equal(bundle.input.reviews[0].effective, false)
      assert.equal(bundle.input.reviews[0].approvalDismissed, true)
      assert.equal(result.components.reduce((sum, c) => sum+c.points,0), 8)
      db.stdin.write(commit(bundle,result) +
        `select 'HEALTH:'||public.get_organization_review_health_input('${bundle.input.organizationId}')::text;\n` +
        `select 'STANDINGS:'||public.get_organization_standings_input('${bundle.input.organizationId}','${result.components[0].seasonId}')::text;\n` +
        "select 'REPLAY:'||count(*) from public.score_component_changes;\n" +
        "update public.review_contributions set metadata_json=metadata_json||jsonb_build_object('deletion_observed_at',now());\n" + readInput("REVERSE:"))
    } else if (line.startsWith("HEALTH:")) {
      const input = JSON.parse(line.slice(7))
      const result = calculateReviewHealth(input, new Date().toISOString())
      assert.equal(input.reviews.length, 1)
      assert.equal(result.current.usefulReviews, 1)
      assert.equal(result.current.participation.reviewers, 1)
      assert.equal(result.agingQueue.count, 0)
    } else if (line.startsWith("STANDINGS:")) {
      const input = JSON.parse(line.slice(10)), asOf = new Date().toISOString()
      const result = calculateStandings(input, asOf)
      const definition = { id: input.seasonId, version: 1, name: "Integration fixture", scoringPolicyVersion: "v1",
        themePack: { id: "fixture", version: "1", assetBaseUrl: "/fixture", integrity: "fixture" },
        progressPolicy: { version: "1", individualTargetPoints: 200, lateJoinFloor: .25, milestones: [] } }
      const entry = createSeasonEntry(input, definition.progressPolicy)
      const snapshot = createSeasonSnapshot(input, definition, entry, asOf)
      assert.equal(snapshot.participants[0].progress.normalized, .04)
      assert.equal(sampleSeasonTimeline(input, definition, entry, asOf).at(-1).participants[0].points, 8)
      assert.equal(result.totalPoints, 8)
      assert.equal(result.standings[0].rank, 1)
      assert.equal(result.standings[0].streak.best, 1)
      assert.equal(result.standings[0].components.length, 1)
      assert.equal(result.standings[1].status, "not_started")
    } else if (line.startsWith("REVERSE:")) {
      const bundle = JSON.parse(line.slice(8)), result = recomputeScores(bundle)
      assert.equal(result.components.length, 0)
      db.stdin.write(commit(bundle, result) +
        "select 'TOTAL:'||coalesce(sum(points),0) from public.score_components where status='effective';\n" +
        "select 'AUDIT:'||sum(points_delta)||':'||count(*) from public.score_component_changes;\nrollback;\n")
      db.stdin.end()
    } else if (line.startsWith("TOTAL:")) assert.equal(line, "TOTAL:0")
    else if (line.startsWith("AUDIT:")) { assert.equal(line, "AUDIT:0:2"); verified = true }
  } catch (error) {
    failed = true
    console.error(error)
    db.stdin.end("rollback;\n")
  }
})
db.on("close", code => {
  if (code || failed || !verified) process.exitCode = 1
  else console.log("PASS: +8 approval, idempotent replay, dismissal keeps 8, standings show rank 1 and streak 1, deletion reverses 8; all fixture data rolled back.")
})
db.stdin.write(fixture + (fastReview ? `
update public.pull_requests set opened_at=now()-interval '90 seconds';
update public.review_contributions set occurred_at=now()-interval '60 seconds';
` : "") + `
insert into public.scoring_events(delivery_id,pull_request_id,event_name,action,occurred_at,state,draft,head_sha)
  select gen_random_uuid(),id,'pull_request','opened',opened_at,'open',false,repeat('1',40) from public.pull_requests;
insert into public.review_gate_observations(pull_request_id,observed_at,head_sha,credit,latest_review_github_id)
  select id,${fastReview ? "now()-interval '30 seconds'" : "opened_at+interval '1 minute'"},repeat('1',40),'unconfigured',${fastReview ? "5001" : "null"} from public.pull_requests;
update public.pull_request_scoring set history_checked_at=now();
` + readInput("AWARD:"))
