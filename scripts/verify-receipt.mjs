import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyRun} from './receipt-policy.mjs';

const args=process.argv.slice(2),value=k=>{const i=args.indexOf(k);return i<0?undefined:args[i+1];};
const runId=value('--run-id');
if(!/^[1-9]\d*$/.test(runId||''))throw Error('Usage: node scripts/verify-receipt.mjs --run-id N [--head-sha SHA] [--save-dir PRIVATE_DIR] [--snapshot]');
const expectedHeadSha=value('--head-sha');
if(expectedHeadSha&&!/^[a-f0-9]{40}$/.test(expectedHeadSha))throw Error('Expected SHA must be a full 40-character GitHub commit SHA');
const policy=JSON.parse(readFileSync(fileURLToPath(new URL('../teacher/trusted-workflows.json',import.meta.url)),'utf8'));
const api=(path,binary=false)=>{
  try{return execFileSync('gh',['api','--method','GET',path],{encoding:binary?undefined:'utf8',maxBuffer:64*1024*1024,stdio:['ignore','pipe','pipe']});}
  catch{throw Error('GitHub API read failed. Check gh authentication, API availability, and the numeric run ID. Do not substitute log or local commit timestamps.');}
};
const run=JSON.parse(api(`repos/${policy.repository}/actions/runs/${runId}`));
if(!/^[a-f0-9]{40}$/.test(run.head_sha||''))throw Error('Server returned a malformed head SHA');
const content=JSON.parse(api(`repos/${policy.repository}/contents/${policy.workflowPath}?ref=${run.head_sha}`));
if(content.type!=='file'||content.encoding!=='base64')throw Error('Cannot read the workflow bytes at the server head SHA');
const workflowBytes=Buffer.from(content.content,'base64');
const receipt=verifyRun(run,{...policy,workflowBytes,expectedHeadSha});
const save=value('--save-dir');
if(save){const dir=resolve(save);mkdirSync(dir,{recursive:true});const prefix=`run-${runId}-${run.head_sha}`;
  writeFileSync(resolve(dir,prefix+'-api.json'),JSON.stringify(run,null,2)+'\n');
  writeFileSync(resolve(dir,prefix+'-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
  writeFileSync(resolve(dir,prefix+'-workflow.yml'),workflowBytes);
  if(args.includes('--snapshot')){if(!receipt.validMetadata)throw Error('Refusing to label an invalid receipt as a submission snapshot');writeFileSync(resolve(dir,prefix+'-snapshot.zip'),api(`repos/${policy.repository}/zipball/${run.head_sha}`,true));}
}else if(args.includes('--snapshot'))throw Error('--snapshot requires --save-dir pointing to a private teacher directory');
console.log(JSON.stringify(receipt,null,2));
if(!receipt.validMetadata)process.exitCode=2;
