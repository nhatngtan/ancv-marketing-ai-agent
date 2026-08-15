import type { Readable } from 'node:stream';
import { config } from '../config.js';
import { storageBucket } from '../firebase.js';
import type { ProviderCapabilities, PublishingProvider, PublishInput, PublishResult } from './types.js';

const tokenUrl = 'https://oauth2.googleapis.com/token';
const channelUrl = 'https://youtube.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true';
const uploadUrl = 'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

interface StagedMedia {
  sizeBytes: number;
  contentType: string;
  stream: Readable;
}

export interface YouTubeProviderOptions {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  expectedChannelId?: string;
  fetchImpl?: typeof fetch;
  readStagedMedia?: (storagePath: string) => Promise<StagedMedia>;
}

async function defaultReadStagedMedia(storagePath: string): Promise<StagedMedia> {
  const file = storageBucket().file(storagePath);
  const [metadata] = await file.getMetadata();
  const sizeBytes = Number(metadata.size ?? 0);
  if (!Number.isFinite(sizeBytes) || sizeBytes < 1_024) throw new Error('YOUTUBE_STAGING_FILE_INVALID');
  return {
    sizeBytes,
    contentType: String(metadata.contentType ?? 'video/mp4'),
    stream: file.createReadStream(),
  };
}

export class YouTubePublishingProvider implements PublishingProvider {
  readonly platform = 'youtube' as const;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;
  private readonly expectedChannelId: string;
  private readonly fetchImpl: typeof fetch;
  private readonly readStagedMedia: (storagePath: string) => Promise<StagedMedia>;

  constructor(options: YouTubeProviderOptions = {}) {
    this.clientId = (options.clientId ?? config.youtubeOAuthClientId).trim();
    this.clientSecret = (options.clientSecret ?? config.youtubeOAuthClientSecret).trim();
    this.refreshToken = (options.refreshToken ?? config.youtubeRefreshToken).trim();
    this.expectedChannelId = (options.expectedChannelId ?? config.youtubeChannelId).trim();
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.readStagedMedia = options.readStagedMedia ?? defaultReadStagedMedia;
  }

  async getCapabilities(): Promise<ProviderCapabilities> {
    const configured = Boolean(this.clientId && this.clientSecret && this.refreshToken && this.expectedChannelId);
    return {
      authenticationStatus: configured ? 'available' : 'error',
      publishing: configured ? 'verified' : 'unavailable',
      analytics: 'partial',
      limitations: configured
        ? ['Upload yêu cầu duyệt thủ công và luôn dùng privacyStatus=private trong V1.', 'API project chưa audit có thể bị giới hạn private.']
        : ['Thiếu YouTube OAuth credential trong Secret Manager.'],
      mode: configured ? 'semi_automatic' : 'manual',
    };
  }

  async testAuthentication(): Promise<ProviderCapabilities> {
    const accessToken = await this.accessToken();
    const channelId = await this.verifyChannel(accessToken);
    if (channelId !== this.expectedChannelId) throw new Error('YOUTUBE_CHANNEL_MISMATCH');
    return this.getCapabilities();
  }

  async publish(input: PublishInput): Promise<PublishResult> {
    if (!input.stagingPath) return this.failure('YOUTUBE_STAGING_REQUIRED', 'Chưa có file staging tạm thời.');
    if (input.privacyStatus !== 'private') return this.failure('YOUTUBE_PRIVATE_REQUIRED', 'V1 chỉ cho phép upload Riêng tư.');
    try {
      const accessToken = await this.accessToken();
      const channelId = await this.verifyChannel(accessToken);
      if (channelId !== this.expectedChannelId) return this.failure('YOUTUBE_CHANNEL_MISMATCH', 'Sai YouTube channel; không upload.');
      const media = await this.readStagedMedia(input.stagingPath);
      const initiate = await this.fetchImpl(uploadUrl, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-length': String(media.sizeBytes),
          'x-upload-content-type': media.contentType,
        },
        body: JSON.stringify({
          snippet: {
            title: input.title.trim().slice(0, 100),
            description: input.body.trim().slice(0, 5_000),
            categoryId: '22',
          },
          status: { privacyStatus: 'private', selfDeclaredMadeForKids: false },
        }),
        signal: AbortSignal.timeout(60_000),
      });
      const location = initiate.headers.get('location');
      if (!initiate.ok || !location) return this.failure('YOUTUBE_RESUMABLE_SESSION_FAILED', `Không thể tạo phiên upload (${initiate.status}).`);
      const upload = await this.fetchImpl(location, {
        method: 'PUT',
        headers: { 'content-length': String(media.sizeBytes), 'content-type': media.contentType },
        body: media.stream as unknown as BodyInit,
        duplex: 'half',
        signal: AbortSignal.timeout(30 * 60_000),
      } as RequestInit & { duplex: 'half' });
      const uploaded = await upload.json() as { id?: string };
      if (!upload.ok || !uploaded.id) return this.failure('YOUTUBE_UPLOAD_UNCERTAIN', `Upload không hoàn tất chắc chắn (${upload.status}); không retry.`);
      const verify = await this.fetchImpl(`https://youtube.googleapis.com/youtube/v3/videos?part=id,snippet,status&id=${encodeURIComponent(uploaded.id)}`, {
        headers: { authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(60_000),
      });
      const verification = await verify.json() as { items?: Array<{ id: string; snippet?: { channelId?: string }; status?: { privacyStatus?: string } }> };
      const video = verification.items?.find((item) => item.id === uploaded.id);
      if (!verify.ok || video?.snippet?.channelId !== this.expectedChannelId || video?.status?.privacyStatus !== 'private') {
        return this.failure('YOUTUBE_UPLOAD_VERIFICATION_FAILED', `Video ${uploaded.id} cần kiểm tra thủ công; không retry.`, uploaded.id);
      }
      return {
        success: true,
        retryable: false,
        platformPostId: uploaded.id,
        postUrl: `https://youtu.be/${uploaded.id}`,
        channelId: this.expectedChannelId,
        privacyStatus: 'private',
        message: 'Đã upload YouTube ở chế độ Riêng tư và xác minh đúng channel.',
      };
    } catch (error) {
      return this.failure('YOUTUBE_UPLOAD_ERROR_NO_RETRY', error instanceof Error ? error.message : 'YouTube upload thất bại; không retry.');
    }
  }

  private async accessToken(): Promise<string> {
    if (!this.clientId || !this.clientSecret || !this.refreshToken) throw new Error('YOUTUBE_OAUTH_NOT_CONFIGURED');
    const response = await this.fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        refresh_token: this.refreshToken,
        grant_type: 'refresh_token',
      }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json() as { access_token?: string };
    if (!response.ok || !payload.access_token) throw new Error('YOUTUBE_REFRESH_TOKEN_EXCHANGE_FAILED');
    return payload.access_token;
  }

  private async verifyChannel(accessToken: string): Promise<string> {
    const response = await this.fetchImpl(channelUrl, {
      headers: { authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json() as { items?: Array<{ id?: string }> };
    if (!response.ok) throw new Error('YOUTUBE_CHANNEL_REQUEST_FAILED');
    const ids = payload.items?.map((item) => item.id).filter((id): id is string => Boolean(id)) ?? [];
    if (ids.length !== 1 || ids[0] !== this.expectedChannelId) throw new Error('YOUTUBE_CHANNEL_MISMATCH');
    return ids[0];
  }

  private failure(errorCode: string, message: string, platformPostId?: string): PublishResult {
    return { success: false, retryable: false, errorCode, message, ...(platformPostId ? { platformPostId } : {}) };
  }
}
