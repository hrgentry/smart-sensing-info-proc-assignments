import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
const version=process.argv[2];
if(!/^receipt-v[1-9]\d*$/.test(version||''))throw Error('Usage: node scripts/approve-workflow.mjs receipt-vN (teacher only)');
const file=root+'teacher/trusted-workflows.json';
let data;
try{data=JSON.parse(readFileSync(file,'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;data={schema:'teacher-trusted-workflows-v1',repository:'hrgentry/smart-sensing-info-proc-assignments',workflowPath:'.github/workflows/receipt.yml',deadlineUtc:'2026-10-21T15:59:59Z',versions:[]};}
const sha256=createHash('sha256').update(readFileSync(root+data.workflowPath)).digest('hex');
const prior=data.versions.find(v=>v.version===version);
if(prior&&prior.sha256!==sha256)throw Error('Never replace a previously approved version: use a new version and retain older entries');
if(!prior)data.versions.push({version,sha256,recordedAt:new Date().toISOString()});
writeFileSync(file,JSON.stringify(data,null,2)+'\n');
console.log(JSON.stringify({version,sha256,retainedVersions:data.versions.length}));
