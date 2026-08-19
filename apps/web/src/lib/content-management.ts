import {
  CONTENT_MANAGEMENT_CHANNEL_IDS,
  type ContentManagementChannelId,
  type ContentRecord,
  type Platform,
} from '@ancv/shared';

export type SimpleChannelStatus = 'none' | 'pending' | 'scheduled' | 'published';

export function channelStatusForContent(content: ContentRecord, channelId: string): SimpleChannelStatus {
  if (!CONTENT_MANAGEMENT_CHANNEL_IDS.includes(channelId as ContentManagementChannelId)) return 'pending';
  const applicable = content.type === 'video'
    ? ['youtube', 'facebook', 'tiktok', 'zalo', 'linkedin'].includes(channelId)
    : ['website', 'facebook', 'zalo', 'linkedin'].includes(channelId);
  if (!applicable) return 'none';
  if (channelId === 'website') {
    if (content.wordpressDraft?.status === 'publish') return 'published';
    if (content.wordpressDraft?.status === 'future') return 'scheduled';
  }
  const publication = content.platforms?.find((item) => item.platform === channelId as Platform);
  if (publication?.status === 'published') return 'published';
  if (publication?.status === 'scheduled') return 'scheduled';
  return 'pending';
}

export function managementContentStatusLabel(status: string): string {
  return ({
    idea: 'Ý tưởng', draft: 'Bản nháp', generating: 'Đang tạo Content', in_production: 'Đang sản xuất',
    post_production: 'Chờ hậu kỳ', awaiting_copy: 'Chờ tạo mô tả', review: 'Chờ duyệt', approved: 'Đã duyệt',
    ready_to_publish: 'Sẵn sàng đăng', scheduled: 'Đã lên lịch', partially_published: 'Đã đăng một phần',
    published: 'Đã đăng', completed: 'Hoàn tất', archived: 'Lưu trữ', test: 'Test',
  } as Record<string, string>)[status] ?? status;
}
