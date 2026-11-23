// Preserve drafts and historical reward requests until their migration is confirmed.
// Authentication uses a separate server-session key, so legacy records are inactive.
export function clearLegacyLocalData(): Promise<void> {
  return Promise.resolve();
}
