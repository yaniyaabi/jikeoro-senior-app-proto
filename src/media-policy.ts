// Decimal MB: one raw upload request must fit within the 100 MB tunnel limit.
export const MAX_FILE_BYTES = 100_000_000;
export const VIDEO_RECORDING_GUIDANCE = '영상은 30초 정도로 짧게 찍어주세요.';
export const VIDEO_SIZE_GUIDANCE = '100MB는 보통 약 1분 분량이지만, 휴대폰 화질 설정에 따라 달라요. 용량이 넘으면 더 짧게 찍거나 카메라 화질을 낮춰주세요.';
export function uploadLimitMessage(file: {type?:string}, kind?:string) {
  return kind === 'video' || file.type?.startsWith('video/')
    ? '영상 한 개는 100MB까지 올릴 수 있어요. 촬영하거나 선택한 영상이 100MB를 넘어 첨부할 수 없어요. 30초 정도로 더 짧게 찍거나, 용량이 작은 영상을 선택해주세요.'
    : '파일 한 개는 100MB까지 올릴 수 있어요. 더 작은 파일을 선택해주세요.';
}
