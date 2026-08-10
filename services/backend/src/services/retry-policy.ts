export type FailureKind = 'authentication' | 'permission' | 'rate_limit' | 'unavailable' | 'timeout' | 'validation' | 'unknown';

export interface RetryDecision {
  retry: boolean;
  maxAttempts: number;
  nextState: 'retry_scheduled' | 'needs_action' | 'failed';
  reason: string;
}

export function decideRetry(kind: FailureKind, attempt: number): RetryDecision {
  if (['authentication', 'permission', 'validation'].includes(kind)) {
    return { retry: false, maxAttempts: 1, nextState: 'needs_action', reason: 'Lỗi không thể tự sửa; chuyển sang xử lý thủ công.' };
  }
  const maxAttempts = kind === 'rate_limit' ? 3 : 2;
  if (attempt >= maxAttempts) {
    return { retry: false, maxAttempts, nextState: 'needs_action', reason: 'Đã đạt giới hạn retry; circuit breaker được mở.' };
  }
  return { retry: true, maxAttempts, nextState: 'retry_scheduled', reason: 'Lỗi tạm thời; retry có giới hạn.' };
}

