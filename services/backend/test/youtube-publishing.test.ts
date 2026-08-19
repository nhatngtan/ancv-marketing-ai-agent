import { Readable } from 'node:stream';
import { describe, expect, it, vi } from 'vitest';
import type { ContentRecord, MediaAssetRecord } from '@ancv/shared';
import { YouTubePublishingProvider } from '../src/connectors/youtube-provider.js';
import { assertYouTubePublishEligibility, youtubeJobId } from '../src/modules/publishing-service.js';

function content(overrides: Partial<ContentRecord> = {}): ContentRecord {
  return {
    id: 'content-1', contentId: 'ANCV-VID-2026-TEST', type: 'video', title: 'TEST', topic: 'TEST', body: '',
    status: 'approved', approvedAt: '2026-08-15T00:00:00.000Z', createdAt: 'x', updatedAt: 'x', createdBy: 'editor',
    finalVideoAssetId: 'asset-1',
    platformCopies: { youtube: { platform: 'youtube', title: 'TEST', text: 'Mô tả.', status: 'approved', version: 1 } },
    platforms: [{ platform: 'youtube', mode: 'semi_automatic', status: 'pending' }],
    ...overrides,
  };
}

const asset = {
  id: 'asset-1', contentDocId: 'content-1', contentId: 'ANCV-VID-2026-TEST', kind: 'video_final', storageType: 'local',
  relativePath: 'Projects/ANCV-VID-2026-TEST/Video Final/final.mp4', fileName: 'final.mp4', contentType: 'video/mp4', sizeBytes: 2048,
  status: 'ready', createdAt: 'x', updatedAt: 'x', createdBy: 'editor',
} as MediaAssetRecord;

describe('YouTube publishing safety', () => {
  it('requires approved copy and approved Content', () => {
    expect(() => assertYouTubePublishEligibility(content({ platformCopies: {} }), asset)).toThrow('YOUTUBE_COPY_APPROVAL_REQUIRED');
    expect(() => assertYouTubePublishEligibility(content({ approvedAt: undefined, status: 'review' }), asset)).toThrow('YOUTUBE_CONTENT_APPROVAL_REQUIRED');
    expect(() => assertYouTubePublishEligibility(content(), asset)).not.toThrow();
    expect(() => assertYouTubePublishEligibility(content({ status: 'scheduled' }), asset)).not.toThrow();
  });

  it('uses one deterministic job ID per Content', () => {
    expect(youtubeJobId('content-1')).toBe('youtube-content-1');
    expect(youtubeJobId('content-1')).toBe(youtubeJobId('content-1'));
  });

  it('fails closed on channel mismatch before upload', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'wrong-channel' }] }), { status: 200 }));
    const provider = new YouTubePublishingProvider({ clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', expectedChannelId: 'expected', fetchImpl });
    const result = await provider.publish({ idempotencyKey: 'key', contentId: 'content-1', title: 'TEST', body: 'TEST', mediaUrls: [], stagingPath: 'stage/test.mp4', privacyStatus: 'private' });
    expect(result).toMatchObject({ success: false, retryable: false, errorCode: 'YOUTUBE_UPLOAD_ERROR_NO_RETRY' });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('uploads once, verifies the expected channel and remains private', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'expected' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { location: 'https://upload.example/session' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'video-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'video-1', snippet: { channelId: 'expected' }, status: { privacyStatus: 'private' } }] }), { status: 200 }));
    const provider = new YouTubePublishingProvider({
      clientId: 'id\r\n', clientSecret: 'secret\n', refreshToken: 'refresh\r\n', expectedChannelId: 'expected\n', fetchImpl,
      readStagedMedia: async () => ({ sizeBytes: 2048, contentType: 'video/mp4', stream: Readable.from(Buffer.alloc(2048)) }),
    });
    const result = await provider.publish({ idempotencyKey: 'key', contentId: 'content-1', title: 'TEST', body: 'TEST', mediaUrls: [], stagingPath: 'stage/test.mp4', privacyStatus: 'private' });
    expect(result).toMatchObject({ success: true, platformPostId: 'video-1', channelId: 'expected', privacyStatus: 'private' });
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(String(fetchImpl.mock.calls[0]?.[1]?.body)).toBe('client_id=id&client_secret=secret&refresh_token=refresh&grant_type=refresh_token');
    expect(fetchImpl.mock.calls.filter(([url, init]) => String(url).includes('/session') && (init as RequestInit).method === 'PUT')).toHaveLength(1);
  });

  it('publishes immediately as public and verifies the final state', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'expected' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { location: 'https://upload.example/session-public' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'video-public' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'video-public', snippet: { channelId: 'expected' }, status: { privacyStatus: 'public' } }] }), { status: 200 }));
    const provider = new YouTubePublishingProvider({
      clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', expectedChannelId: 'expected', fetchImpl,
      readStagedMedia: async () => ({ sizeBytes: 2048, contentType: 'video/mp4', stream: Readable.from(Buffer.alloc(2048)) }),
    });
    const result = await provider.publish({ idempotencyKey: 'key', contentId: 'content-1', title: 'TEST', body: 'TEST', mediaUrls: [], stagingPath: 'stage/test.mp4', privacyStatus: 'public' });
    expect(result).toMatchObject({ success: true, platformPostId: 'video-public', privacyStatus: 'public' });
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toMatchObject({ status: { privacyStatus: 'public' } });
  });

  it('schedules once using private plus publishAt and verifies the schedule', async () => {
    const scheduledAt = '2099-08-20T03:00:00.000Z';
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'expected' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { location: 'https://upload.example/session-scheduled' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'video-scheduled' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'video-scheduled', snippet: { channelId: 'expected' }, status: { privacyStatus: 'private', publishAt: scheduledAt } }] }), { status: 200 }));
    const provider = new YouTubePublishingProvider({
      clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', expectedChannelId: 'expected', fetchImpl,
      readStagedMedia: async () => ({ sizeBytes: 2048, contentType: 'video/mp4', stream: Readable.from(Buffer.alloc(2048)) }),
    });
    const result = await provider.publish({ idempotencyKey: 'key', contentId: 'content-1', title: 'TEST', body: 'TEST', mediaUrls: [], stagingPath: 'stage/test.mp4', privacyStatus: 'private', scheduledAt });
    expect(result).toMatchObject({ success: true, privacyStatus: 'private', scheduledAt });
    expect(JSON.parse(String(fetchImpl.mock.calls[2]?.[1]?.body))).toMatchObject({ status: { privacyStatus: 'private', publishAt: scheduledAt } });
  });

  it('fails closed without another upload when verification is uncertain', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'expected' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200, headers: { location: 'https://upload.example/session-uncertain' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'video-uncertain' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'video-uncertain', snippet: { channelId: 'expected' }, status: { privacyStatus: 'private' } }] }), { status: 200 }));
    const provider = new YouTubePublishingProvider({
      clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', expectedChannelId: 'expected', fetchImpl,
      readStagedMedia: async () => ({ sizeBytes: 2048, contentType: 'video/mp4', stream: Readable.from(Buffer.alloc(2048)) }),
    });
    const result = await provider.publish({ idempotencyKey: 'key', contentId: 'content-1', title: 'TEST', body: 'TEST', mediaUrls: [], stagingPath: 'stage/test.mp4', privacyStatus: 'public' });
    expect(result).toMatchObject({ success: false, retryable: false, errorCode: 'YOUTUBE_UPLOAD_VERIFICATION_FAILED' });
    expect(fetchImpl.mock.calls.filter(([url, init]) => String(url).includes('/session-uncertain') && (init as RequestInit).method === 'PUT')).toHaveLength(1);
  });
});
