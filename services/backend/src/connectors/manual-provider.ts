import type { Platform } from '@ancv/shared';
import type { ProviderCapabilities, PublishingProvider, PublishInput, PublishResult } from './types.js';

export class ManualPublishingProvider implements PublishingProvider {
  constructor(public readonly platform: Platform) {}

  async getCapabilities(): Promise<ProviderCapabilities> {
    return {
      authenticationStatus: 'not_tested',
      publishing: 'unverified',
      analytics: 'unverified',
      limitations: ['Chưa có request test thực tế; chỉ cho phép Manual Fallback.'],
      mode: 'manual',
    };
  }

  async testAuthentication(): Promise<ProviderCapabilities> {
    return this.getCapabilities();
  }

  async publish(_input: PublishInput): Promise<PublishResult> {
    return {
      success: false,
      retryable: false,
      errorCode: 'MANUAL_REQUIRED',
      message: 'Connector chưa được xác minh. Hãy sử dụng quy trình đăng thủ công.',
    };
  }
}

