import test from 'node:test';
import assert from 'node:assert/strict';
import {MAX_FILE_BYTES,RECORDING_STOP_BYTES,uploadLimitMessage,startBoundedRecording} from '../src/media-policy.ts';
import {createSubmissionState,submitWithAttachments} from '../src/report-submission.ts';
function fixture({throws=false}={}) {
  const completed=[],errors=[],progress=[];let stops=0,released=0;
  const recorder={state:'inactive',mimeType:'video/mp4',start(timeslice){assert.equal(timeslice,250);if(throws)throw Error('unsupported');this.state='recording';},stop(){stops++;this.state='inactive';}};
  const stream={getTracks:()=>[{stop(){released++;}}]};
  const session=startBoundedRecording(recorder,stream,{onProgress:n=>progress.push(n),onComplete:(file,automatic)=>completed.push({file,automatic}),onError:e=>errors.push(e)});
  return {session,recorder,completed,errors,progress,stops:()=>stops,released:()=>released,chunk:data=>recorder.ondataavailable({data}),finish:()=>recorder.onstop()};
}
test('file limit accepts exactly 100 decimal MB and rejects the next byte before creating a report',async()=>{
  assert.equal(MAX_FILE_BYTES,100_000_000);assert.ok(RECORDING_STOP_BYTES<MAX_FILE_BYTES);
  let created=0;const services={createId:()=> 'new',save:async p=>{created++;return {id:p.id};},upload:async()=>{},remove:async()=>{}};
  for(const size of [60_000_000,100_000_000])await submitWithAttachments(createSubmissionState(),{},[{id:'video',kind:'video',file:{size,type:'video/mp4'}}],services);
  assert.equal(created,2);
  await assert.rejects(submitWithAttachments(createSubmissionState(),{},[{id:'video',kind:'video',file:{size:100_000_001,type:'video/mp4'}}],services),/100MB.*첨부할 수 없/);
  assert.equal(created,2);assert.match(uploadLimitMessage({type:'video/mp4'}),/영상/);
});
test('recording stops before the hard limit, preserves the final encoder chunk and yields a complete bounded file',async()=>{
  const f=fixture();const data=new Uint8Array(RECORDING_STOP_BYTES);data.set(new TextEncoder().encode('HEADER'));
  f.chunk(new Blob([data]));assert.equal(f.stops(),1);assert.equal(f.completed.length,0);
  f.chunk(new Blob(['FINAL']));f.finish();
  assert.equal(f.completed.length,1);assert.equal(f.completed[0].automatic,true);
  const file=f.completed[0].file;assert.ok(file.size<=MAX_FILE_BYTES);assert.equal(file.size,RECORDING_STOP_BYTES+5);
  assert.equal(await file.slice(0,6).text(),'HEADER');assert.equal(await file.slice(-5).text(),'FINAL');assert.match(file.name,/\.mp4$/);assert.ok(f.released()>0);
});
test('oversized delayed chunks are stopped and rejected without trimming or attaching a corrupt video',()=>{
  const f=fixture();f.chunk({size:MAX_FILE_BYTES+1});f.finish();
  assert.equal(f.stops(),1);assert.equal(f.completed.length,0);assert.match(f.errors[0],/100MB/);assert.ok(f.released()>0);
});
test('manual stop attaches the video, while cancel, recorder failure and start failure release the camera',()=>{
  const manual=fixture();manual.chunk(new Blob(['video']));manual.session.stop();manual.finish();
  assert.equal(manual.completed[0].automatic,false);
  const cancelled=fixture();cancelled.chunk(new Blob(['video']));cancelled.session.cancel();cancelled.finish();assert.equal(cancelled.completed.length,0);assert.ok(cancelled.released()>0);
  const failed=fixture();failed.recorder.onerror();failed.finish();assert.equal(failed.completed.length,0);assert.equal(failed.errors.length,1);assert.ok(failed.released()>0);
  const start=fixture({throws:true});assert.equal(start.completed.length,0);assert.equal(start.errors.length,1);assert.ok(start.released()>0);
});
