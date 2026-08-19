import type { ContentRecord, MediaAssetRecord, Platform } from '@ancv/shared';

export const manualSocialUrls: Partial<Record<Platform, string>> = {
  facebook: 'https://www.facebook.com/',
  tiktok: 'https://www.tiktok.com/upload',
  zalo: 'https://oa.zalo.me/manage/oa',
  linkedin: 'https://www.linkedin.com/feed/?shareActive=true',
};

export interface SocialHandoffDependencies {
  copyText: (value: string) => Promise<void>;
  openExternal: (url: string) => void;
  openLocalAsset: (contentDocId: string, assetId: string) => Promise<unknown>;
}

export async function prepareSocialHandoff(
  content: ContentRecord,
  platform: Platform,
  media: MediaAssetRecord | undefined,
  dependencies: SocialHandoffDependencies,
): Promise<string> {
  const copy = content.platformCopies?.[platform];
  if (!copy?.text.trim() || copy.status !== 'approved') throw new Error('SOCIAL_COPY_APPROVAL_REQUIRED');
  const platformUrl = manualSocialUrls[platform];
  if (!platformUrl) throw new Error('SOCIAL_PLATFORM_UNSUPPORTED');
  dependencies.openExternal(platformUrl);
  await dependencies.copyText(copy.text);
  if (content.type === 'video') {
    if (!media || media.kind !== 'video_final' || media.storageType !== 'local') throw new Error('SOCIAL_VIDEO_FINAL_REQUIRED');
    await dependencies.openLocalAsset(content.id, media.id);
  } else if (media?.downloadUrl) {
    dependencies.openExternal(media.downloadUrl);
  }
  return `Nội dung đã được sao chép. Hãy dán và đăng trên ${platform === 'zalo' ? 'Zalo' : platform === 'linkedin' ? 'LinkedIn' : platform === 'tiktok' ? 'TikTok' : 'Facebook'}.`;
}
