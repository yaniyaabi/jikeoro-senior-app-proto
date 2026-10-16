import { supabase } from "./supabase";

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

export async function getReports(userId: string): Promise<StoredReport[]> {
  const { data, error } = await supabase
    .from("reports")
    .select("*, report_media(id,kind,original_name,mime_type,size_bytes,storage_path), report_status_history(status,note,created_at)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data as ReportRow[]).map(mapReport);
}

export async function getReportMedia(reportId: string): Promise<StoredMedia[]> {
  const { data, error } = await supabase
    .from("report_media")
    .select("id,report_id,kind,original_name,mime_type,size_bytes")
    .eq("report_id", reportId);
  if (error) throw error;
  return (data ?? []).map((item) => ({
    id: item.id,
    reportId: item.report_id,
    kind: item.kind as StoredMedia["kind"],
    name: item.original_name,
    type: item.mime_type,
    size: item.size_bytes,
    blob: new Blob([], { type: item.mime_type }),
  }));
}

function fileExtension(name: string) {
  const match = name.match(/\.[a-z0-9]{1,8}$/i);
  return match?.[0].toLowerCase() ?? "";
}

export async function saveReport(report: StoredReport, files: StoredMedia[]) {
  const { error: reportError } = await supabase.from("reports").insert({
    id: report.id,
    user_id: report.userId,
    source: "senior_app",
    category: report.riskType,
    subcategory: report.riskDetail ?? null,
    title: report.description || `${report.riskType} 위험요소를 발견했어요`,
    description: report.description,
    latitude: report.latitude,
    longitude: report.longitude,
    accuracy: report.accuracy,
    place_description: report.place,
    status: "received",
    response: report.response,
    observed_at: report.createdAt,
    points: report.points,
  });
  if (reportError) throw reportError;

  const uploadedPaths: string[] = [];
  try {
    const mediaRows = [];
    for (const file of files) {
      const path = `${report.userId}/${report.id}/${crypto.randomUUID()}${fileExtension(file.name)}`;
      const contentType = file.type.split(";")[0] || "application/octet-stream";
      const { error: uploadError } = await supabase.storage.from("report-media").upload(path, file.blob, { contentType, upsert: false });
      if (uploadError) throw uploadError;
      uploadedPaths.push(path);
      mediaRows.push({
        report_id: report.id,
        user_id: report.userId,
        kind: file.kind,
        storage_path: path,
        original_name: file.name,
        mime_type: contentType,
        size_bytes: file.size,
      });
    }
    if (mediaRows.length) {
      const { error: mediaError } = await supabase.from("report_media").insert(mediaRows);
      if (mediaError) throw mediaError;
    }
  } catch (error) {
    if (uploadedPaths.length) await supabase.storage.from("report-media").remove(uploadedPaths);
    await supabase.from("reports").delete().eq("id", report.id);
    throw error;
  }
}

export async function deleteReport(reportId: string) {
  const { data: media, error: mediaError } = await supabase.from("report_media").select("storage_path").eq("report_id", reportId);
  if (mediaError) throw mediaError;
  const paths = (media ?? []).map((item) => item.storage_path);
  if (paths.length) {
    const { error: removeError } = await supabase.storage.from("report-media").remove(paths);
    if (removeError) throw removeError;
  }
  const { error } = await supabase.from("reports").delete().eq("id", reportId);
  if (error) throw error;
}
