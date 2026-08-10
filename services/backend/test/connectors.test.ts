import { describe, expect, it } from 'vitest';
import { ManualPublishingProvider } from '../src/connectors/manual-provider.js';

describe('manual fallback provider', () => {
  it('never claims untested APIs are automatic', async () => {
    const provider = new ManualPublishingProvider('tiktok');
    expect(await provider.getCapabilities()).toMatchObject({ authenticationStatus: 'not_tested', mode: 'manual' });
    expect(await provider.publish({ idempotencyKey: 'key-12345', contentId: 'x', title: 'x', body: 'x', mediaUrls: [] }))
      .toMatchObject({ success: false, retryable: false, errorCode: 'MANUAL_REQUIRED' });
  });
});

