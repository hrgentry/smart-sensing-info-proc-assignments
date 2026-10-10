import {createHash} from 'node:crypto';

export function verifyRun(run, policy) {
  const errors=[];
  const actor=String(run.actor?.login||'').toLowerCase();
  const branch=String(run.head_branch||'');
  const headSha=String(run.head_sha||'');
  const workflowSha256=createHash('sha256').update(policy.workflowBytes).digest('hex');
  const version=policy.versions.find(v=>v.sha256===workflowSha256);
  const created=Date.parse(run.created_at),deadline=Date.parse(policy.deadlineUtc);
  if(String(run.repository?.full_name||'').toLowerCase()!==policy.repository.toLowerCase())errors.push('repository mismatch');
  if(run.event!=='push')errors.push('event must be push');
  if(run.path!==policy.workflowPath)errors.push('unexpected workflow path');
  if(!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(actor)||branch!==`student/${actor}`)errors.push('branch must equal student/<lowercase actor>');
  if(!/^[a-f0-9]{40}$/.test(headSha)||policy.expectedHeadSha&&headSha!==policy.expectedHeadSha)errors.push('head SHA mismatch or malformed SHA');
  if(!version)errors.push('head workflow is not a retained teacher-approved version');
  if(typeof run.created_at!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(run.created_at)||!Number.isFinite(created)||!Number.isFinite(deadline))errors.push('invalid server creation time or deadline');
  if(!Number.isSafeInteger(run.id)||run.id<=0)errors.push('invalid server run ID');
  return {
    schema:'verified-submission-receipt-v1',validMetadata:errors.length===0,errors,
    repository:run.repository?.full_name,actor,branch,headSha,runId:run.id,runAttempt:run.run_attempt,
    event:run.event,workflowPath:run.path,workflowSha256,workflowVersion:version?.version||null,
    runCreatedAt:run.created_at,runUrl:run.html_url,deadlineUtc:policy.deadlineUtc,
    timingStatus:!Number.isFinite(created)?'unavailable':created<=deadline?'within-run-creation-cutoff':'after-cutoff-needs-teacher-review',
    timeMeaning:'GitHub server workflow run creation time; not the exact arrival time of a push',
    contentAssessed:false
  };
}
