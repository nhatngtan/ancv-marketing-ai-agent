import { describe, expect, it, vi } from 'vitest';
import type { ContentRecord, MediaAssetRecord, Platform } from '@ancv/shared';
import { manualSocialUrls, prepareSocialHandoff } from './social-handoff';

function content(type: 'video' | 'article', platform: Platform, status: 'draft' | 'approved' = 'approved'): ContentRecord {
  return {
    id: 'content-doc', contentId: type === 'video' ? 'ANCV-VID-2026-001' : 'ANCV-ART-2026-001', type,
    title: 'Content', topic: 'Content', body: '', status: 'approved', platforms: [],
    platformCopies: { [platform]: { platform, text: `Nội dung ${platform}`, status, version: 1 } },
    createdAt: '2026-08-19T00:00:00.000Z', updatedAt: '2026-08-19T00:00:00.000Z', createdBy: 'tester',
  };
}

function dependencies() {
  return { copyText: vi.fn(async () => undefined), openExternal: vi.fn(), openLocalAsset: vi.fn(async () => undefined) };
}

describe('manual social handoff', () => {
  it.each(['facebook', 'tiktok', 'zalo', 'linkedin'] as Platform[])('copies approved copy and opens %s with the selected local Final', async (platform) => {
    const deps = dependencies();
    const final = { id: 'final', contentDocId: 'content-doc', kind: 'video_final', storageType: 'local', relativePath: 'ANCV-VID-2026-001/Video Final/final.mp4' } as MediaAssetRecord;
    await prepareSocialHandoff(content('video', platform), platform, final, deps);
    expect(deps.openExternal).toHaveBeenCalledWith(manualSocialUrls[platform]);
    expect(deps.copyText).toHaveBeenCalledWith(`Nội dung ${platform}`);
    expect(deps.openLocalAsset).toHaveBeenCalledWith('content-doc', 'final');
  });

  it('opens the selected Article image without uploading or posting it', async () => {
    const deps = dependencies();
    const image = { id: 'image', contentDocId: 'content-doc', kind: 'article_image', downloadUrl: 'https://example.test/image.jpg' } as MediaAssetRecord;
    await prepareSocialHandoff(content('article', 'linkedin'), 'linkedin', image, deps);
    expect(deps.openExternal.mock.calls).toEqual([[manualSocialUrls.linkedin], ['https://example.test/image.jpg']]);
    expect(deps.openLocalAsset).not.toHaveBeenCalled();
  });

  it('fails closed when platform copy is not approved', async () => {
    const deps = dependencies();
    await expect(prepareSocialHandoff(content('video', 'facebook', 'draft'), 'facebook', undefined, deps)).rejects.toThrow('SOCIAL_COPY_APPROVAL_REQUIRED');
    expect(deps.openExternal).not.toHaveBeenCalled();
  });
});
