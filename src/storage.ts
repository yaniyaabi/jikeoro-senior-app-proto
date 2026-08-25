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

export async function getReports(): Promise<StoredReport[]> {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction("reports", "readonly");
    const request = transaction.objectStore("reports").getAll();
    request.onsuccess = () => {
      database.close();
      resolve((request.result as StoredReport[]).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
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

export const seedReports: StoredReport[] = [
  {
    id: "demo-report-1",
    riskType: "단차",
    description: "횡단보도 앞 턱이 높아서 보행기가 걸려요.",
    latitude: 37.5447,
    longitude: 127.0567,
    accuracy: 18,
    place: "성수역 2번 출구 앞",
    createdAt: "2026-08-22T09:42:00.000Z",
    status: "확인 중",
    mediaCount: 1,
    points: 100,
  },
];
