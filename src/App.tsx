import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { getReports, saveReport, seedReports, StoredMedia, StoredReport } from "./storage";

type View = "home" | "report" | "history" | "rewards";
type MediaKind = "image" | "video" | "audio";
type Attachment = { id: string; kind: MediaKind; file: File; url: string };
type LocationPoint = { latitude: number; longitude: number; accuracy: number };
type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<{ 0: { transcript: string } }> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
};

const riskTypes = [
  { name: "단차", icon: "▰", help: "보도 턱·높이 차이" },
  { name: "포트홀", icon: "◉", help: "도로·보도의 구멍" },
  { name: "조도", icon: "☾", help: "어둡고 잘 안 보임" },
  { name: "적치물", icon: "▦", help: "통행을 막는 물건" },
  { name: "기타", icon: "+", help: "그 밖의 위험" },
];

const statusHelp: Record<StoredReport["status"], string> = {
  접수: "기록이 안전하게 접수됐어요.",
  "확인 중": "연구원이 위치와 내용을 살펴보고 있어요.",
  "조치 중": "담당 기관에서 개선을 진행하고 있어요.",
  완료: "현장 개선이 완료됐어요.",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function App() {
  const [view, setView] = useState<View>("home");
  const [step, setStep] = useState(1);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [riskType, setRiskType] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [place, setPlace] = useState("");
  const [reports, setReports] = useState<StoredReport[]>(seedReports);
  const [points, setPoints] = useState(() => Number(localStorage.getItem("jikeoro-senior-points") ?? 620));
  const [weeklyCount, setWeeklyCount] = useState(() => Number(localStorage.getItem("jikeoro-senior-weekly") ?? 2));
  const [contrast, setContrast] = useState(() => localStorage.getItem("jikeoro-senior-contrast") === "true");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [listening, setListening] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const attachmentsRef = useRef<Attachment[]>([]);

  useEffect(() => {
    getReports().then((stored) => {
      if (stored.length) setReports(stored);
    }).catch(() => undefined);
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handleInstall);
    return () => window.removeEventListener("beforeinstallprompt", handleInstall);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.contrast = contrast ? "high" : "normal";
    localStorage.setItem("jikeoro-senior-contrast", String(contrast));
  }, [contrast]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recognitionRef.current?.stop();
  }, []);

  const progress = Math.min(100, (weeklyCount / 3) * 100);

  const pageTitle = useMemo(() => {
    if (view === "report") return step === 1 ? "위험 모습을 남겨주세요" : step === 2 ? "어떤 위험인지 알려주세요" : step === 3 ? "내용을 확인해주세요" : "제보가 완료됐어요";
    if (view === "history") return "내가 남긴 기록";
    if (view === "rewards") return "참여와 마일리지";
    return "오늘도 안전하게 걸어요";
  }, [view, step]);

  const speakPage = () => {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(pageTitle);
    utterance.lang = "ko-KR";
    utterance.rate = 0.86;
    window.speechSynthesis.speak(utterance);
  };

  const resetReport = () => {
    attachments.forEach((item) => URL.revokeObjectURL(item.url));
    setAttachments([]);
    setRiskType("");
    setDescription("");
    setLocation(null);
    setLocationMessage("");
    setPlace("");
    setError("");
    setStep(1);
  };

  const openReport = () => {
    resetReport();
    setView("report");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const oversized = files.find((file) => file.size > 80 * 1024 * 1024);
    if (oversized) {
      setError("파일 한 개는 80MB보다 작아야 합니다.");
      return;
    }
    setAttachments((current) => {
      const available = Math.max(0, 5 - current.length);
      if (files.length > available) setError("사진·영상·음성은 모두 합쳐 5개까지 넣을 수 있습니다.");
      return [...current, ...files.slice(0, available).map((file) => ({
        id: crypto.randomUUID(),
        kind: file.type.startsWith("video/") ? "video" as const : "image" as const,
        file,
        url: URL.createObjectURL(file),
      }))];
    });
  };

  const removeAttachment = (id: string) => {
    setAttachments((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return current.filter((item) => item.id !== id);
    });
  };

  const requestLocation = () => {
    setLocationMessage("현재 위치를 확인하고 있습니다.");
    if (!("geolocation" in navigator)) {
      setLocationMessage("위치 기능을 사용할 수 없습니다. 장소를 직접 적어주세요.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setLocationMessage(`현재 위치를 저장했습니다. 오차 약 ${Math.round(position.coords.accuracy)}m`);
      },
      () => setLocationMessage("위치를 확인하지 못했습니다. 아래에 장소를 직접 적어주세요."),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  };

  const startSpeechInput = () => {
    const speechWindow = window as typeof window & {
      SpeechRecognition?: new () => SpeechRecognitionLike;
      webkitSpeechRecognition?: new () => SpeechRecognitionLike;
    };
    const Recognition = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
    if (!Recognition) {
      setError("이 브라우저에서는 말로 글쓰기를 지원하지 않습니다. 음성 녹음이나 글쓰기를 이용해주세요.");
      return;
    }
    const recognition = new Recognition();
    recognition.lang = "ko-KR";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? "";
      setDescription((current) => `${current}${current ? " " : ""}${transcript}`);
    };
    recognition.onerror = () => setError("말을 잘 듣지 못했습니다. 다시 눌러 천천히 말씀해주세요.");
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setError("");
    setListening(true);
    recognition.start();
  };

  const startAudioRecording = async () => {
    if (!navigator.mediaDevices?.getUserMedia || !("MediaRecorder" in window)) {
      setError("이 기기에서는 음성 녹음을 사용할 수 없습니다.");
      return;
    }
    if (attachments.length >= 5) {
      setError("첨부파일은 모두 합쳐 5개까지 넣을 수 있습니다.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      streamRef.current = stream;
      recorderRef.current = recorder;
      audioChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) audioChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || "audio/webm";
        const blob = new Blob(audioChunksRef.current, { type });
        const file = new File([blob], `현장음성-${Date.now()}.webm`, { type });
        setAttachments((current) => [...current, {
          id: crypto.randomUUID(),
          kind: "audio" as const,
          file,
          url: URL.createObjectURL(file),
        }].slice(0, 5));
        stream.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        recorderRef.current = null;
        setRecording(false);
      };
      setError("");
      setRecordingSeconds(0);
      setRecording(true);
      recorder.start();
    } catch {
      setError("마이크 권한을 허용해주세요.");
    }
  };

  const stopAudioRecording = () => recorderRef.current?.stop();

  const goNext = () => {
    setError("");
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      if (!riskType) {
        setError("위험의 종류를 하나 선택해주세요.");
        return;
      }
      if (!location && !place.trim()) {
        setError("현재 위치를 확인하거나 장소를 직접 적어주세요.");
        return;
      }
      setStep(3);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const submitReport = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    const reportId = `report-${crypto.randomUUID()}`;
    const report: StoredReport = {
      id: reportId,
      riskType,
      description: description.trim() || "현장에서 발견한 위험요소입니다.",
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracy: location?.accuracy ?? null,
      place: place.trim() || "GPS로 저장한 위치",
      createdAt: new Date().toISOString(),
      status: "접수",
      mediaCount: attachments.length,
      points: 100,
    };
    const media: StoredMedia[] = attachments.map((item) => ({
      id: `${reportId}-${item.id}`,
      reportId,
      kind: item.kind,
      name: item.file.name,
      type: item.file.type,
      size: item.file.size,
      blob: item.file,
    }));
    try {
      await saveReport(report, media);
      setReports((current) => [report, ...current.filter((item) => item.id !== "demo-report-1")]);
      const nextPoints = points + 100;
      const nextWeekly = Math.min(3, weeklyCount + 1);
      setPoints(nextPoints);
      setWeeklyCount(nextWeekly);
      localStorage.setItem("jikeoro-senior-points", String(nextPoints));
      localStorage.setItem("jikeoro-senior-weekly", String(nextWeekly));
      setStep(4);
    } catch {
      setError("이 기기에 기록을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.");
    } finally {
      setSaving(false);
    }
  };

  const installApp = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const navigate = (next: View) => {
    if (next === "report") openReport();
    else {
      setView(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  return (
    <div className="app-stage">
      <div className="phone-app">
        <header className="app-header">
          <button className="brand-button" onClick={() => navigate("home")} aria-label="지켜로 홈">
            <span className="brand-symbol">路</span>
            <span><strong>지켜路</strong><small>쉬운 제보</small></span>
          </button>
          <div className="header-tools">
            <button onClick={speakPage} aria-label="현재 화면 제목 읽어주기"><span>♬</span> 읽어주기</button>
            <button onClick={() => setContrast((value) => !value)} aria-label="고대비 화면 전환"><span>◐</span> 고대비</button>
          </div>
        </header>

        <main className={`app-main ${view === "home" ? "home-main" : ""}`}>
          {view === "home" && (
            <>
              <section className="hello-card">
                <div><p>안녕하세요, 김지킴님</p><h1>오늘도 안전하게<br />걸어요.</h1></div>
                <div className="points-pill"><span>나의 마일리지</span><strong>{points.toLocaleString()}P</strong></div>
              </section>

              <section className="report-hero">
                <span className="hero-icon">!</span>
                <div><p>길에서 불편하거나 위험한 곳을 발견하셨나요?</p><h2>60초면 제보할 수 있어요</h2></div>
                <button onClick={openReport}><span>＋</span> 위험요소 제보하기</button>
              </section>

              <section className="mission-card">
                <div className="mission-top"><span>이번 주 동네 미션</span><strong>+200P</strong></div>
                <h2>우리 동네 위험요소를<br />한 번 더 살펴봐요</h2>
                <p>이번 주 제보 {weeklyCount}/3건</p>
                <div className="progress-track" aria-label={`미션 ${weeklyCount}/3 완료`}><span style={{ width: `${progress}%` }} /></div>
                <button onClick={openReport}>{weeklyCount >= 3 ? "미션 완료! 새 기록 남기기" : "한 곳 더 기록하기"} <span>→</span></button>
              </section>

            </>
          )}

          {view === "report" && (
            <section className="report-flow">
              <div className="flow-heading">
                <button className="back-button" onClick={() => step > 1 && step < 4 ? setStep((value) => value - 1) : navigate("home")} aria-label="이전 화면">←</button>
                <div><p>{step < 4 ? `${step} / 3 단계` : "제보 완료"}</p><h1>{pageTitle}</h1></div>
              </div>
              {step < 4 && <div className="step-progress"><span style={{ width: `${(step / 3) * 100}%` }} /></div>}

              {step === 1 && (
                <div className="flow-card">
                  <p className="lead-text">사진이나 영상이 없어도 제보할 수 있습니다.</p>
                  <div className="capture-grid">
                    <label className="capture-button primary-capture">
                      <input type="file" accept="image/*" capture="environment" onChange={addFiles} />
                      <span>📷</span><strong>지금 사진 찍기</strong><small>카메라가 열립니다</small>
                    </label>
                    <label className="capture-button">
                      <input type="file" accept="image/*,video/*" multiple onChange={addFiles} />
                      <span>🖼</span><strong>사진·영상 고르기</strong><small>기기에 있는 파일 선택</small>
                    </label>
                  </div>
                  {attachments.length > 0 && (
                    <div className="media-list">
                      {attachments.map((item) => (
                        <article key={item.id}>
                          {item.kind === "image" && <img src={item.url} alt="선택한 위험요소" />}
                          {item.kind === "video" && <video src={item.url} controls />}
                          {item.kind === "audio" && <div className="audio-preview">🎙<audio src={item.url} controls /></div>}
                          <button onClick={() => removeAttachment(item.id)} aria-label="첨부파일 삭제">×</button>
                        </article>
                      ))}
                    </div>
                  )}
                  <button className="next-button" onClick={goNext}>{attachments.length ? "다음 단계" : "사진 없이 계속하기"}<span>→</span></button>
                </div>
              )}

              {step === 2 && (
                <div className="flow-card">
                  <fieldset className="risk-fieldset">
                    <legend>위험의 종류를 선택해주세요</legend>
                    <div className="risk-grid">
                      {riskTypes.map((item) => (
                        <button type="button" className={riskType === item.name ? "selected" : ""} onClick={() => setRiskType(item.name)} key={item.name}>
                          <span>{item.icon}</span><strong>{item.name}</strong><small>{item.help}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <div className="location-box">
                    <h2>위험한 곳은 어디인가요?</h2>
                    <p>위치정보는 제보 장소를 확인할 때만 사용합니다.</p>
                    <button className={location ? "location-button success" : "location-button"} onClick={requestLocation}>
                      <span>{location ? "✓" : "◎"}</span>{location ? "현재 위치 저장됨" : "현재 위치 자동으로 찾기"}
                    </button>
                    {locationMessage && <p className="location-message">{locationMessage}</p>}
                    <label className="place-field"><span>또는 장소를 직접 적어주세요</span><input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="예: 성수역 2번 출구 앞" /></label>
                  </div>
                  <button className="next-button" onClick={goNext}>다음 단계<span>→</span></button>
                </div>
              )}

              {step === 3 && (
                <form className="flow-card" onSubmit={submitReport}>
                  <label className="description-field">
                    <span>무엇이 위험했나요?</span>
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="예: 보도 턱이 높아서 보행기가 걸려요." rows={5} />
                  </label>
                  <div className="voice-actions">
                    <button type="button" className={listening ? "active" : ""} onClick={startSpeechInput}><span>🎤</span><strong>{listening ? "듣고 있어요…" : "말로 글쓰기"}</strong><small>말한 내용이 글로 적혀요</small></button>
                    <button type="button" className={recording ? "recording" : ""} onClick={recording ? stopAudioRecording : startAudioRecording}><span>●</span><strong>{recording ? `${recordingSeconds}초 · 녹음 끝내기` : "현장음 녹음"}</strong><small>목소리를 파일로 남겨요</small></button>
                  </div>
                  <div className="quick-phrases">
                    <span>자주 쓰는 말</span>
                    <button type="button" onClick={() => setDescription("보행기 바퀴가 걸릴 만큼 높이 차이가 커요.")}>보행기가 걸려요</button>
                    <button type="button" onClick={() => setDescription("길이 어두워서 바닥이 잘 보이지 않아요.")}>길이 너무 어두워요</button>
                  </div>
                  <div className="review-card">
                    <h2>제보 내용 확인</h2>
                    <dl><div><dt>위험유형</dt><dd>{riskType}</dd></div><div><dt>위치</dt><dd>{place || "GPS로 저장한 위치"}</dd></div><div><dt>첨부</dt><dd>{attachments.length}개</dd></div></dl>
                  </div>
                  <label className="consent-check"><input required type="checkbox" /><span>위치와 제보 내용을 연구 목적으로 수집하는 것에 동의합니다.</span></label>
                  <button className="next-button" disabled={saving} type="submit">{saving ? "저장하고 있습니다…" : "제보 완료하기"}<span>→</span></button>
                </form>
              )}

              {step === 4 && (
                <div className="success-card">
                  <span className="success-icon">✓</span>
                  <p>안전한 동네를 만드는 기록</p>
                  <h1>제보가 잘<br />접수됐습니다!</h1>
                  <div className="reward-earned"><span>참여 마일리지</span><strong>+100P</strong></div>
                  <p className="success-copy">연구원이 내용을 확인하면<br />처리 상황을 알려드릴게요.</p>
                  <button className="next-button" onClick={() => navigate("history")}>내 기록 확인하기<span>→</span></button>
                  <button className="text-button" onClick={() => navigate("home")}>홈으로 돌아가기</button>
                </div>
              )}
              {error && <div className="error-message" role="alert"><span>!</span>{error}</div>}
            </section>
          )}

          {view === "history" && (
            <section className="plain-page">
              <div className="plain-heading"><p>MY REPORTS</p><h1>내가 남긴 기록</h1><span>제보가 어떻게 처리되고 있는지 확인할 수 있습니다.</span></div>
              <div className="history-list">
                {reports.map((report) => (
                  <article key={report.id}>
                    <div className="history-top"><span className="report-type">{report.riskType}</span><time>{formatDate(report.createdAt)}</time></div>
                    <h2>{report.description}</h2>
                    <p>◎ {report.place}</p>
                    <div className="history-status"><span>{report.status}</span><strong>{statusHelp[report.status]}</strong></div>
                    <div className="status-line"><i className="done">✓</i><span /><i className={report.status !== "접수" ? "done" : ""}>2</i><span /><i className={report.status === "조치 중" || report.status === "완료" ? "done" : ""}>3</i><span /><i className={report.status === "완료" ? "done" : ""}>4</i></div>
                    <small>접수　　현장 확인　　조치 진행　　개선 완료</small>
                  </article>
                ))}
              </div>
              <button className="next-button" onClick={openReport}><span>＋</span>새로운 위험 제보하기</button>
            </section>
          )}

          {view === "rewards" && (
            <section className="plain-page rewards-page">
              <div className="plain-heading"><p>TOGETHER</p><h1>참여와 마일리지</h1><span>작은 기록이 안전한 동네를 만듭니다.</span></div>
              <div className="total-points"><span>나의 마일리지</span><strong>{points.toLocaleString()}P</strong><p>이번 주 제보 {weeklyCount}건</p></div>
              <article className="large-mission">
                <div><span>이번 주 미션</span><strong>{weeklyCount}/3 완료</strong></div>
                <h2>우리 동네 위험요소<br />3곳을 기록해요</h2>
                <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                <p>{weeklyCount >= 3 ? "축하합니다! 200P 적립 준비가 완료됐어요." : `${3 - weeklyCount}곳을 더 기록하면 200P를 받을 수 있어요.`}</p>
              </article>
              <section className="badge-section"><h2>내가 모은 배지</h2><div><span className="earned">1<small>첫 발견</small></span><span className="earned">路<small>동네지킴이</small></span><span>☾<small>밤길 관찰자</small></span></div></section>
              <section className="why-card"><span>♥</span><div><h2>마일리지는 참여를 응원해요</h2><p>경쟁보다 꾸준한 참여를 돕기 위한 기능입니다. 실제 보상 방식은 주민과 함께 결정합니다.</p></div></section>
              {installPrompt && <button className="install-banner" onClick={installApp}><span>↓</span><div><strong>휴대전화에 지켜路 설치하기</strong><small>홈 화면에서 바로 열 수 있어요.</small></div></button>}
              <p className="prototype-note">현재 버전은 기능 시연용입니다. 제보와 파일은 이 기기의 브라우저에만 저장됩니다.</p>
            </section>
          )}
        </main>

        <nav className="bottom-nav" aria-label="앱 주요 메뉴">
          <button className={view === "home" ? "active" : ""} onClick={() => navigate("home")}><span>⌂</span><strong>홈</strong></button>
          <button className={view === "report" ? "active report-nav" : "report-nav"} onClick={() => navigate("report")}><span>＋</span><strong>제보</strong></button>
          <button className={view === "history" ? "active" : ""} onClick={() => navigate("history")}><span>▤</span><strong>내 기록</strong></button>
          <button className={view === "rewards" ? "active" : ""} onClick={() => navigate("rewards")}><span>★</span><strong>참여</strong></button>
        </nav>
      </div>
    </div>
  );
}

export default App;
