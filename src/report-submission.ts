import { MAX_FILE_BYTES, uploadLimitMessage } from './media-policy.ts';
export type SubmissionState = { pendingId: string | null; busy: boolean };
export type SubmissionAttachment = { id: string; kind: string; file: Blob };
type SubmissionServices = {
  createId: () => string;
  save: (payload: Record<string, unknown>) => Promise<{ id: string }>;
  upload: (id: string, attachment: SubmissionAttachment) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
};
export function createSubmissionState(): SubmissionState { return { pendingId: null, busy: false }; }
export async function submitWithAttachments(state: SubmissionState, payload: Record<string, unknown>, attachments: SubmissionAttachment[], services: SubmissionServices) {
  if (state.busy) throw new Error("이미 저장하고 있어요. 잠시만 기다려주세요.");
  if (attachments.some(item => item.file.size > MAX_FILE_BYTES)) throw new Error(uploadLimitMessage({}, attachments.find(item => item.file.size > MAX_FILE_BYTES)?.kind));
  state.busy = true;
  try {
    // Finish any uncertain cleanup before starting another submission.
    if (state.pendingId) { await services.remove(state.pendingId); state.pendingId = null; }
    const id = services.createId();
    state.pendingId = id;
    const saved = await services.save({ ...payload, id });
    if (saved.id !== id) throw new Error("제보 저장 결과를 확인하지 못했습니다.");
    for (const attachment of attachments) await services.upload(id, attachment);
    state.pendingId = null;
    return id;
  } catch (error) {
    const detail = error instanceof Error ? error.message : "잠시 후 다시 시도해주세요.";
    if (state.pendingId) {
      try { await services.remove(state.pendingId); state.pendingId = null; }
      catch { throw new Error(`첨부파일 전송이 끝나지 않았고 저장 상태도 확인하지 못했어요. 이 화면에서 다시 시도해주세요. ${detail}`); }
    }
    throw new Error(`제보 저장을 완료하지 못했어요. 선택한 파일은 유지돼요. ${detail}`);
  } finally { state.busy = false; }
}
