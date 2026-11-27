// Decimal MB keeps the entire raw upload within Cloudflare's 100 MB request cap.
export const MAX_FILE_BYTES = 100_000_000;
export const RECORDING_STOP_BYTES = 95_000_000; // Reserve room for the encoder's final data chunk.
export function uploadLimitMessage(file: {type?:string}, kind?:string) {
  return kind === 'video' || file.type?.startsWith('video/')
    ? '영상 한 개는 100MB까지 올릴 수 있어요. 선택한 영상이 100MB를 넘어 첨부할 수 없어요. 더 짧거나 용량이 작은 영상을 선택해주세요.'
    : '파일 한 개는 100MB까지 올릴 수 있어요. 더 작은 파일을 선택해주세요.';
}
type RecordingOptions = {
  onProgress:(bytes:number)=>void;
  onComplete:(file:File,autoStopped:boolean)=>void;
  onError:(message:string)=>void;
};
export function startBoundedRecording(recorder:MediaRecorder, stream:MediaStream, options:RecordingOptions) {
  let chunks:Blob[]=[],size=0,stopping=false,finished=false,cancelled=false,automatic=false,failure='';
  const release=()=>stream.getTracks().forEach(track=>track.stop());
  const finish=()=>{
    if(finished)return;finished=true;release();
    if(cancelled){chunks=[];return;}
    if(failure || !size || size>MAX_FILE_BYTES){chunks=[];options.onError(failure || '촬영한 영상을 저장하지 못했어요. 다시 촬영해주세요.');return;}
    const type=recorder.mimeType || 'video/webm';
    const file=new File(chunks,`현장영상-${Date.now()}.${type.includes('mp4')?'mp4':'webm'}`,{type});chunks=[];
    options.onComplete(file,automatic);
  };
  const stop=(auto=false)=>{
    automatic ||= auto;
    if(stopping || finished)return;stopping=true;
    if(recorder.state!=='inactive')recorder.stop();else finish();
  };
  recorder.ondataavailable=event=>{
    if(finished || cancelled || !event.data.size)return;
    size+=event.data.size;
    if(size>MAX_FILE_BYTES){failure='촬영 마무리 중 100MB를 넘었어요. 이 영상은 첨부하지 않았어요. 더 짧게 다시 촬영해주세요.';chunks=[];stop(true);return;}
    chunks.push(event.data);options.onProgress(size);
    if(size>=RECORDING_STOP_BYTES)stop(true);
  };
  recorder.onstop=finish;
  recorder.onerror=()=>{failure='영상 촬영이 중단됐어요. 카메라를 다시 열어 촬영해주세요.';stop();};
  try {recorder.start(250);}catch{failure='이 기기에서 영상 촬영을 시작하지 못했어요. 사진첩의 영상을 선택해주세요.';finish();}
  return {stop:()=>stop(),cancel:()=>{cancelled=true;chunks=[];stop();release();}};
}
