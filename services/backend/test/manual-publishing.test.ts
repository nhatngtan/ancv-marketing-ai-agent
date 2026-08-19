import { describe, expect, it } from 'vitest';
import { manualPublishInputSchema, markPlatformPublished } from '../src/modules/content-service.js';

describe('manual social completion', () => {
  it('allows Đã đăng without a Post URL and creates a missing platform safely', () => {
    const input = manualPublishInputSchema.parse({ platform: 'facebook' });
    const result = markPlatformPublished([], input, '2026-08-19T00:00:00.000Z');
    expect(result).toEqual([{ platform: 'facebook', mode: 'manual', status: 'published', publishedAt: '2026-08-19T00:00:00.000Z' }]);
    expect(result[0]).not.toHaveProperty('postUrl');
  });

  it('updates one existing platform without duplicating it', () => {
    const input = manualPublishInputSchema.parse({ platform: 'linkedin', postUrl: 'https://www.linkedin.com/feed/update/urn:li:activity:1' });
    const result = markPlatformPublished([{ platform: 'linkedin', mode: 'manual', status: 'manual_pending' }], input, '2026-08-19T00:00:00.000Z');
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ platform: 'linkedin', status: 'published', postUrl: input.postUrl });
  });
});
