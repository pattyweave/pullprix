// Rollback-only SQL -> scoring engine -> archive engine -> authenticated read -> uninstall/purge.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { createInterface } from 'node:readline'
import { recomputeScores } from '../functions/process-jobs/scoring.ts'
import { buildSeasonResult } from '../functions/process-jobs/season-finalization.ts'
import { activeSeason } from '../functions/_shared/season/activation.ts'
const fixture=readFileSync(new URL('./database/pp041_reversible_scoring.test.sql',import.meta.url),'utf8')
 .split('select is(pg_temp.input()')[0].replace('begin;', () => `begin;
do $$ begin if exists(select 1 from public.organizations) then raise exception 'Use an empty local test database; refusing mixed fixtures'; end if; end $$;`).replaceAll('now()',"timestamptz '2026-07-15T12:00:00Z'")
const db=spawn('docker',['exec','-i','supabase_db_pullprix','psql','-U','postgres','-At','-q','-v','ON_ERROR_STOP=1'],{stdio:['pipe','pipe','inherit']})
const lines=createInterface({input:db.stdout}); let failed=false, finished=false, saved
const timeout=setTimeout(()=>{failed=true;db.kill();console.error('Rehearsal timed out; database connection rolls back.')},30000)
function send(sql){db.stdin.write(sql+'\n')}
lines.on('line',line=>{try{
 if(line.startsWith('SCORE:')){
  const bundle=JSON.parse(line.slice(6)),score=recomputeScores(bundle)
  assert.equal(score.status,'complete',JSON.stringify(score.decisions));assert.equal(score.components.reduce((n,c)=>n+c.points,0),8)
  send(`select public.commit_pull_request_scores('${bundle.input.pullRequest.id}',${bundle.revision},$json$${JSON.stringify(score)}$json$::jsonb);
   insert into public.repository_backfills(repository_id,organization_id,status,completed_at)
    select id,organization_id,'completed',now() from public.repositories;
   select 'FINALIZE:'||public.get_season_finalization_inputs()::text;`)
 }else if(line.startsWith('FINALIZE:')){
  const bundle=JSON.parse(line.slice(9)).find(x=>x.seasonId==='2026-07');assert.ok(bundle)
  saved=buildSeasonResult(bundle);assert.equal(saved.totalPoints,8);assert.equal(saved.participants.filter(p=>p.champion).length,1)
  assert.equal(activeSeason('2026-08-03T12:00:00Z').id,'2026-08')
  send(`select 'COMMIT:'||public.commit_season_result('${bundle.organizationId}','2026-07','${bundle.revision}',$json$${JSON.stringify(saved)}$json$::jsonb)::text;
   insert into auth.users(id) values('08600000-0000-0000-0000-000000000001');
   insert into auth.identities(id,user_id,provider,provider_id,identity_data) values(gen_random_uuid(),'08600000-0000-0000-0000-000000000001','github','7001','{"sub":"7001","user_name":"author"}');
   insert into auth.sessions(id,user_id) values('08600000-0000-0000-0000-000000000002','08600000-0000-0000-0000-000000000001');
   select public.complete_team_access('08600000-0000-0000-0000-000000000001','08600000-0000-0000-0000-000000000002',12345,9876,true,true,null);
   select set_config('request.jwt.claims','{"sub":"08600000-0000-0000-0000-000000000001","role":"authenticated","session_id":"08600000-0000-0000-0000-000000000002"}',true);
   set local role authenticated;
   select 'ARCHIVE:'||public.get_season_history(12345,'2026-07')::text;
   reset role;`)
 }else if(line.startsWith('COMMIT:')) assert.equal(line,'COMMIT:true')
 else if(line.startsWith('ARCHIVE:')){
  assert.deepEqual(JSON.parse(line.slice(8)).snapshot,saved)
  send(`update public.score_components set points=10,component=jsonb_set(component,'{points}','10');
   select 'FROZEN:'||(snapshot->>'totalPoints') from public.season_results where season_id='2026-07';
   select * from public.apply_github_installation_lifecycle(12345,9876,'score-team','Organization','deleted',now(),'2026-07-12T12:00:00Z');
   select 'PURGE:'||public.process_data_deletions()::text;
   select 'REMAINING:'||(select count(*) from public.organizations)::text||':'||(select count(*) from public.score_components)::text||':'||(select count(*) from public.season_results)::text;
   select 'LATE:'||delivery_status from public.accept_github_delivery('08600000-0000-0000-0000-000000000003','pull_request','{"secret":"late payload"}',null,12345);
   rollback;
   select 'ROLLED_BACK:'||count(*) from private.deleted_installations where github_installation_id=12345;`)
  db.stdin.end()
 }else if(line.startsWith('FROZEN:'))assert.equal(line,'FROZEN:8')
 else if(line.startsWith('PURGE:'))assert.equal(line,'PURGE:1')
 else if(line.startsWith('REMAINING:'))assert.equal(line,'REMAINING:0:0:0')
 else if(line.startsWith('LATE:'))assert.equal(line,'LATE:ignored')
 else if(line.startsWith('ROLLED_BACK:')){assert.equal(line,'ROLLED_BACK:0');finished=true}
}catch(error){failed=true;console.error(error);db.kill()}})
db.on('close',code=>{clearTimeout(timeout);if(code||failed||!finished)process.exitCode=1;else console.log('PASS: SQL review -> +8 scored -> season finalized -> authenticated archive read -> later ledger change leaves archive frozen -> uninstall purges -> late webhook suppressed; all fixtures and tombstones rolled back.')})
send(fixture+`
 -- Model the roster that existed during this historical season. The current
 -- 60-day discovery rule correctly refuses to create it from an old replay.
 insert into public.participants(organization_id,github_user_id,display_name,joined_at,last_qualifying_activity_at)
 select o.id,u.id,u.login,'2026-07-13T12:00:00Z','2026-07-14T12:00:00Z'
 from public.organizations o cross join public.github_users u on conflict do nothing;
 insert into public.scoring_events(delivery_id,pull_request_id,event_name,action,occurred_at,state,draft,head_sha)
 select gen_random_uuid(),id,'pull_request','opened',opened_at,'open',false,repeat('1',40) from public.pull_requests;
 insert into public.review_gate_observations(pull_request_id,observed_at,head_sha,credit)
 select id,opened_at+interval '1 minute',repeat('1',40),'unconfigured' from public.pull_requests;
 update public.pull_request_scoring set history_checked_at=now();
 select 'SCORE:'||pg_temp.input()::text;`)
