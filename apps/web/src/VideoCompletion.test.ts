import { describe, expect, it, vi } from 'vitest';
import type { ContentRecord, Platform } from '@ancv/shared';
import { generateVideoPlatformCopies } from './lib/repository';

const content = {
  id: 'content-1', contentId: 'ANCV-VID-2026-TEST', type: 'video', title: 'TEST', topic: 'TEST', body: '', status: 'awaiting_copy',
  createdAt: 'x', updatedAt: 'x', createdBy: 'editor', platforms: [], platformCopies: {},
} as ContentRecord;

describe('Video completion platform copy', () => {
  it('runs sequentially and keeps four successes when one platform fails', async () => {
    const order: Platform[] = [];
    const generator = vi.fn(async (_contentId: string, platform: Platform) => {
      order.push(platform);
      if (platform === 'zalo') throw new Error('ZALO_TEST_FAILURE');
    });
    const result = await generateVideoPlatformCopies(content, generator);
    expect(order).toEqual(['tiktok', 'youtube', 'facebook', 'zalo', 'linkedin']);
    expect(result.succeeded).toEqual(['tiktok', 'youtube', 'facebook', 'linkedin']);
    expect(result.failed).toEqual([{ platform: 'zalo', message: 'ZALO_TEST_FAILURE' }]);
    expect(generator).toHaveBeenCalledTimes(5);
  });

  it('does not overwrite an existing platform draft', async () => {
    const generator = vi.fn(async (contentId: string, platform: Platform, replaceExisting: boolean) => {
      expect([contentId, platform, replaceExisting]).toBeTruthy();
    });
    const existing = { ...content, platformCopies: { youtube: { platform: 'youtube' as const, text: 'Giữ nguyên', status: 'draft' as const, version: 1 } } };
    await generateVideoPlatformCopies(existing, generator);
    expect(generator.mock.calls.some((call) => call[1] === 'youtube')).toBe(false);
  });
});
