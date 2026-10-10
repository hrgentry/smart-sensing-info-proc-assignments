import {readFileSync,realpathSync,lstatSync} from 'node:fs';
import {resolve,sep,isAbsolute,relative as relativePath,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const M=createRequire(import.meta.url)('../assignments/hw-02/model.js');
const trustedDefault=fileURLToPath(new URL('../',import.meta.url));

export function validateSubmission(base,login,trustedCheckout=trustedDefault) {
  const errors=[],messages=[];
  const fail=m=>errors.push(m);
  if(!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(login||''))return {validStructure:false,errors:['Use your lowercase GitHub login'],contentAssessed:false};
  let root;
  try{
    const checkout=resolve(trustedCheckout),expected=resolve(checkout,'submissions',login,'hw-02');
    if(lstatSync(checkout).isSymbolicLink()||resolve(base)!==expected)throw Error('Unexpected trusted checkout or personal path');
    let current=checkout;
    for(const part of relativePath(checkout,expected).split(sep)){current=join(current,part);if(lstatSync(current).isSymbolicLink())throw Error('Root or ancestor symbolic links are not allowed');}
    root=realpathSync(expected);
    if(!root.startsWith(realpathSync(checkout)+sep))throw Error('Submission leaves the trusted checkout');
  }catch(e){return {validStructure:false,errors:['Unsafe or missing submission root: '+e.message],contentAssessed:false};}
  const read=(relative,binary=false)=>{
    if(typeof relative!=='string'||!relative||isAbsolute(relative)||relative.includes('\\')||relative.split('/').some(s=>s==='..'||s===''))throw Error('Paths must be relative to your own HW02 directory');
    const p=resolve(root,relative);
    let current=root;for(const part of relativePath(root,p).split(sep)){current=join(current,part);if(lstatSync(current).isSymbolicLink())throw Error('Symbolic links are not allowed');}
    if(!p.startsWith(root+sep)||!realpathSync(p).startsWith(root+sep))throw Error('Path leaves your directory');
    return readFileSync(p,binary?undefined:'utf8');
  };
  let manifest,record;
  try{manifest=JSON.parse(read('manifest.json'));}catch(e){return {validStructure:false,errors:['manifest.json: '+e.message],contentAssessed:false};}
  if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))return {validStructure:false,errors:['manifest must be a JSON object'],contentAssessed:false};
  if(manifest.schema!=='hw02-submission-v1'||manifest.assignment!=='hw-02')fail('Unexpected manifest schema or assignment');
  if(manifest.githubLogin!==login)fail('Manifest GitHub login does not match your directory');
  if(!['laser','quality','curve'].includes(manifest.case))fail('Choose laser, quality or curve');
  if('commitSha' in manifest||'headSha' in manifest)fail('Do not put a self-referential submission SHA in the manifest');
  for(const k of ['report','aiDisclosure'])try{if(read(manifest[k]).trim().length<20)fail(k+' is empty');}catch(e){fail(k+': '+e.message);}
  try{record=JSON.parse(read(manifest.record));}catch(e){fail('record: '+e.message);return {validStructure:false,errors,contentAssessed:false};}
  if(!record||typeof record!=='object'||Array.isArray(record))return {validStructure:false,errors:[...errors,'record must be a JSON object'],contentAssessed:false};
  if(record.schema!=='hw02-record-v1'||record.modelVersion!=='v1'||record.case!==manifest.case)fail('Record schema/modelVersion/case mismatch');
  const status=record.completion?.status;
  if(!['complete','incomplete'].includes(status)||!Array.isArray(record.completion?.missing))fail('Record completion must be {status,missing:[]}');
  if(!Array.isArray(record.records)||!Array.isArray(record.archivedRounds))return {validStructure:false,errors:[...errors,'Record must retain records and archivedRounds arrays'],contentAssessed:false};
  if(record.records.some(r=>!r||typeof r!=='object'||Array.isArray(r)))return {validStructure:false,errors:[...errors,'Every record entry must be a JSON object'],contentAssessed:false};
  const date=v=>typeof v==='string'&&Number.isFinite(Date.parse(v));
  if(typeof record.roundId!=='string'||!record.roundId||!date(record.startedAt))fail('Missing roundId or local start time');
  const quadrants=['knownKnown','knownUnknown','implicitKnowledge','unknownUnknown'];
  const four=q=>q&&quadrants.every(k=>typeof q[k]==='string')&&Object.keys(q).length===4;
  const confidence=v=>Number.isFinite(v)&&v>=0&&v<=100;
  if(record.newRoundReason!==undefined&&(record.newRoundReason===null||typeof record.newRoundReason!=='object'||Array.isArray(record.newRoundReason)))fail('newRoundReason must retain its reason object');
  if(status==='complete'){
    const p=record.prediction,a=record.after,rs=record.records||[];
    if(!p||typeof p.statement!=='string'||!p.statement.trim()||typeof p.reason!=='string'||!p.reason.trim()||!confidence(p.confidence)||!four(p.initial4quadrants)||!date(p.lockedAt))fail('Complete record needs the locked first prediction, reason, confidence and four quadrants');
    const assessed=M.assessCompletion(record);
    if(assessed.status!=='complete')fail('Declared complete but the trusted case policy reports missing: '+assessed.missing.join(', '));
    if(new Set(rs.map(r=>r.recordId)).size!==rs.length)fail('Record IDs must be unique');
    for(const r of rs){
      if(!r.recordId||!date(r.at)||typeof r.operation!=='string'||r.modelVersion!=='v1'||!r.parameters||!r.readings||!r.parameters.units||!r.readings.units)fail('Each record needs ID/time/operation/version/parameters/readings/units');
      if(p?.lockedAt&&date(r.at)&&Date.parse(r.at)<Date.parse(p.lockedAt))fail('Experiment precedes the locked prediction');
    }
    if(!a||!four(a.updated4quadrants)||!date(a.savedAt)||!confidence(a.confidence)||typeof a.updatedStatement!=='string'||!a.updatedStatement.trim()||a.originalStatement!==p?.statement)fail('Complete record needs the saved update of the same original statement and updated four quadrants');
    if(a&&rs.some(r=>date(r.at)&&Date.parse(r.at)>Date.parse(a.savedAt)))fail('New evidence appeared after the update: save after again');
    if(Array.isArray(record.completion?.missing)&&record.completion.missing.length)fail('Complete record still declares missing work');
  }else if(status==='incomplete')messages.push('Truthful incomplete draft: structure only; it is not a completed assignment or content PASS');
  const shots=manifest.screenshots;
  if(!Array.isArray(shots))fail('screenshots must be a list of relative paths');
  else{
    if(status==='complete'&&(shots.length<2||new Set(shots).size!==shots.length))fail('Complete submission needs at least two different screenshots');
    for(const p of shots)try{const b=read(p,true),png=b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),jpg=b[0]===255&&b[1]===216&&b[2]===255;if(!png&&!jpg)fail('Not a PNG/JPEG screenshot: '+p);}catch(e){fail('screenshot: '+e.message);}
  }
  return {validStructure:errors.length===0,completion:status||'unknown',errors,messages,contentAssessed:false,timeMeaning:'Record times are local learning chronology, not server submission receipts'};
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const i=process.argv.indexOf('--login'),login=i<0?'':process.argv[i+1],root=fileURLToPath(new URL('../',import.meta.url));
  const result=validateSubmission(resolve(root,'submissions',login||'_missing_','hw-02'),login);
  console.log(JSON.stringify(result,null,2));if(!result.validStructure)process.exitCode=1;
}
