export type ArticleSaveState = 'saving' | 'saved' | 'error';

export function articleSaveStateLabel(state: ArticleSaveState): string {
  if (state === 'saving') return 'Đang lưu…';
  if (state === 'error') return 'Lỗi lưu — nội dung vẫn đang ở trình duyệt';
  return 'Đã lưu';
}

export function shouldConfirmArticleRegeneration(body: string): boolean {
  return body.trim().length > 0;
}
