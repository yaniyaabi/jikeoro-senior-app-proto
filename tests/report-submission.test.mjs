import test from 'node:test';
import assert from 'node:assert/strict';
import {createSubmissionState,submitWithAttachments} from '../src/report-submission.ts';
const attachment=id=>({id,kind:'image',file:new File(['photo bytes'],`${id}.jpg`,{type:'image/jpeg'})});

test('completion waits for every attachment and prevents simultaneous double submission',async()=>{
  const state=createSubmissionState();let finishUpload;
  const gate=new Promise(resolve=>{finishUpload=resolve;});let complete=false;
  const services={createId:()=> 'new-report',save:async payload=>({id:payload.id}),upload:async()=>gate,remove:async()=>{}};
  const pending=submitWithAttachments(state,{},[attachment('one')],services).then(id=>{complete=true;return id;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(state.busy,true);assert.equal(complete,false);
  await assert.rejects(()=>submitWithAttachments(state,{},[],services),/저장하고/);
  finishUpload();assert.equal(await pending,'new-report');assert.equal(state.busy,false);
});
test('a failed photo rolls back only the new report, preserves selected files and allows a clean retry',async()=>{
  const state=createSubmissionState(),files=[attachment('first'),attachment('second')];
  const records=new Map([['previous-report',['existing photo']]]);let number=0,fail=true;
  const services={createId:()=>`attempt-${++number}`,save:async payload=>{records.set(payload.id,[]);return {id:payload.id};},upload:async(id,item)=>{if(item.id==='second' && fail)throw new Error('NAS EBUSY');records.get(id).push(item.id);},remove:async id=>{records.delete(id);}};
  await assert.rejects(()=>submitWithAttachments(state,{title:'제보'},files,services),/NAS EBUSY/);
  assert.deepEqual([...records.keys()],['previous-report']);assert.equal(state.pendingId,null);assert.equal(files.length,2);
  assert.equal(await files[0].file.text(),'photo bytes');
  fail=false;assert.equal(await submitWithAttachments(state,{title:'제보'},files,services),'attempt-2');
  assert.deepEqual(records.get('attempt-2'),['first','second']);assert.deepEqual(records.get('previous-report'),['existing photo']);
});
test('uncertain cleanup blocks another report until the previous attempt is resolved',async()=>{
  const state=createSubmissionState();let created=0,clean=false;
  const services={createId:()=>`report-${++created}`,save:async payload=>({id:payload.id}),upload:async()=>{throw new Error('connection reset');},remove:async()=>{if(!clean)throw new Error('cleanup offline');}};
  await assert.rejects(()=>submitWithAttachments(state,{},[attachment('one')],services),/저장 상태/);
  assert.equal(state.pendingId,'report-1');
  await assert.rejects(()=>submitWithAttachments(state,{},[attachment('one')],services));assert.equal(created,1);
  clean=true;services.upload=async()=>{};
  assert.equal(await submitWithAttachments(state,{},[attachment('one')],services),'report-2');assert.equal(state.pendingId,null);
});
test('oversized files are rejected before any report is created',async()=>{
  let saves=0;const state=createSubmissionState();
  await assert.rejects(()=>submitWithAttachments(state,{},[{id:'big',kind:'video',file:{size:51*1024*1024}}],{createId:()=> 'report',save:async()=>{saves++;return {id:'report'};},upload:async()=>{},remove:async()=>{}}),/50MB/);
  assert.equal(saves,0);assert.equal(state.busy,false);
});
