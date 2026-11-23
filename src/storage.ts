import { apiJson, jsonBody, uploadMedia } from "./api-client";
import { createSubmissionState, submitWithAttachments, type SubmissionState } from "./report-submission";

export type StoredMedia = {
  id: string;
  reportId: string;
  kind: "image" | "video" | "audio";
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

export type StoredDraftMedia = {
  id: string;
  userId: string;
  kind: "image" | "video" | "audio";
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

export type ReportStatus = "received" | "review" | "action" | "completed";

export type WeatherSnapshot = {
  temperature: number;
  code: number;
  observedAt: string;
};

export type ReportStatusUpdate = {
  status: ReportStatus;
  note: string;
  createdAt: string;
  department?: string | null;
};

export type StoredReport = {
  id: string;
  userId: string;
  riskType: string;
  riskDetail?: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  place: string;
  createdAt: string;
  updatedAt: string;
  status: ReportStatus;
  department: string | null;
  response: string;
  weather: WeatherSnapshot | null;
  statusHistory: ReportStatusUpdate[];
  mediaCount: number;
  points: number;
};

type ReportRow = {
  id: string;
  user_id: string;
  category: string;
  subcategory: string | null;
  description: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  address: string | null;
  place_description: string | null;
  created_at: string;
  updated_at: string;
  status: ReportStatus;
  assigned_agency: string | null;
  response: string | null;
  weather: WeatherSnapshot | null;
  points: number;
  report_media?: Array<{ id: string; kind: StoredMedia["kind"]; original_name: string; mime_type: string; size_bytes: number; storage_path: string }>;
  report_status_history?: Array<{ status: ReportStatus; note: string | null; created_at: string }>;
};

const DB_NAME = "jikeoro-senior-prototype";
const DB_VERSION = 2;

function defaultResponse(status: ReportStatus) {
  if (status === "review") return "담당자가 제보 내용을 검토하고 현장 확인 일정을 준비하고 있어요.";
  if (status === "action") return "현장 확인을 마치고 담당 기관에 개선 조치를 요청했어요.";
  if (status === "completed") return "담당 기관의 개선 조치가 완료됐어요.";
  return "기록이 안전하게 접수됐어요. 위치와 내용을 확인한 뒤 담당 기관을 연결할게요.";
}

function mapReport(row: ReportRow): StoredReport {
  const response = row.response?.trim() || defaultResponse(row.status);
  const history = [...(row.report_status_history ?? [])]
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
    .map((item) => ({
      status: item.status,
      note: item.note?.trim() || defaultResponse(item.status),
      createdAt: item.created_at,
      department: row.assigned_agency,
    }));
  return {
    id: row.id,
    userId: row.user_id,
    riskType: row.category,
    riskDetail: row.subcategory ?? undefined,
    description: row.description,
    latitude: row.latitude,
    longitude: row.longitude,
    accuracy: row.accuracy,
    place: row.address?.trim() || row.place_description?.trim() || "위치정보 없음",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    department: row.assigned_agency,
    response,
    weather: row.weather ?? null,
    statusHistory: history.length ? history : [{ status: row.status, note: response, createdAt: row.updated_at, department: row.assigned_agency }],
    mediaCount: row.report_media?.length ?? 0,
    points: row.points ?? 100,
  };
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("reports")) database.createObjectStore("reports", { keyPath: "id" });
      if (!database.objectStoreNames.contains("media")) {
        const store = database.createObjectStore("media", { keyPath: "id" });
        store.createIndex("reportId", "reportId");
      }
      if (!database.objectStoreNames.contains("draftMedia")) {
        const store = database.createObjectStore("draftMedia", { keyPath: "id" });
        store.createIndex("userId", "userId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getDraftMedia(userId: string): Promise<StoredDraftMedia[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("draftMedia", "readonly");
    const request = transaction.objectStore("draftMedia").index("userId").getAll(userId);
    request.onsuccess = () => { database.close(); resolve(request.result as StoredDraftMedia[]); };
    request.onerror = () => { database.close(); reject(request.error); };
  });
}

export async function replaceDraftMedia(userId: string, files: StoredDraftMedia[]) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("draftMedia", "readwrite");
    const store = transaction.objectStore("draftMedia");
    const keysRequest = store.index("userId").getAllKeys(userId);
    keysRequest.onsuccess = () => {
      keysRequest.result.forEach((key) => store.delete(key));
      files.forEach((file) => store.put(file));
    };
    transaction.oncomplete = () => { database.close(); resolve(); };
    transaction.onerror = () => { database.close(); reject(transaction.error); };
  });
}

export async function deleteDraftMedia(userId: string) {
  return replaceDraftMedia(userId, []);
}

export async function getReports(_userId: string): Promise<StoredReport[]> {
  const result=await apiJson<{reports:ReportRow[]}>("/api/app/reports");
  return result.reports.map(mapReport);
}
export async function getReportMedia(reportId:string):Promise<StoredMedia[]> {
  const result=await apiJson<{media:Array<{id:string;report_id:string;kind:StoredMedia["kind"];original_name:string;mime_type:string;size_bytes:number}>}>(`/api/reports/${encodeURIComponent(reportId)}/media`);
  return result.media.map(item=>({id:item.id,reportId:item.report_id,kind:item.kind,name:item.original_name,type:item.mime_type,size:item.size_bytes,blob:new Blob([],{type:item.mime_type})}));
}
const submissionStates = new Map<string, SubmissionState>();
export async function saveReport(report:StoredReport,files:StoredMedia[]) {
  const state = submissionStates.get(report.userId) ?? createSubmissionState();
  submissionStates.set(report.userId, state);
  await submitWithAttachments(state, {
    source: "senior_app", category: report.riskType, subcategory: report.riskDetail,
    title: report.description.slice(0,150) || `${report.riskType} 위험요소를 발견했어요`,
    description: report.description, latitude: report.latitude, longitude: report.longitude,
    accuracy: report.accuracy, placeDescription: report.place, observedAt: report.createdAt, weather: report.weather,
  }, files.map(file => ({id: file.id, kind: file.kind, file: file.blob})), {
    createId: () => report.id,
    save: payload => apiJson<{id:string}>("/api/reports", jsonBody(payload)),
    upload: (id, attachment) => {
      const file = files.find(item => item.id === attachment.id)!;
      return uploadMedia(id, file.blob, file.name, file.kind);
    },
    remove: deleteReport,
  });
}
export async function deleteReport(reportId:string) {
  await apiJson("/api/reports",{...jsonBody({id:reportId}),method:"DELETE"});
}
