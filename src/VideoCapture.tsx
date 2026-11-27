import './video-capture.css';
import {useEffect,useRef,useState} from 'react';
import {MAX_FILE_BYTES,RECORDING_STOP_BYTES,startBoundedRecording} from './media-policy';

type Props={onCapture:(file:File,autoStopped:boolean)=>void;onClose:()=>void};
export function VideoCapture({onCapture,onClose}:Props) {
  const video=useRef<HTMLVideoElement>(null),stream=useRef<MediaStream|null>(null);
  const session=useRef<ReturnType<typeof startBoundedRecording>|null>(null);
  const callbacks=useRef({onCapture,onClose});callbacks.current={onCapture,onClose};
  const [ready,setReady]=useState(false),[recording,setRecording]=useState(false),[finishing,setFinishing]=useState(false);
  const [bytes,setBytes]=useState(0),[seconds,setSeconds]=useState(0),[error,setError]=useState('');
  useEffect(()=>{
    let disposed=false;
    const previous=document.body.style.overflow;document.body.style.overflow='hidden';
    const open=async()=>{
      if(!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder==='undefined'){setError('이 브라우저에서는 앱 안 영상 촬영을 지원하지 않아요. 사진첩에서 영상을 선택해주세요.');return;}
      try {
        const camera=await navigator.mediaDevices.getUserMedia({audio:true,video:{facingMode:{ideal:'environment'},width:{ideal:1920,max:1920},height:{ideal:1080,max:1080},frameRate:{ideal:30,max:30}}});
        if(disposed){camera.getTracks().forEach(t=>t.stop());return;}
        stream.current=camera;
        if(video.current){video.current.srcObject=camera;void video.current.play().catch(()=>{});}
        setReady(true);
      }catch{if(!disposed)setError('카메라와 마이크 권한을 확인해주세요. 다른 앱에서 카메라를 사용 중이면 닫고 다시 시도해주세요.');}
    };
    void open();
    const hidden=()=>{if(document.visibilityState==='hidden' && session.current){setFinishing(true);session.current.stop();}};
    const escape=(e:KeyboardEvent)=>{if(e.key==='Escape')callbacks.current.onClose();};
    document.addEventListener('visibilitychange',hidden);document.addEventListener('keydown',escape);
    return ()=>{disposed=true;session.current?.cancel();stream.current?.getTracks().forEach(t=>t.stop());document.body.style.overflow=previous;document.removeEventListener('visibilitychange',hidden);document.removeEventListener('keydown',escape);};
  },[]);
  useEffect(()=>{if(!recording)return;const t=setInterval(()=>setSeconds(s=>s+1),1000);return()=>clearInterval(t);},[recording]);
  const start=()=>{
    if(!stream.current || recording || finishing)return;
    setError('');setBytes(0);setSeconds(0);
    try {
      const mime=['video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/webm;codecs=vp8,opus','video/mp4','video/webm'].find(t=>MediaRecorder.isTypeSupported(t));
      const recorder=new MediaRecorder(stream.current,{...(mime?{mimeType:mime}:{}),videoBitsPerSecond:5_000_000,audioBitsPerSecond:128_000});
      setRecording(true);
      session.current=startBoundedRecording(recorder,stream.current,{
        onProgress:value=>{setBytes(value);if(value>=RECORDING_STOP_BYTES)setFinishing(true);},
        onComplete:(file,automatic)=>{setRecording(false);callbacks.current.onCapture(file,automatic);},
        onError:message=>{setError(message);setRecording(false);setReady(false);setFinishing(false);},
      });
    }catch{setError('영상 촬영을 시작하지 못했어요. 닫고 사진첩에서 영상을 선택해주세요.');stream.current.getTracks().forEach(t=>t.stop());setReady(false);}
  };
  const stop=()=>{setFinishing(true);session.current?.stop();};
  return <div className="jk-video-backdrop" data-jikeoro-video-capture="true"><section className="jk-video-dialog" role="dialog" aria-modal="true" aria-labelledby="jk-video-title">
    <div className="jk-video-heading"><h2 id="jk-video-title">영상 촬영</h2><button type="button" onClick={onClose} aria-label="촬영 취소하고 닫기">×</button></div>
    <p>영상은 한 개당 100MB까지 첨부할 수 있어요.</p>
    <video ref={video} autoPlay muted playsInline aria-label="촬영 중인 카메라 화면" />
    <div className="jk-video-status" role="status">{recording?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} · ${(bytes/1_000_000).toFixed(1)} / 100MB`:ready?'촬영 준비가 됐어요.':'카메라를 준비하고 있어요.'}</div>
    <progress max={MAX_FILE_BYTES} value={bytes} aria-label="촬영한 영상 용량" />
    <p className="jk-video-help">최대 FHD로 촬영하며, 100MB를 넘지 않도록 한도에 가까워지면 자동으로 촬영을 마쳐요.</p>
    {error && <p className="jk-video-error" role="alert">{error}</p>}
    <div className="jk-video-actions"><button type="button" onClick={onClose}>취소</button>{recording?<button type="button" disabled={finishing} onClick={stop}>{finishing?'영상 마무리 중…':'촬영 완료'}</button>:<button type="button" disabled={!ready} onClick={start}>촬영 시작</button>}</div>
  </section></div>;
}
