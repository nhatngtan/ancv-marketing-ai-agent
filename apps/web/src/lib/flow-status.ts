import type { FlowJobRecord } from '@ancv/shared';

const flowStatusLabels: Record<string, string> = {
  queued: 'Chờ xử lý',
  processing: 'Đang xử lý',
  succeeded: 'Thành công',
  needs_manual: 'Cần xử lý thủ công',
};

const flowStageLabels: Record<string, string> = {
  queued: 'Chờ xử lý',
  opening_flow: 'Đang mở Google Flow…',
  filling_prompt: 'Đang nhập Prompt…',
  generating: 'Đang tạo video…',
  waiting_output: 'Đang chờ Google Flow…',
  output_detected: 'Đã nhận output, đang kết xuất…',
  output_rendering: 'Google Flow đang kết xuất video…',
  output_ready: 'Video đã kết xuất xong…',
  download_ready: 'Video sẵn sàng tải xuống…',
  downloading: 'Đang tải video…',
  completed: 'Hoàn tất',
  needs_manual: 'Cần xử lý thủ công',
};

export function flowProgressLabel(job: FlowJobRecord): string {
  return flowStageLabels[job.stage ?? ''] ?? flowStatusLabels[job.status] ?? 'Đang xử lý';
}

export function flowErrorMessage(error?: string | null): string {
  if (!error) return '';
  if (/NEEDS?_LOGIN|yêu cầu đăng nhập|chưa sẵn sàng/i.test(error)) return 'Google Flow cần đăng nhập.';
  if (/LOCAL_AGENT|CDP|CHROME_PROFILE_IN_USE|CHROME_START/i.test(error)) return 'Không thể kết nối máy xử lý.';
  if (/ACCOUNT_MISMATCH|ACCOUNT_NOT_DETECTED|EXPECTED_ACCOUNT/i.test(error)) return 'Sai tài khoản Google Flow.';
  if (/PROJECT_MISMATCH|PROJECT_MAPPING/i.test(error)) return 'Sai Google Flow Project.';
  if (/PREFLIGHT|UI|LOCATOR|CONTROL|APPROVAL/i.test(error)) return 'Google Flow đã thay đổi giao diện hoặc cần xác nhận thủ công.';
  if (/OUTPUT|DOWNLOAD|AMBIGUOUS|timeout/i.test(error)) return 'Không xác định được kết quả – cần kiểm tra thủ công.';
  return 'Google Flow dừng an toàn – cần kiểm tra thủ công.';
}
