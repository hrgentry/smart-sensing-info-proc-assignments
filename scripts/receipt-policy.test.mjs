import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {verifyRun} from './receipt-policy.mjs';

const workflow = 'teacher-approved synthetic workflow fixture\n';
const hash = createHash('sha256').update(workflow).digest('hex');
const policy = {repository: 'hrgentry/smart-sensing-info-proc-assignments', workflowPath: '.github/workflows/receipt.yml', deadlineUtc: '2026-10-21T15:59:59Z', versions: [{version:'receipt-v1',sha256:hash}]};
const sha = 'a'.repeat(40);
const run = {id:42,run_attempt:1,repository:{full_name:policy.repository},event:'push',path:policy.workflowPath,head_branch:'student/example-learner',actor:{login:'Example-Learner'},head_sha:sha,created_at:policy.deadlineUtc,updated_at:'2026-10-22T00:00:00Z',html_url:`https://github.com/${policy.repository}/actions/runs/42`};
const check = (changes={},options={}) => verifyRun({...run,...changes},{...policy,workflowBytes:workflow,expectedHeadSha:sha,...options});

test('server creation time is inclusive at the last allowed second, ignores updated/local dates',()=>{
  const r=check();assert.equal(r.validMetadata,true);assert.equal(r.runCreatedAt,policy.deadlineUtc);assert.equal(r.timingStatus,'within-run-creation-cutoff');assert.equal(r.headSha,sha);assert.equal(r.contentAssessed,false);
});
test('after-cutoff run creates a review flag, never an automatic grade or penalty',()=>{
  const r=check({created_at:'2026-10-21T16:00:00Z'});assert.equal(r.validMetadata,true);assert.equal(r.timingStatus,'after-cutoff-needs-teacher-review');assert.equal('score' in r,false);
});
test('every server provenance condition is required',()=>{
  for(const change of [{event:'workflow_dispatch'},{path:'.github/workflows/other.yml'},{head_branch:'main'},{head_branch:'student/someone-else'},{head_sha:'b'.repeat(40)},{repository:{full_name:'other/repo'}},{created_at:'not-a-date'}])assert.equal(check(change).validMetadata,false,JSON.stringify(change));
});
test('teacher whitelist accepts retained old versions and rejects modified workflow bytes',()=>{
  assert.equal(check({}, {versions:[{version:'receipt-v1',sha256:hash},{version:'receipt-v2',sha256:'b'.repeat(64)}]}).validMetadata,true);
  assert.equal(check({}, {workflowBytes:workflow+'modified'}).validMetadata,false);
  assert.equal(check({}, {versions:[]}).validMetadata,false);
});
test('case normalization is explicit and timestamp belongs to the original run on rerun',()=>{
  const r=check({run_attempt:2,actor:{login:'EXAMPLE-LEARNER'},updated_at:'2027-01-01T00:00:00Z'});assert.equal(r.validMetadata,true);assert.equal(r.actor,'example-learner');assert.equal(r.runCreatedAt,policy.deadlineUtc);
});
