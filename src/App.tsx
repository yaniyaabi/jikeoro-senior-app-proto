import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { loginPrototypeAccount, logoutPrototypeAccount, PrototypeUser, readPrototypeSession, registerPrototypeAccount } from "./auth";
import { deleteReport, getReportMedia, getReports, saveReport, StoredMedia, StoredReport } from "./storage";

type View = "home" | "report" | "history" | "rewards";
type AuthMode = "login" | "signup";
type MediaKind = "image" | "video" | "audio";
type Attachment = { id: string; kind: MediaKind; file: File; url: string };
type MediaPreview = StoredMedia & { url: string };
type LocationPoint = { latitude: number; longitude: number; accuracy: number };
type LocationMode = "gps" | "manual" | null;
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

function calculateParticipation(reports: StoredReport[]) {
  const now = new Date();
  const completedCount = reports.filter((report) => report.status === "완료").length;
  const lightingReportsThisMonth = reports.filter((report) => {
    if (report.riskType !== "조도") return false;
    const createdAt = new Date(report.createdAt);
    return createdAt.getFullYear() === now.getFullYear() && createdAt.getMonth() === now.getMonth();
  }).length;
  const missionProgress = Math.min(lightingReportsThisMonth, 3);
  const missionCompleted = missionProgress >= 3;
  return {
    completedCount,
    missionProgress,
    missionCompleted,
    points: reports.length * 100 + completedCount * 50 + (missionCompleted ? 150 : 0),
    level: reports.length === 0 ? 0 : Math.floor((reports.length - 1) / 3) + 1,
    firstBadge: reports.length >= 1,
    guardianBadge: reports.length >= 3,
    nightBadge: reports.some((report) => report.riskType === "조도"),
  };
}

function LocationPickerMap({ point, onChange }: { point: LocationPoint; onChange: (point: LocationPoint) => void }) {
  const mapElementRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pointRef = useRef(point);
  const onChangeRef = useRef(onChange);
  const [mapError, setMapError] = useState("");

  useEffect(() => { pointRef.current = point; }, [point]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  useEffect(() => {
    if (!mapElementRef.current || mapRef.current) return;
    let disposed = false;
    import("maplibre-gl").then((maplibregl) => {
      if (disposed || !mapElementRef.current) return;
      try {
        const map = new maplibregl.Map({
          container: mapElementRef.current,
          style: {
            version: 8,
            sources: {
              openStreetMap: {
                type: "raster",
                tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
                tileSize: 256,
                maxzoom: 19,
                attribution: "© OpenStreetMap contributors",
              },
            },
            layers: [{ id: "openStreetMap", type: "raster", source: "openStreetMap" }],
          },
          center: [pointRef.current.longitude, pointRef.current.latitude],
          zoom: 17,
          minZoom: 7,
          maxZoom: 19,
          attributionControl: {},
        });
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => { setMapError(""); map.resize(); });
        map.on("moveend", () => {
          const center = map.getCenter();
          onChangeRef.current({ ...pointRef.current, latitude: center.lat, longitude: center.lng });
        });
        mapRef.current = map;
      } catch {
        setMapError("지도를 불러오지 못했습니다. 장소를 직접 적어주세요.");
      }
    }).catch(() => setMapError("지도를 불러오지 못했습니다. 장소를 직접 적어주세요."));

    return () => {
      disposed = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  return (
    <div className="location-picker-map" aria-label="위험 장소 선택 지도">
      <div ref={mapElementRef} className="location-map-canvas" />
      {!mapError && <><span className="location-center-pin" aria-hidden="true">●</span><p className="location-map-guide">지도를 움직여 핀을 위험한 곳에 맞춰주세요.</p></>}
      {mapError && <p className="location-map-error" role="alert">{mapError}</p>}
    </div>
  );
}

function App() {
  const [currentUser, setCurrentUser] = useState<PrototypeUser | null>(() => readPrototypeSession());
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authName, setAuthName] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authPasswordConfirm, setAuthPasswordConfirm] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [view, setView] = useState<View>("home");
  const [step, setStep] = useState(1);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [riskType, setRiskType] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [locationMode, setLocationMode] = useState<LocationMode>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [place, setPlace] = useState("");
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<StoredReport | null>(null);
  const [detailMedia, setDetailMedia] = useState<MediaPreview[]>([]);
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
    if (!currentUser) {
      setReports([]);
      return;
    }
    getReports(currentUser.id).then(setReports).catch(() => setReports([]));
  }, [currentUser]);

  useEffect(() => {
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

  useEffect(() => {
    if (!selectedReport) {
      setDetailMedia([]);
      return;
    }
    let disposed = false;
    let urls: string[] = [];
    getReportMedia(selectedReport.id).then((media) => {
      if (disposed) return;
      const previews = media.map((item) => ({ ...item, url: URL.createObjectURL(item.blob) }));
      urls = previews.map((item) => item.url);
      setDetailMedia(previews);
    }).catch(() => setDetailMedia([]));
    return () => {
      disposed = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedReport]);

  const participation = useMemo(() => calculateParticipation(reports), [reports]);
  const progress = Math.min(100, (participation.missionProgress / 3) * 100);

  const pageTitle = useMemo(() => {
    if (view === "report") return step === 1 ? "위험 모습을 남겨주세요" : step === 2 ? "위험한 이유를 알려주세요" : step === 3 ? "위험한 장소를 확인해주세요" : step === 4 ? "제보내용을 확인해주세요" : "제보가 완료됐어요";
    if (view === "history") return "내가 남긴 기록";
    if (view === "rewards") return "참여와 마일리지";
    return "오늘도 안전하게 걸어요";
  }, [view, step]);

  const changeAuthMode = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthError("");
    setAuthPassword("");
    setAuthPasswordConfirm("");
  };

  const submitAuth = async (event: FormEvent) => {
    event.preventDefault();
    const email = authEmail.trim().toLowerCase();
    if (!email || !authPassword) {
      setAuthError("이메일과 비밀번호를 입력해주세요.");
      return;
    }
    if (authMode === "signup") {
      if (authName.trim().length < 2) {
        setAuthError("이름을 두 글자 이상 입력해주세요.");
        return;
      }
      if (authPassword.length < 8) {
        setAuthError("비밀번호는 8자 이상 입력해주세요.");
        return;
      }
      if (authPassword !== authPasswordConfirm) {
        setAuthError("비밀번호 확인이 맞지 않습니다.");
        return;
      }
    }
    setAuthLoading(true);
    setAuthError("");
    try {
      const user = authMode === "signup"
        ? await registerPrototypeAccount(authName, email, authPassword)
        : await loginPrototypeAccount(email, authPassword);
      setCurrentUser(user);
      setView("home");
      setAuthPassword("");
      setAuthPasswordConfirm("");
    } catch (authFailure) {
      setAuthError(authFailure instanceof Error ? authFailure.message : "로그인하지 못했습니다.");
    } finally {
      setAuthLoading(false);
    }
  };

  const logout = () => {
    logoutPrototypeAccount();
    setCurrentUser(null);
    setReports([]);
    setSelectedReport(null);
    setView("home");
  };

  const removeReport = async (report: StoredReport) => {
    if (!window.confirm("이 기록을 삭제할까요? 삭제하면 첨부한 사진·영상·음성도 함께 지워집니다.")) return;
    try {
      await deleteReport(report.id);
      setReports((current) => current.filter((item) => item.id !== report.id));
      setSelectedReport(null);
    } catch {
      setError("기록을 삭제하지 못했습니다. 잠시 후 다시 시도해주세요.");
    }
  };

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
    setLocationMode(null);
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
    setLocationMode("gps");
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
      setStep(3);
    } else if (step === 3) {
      if (!location && !place.trim()) {
        setError("현재 위치를 확인하거나 장소를 직접 적어주세요.");
        return;
      }
      setStep(4);
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
      userId: currentUser!.id,
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
      setReports((current) => [report, ...current]);
      setStep(5);
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

  if (!currentUser) {
    return (
      <div className="app-stage auth-stage">
        <div className="phone-app auth-phone">
          <main className="app-auth-page">
            <div className="app-auth-brand"><span>路</span><div><strong>지켜路</strong><small>우리 동네 쉬운 제보</small></div></div>
            <section className="app-auth-intro">
              <p>나의 기록을 한곳에서</p>
              <h1>함께 안전한 길을<br />만들어가요.</h1>
              <span>로그인하면 내가 남긴 제보와 처리 현황, 마일리지와 배지를 이어서 확인할 수 있습니다.</span>
            </section>
            <section className="app-auth-card">
              <div className="app-auth-tabs" role="tablist" aria-label="로그인 또는 회원가입 선택">
                <button type="button" role="tab" aria-selected={authMode === "login"} className={authMode === "login" ? "active" : ""} onClick={() => changeAuthMode("login")}>로그인</button>
                <button type="button" role="tab" aria-selected={authMode === "signup"} className={authMode === "signup" ? "active" : ""} onClick={() => changeAuthMode("signup")}>회원가입</button>
              </div>
              <div className="app-auth-heading"><h2>{authMode === "login" ? "다시 만나 반가워요." : "지켜路와 함께해요."}</h2><p>{authMode === "login" ? "가입한 이메일과 비밀번호를 입력해주세요." : "간단한 정보만 입력하면 바로 시작할 수 있어요."}</p></div>
              <form className="app-auth-form" onSubmit={submitAuth}>
                {authMode === "signup" && <label><span>이름</span><input value={authName} onChange={(event) => setAuthName(event.target.value)} autoComplete="name" placeholder="이름 입력" /></label>}
                <label><span>이메일</span><input type="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" /></label>
                <label><span>비밀번호</span><span className="app-password-field"><input type={showPassword ? "text" : "password"} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} autoComplete={authMode === "signup" ? "new-password" : "current-password"} placeholder={authMode === "signup" ? "8자 이상 입력" : "비밀번호 입력"} /><button type="button" onClick={() => setShowPassword((value) => !value)}>{showPassword ? "숨기기" : "보기"}</button></span></label>
                {authMode === "signup" && <label><span>비밀번호 확인</span><input type={showPassword ? "text" : "password"} value={authPasswordConfirm} onChange={(event) => setAuthPasswordConfirm(event.target.value)} autoComplete="new-password" placeholder="비밀번호를 다시 입력" /></label>}
                {authError && <p className="app-auth-error" role="alert">{authError}</p>}
                <button className="app-auth-submit" type="submit" disabled={authLoading}>{authLoading ? "확인하고 있습니다…" : authMode === "login" ? "로그인하기" : "회원가입하고 시작하기"}<span>→</span></button>
              </form>
              <p className="app-auth-switch">{authMode === "login" ? "아직 계정이 없나요?" : "이미 계정이 있나요?"} <button type="button" onClick={() => changeAuthMode(authMode === "login" ? "signup" : "login")}>{authMode === "login" ? "회원가입" : "로그인"}</button></p>
            </section>
            <p className="app-auth-note">현재는 화면과 사용 흐름을 확인하는 프로토타입입니다.<br />AWS 연결 후에는 홈페이지와 같은 계정·기록을 사용합니다.</p>
          </main>
        </div>
      </div>
    );
  }

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
                <div><p>안녕하세요, {currentUser.name}님</p><h1>오늘도 안전하게<br />걸어요.</h1><button className="logout-link" type="button" onClick={logout}>로그아웃</button></div>
                <div className="points-pill"><span>나의 마일리지</span><strong>{participation.points.toLocaleString()}P</strong><small>동네지킴이 Lv.{participation.level}</small></div>
              </section>

              <section className="report-hero">
                <span className="hero-icon">!</span>
                <div><p>길에서 불편하거나 위험한 곳을 발견하셨나요?</p><h2>60초면 제보할 수 있어요</h2></div>
                <button onClick={openReport}><span>＋</span> 위험요소 제보하기</button>
              </section>

              <section className="mission-card">
                <div className="mission-top"><span>이번 달 동네 미션</span><strong>+150P</strong></div>
                <h2>우리 동네 밤길을<br />한 번 더 살펴봐요</h2>
                <p>조명이 부족한 길 {participation.missionProgress}/3곳 기록</p>
                <div className="progress-track" aria-label={`미션 ${participation.missionProgress}/3 완료`}><span style={{ width: `${progress}%` }} /></div>
                <button onClick={openReport}>{participation.missionCompleted ? "미션 완료! 새 기록 남기기" : participation.missionProgress ? "한 곳 더 기록하기" : "첫 조명 기록하기"} <span>→</span></button>
              </section>

            </>
          )}

          {view === "report" && (
            <section className="report-flow">
              <div className="flow-heading">
                <button className="back-button" onClick={() => step > 1 && step < 5 ? setStep((value) => value - 1) : navigate("home")} aria-label="이전 화면">←</button>
                <div><p>{step < 5 ? `${step} / 4 단계` : "제보 완료"}</p><h1>{pageTitle}</h1></div>
              </div>
              {step < 5 && <div className="step-progress"><span style={{ width: `${(step / 4) * 100}%` }} /></div>}

              {step === 1 && (
                <div className="flow-card">
                  <p className="lead-text">사진이나 영상이 없어도 제보할 수 있습니다.</p>
                  <div className="capture-grid">
                    <label className="capture-button primary-capture">
                      <input type="file" accept="image/*" capture="environment" multiple onChange={addFiles} />
                      <span>📷</span><strong>사진 촬영·선택</strong><small>카메라 또는 사진첩</small>
                    </label>
                    <label className="capture-button">
                      <input type="file" accept="video/*" capture="environment" multiple onChange={addFiles} />
                      <span>▶</span><strong>영상 촬영·선택</strong><small>카메라 또는 보관함</small>
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
                  <p className="media-privacy">얼굴과 차량번호가 보이면 제출 전에 확인해주세요. 첨부자료는 이 기기에 저장됩니다.</p>
                  <button className="next-button" onClick={goNext}>{attachments.length ? "선택한 자료와 계속하기" : "자료 없이 계속하기"}<span>→</span></button>
                </div>
              )}

              {step === 2 && (
                <div className="flow-card">
                  <fieldset className="risk-fieldset">
                    <legend>위험요소 유형</legend>
                    <div className="risk-grid">
                      {riskTypes.map((item) => (
                        <button type="button" className={riskType === item.name ? "selected" : ""} onClick={() => setRiskType(item.name)} key={item.name}>
                          <span>{item.icon}</span><strong>{item.name}</strong><small>{item.help}</small>
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <label className="description-field separated-description">
                    <span>설명</span>
                    <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="예: 보도 턱이 높아서 보행기가 걸려요." rows={5} />
                  </label>
                  <div className="voice-actions">
                    <button type="button" className={listening ? "active" : ""} onClick={startSpeechInput}><span>🎤</span><strong>{listening ? "듣고 있어요…" : "말로 글쓰기"}</strong><small>말한 내용이 글로 적혀요</small></button>
                    <button type="button" className={recording ? "recording" : ""} onClick={recording ? stopAudioRecording : startAudioRecording}><span>●</span><strong>{recording ? `${recordingSeconds}초 · 녹음 끝내기` : "현장음 녹음"}</strong><small>현장의 소리를 파일로 남겨요</small></button>
                  </div>
                  {attachments.some((item) => item.kind === "audio") && (
                    <div className="audio-attachment-list" aria-label="녹음한 현장음">
                      {attachments.filter((item) => item.kind === "audio").map((item) => (
                        <article key={item.id}><span>♪</span><audio src={item.url} controls /><button type="button" onClick={() => removeAttachment(item.id)} aria-label="현장음 삭제">×</button></article>
                      ))}
                    </div>
                  )}
                  <div className="quick-phrases">
                    <span>자주 쓰는 말</span>
                    <button type="button" onClick={() => setDescription("보행기 바퀴가 걸릴 만큼 높이 차이가 커요.")}>보행기가 걸려요</button>
                    <button type="button" onClick={() => setDescription("길이 어두워서 바닥이 잘 보이지 않아요.")}>길이 너무 어두워요</button>
                  </div>
                  <button className="next-button" onClick={goNext}>위치 입력하기<span>→</span></button>
                </div>
              )}

              {step === 3 && (
                <div className="flow-card">
                  <fieldset className="location-fieldset">
                    <legend>위치</legend>
                    <p className="location-guide">GPS 지도의 핀을 맞추거나 알고 있는 장소를 직접 적어주세요.</p>
                    <div className="location-methods">
                      <button type="button" className={locationMode === "gps" ? "selected" : ""} onClick={requestLocation}><span>⌖</span><strong>현재 위치 사용</strong></button>
                      <button type="button" className={locationMode === "manual" ? "selected" : ""} onClick={() => { setLocationMode("manual"); setLocation(null); setLocationMessage(""); }}><span>⌨</span><strong>직접 입력</strong></button>
                    </div>
                    {locationMode === "gps" && !location && locationMessage && <p className="location-message">{locationMessage}</p>}
                    {locationMode === "gps" && location && (
                      <div className="gps-map-block">
                        <LocationPickerMap point={location} onChange={setLocation} />
                        <div className="gps-map-meta">
                          <strong><span>●</span> 선택한 위치</strong>
                          <small>위도 {location.latitude.toFixed(5)} · 경도 {location.longitude.toFixed(5)}</small>
                          <button type="button" onClick={requestLocation}>현재 위치로 돌아가기</button>
                        </div>
                      </div>
                    )}
                    {locationMode === "manual" && (
                      <label className="place-field"><span>어디 앞인지 알려주세요</span><input value={place} onChange={(event) => setPlace(event.target.value)} placeholder="예: 우리 동네 주민센터 앞 횡단보도" /></label>
                    )}
                    <p className="location-privacy">위치정보는 이 위험 기록의 장소를 확인하는 용도로만 사용됩니다.</p>
                  </fieldset>
                  <button className="next-button" onClick={goNext}>제보내용 확인하기<span>→</span></button>
                </div>
              )}

              {step === 4 && (
                <form className="flow-card" onSubmit={submitReport}>
                  <div className="review-card standalone-review">
                    <h2>제보내용 확인</h2>
                    <dl>
                      <div><dt>위험유형</dt><dd>{riskType}</dd></div>
                      <div><dt>위치</dt><dd>{locationMode === "gps" && location ? `지도에서 선택한 위치 (${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)})` : place}</dd></div>
                      <div><dt>첨부</dt><dd>사진 {attachments.filter((item) => item.kind === "image").length} · 영상 {attachments.filter((item) => item.kind === "video").length} · 음성 {attachments.filter((item) => item.kind === "audio").length}</dd></div>
                    </dl>
                  </div>
                  <div className="auto-save-info">
                    <span>날짜·시간 자동저장</span>
                    <strong>{new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date())}</strong>
                  </div>
                  <label className="consent-check"><input required type="checkbox" /><span>위치와 제보내용을 연구목적으로 수집하는 것에 동의합니다.</span></label>
                  <button className="next-button" disabled={saving} type="submit">{saving ? "저장하고 있습니다…" : "제보 완료하기"}<span>→</span></button>
                </form>
              )}

              {step === 5 && (
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
                  <article className="history-card-button" key={report.id} role="button" tabIndex={0} onClick={() => setSelectedReport(report)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") setSelectedReport(report); }}>
                    <div className="history-top"><span className="report-type">{report.riskType}</span><time>{formatDate(report.createdAt)}</time></div>
                    <h2>{report.description}</h2>
                    <p>◎ {report.place}</p>
                    <div className="history-status"><span>{report.status}</span><strong>{statusHelp[report.status]}</strong></div>
                    <div className="status-line"><i className="done">✓</i><span /><i className={report.status !== "접수" ? "done" : ""}>2</i><span /><i className={report.status === "조치 중" || report.status === "완료" ? "done" : ""}>3</i><span /><i className={report.status === "완료" ? "done" : ""}>4</i></div>
                    <small>접수　　현장 확인　　조치 진행　　개선 완료</small>
                    <b className="history-detail-hint">사진·내용 자세히 보기 →</b>
                  </article>
                ))}
                {!reports.length && <div className="empty-history"><span>＋</span><h2>아직 남긴 기록이 없습니다.</h2><p>첫 위험요소를 발견하면 사진이나 말로 간단히 알려주세요.</p></div>}
              </div>
              <button className="next-button" onClick={openReport}><span>＋</span>새로운 위험 제보하기</button>
            </section>
          )}

          {view === "rewards" && (
            <section className="plain-page rewards-page">
              <div className="plain-heading"><p>TOGETHER</p><h1>참여와 마일리지</h1><span>작은 기록이 안전한 동네를 만듭니다.</span></div>
              <div className="total-points"><span>나의 마일리지</span><strong>{participation.points.toLocaleString()}P</strong><p>전체 제보 {reports.length}건 · 개선 완료 {participation.completedCount}건</p></div>
              <article className="large-mission">
                <div><span>이번 달 동네 미션</span><strong>{participation.missionProgress}/3 완료</strong></div>
                <h2>조명이 부족한 길<br />3곳을 기록해요</h2>
                <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
                <p>{participation.missionCompleted ? "축하합니다! 150P가 적립됐어요." : `${3 - participation.missionProgress}곳을 더 기록하면 150P를 받을 수 있어요.`}</p>
              </article>
              <section className="badge-section"><h2>내가 모은 배지</h2><div><span className={participation.firstBadge ? "earned" : ""}>1<small>첫 발견</small></span><span className={participation.guardianBadge ? "earned" : ""}>路<small>동네지킴이</small></span><span className={participation.nightBadge ? "earned" : ""}>☾<small>밤길 관찰자</small></span></div><p>{reports.length ? "기록을 이어가면 새로운 배지가 열립니다." : "첫 위험 기록을 남기면 ‘첫 발견’ 배지를 받습니다."}</p></section>
              <section className="why-card"><span>♥</span><div><h2>마일리지는 참여를 응원해요</h2><p>경쟁보다 꾸준한 참여를 돕기 위한 기능입니다. 실제 보상 방식은 주민과 함께 결정합니다.</p></div></section>
              {installPrompt && <button className="install-banner" onClick={installApp}><span>↓</span><div><strong>휴대전화에 지켜路 설치하기</strong><small>홈 화면에서 바로 열 수 있어요.</small></div></button>}
              <p className="prototype-note">현재 버전은 기능 시연용입니다. 제보와 파일은 이 기기의 브라우저에만 저장됩니다.</p>
            </section>
          )}
        </main>

        {selectedReport && (
          <div className="app-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedReport(null)}>
            <section className="app-detail-sheet" role="dialog" aria-modal="true" aria-labelledby="app-detail-title">
              <button className="app-detail-close" type="button" onClick={() => setSelectedReport(null)} aria-label="상세 내용 닫기">×</button>
              <div className="app-detail-heading"><span className="report-type">{selectedReport.riskType}</span><time>{formatDate(selectedReport.createdAt)}</time><h2 id="app-detail-title">{selectedReport.description}</h2><p>◎ {selectedReport.place}</p></div>
              <section className="app-detail-status"><span>{selectedReport.status}</span><strong>{statusHelp[selectedReport.status]}</strong></section>
              <section className="app-detail-media"><h3>첨부한 사진·영상·음성 <b>{selectedReport.mediaCount}</b></h3>
                {detailMedia.length ? <div>{detailMedia.map((item) => <figure key={item.id}>
                  {item.kind === "image" && <img src={item.url} alt="첨부한 위험 현장" />}
                  {item.kind === "video" && <video src={item.url} controls />}
                  {item.kind === "audio" && <audio src={item.url} controls />}
                  <figcaption>{item.kind === "image" ? "현장 사진" : item.kind === "video" ? "현장 영상" : "현장음"}</figcaption>
                </figure>)}</div> : <p>이 기록에는 첨부된 자료가 없습니다.</p>}
              </section>
              <dl className="app-detail-facts"><div><dt>위치</dt><dd>{selectedReport.place}</dd></div><div><dt>위치좌표</dt><dd>{selectedReport.latitude != null && selectedReport.longitude != null ? `${selectedReport.latitude.toFixed(5)}, ${selectedReport.longitude.toFixed(5)}` : "직접 입력한 장소"}</dd></div><div><dt>참여 포인트</dt><dd>100P</dd></div></dl>
              <button className="next-button" type="button" onClick={() => setSelectedReport(null)}>확인했습니다</button>
              <button className="app-detail-delete" type="button" onClick={() => removeReport(selectedReport)}>이 기록 삭제하기</button>
            </section>
          </div>
        )}

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
