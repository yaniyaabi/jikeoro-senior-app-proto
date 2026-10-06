import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { loginPrototypeAccount, logoutPrototypeAccount, PrototypeUser, readPrototypeSession, registerPrototypeAccount } from "./auth";
import { deleteReport, getReportMedia, getReports, ReportStatus, saveReport, StoredMedia, StoredReport } from "./storage";

type View = "home" | "report" | "history" | "rewards";
type AuthMode = "login" | "signup";
type ActivityFilter = "all" | "active" | "completed";
type MediaKind = "image" | "video" | "audio";
type Attachment = { id: string; kind: MediaKind; file: File; url: string };
type MediaPreview = StoredMedia & { url: string };
type LocationPoint = { latitude: number; longitude: number; accuracy: number };
type LocationMode = "gps" | "manual" | null;
type MediaPickerKind = "image" | "video" | null;

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
  { name: "인도", icon: "category-sidewalk.png", help: "턱·파손·적치물" },
  { name: "횡단보도", icon: "category-crosswalk.png", help: "신호·노면·진입부" },
  { name: "조도", icon: "category-lighting.png", help: "어둡고 잘 안 보임" },
  { name: "날씨 관련 위험", icon: "category-weather.png", help: "비·눈·결빙·침수" },
  { name: "기타", icon: "category-other.png", help: "그 밖의 위험" },
];

const riskDetails: Record<string, { name: string; help: string; symbol: string }[]> = {
  인도: [
    { name: "보도 없음/끊김", help: "인도가 없거나 중간에 끊겨요", symbol: "∅" },
    { name: "턱/단차", help: "높이 차이로 바퀴가 걸려요", symbol: "↕" },
    { name: "보도 파손", help: "깨지거나 들뜬 곳이 있어요", symbol: "⌁" },
    { name: "적치물/통행 방해", help: "물건이나 시설물이 길을 막아요", symbol: "▣" },
    { name: "보도 폭 부족", help: "길이 좁아 지나가기 어려워요", symbol: "↔" },
    { name: "경사", help: "경사가 가팔라서 걷기 힘들어요", symbol: "∠" },
    { name: "미끄러운 노면", help: "바닥이 미끄러워요", symbol: "~" },
    { name: "기타 인도 위험", help: "위 항목에 없는 인도 문제예요", symbol: "+" },
  ],
  횡단보도: [
    { name: "보행시간 짧음", help: "시간 안에 건너기 어려워요", symbol: "◷" },
    { name: "신호기 문제", help: "신호등이나 음향신호가 불편해요", symbol: "◉" },
    { name: "노면표시 흐림", help: "횡단보도 선이 잘 보이지 않아요", symbol: "≡" },
    { name: "진입부 단차", help: "보도와 도로 사이 턱이 높아요", symbol: "↕" },
    { name: "시야 방해", help: "차량이나 시설물에 가려져요", symbol: "◐" },
    { name: "기타 횡단보도 위험", help: "위 항목에 없는 횡단보도 문제예요", symbol: "+" },
  ],
  조도: [
    { name: "가로등 부족", help: "주변에 불빛이 충분하지 않아요", symbol: "☼" },
    { name: "가로등 고장", help: "불이 꺼지거나 깜빡거려요", symbol: "×" },
    { name: "빛 가림", help: "나무나 시설물이 불빛을 가려요", symbol: "◒" },
    { name: "눈부심/명암 차이", help: "밝기 차이로 앞이 잘 안 보여요", symbol: "◑" },
    { name: "기타 조도 문제", help: "위 항목에 없는 밝기 문제예요", symbol: "+" },
  ],
  "날씨 관련 위험": [
    { name: "빗물/배수 불량", help: "물이 고이거나 잘 빠지지 않아요", symbol: "≈" },
    { name: "눈/결빙", help: "눈이나 얼음 때문에 위험해요", symbol: "✣" },
    { name: "침수", help: "물이 차서 지나가기 어려워요", symbol: "≋" },
    { name: "낙엽/흙", help: "쌓인 낙엽이나 흙 때문에 위험해요", symbol: "⌁" },
    { name: "기타 날씨 위험", help: "위 항목에 없는 날씨 문제예요", symbol: "+" },
  ],
  기타: [
    { name: "공사 구간", help: "공사 때문에 이동이 불편해요", symbol: "△" },
    { name: "계단/난간", help: "계단이나 손잡이가 위험해요", symbol: "⌜" },
    { name: "그 밖의 위험", help: "직접 설명이 필요한 문제예요", symbol: "+" },
  ],
};

const iconPath = (file: string) => `${import.meta.env.BASE_URL}icons/${file}`;
const appIconPath = `${import.meta.env.BASE_URL}icon-v2-192.png`;

function BrandName() {
  return <>지켜<span className="brand-hanja">路</span></>;
}

const REWARD_EXCHANGE_MINIMUM = 10_000;
const REWARD_FORM_URL = "https://docs.google.com/forms/d/e/1FAIpQLSd6PApYqiWa-HbE5LyGA8bKAecQshSCMu38oAD6E1xlUOWRVQ/viewform";
const REWARD_FORM_ENTRIES = {
  name: "entry.1605426205",
  email: "entry.1819571806",
  phone: "entry.1254984587",
  points: "entry.103413830",
};

const reportStatus: Record<ReportStatus, { label: string; defaultResponse: string }> = {
  received: {
    label: "접수 완료",
    defaultResponse: "기록이 안전하게 접수됐어요. 위치와 내용을 확인한 뒤 담당 기관을 연결할게요.",
  },
  review: {
    label: "현장 검토 중",
    defaultResponse: "담당자가 제보 내용을 검토하고 현장 확인 일정을 준비하고 있어요.",
  },
  action: {
    label: "조치 요청",
    defaultResponse: "현장 확인을 마치고 담당 기관에 개선 조치를 요청했어요.",
  },
  completed: {
    label: "개선 완료",
    defaultResponse: "담당 기관의 개선 조치가 완료됐어요.",
  },
};

const reportStage: Record<ReportStatus, number> = { received: 1, review: 2, action: 3, completed: 4 };

function reportResponse(report: StoredReport) {
  return report.response?.trim() || reportStatus[report.status].defaultResponse;
}

function reportDepartment(report: StoredReport) {
  return report.department?.trim() || "지켜路 운영팀";
}

function NavIcon({ name }: { name: "home" | "report" | "history" | "reward" }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {name === "home" && <><path d="M3.75 10.25 12 3.75l8.25 6.5" /><path d="M5.75 9.25v10a1.5 1.5 0 0 0 1.5 1.5h9.5a1.5 1.5 0 0 0 1.5-1.5v-10" /><path d="M9.5 20.75v-6.5h5v6.5" /></>}
      {name === "report" && <><path d="M5.25 4.25h13.5a2 2 0 0 1 2 2v8.25a2 2 0 0 1-2 2H11l-4.5 3v-3H5.25a2 2 0 0 1-2-2V6.25a2 2 0 0 1 2-2Z" /><path d="M12 7.75v5.5M9.25 10.5h5.5" /></>}
      {name === "history" && <><rect x="4.5" y="3.5" width="15" height="17" rx="2.5" /><path d="m8 9 1.3 1.3L12 7.7M13.8 9h2.4M8 15l1.3 1.3 2.7-2.6M13.8 15h2.4" /></>}
      {name === "reward" && <><path d="M12 20.5S4.25 16.15 4.25 9.75A4.25 4.25 0 0 1 12 7.3a4.25 4.25 0 0 1 7.75 2.45c0 6.4-7.75 10.75-7.75 10.75Z" /><path d="M12 7.3V4.5M8.4 5.55 7 3.55M15.6 5.55l1.4-2" /></>}
    </svg>
  );
}

function LocationPinIcon() {
  return (
    <span className="location-action-icon current-location-icon" aria-hidden="true">
      <svg viewBox="0 0 28 36"><path d="M14 1.5C7.1 1.5 1.5 7.1 1.5 14c0 9.5 12.5 20.5 12.5 20.5S26.5 23.5 26.5 14C26.5 7.1 20.9 1.5 14 1.5Z"/><circle cx="14" cy="13.5" r="5.8"/></svg>
    </span>
  );
}

function ManualInputIcon() {
  return (
    <span className="location-action-icon manual-location-icon" aria-hidden="true">
      <svg viewBox="0 0 32 24"><rect x="1" y="3" width="30" height="18" rx="3"/><path d="M6 8h2m3 0h2m3 0h2m3 0h2m3 0h1M6 12h2m3 0h2m3 0h2m3 0h2m3 0h1M7 16h18"/></svg>
    </span>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function calculateParticipation(reports: StoredReport[]) {
  const now = new Date();
  const completedCount = reports.filter((report) => report.status === "completed").length;
  const lightingReportsThisMonth = reports.filter((report) => {
    if (report.riskType !== "조도") return false;
    const createdAt = new Date(report.createdAt);
    return createdAt.getFullYear() === now.getFullYear() && createdAt.getMonth() === now.getMonth();
  }).length;
  const missionProgress = Math.min(lightingReportsThisMonth, 3);
  const missionCompleted = missionProgress >= 3;
  const points = reports.length * 100 + completedCount * 50 + (missionCompleted ? 150 : 0);
  return {
    completedCount,
    missionProgress,
    missionCompleted,
    points,
    level: Math.floor(points / 1_000),
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
  const [showLaunch, setShowLaunch] = useState(true);
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
  const [riskDetail, setRiskDetail] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState<LocationPoint | null>(null);
  const [locationMode, setLocationMode] = useState<LocationMode>(null);
  const [locationMessage, setLocationMessage] = useState("");
  const [place, setPlace] = useState("");
  const [reports, setReports] = useState<StoredReport[]>([]);
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [selectedReport, setSelectedReport] = useState<StoredReport | null>(null);
  const [detailMedia, setDetailMedia] = useState<MediaPreview[]>([]);
  const [contrast, setContrast] = useState(() => localStorage.getItem("jikeoro-senior-contrast") === "true");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [mediaPickerKind, setMediaPickerKind] = useState<MediaPickerKind>(null);
  const [rewardFormOpen, setRewardFormOpen] = useState(false);
  const [rewardPhone, setRewardPhone] = useState("");
  const [rewardFormError, setRewardFormError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const attachmentsRef = useRef<Attachment[]>([]);
  const imageCameraRef = useRef<HTMLInputElement>(null);
  const imageLibraryRef = useRef<HTMLInputElement>(null);
  const videoCameraRef = useRef<HTMLInputElement>(null);
  const videoLibraryRef = useRef<HTMLInputElement>(null);
  const riskDetailPanelRef = useRef<HTMLDivElement>(null);
  const mainContentRef = useRef<HTMLElement>(null);
  const speechRunRef = useRef(0);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setShowLaunch(false), reducedMotion ? 500 : 2300);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!currentUser) {
      setReports([]);
      return;
    }
    getReports(currentUser.id).then(setReports).catch(() => setReports([]));
  }, [currentUser]);

  useEffect(() => {
    document.documentElement.dataset.contrast = contrast ? "high" : "normal";
    localStorage.setItem("jikeoro-senior-contrast", String(contrast));
  }, [contrast]);

  useEffect(() => {
    speechRunRef.current += 1;
    window.speechSynthesis?.cancel();
    setSpeaking(false);
  }, [view, step]);

  useEffect(() => {
    if (!recording) return;
    const timer = window.setInterval(() => setRecordingSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, [recording]);

  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);

  useEffect(() => {
    if (!riskType || step !== 2 || view !== "report") return;
    const frame = window.requestAnimationFrame(() => {
      riskDetailPanelRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [riskType, step, view]);

  useEffect(() => () => {
    attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    recorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    recognitionRef.current?.stop();
    speechRunRef.current += 1;
    window.speechSynthesis?.cancel();
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

  useEffect(() => {
    if (!rewardFormOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setRewardFormOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [rewardFormOpen]);

  const participation = useMemo(() => calculateParticipation(reports), [reports]);
  const progress = Math.min(100, (participation.missionProgress / 3) * 100);
  const rewardExchangeRemaining = Math.max(0, REWARD_EXCHANGE_MINIMUM - participation.points);
  const rewardExchangeProgress = Math.min(100, (participation.points / REWARD_EXCHANGE_MINIMUM) * 100);
  const canExchangeReward = participation.points >= REWARD_EXCHANGE_MINIMUM;
  const visibleReports = useMemo(() => reports.filter((report) => {
    if (activityFilter === "completed") return report.status === "completed";
    if (activityFilter === "active") return report.status !== "completed";
    return true;
  }), [activityFilter, reports]);

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

  const openRewardForm = () => {
    setRewardPhone(localStorage.getItem("jikeoro-reward-phone") ?? "");
    setRewardFormError("");
    setRewardFormOpen(true);
  };

  const submitRewardForm = (event: FormEvent) => {
    event.preventDefault();
    if (!currentUser) return;
    const normalizedPhone = rewardPhone.replace(/\D/g, "");
    if (normalizedPhone.length < 10 || normalizedPhone.length > 11) {
      setRewardFormError("휴대전화 번호를 정확히 입력해주세요.");
      return;
    }
    if (REWARD_FORM_URL.includes("FORM_ID")) {
      setRewardFormError("신청 양식을 연결하는 중입니다. 잠시 후 다시 시도해주세요.");
      return;
    }
    localStorage.setItem("jikeoro-reward-phone", rewardPhone.trim());
    const formUrl = new URL(REWARD_FORM_URL);
    formUrl.searchParams.set("usp", "pp_url");
    formUrl.searchParams.set(REWARD_FORM_ENTRIES.name, currentUser.name);
    formUrl.searchParams.set(REWARD_FORM_ENTRIES.email, currentUser.email);
    formUrl.searchParams.set(REWARD_FORM_ENTRIES.phone, rewardPhone.trim());
    formUrl.searchParams.set(REWARD_FORM_ENTRIES.points, `${participation.points}P`);
    window.open(formUrl.toString(), "_blank", "noopener,noreferrer");
    setRewardFormOpen(false);
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

    if (speaking) {
      speechRunRef.current += 1;
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }

    const openDialog = document.querySelector<HTMLElement>('.phone-app [role="dialog"]');
    const readingTarget = openDialog ?? mainContentRef.current;
    if (!readingTarget) return;

    const fieldValues = Array.from(readingTarget.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>("input, textarea, select"))
      .filter((field) => field.type !== "file" && field.type !== "password" && field.value.trim())
      .map((field) => {
        const label = field.getAttribute("aria-label") || field.closest("label")?.querySelector("span")?.textContent || "입력 내용";
        return `${label}, ${field.value.trim()}`;
      });
    const navigationText = openDialog ? "" : document.querySelector<HTMLElement>(".bottom-nav")?.innerText ?? "";
    const readableText = [readingTarget.innerText, ...fieldValues, navigationText]
      .join(". ")
      .replace(/\s+/g, " ")
      .trim();
    if (!readableText) return;

    const chunks = readableText.match(/.{1,150}(?:\s+|$)/g)?.map((chunk) => chunk.trim()).filter(Boolean) ?? [readableText];
    const runId = speechRunRef.current + 1;
    speechRunRef.current = runId;
    window.speechSynthesis.cancel();
    setSpeaking(true);

    const speakChunk = (index: number) => {
      if (speechRunRef.current !== runId) return;
      if (index >= chunks.length) {
        setSpeaking(false);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(chunks[index]);
      utterance.lang = "ko-KR";
      utterance.rate = 0.86;
      utterance.onend = () => speakChunk(index + 1);
      utterance.onerror = () => {
        if (speechRunRef.current === runId) setSpeaking(false);
      };
      window.speechSynthesis.speak(utterance);
    };

    speakChunk(0);
  };

  const resetReport = () => {
    attachments.forEach((item) => URL.revokeObjectURL(item.url));
    setAttachments([]);
    setRiskType("");
    setRiskDetail("");
    setDescription("");
    setLocation(null);
    setLocationMode(null);
    setLocationMessage("");
    setPlace("");
    setError("");
    setMediaPickerKind(null);
    setStep(1);
  };

  const openReport = () => {
    resetReport();
    setView("report");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addFiles = (event: ChangeEvent<HTMLInputElement>) => {
    setMediaPickerKind(null);
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (!files.length) return;
    const oversized = files.find((file) => file.size > 80 * 1024 * 1024);
    if (oversized) {
      setError("파일 한 개는 80MB보다 작아야 합니다.");
      return;
    }
    setError("");
    setAttachments((current) => {
      const available = Math.max(0, 5 - current.length);
      if (files.length > available) setError("사진·영상·음성은 모두 합쳐 5개까지 넣을 수 있습니다.");
      return [...current, ...files.slice(0, available).map((file) => ({
        id: crypto.randomUUID(),
        kind: file.type.startsWith("video/") ? "video" as const : file.type.startsWith("audio/") ? "audio" as const : "image" as const,
        file,
        url: URL.createObjectURL(file),
      }))];
    });
  };

  const openNativeMediaPicker = (source: "image-camera" | "image-library" | "video-camera" | "video-library") => {
    const input = {
      "image-camera": imageCameraRef,
      "image-library": imageLibraryRef,
      "video-camera": videoCameraRef,
      "video-library": videoLibraryRef,
    }[source];
    setMediaPickerKind(null);
    input.current?.click();
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
      if (!riskDetail) {
        setError("선택한 위험의 세부 유형을 하나 골라주세요.");
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
    const createdAt = new Date().toISOString();
    const initialResponse = reportStatus.received.defaultResponse;
    const report: StoredReport = {
      id: reportId,
      userId: currentUser!.id,
      riskType,
      riskDetail,
      description: description.trim() || "현장에서 발견한 위험요소입니다.",
      latitude: location?.latitude ?? null,
      longitude: location?.longitude ?? null,
      accuracy: location?.accuracy ?? null,
      place: place.trim() || "GPS로 저장한 위치",
      createdAt,
      updatedAt: createdAt,
      status: "received",
      department: null,
      response: initialResponse,
      statusHistory: [{ status: "received", note: initialResponse, createdAt, department: null }],
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

  const navigate = (next: View) => {
    if (next === "report") openReport();
    else {
      setView(next);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  const launchScreen = showLaunch ? (
    <div className="launch-screen" role="status" aria-label="지켜로 앱을 시작합니다">
      <div className="launch-brand">
        <img className="launch-symbol" src={appIconPath} alt="" />
        <div className="launch-name"><strong><BrandName /></strong><span>JIKEORO</span></div>
        <i aria-hidden="true" />
        <p>우리 동네 보행안전 지도</p>
      </div>
      <small>함께 발견하고, 함께 바꾸는 길</small>
    </div>
  ) : null;

  if (!currentUser) {
    return (
      <div className="app-stage auth-stage">
        {launchScreen}
        <div className="phone-app auth-phone">
          <main className="app-auth-page">
            <div className="app-auth-brand"><img src={appIconPath} alt="" /><div><strong><BrandName /></strong><small>우리 동네 쉬운 제보</small></div></div>
            <section className="app-auth-intro">
              <p>나의 기록을 한곳에서</p>
              <h1>함께 안전한 길을<br />만들어가요.</h1>
              <span>로그인하면 내가 남긴 제보와 처리 현황, 마일리지를 이어서 확인할 수 있습니다.</span>
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
      {launchScreen}
      <div className="phone-app">
        <header className="app-header">
          <button className="brand-button" onClick={() => navigate("home")} aria-label="지켜로 홈">
            <img className="brand-symbol" src={appIconPath} alt="" />
            <span><strong><BrandName /></strong><small>쉬운 제보</small></span>
          </button>
          <div className="header-tools">
            <button onClick={speakPage} aria-label={speaking ? "읽어주기 중지" : "현재 화면 전체 읽어주기"}><span>{speaking ? "■" : "♬"}</span> {speaking ? "읽기 중지" : "읽어주기"}</button>
            <button onClick={() => setContrast((value) => !value)} aria-label="고대비 화면 전환"><span>◐</span> 고대비</button>
          </div>
        </header>

        <main ref={mainContentRef} className={`app-main ${view === "home" ? "home-main" : ""}`}>
          {view === "home" && (
            <>
              <section className="hello-card">
                <div>
                  <div className="hello-greeting"><p>안녕하세요, {currentUser.name}님</p><button className="logout-link" type="button" onClick={logout}>로그아웃</button></div>
                  <h1>오늘도 안전하게<br />걸어요.</h1>
                </div>
                <div className="points-pill"><span>나의 마일리지</span><strong>{participation.points.toLocaleString()}P</strong><small>동네지킴이 Lv.{participation.level}</small></div>
              </section>

              <section className="report-hero">
                <span className="hero-icon">!</span>
                <div><p>길에서 불편하거나 위험한 곳을 발견하셨나요?</p><h2>60초면 제보할 수 있어요</h2></div>
                <button onClick={openReport}><span>＋</span> 위험요소 제보하기</button>
              </section>

              <section className="report-guide-card" aria-labelledby="report-guide-title">
                <div className="report-guide-heading">
                  <span>처음이어도 괜찮아요</span>
                  <h2 id="report-guide-title">위험요소 제보 방법</h2>
                  <p>화면의 큰 버튼을 순서대로 누르면 됩니다.</p>
                </div>
                <ol className="report-guide-steps">
                  <li><b>1</b><span><strong>사진·영상</strong><small>찍거나 선택해요</small></span></li>
                  <li><b>2</b><span><strong>위험한 이유</strong><small>말하거나 골라요</small></span></li>
                  <li><b>3</b><span><strong>위치 확인</strong><small>지도를 확인해요</small></span></li>
                  <li><b>4</b><span><strong>내용 보내기</strong><small>확인하고 제출해요</small></span></li>
                </ol>
                <button onClick={openReport}>1단계부터 시작하기 <span>→</span></button>
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
                  <p className="lead-text">사진이나 영상을 촬영하거나 기기에 저장된 사진이나 영상을 선택해주세요.</p>
                  <div className="capture-grid">
                    <button type="button" className="capture-button primary-capture" onClick={() => setMediaPickerKind("image")}>
                      <img className="provided-media-icon" src={iconPath("camera.png")} alt="" /><strong>사진 촬영·선택</strong><small>카메라 또는 사진첩</small>
                    </button>
                    <button type="button" className="capture-button" onClick={() => setMediaPickerKind("video")}>
                      <img className="provided-media-icon" src={iconPath("video.png")} alt="" /><strong>영상 촬영·선택</strong><small>카메라 또는 보관함</small>
                    </button>
                  </div>
                  <input ref={imageCameraRef} className="capture-file-input" type="file" accept="image/*" capture="environment" onChange={addFiles} />
                  <input ref={imageLibraryRef} className="capture-file-input" type="file" accept="image/*" multiple onChange={addFiles} />
                  <input ref={videoCameraRef} className="capture-file-input" type="file" accept="video/*" capture="environment" onChange={addFiles} />
                  <input ref={videoLibraryRef} className="capture-file-input" type="file" accept="video/*" multiple onChange={addFiles} />
                  {mediaPickerKind && (
                    <div className="media-source-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setMediaPickerKind(null)}>
                      <section className="media-source-sheet" role="dialog" aria-modal="true" aria-labelledby="media-source-title">
                        <button type="button" className="media-source-close" onClick={() => setMediaPickerKind(null)} aria-label="닫기">×</button>
                        <img className="media-source-icon provided-source-icon" src={iconPath(mediaPickerKind === "image" ? "camera.png" : "video.png")} alt="" />
                        <h2 id="media-source-title">{mediaPickerKind === "image" ? "사진" : "영상"}을 어떻게 추가할까요?</h2>
                        <p>원하는 방법을 하나 골라주세요.</p>
                        <div className="media-source-actions">
                          <button type="button" onClick={() => openNativeMediaPicker(mediaPickerKind === "image" ? "image-camera" : "video-camera")}>
                            <span aria-hidden="true">{mediaPickerKind === "image" ? "📷" : "●"}</span>
                            <strong>지금 촬영</strong>
                            <small>카메라 열기</small>
                          </button>
                          <button type="button" onClick={() => openNativeMediaPicker(mediaPickerKind === "image" ? "image-library" : "video-library")}>
                            <span aria-hidden="true">▧</span>
                            <strong>{mediaPickerKind === "image" ? "사진첩에서 선택" : "보관함에서 선택"}</strong>
                            <small>저장된 {mediaPickerKind === "image" ? "사진" : "영상"} 가져오기</small>
                          </button>
                        </div>
                        <button type="button" className="media-source-cancel" onClick={() => setMediaPickerKind(null)}>취소</button>
                      </section>
                    </div>
                  )}
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
                  <p className="media-privacy">얼굴과 차량번호가 보이면 제출 전에 확인해주세요.</p>
                  <button className="next-button" onClick={goNext}>{attachments.length ? "선택한 자료와 계속하기" : "위험요소 선택하기"}<span>→</span></button>
                </div>
              )}

              {step === 2 && (
                <div className="flow-card">
                  <fieldset className="risk-fieldset">
                    <legend>위험요소 유형</legend>
                    <div className="risk-grid">
                      {riskTypes.map((item) => (
                        <button type="button" className={riskType === item.name ? "selected" : ""} onClick={() => { setRiskType(item.name); setRiskDetail(""); setError(""); }} key={item.name}>
                          <img className="risk-type-icon" src={iconPath(item.icon)} alt="" /><strong>{item.name}</strong><small>{item.help}</small>
                        </button>
                      ))}
                    </div>
                    {riskType && (
                      <div className="risk-detail-panel" aria-live="polite" ref={riskDetailPanelRef}>
                        <div className="risk-detail-heading">
                          <strong>세부 유형</strong>
                          <p>가장 가까운 항목 하나를 골라주세요.</p>
                        </div>
                        <div className="risk-detail-grid">
                          {riskDetails[riskType].map((item) => (
                            <button type="button" className={riskDetail === item.name ? "selected" : ""} onClick={() => { setRiskDetail(item.name); setError(""); }} key={item.name}>
                              <span><strong>{item.name}</strong><small>{item.help}</small></span>
                              <b aria-hidden="true">✓</b>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </fieldset>
                  <div className="description-field separated-description">
                    <div className="description-field-heading">
                      <label htmlFor="report-description">설명 <small>선택</small></label>
                      <button type="button" className={`report-audio-action${listening ? " active" : ""}`} onClick={startSpeechInput} aria-pressed={listening}>
                        <span className="speech-write-icon" aria-hidden="true">
                          <svg viewBox="0 0 36 28"><path d="M4 3.5h28a2.5 2.5 0 0 1 2.5 2.5v13a2.5 2.5 0 0 1-2.5 2.5H16l-7 4v-4H4A2.5 2.5 0 0 1 1.5 19V6A2.5 2.5 0 0 1 4 3.5Z"/><path d="M7 9h22M7 13h22M7 17h15"/></svg>
                        </span>
                        {listening ? "말하기 끝내기" : "말로 글쓰기"}
                      </button>
                    </div>
                    <textarea id="report-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="예: 보도 턱이 높아서 보행기가 걸려요." rows={5} />
                  </div>
                  <div className="voice-recorder">
                    <div>
                      <strong>현장음 녹음</strong>
                      <small>{recording ? `${recordingSeconds}초 녹음 중` : "현장의 소리를 별도 파일로 남길 수 있어요."}</small>
                    </div>
                    <button type="button" className={`report-audio-action${recording ? " recording" : ""}`} onClick={recording ? stopAudioRecording : startAudioRecording}>
                      <span className="record-action-icon" aria-hidden="true">{recording ? "■" : "●"}</span>
                      {recording ? "녹음 끝내기" : "현장음 녹음"}
                    </button>
                    <label className="audio-file-button report-audio-action">
                      <input type="file" accept="audio/*" onChange={addFiles} />
                      녹음 파일 선택
                    </label>
                  </div>
                  {attachments.some((item) => item.kind === "audio") && (
                    <div className="audio-attachment-list" aria-label="녹음한 현장음">
                      {attachments.filter((item) => item.kind === "audio").map((item) => (
                        <article key={item.id}><audio src={item.url} controls /><button type="button" onClick={() => removeAttachment(item.id)} aria-label="현장음 삭제">×</button></article>
                      ))}
                    </div>
                  )}
                  <button className="next-button" onClick={goNext}>위치 입력하기<span>→</span></button>
                </div>
              )}

              {step === 3 && (
                <div className="flow-card">
                  <fieldset className="location-fieldset">
                    <legend>위치</legend>
                    <p className="location-guide">GPS 지도의 핀을 맞추거나 알고 있는 장소를 직접 적어주세요.</p>
                    <div className="location-methods">
                      <button type="button" className={locationMode === "gps" ? "selected" : ""} onClick={requestLocation} aria-pressed={locationMode === "gps"}><LocationPinIcon /><strong>현재 위치 사용</strong></button>
                      <button type="button" className={locationMode === "manual" ? "selected" : ""} onClick={() => { setLocationMode("manual"); setLocation(null); setLocationMessage(""); }} aria-pressed={locationMode === "manual"}><ManualInputIcon /><strong>직접 입력</strong></button>
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
                      <div><dt>세부유형</dt><dd>{riskDetail}</dd></div>
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
              <div className="activity-board">
                <div className="activity-heading">
                  <div><p className="activity-eyebrow">MY REPORTS</p><h1>내가 남긴 기록과 대응 현황</h1></div>
                  <div className="activity-filters" role="group" aria-label="내 기록 상태 필터">
                    <button className={activityFilter === "all" ? "active" : ""} onClick={() => setActivityFilter("all")}>전체 {reports.length}</button>
                    <button className={activityFilter === "active" ? "active" : ""} onClick={() => setActivityFilter("active")}>처리 중</button>
                    <button className={activityFilter === "completed" ? "active" : ""} onClick={() => setActivityFilter("completed")}>완료</button>
                  </div>
                </div>
                <div className="member-report-list" aria-live="polite">
                  {visibleReports.map((report) => (
                    <article className="member-report" key={report.id} role="button" tabIndex={0} aria-label={`${report.description} 상세 내용 보기`} onClick={() => setSelectedReport(report)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedReport(report); } }}>
                      <div className="report-main">
                        <div className="report-meta"><span className={`status-chip status-${report.status}`}>{reportStatus[report.status].label}</span><small>{formatDate(report.createdAt)} · {report.riskType}</small></div>
                        <h2>{report.description}</h2>
                        <p>⌖ {report.place}</p>
                        {Boolean(report.mediaCount) && <span className="report-media-count">사진·영상·음성 {report.mediaCount}개 첨부</span>}
                      </div>
                      <div className="response-box"><small>{reportDepartment(report)} 답변</small><p>{reportResponse(report)}</p></div>
                      <ol className="status-track" aria-label={`${report.description} 처리 단계`}>
                        {["접수", "현장 검토", "조치 전달", "개선 완료"].map((label, index) => (
                          <li className={index < reportStage[report.status] ? "done" : ""} key={label}><i>{index < reportStage[report.status] ? "✓" : index + 1}</i><span>{label}</span></li>
                        ))}
                      </ol>
                      <span className="member-report-open-hint">상세 보기 <b>→</b></span>
                    </article>
                  ))}
                  {!visibleReports.length && <p className="empty-member-reports">아직 해당하는 기록이 없어요.</p>}
                </div>
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
              <article className="app-reward-exchange" aria-labelledby="app-reward-title">
                <div className="app-reward-label"><span>마일리지 사용</span><b>교환 준비 중</b></div>
                <h2 id="app-reward-title">모은 마일리지를<br />상품권으로 바꿔요.</h2>
                <p>10,000P부터 온누리상품권 등 지역상품권으로 교환할 수 있도록 준비하고 있어요.</p>
                <div className="app-voucher-preview"><i><img src={`${import.meta.env.BASE_URL}onnuri-logo-3d.png`} alt="디지털 온누리상품권" /></i><div><small>디지털 온누리상품권</small><strong>10,000P부터</strong></div></div>
                <div className="app-reward-progress" aria-label={`상품권 교환까지 ${Math.round(rewardExchangeProgress)}%`}><span style={{ width: `${rewardExchangeProgress}%` }} /></div>
                <div className="app-reward-status"><span>현재 {participation.points.toLocaleString()}P</span><strong>{canExchangeReward ? "교환 가능" : `${rewardExchangeRemaining.toLocaleString()}P 남음`}</strong></div>
                <button type="button" disabled={!canExchangeReward} onClick={openRewardForm}>{canExchangeReward ? "상품권 교환 신청하기" : "10,000P부터 신청할 수 있어요"}</button>
                <small>신청서를 보내면 담당자가 확인한 뒤 입력한 휴대전화로 상품권을 발송합니다.</small>
              </article>
              <p className="prototype-note">현재 버전은 기능 시연용입니다. 제보와 파일은 이 기기의 브라우저에만 저장됩니다.</p>
            </section>
          )}
        </main>

        {rewardFormOpen && currentUser && (
          <div className="app-reward-form-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setRewardFormOpen(false)}>
            <section className="app-reward-form-sheet" role="dialog" aria-modal="true" aria-labelledby="app-reward-form-title">
              <button className="app-reward-form-close" type="button" onClick={() => setRewardFormOpen(false)} aria-label="교환 신청 닫기">×</button>
              <img className="app-reward-form-logo" src={`${import.meta.env.BASE_URL}onnuri-logo-3d.png`} alt="디지털 온누리상품권" />
              <p>10,000P REWARD</p>
              <h2 id="app-reward-form-title">상품권 교환을 신청할까요?</h2>
              <span>회원 정보와 연락처가 입력된 Google Form이 열립니다. 내용을 확인해 제출하면 담당자가 확인 후 휴대전화로 보내드려요.</span>
              <form onSubmit={submitRewardForm}>
                <div className="app-reward-applicant"><span><small>이름</small><strong>{currentUser.name}</strong></span><span><small>이메일</small><strong>{currentUser.email}</strong></span></div>
                <label><span>상품권 받을 휴대전화 번호</span><input type="tel" inputMode="tel" autoComplete="tel" value={rewardPhone} onChange={(event) => { setRewardPhone(event.target.value); setRewardFormError(""); }} placeholder="010-1234-5678" /></label>
                {rewardFormError && <p className="app-reward-form-error" role="alert">{rewardFormError}</p>}
                <button type="submit">Google Form에서 신청 계속하기 <b>→</b></button>
              </form>
              <small>Google Form 제출 전까지 포인트는 차감되지 않습니다.</small>
            </section>
          </div>
        )}

        {selectedReport && (
          <div className="member-detail-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelectedReport(null)}>
            <section className="member-detail-modal" role="dialog" aria-modal="true" aria-labelledby="member-detail-title">
              <button className="member-detail-close" type="button" onClick={() => setSelectedReport(null)} aria-label="상세 내용 닫기">×</button>
              <header className="member-detail-heading">
                <div className="report-meta"><span className={`status-chip status-${selectedReport.status}`}>{reportStatus[selectedReport.status].label}</span><small>{selectedReport.riskType} · {formatDate(selectedReport.createdAt)}</small></div>
                <h2 id="member-detail-title">{selectedReport.description}</h2>
                <p>내가 남긴 위험 기록의 내용과 첨부자료를 확인할 수 있어요.</p>
              </header>
              <div className="member-detail-grid">
                <div className="member-detail-main">
                  <section className="member-detail-section"><h3>제보 내용</h3><p>{selectedReport.description}</p></section>
                  <section className="member-detail-section">
                    <div className="member-detail-section-title"><h3>첨부자료</h3><span>{detailMedia.length || selectedReport.mediaCount}개</span></div>
                    {detailMedia.length ? <div className="member-media-gallery">{detailMedia.map((item, index) => <figure className={`member-media-item media-${item.kind}`} key={item.id}>
                      {item.kind === "image" && <img src={item.url} alt={`${selectedReport.description} 첨부 사진 ${index + 1}`} />}
                      {item.kind === "video" && <video src={item.url} controls />}
                      {item.kind === "audio" && <div className="member-audio-preview"><span>●</span><audio src={item.url} controls /></div>}
                      <figcaption><b>{item.kind === "image" ? "사진" : item.kind === "video" ? "영상" : "음성"}</b><span>{item.name}</span></figcaption>
                    </figure>)}</div> : <p className="member-media-message">이 기록에는 첨부자료가 없어요.</p>}
                  </section>
                </div>
                <aside className="member-detail-side">
                  <dl className="member-detail-facts">
                    <div><dt>위험유형</dt><dd>{selectedReport.riskType}{selectedReport.riskDetail ? ` · ${selectedReport.riskDetail}` : ""}</dd></div>
                    <div><dt>위치</dt><dd>{selectedReport.place}</dd></div>
                    {selectedReport.latitude != null && selectedReport.longitude != null && <div><dt>위치 좌표</dt><dd>{selectedReport.latitude.toFixed(5)}, {selectedReport.longitude.toFixed(5)}</dd></div>}
                    <div><dt>제보 시각</dt><dd>{formatDate(selectedReport.createdAt)}</dd></div>
                  </dl>
                  <div className="member-detail-response"><small>{reportDepartment(selectedReport)} 답변</small><p>{reportResponse(selectedReport)}</p></div>
                </aside>
              </div>
              <div className="member-detail-actions">
                <button className="member-delete-button" type="button" onClick={() => removeReport(selectedReport)}>기록 삭제</button>
                <button className="member-detail-done" type="button" onClick={() => setSelectedReport(null)}>확인</button>
              </div>
            </section>
          </div>
        )}

        <nav className="bottom-nav" aria-label="앱 주요 메뉴">
          <button className={view === "home" ? "active" : ""} onClick={() => navigate("home")}><span><NavIcon name="home" /></span><strong>홈</strong></button>
          <button aria-label="새로운 위험요소 제보하기" className={view === "report" ? "active report-nav" : "report-nav"} onClick={() => navigate("report")}><span><NavIcon name="report" /></span><strong>제보</strong></button>
          <button className={view === "history" ? "active" : ""} onClick={() => navigate("history")}><span><NavIcon name="history" /></span><strong>내 기록</strong></button>
          <button className={view === "rewards" ? "active" : ""} onClick={() => navigate("rewards")}><span><NavIcon name="reward" /></span><strong>참여</strong></button>
        </nav>
      </div>
    </div>
  );
}

export default App;
