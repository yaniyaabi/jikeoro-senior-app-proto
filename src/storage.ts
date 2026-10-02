export type StoredMedia = {
  id: string;
  reportId: string;
  kind: "image" | "video" | "audio";
  name: string;
  type: string;
  size: number;
  blob: Blob;
};

export type StoredReport = {
  id: string;
  userId: string;
  riskType: string;
  description: string;
  latitude: number | null;
  longitude: number | null;
  accuracy: number | null;
  place: string;
  createdAt: string;
  status: "접수" | "확인 중" | "조치 중" | "완료";
  mediaCount: number;
  points: number;
};

const DB_NAME = "jikeoro-senior-prototype";
const DB_VERSION = 1;

function normalizeRiskType(value: string) {
  if (value === "단차" || value === "적치물") return "인도";
  if (value === "포트홀") return "횡단보도";
  if (["인도", "횡단보도", "조도", "날씨 관련 위험", "기타"].includes(value)) return value;
  return "기타";
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("reports")) {
        database.createObjectStore("reports", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("media")) {
        const store = database.createObjectStore("media", { keyPath: "id" });
        store.createIndex("reportId", "reportId");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getReports(userId: string): Promise<StoredReport[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("reports", "readonly");
    const request = transaction.objectStore("reports").getAll();
    request.onsuccess = () => {
      database.close();
      resolve((request.result as StoredReport[])
        .filter((report) => report.userId === userId)
        .map((report) => ({ ...report, riskType: normalizeRiskType(report.riskType) }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

export async function getReportMedia(reportId: string): Promise<StoredMedia[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("media", "readonly");
    const request = transaction.objectStore("media").index("reportId").getAll(reportId);
    request.onsuccess = () => {
      database.close();
      resolve(request.result as StoredMedia[]);
    };
    request.onerror = () => {
      database.close();
      reject(request.error);
    };
  });
}

export async function saveReport(report: StoredReport, files: StoredMedia[]) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["reports", "media"], "readwrite");
    transaction.objectStore("reports").put(report);
    const mediaStore = transaction.objectStore("media");
    files.forEach((file) => mediaStore.put(file));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}

export async function deleteReport(reportId: string) {
  const database = await openDatabase();
  return new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(["reports", "media"], "readwrite");
    transaction.objectStore("reports").delete(reportId);
    const mediaStore = transaction.objectStore("media");
    const mediaIndex = mediaStore.index("reportId");
    const mediaRequest = mediaIndex.getAllKeys(reportId);
    mediaRequest.onsuccess = () => mediaRequest.result.forEach((key) => mediaStore.delete(key));
    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error);
    };
  });
}
