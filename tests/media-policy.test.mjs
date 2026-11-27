import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_FILE_BYTES,uploadLimitMessage} from '../src/media-policy.ts';
import {createSubmissionState,submitWithAttachments} from '../src/report-submission.ts';
function fixture({throws=false}={}) {
  const completed=[],errors=[],progress=[];let stops=0,released=0;
  const recorder={state:'inactive',mimeType:'video/mp4',start(timeslice){assert.equal(timeslice,250);if(throws)throw Error('unsupported');this.state='recording';},stop(){stops++;this.state='inactive';}};
  const stream={getTracks:()=>[{stop(){released++;}}]};
  const session=startBoundedRecording(recorder,stream,{onProgress:n=>progress.push(n),onComplete:(file,automatic)=>completed.push({file,automatic}),onError:e=>errors.push(e)});
  return {session,recorder,completed,errors,progress,stops:()=>stops,released:()=>released,chunk:data=>recorder.ondataavailable({data}),finish:()=>recorder.onstop()};
}
test('file limit accepts exactly 100 decimal MB and rejects the next byte before creating a report',async()=>{
  assert.equal(MAX_FILE_BYTES,100_000_000);
  let created=0;const services={createId:()=> 'new',save:async p=>{created++;return {id:p.id};},upload:async()=>{},remove:async()=>{}};
  for(const size of [60_000_000,100_000_000])await submitWithAttachments(createSubmissionState(),{},[{id:'video',kind:'video',file:{size,type:'video/mp4'}}],services);
  assert.equal(created,2);
  await assert.rejects(submitWithAttachments(createSubmissionState(),{},[{id:'video',kind:'video',file:{size:100_000_001,type:'video/mp4'}}],services),/100MB.*첨부할 수 없/);
  assert.equal(created,2);assert.match(uploadLimitMessage({type:'video/mp4'}),/영상/);
});
