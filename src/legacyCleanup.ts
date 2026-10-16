const KEY_CLEANUP_MARKER = "jikeoro-legacy-local-keys-cleaned-v1";
const DATABASE_CLEANUP_MARKER = "jikeoro-legacy-local-database-cleaned-v1";
const LEGACY_DATABASE = "jikeoro-senior-prototype";
const LEGACY_KEYS = [
  "jikeoro-senior-accounts",
  "jikeoro-senior-session",
  "jikeoro-reward-requests-v1",
  "jikeoro-reward-phone",
];
const LEGACY_PREFIXES = ["jikeoro-senior-report-draft-v1:"];

function clearLegacyKeys(storage: Storage) {
  LEGACY_KEYS.forEach((key) => storage.removeItem(key));
  for (let index = storage.length - 1; index >= 0; index -= 1) {
    const key = storage.key(index);
    if (key && LEGACY_PREFIXES.some((prefix) => key.startsWith(prefix))) storage.removeItem(key);
  }
}

export function clearLegacyLocalData() {
  if (localStorage.getItem(KEY_CLEANUP_MARKER) !== "complete") {
    clearLegacyKeys(localStorage);
    clearLegacyKeys(sessionStorage);
    localStorage.setItem(KEY_CLEANUP_MARKER, "complete");
  }
  if (localStorage.getItem(DATABASE_CLEANUP_MARKER) === "complete") return Promise.resolve();

  return new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase(LEGACY_DATABASE);
    request.onsuccess = () => {
      localStorage.setItem(DATABASE_CLEANUP_MARKER, "complete");
      resolve();
    };
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  });
}
