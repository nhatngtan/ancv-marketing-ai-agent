import type {
  ConnectorRecord, ContentRecord, ContentStatus, FlowJobRecord, LocalAgentRecord, MarketingDashboardResponse,
  MarketingPipelineItem, MarketingQuickAction, MarketingTodayAction, MarketingWorkItem, MediaAssetRecord, Platform, PublishingJobRecord, SceneRecord,
  YouTubeContentMetric, YouTubePeriodMetrics,
} from '@ancv/shared';
import { config } from '../config.js';
import { db } from '../firebase.js';

type UnknownRecord = Record<string, unknown>;

interface ReportingDocuments {
  contents: ContentRecord[];
  scenes: SceneRecord[];
  assets: MediaAssetRecord[];
  publishingJobs: PublishingJobRecord[];
  flowJobs: FlowJobRecord[];
  localAgents: LocalAgentRecord[];
  connectors: ConnectorRecord[];
  openAIStatus?: string;
}

interface YouTubeReportingOptions {
  fetchImpl?: typeof fetch;
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
  expectedChannelId?: string;
}

const completedStatuses = new Set(['published', 'completed', 'archived']);
const workingStatuses = new Set(['idea', 'draft', 'generating', 'in_production', 'post_production', 'awaiting_copy']);
const socialPlatforms = new Set<Platform>(['facebook', 'tiktok', 'linkedin', 'zalo']);

export function isoDate(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
  }
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value === 'object') {
    const record = value as { toDate?: () => Date; _seconds?: number; seconds?: number };
    if (typeof record.toDate === 'function') return record.toDate().toISOString();
    const seconds = record._seconds ?? record.seconds;
    if (typeof seconds === 'number') return new Date(seconds * 1_000).toISOString();
  }
  return undefined;
}

function inDateRange(value: unknown, from: string, to: string): boolean {
  const date = isoDate(value)?.slice(0, 10);
  return Boolean(date && date >= from && date <= to);
}

function inMonth(value: unknown, month: string): boolean {
  return isoDate(value)?.startsWith(month) ?? false;
}

function contentAssets(contentId: string, assets: MediaAssetRecord[]) {
  return assets.filter((item) => item.contentDocId === contentId);
}

export function derivePipelineItem(
  content: ContentRecord,
  scenes: SceneRecord[],
  assets: MediaAssetRecord[],
): MarketingPipelineItem {
  let progress = 0;
  let currentStep = content.type === 'video' ? 'MASTER SCRIPT' : 'Bản nháp';
  const relatedScenes = scenes.filter((scene) => scene.contentDocId === content.id);
  const relatedAssets = contentAssets(content.id, assets);
  const published = (content.platforms ?? []).filter((item) => item.status === 'published').length;

  if (content.type === 'video') {
    if (content.masterScript?.trim()) { progress = 15; currentStep = 'Phân cảnh'; }
    if (relatedScenes.length > 0) { progress = 32; currentStep = 'Video Raw'; }
    if (relatedAssets.some((item) => item.kind === 'scene_take')) { progress = 50; currentStep = 'Video Final'; }
    if (content.finalVideoAssetId || relatedAssets.some((item) => item.kind === 'video_final' && item.selected)) { progress = 68; currentStep = 'Nội dung nền tảng'; }
    if (Object.keys(content.platformCopies ?? {}).length > 0) { progress = 84; currentStep = 'Đăng Content'; }
  } else {
    if (content.body?.trim()) { progress = 20; currentStep = 'SEO'; }
    if (content.articleSeo?.seoTitle?.trim()) { progress = 42; currentStep = 'Hình ảnh'; }
    if (content.selectedImageId || relatedAssets.some((item) => item.kind === 'article_image' && item.selected)) { progress = 62; currentStep = 'Nội dung mạng xã hội'; }
    if (Object.keys(content.platformCopies ?? {}).length > 0) { progress = 78; currentStep = 'WordPress Draft'; }
    if (content.wordpressDraft) { progress = 92; currentStep = 'Đăng Website'; }
  }
  if (content.status === 'ready_to_publish' || content.status === 'scheduled') progress = Math.max(progress, 94);
  if (published > 0 && !completedStatuses.has(content.status)) { progress = Math.max(progress, 96); currentStep = 'Đăng Content'; }
  if (completedStatuses.has(content.status)) { progress = 100; currentStep = 'Hoàn tất'; }

  return {
    id: content.id,
    contentId: content.contentId,
    title: content.title,
    type: content.type,
    status: content.status as ContentStatus,
    currentStep,
    progress,
    ...(content.dueDate ? { dueDate: content.dueDate } : {}),
    priority: content.priority ?? 'normal',
    platforms: (content.platforms ?? []).map((item) => ({ platform: item.platform, status: item.status })),
    updatedAt: isoDate(content.updatedAt) ?? new Date(0).toISOString(),
  };
}

const operationStatusLabels: Record<string, string> = {
  idea: 'Ý tưởng', draft: 'Bản nháp', generating: 'Đang tạo nội dung', in_production: 'Đang sản xuất',
  post_production: 'Chờ hậu kỳ', awaiting_copy: 'Chờ nội dung nền tảng', review: 'Cần duyệt', approved: 'Đã duyệt',
  ready_to_publish: 'Sẵn sàng đăng', scheduled: 'Đã lên lịch', partially_published: 'Đã đăng một phần',
  published: 'Đã đăng', completed: 'Hoàn tất', archived: 'Đã lưu trữ', test: 'Dữ liệu test',
};

function quickAction(content: ContentRecord, pipeline: MarketingPipelineItem): { action: MarketingQuickAction; label: string } {
  if (content.type === 'article') {
    if (content.wordpressDraft) return { action: 'open_wordpress', label: 'Mở WordPress Draft' };
    if (['approved', 'ready_to_publish', 'scheduled'].includes(content.status)) return { action: 'open_wordpress', label: 'Mở WordPress Draft' };
    return { action: 'open_article', label: content.body?.trim() ? 'Mở bài viết' : 'Mở bài viết' };
  }
  if (pipeline.currentStep === 'MASTER SCRIPT' || pipeline.currentStep === 'Phân cảnh') return { action: 'open_script', label: 'Mở Kịch bản' };
  if (pipeline.currentStep === 'Video Final') return { action: 'open_video_folder', label: 'Mở thư mục Video' };
  if (['approved', 'ready_to_publish', 'scheduled'].includes(content.status) || pipeline.progress >= 84) return { action: 'open_publish', label: 'Mở bước Đăng' };
  return { action: 'open_script', label: 'Mở Video' };
}

function statusGroup(status: ContentStatus): MarketingWorkItem['statusGroup'] {
  if (completedStatuses.has(status)) return 'completed';
  if (status === 'review') return 'review';
  if (['approved', 'ready_to_publish', 'scheduled'].includes(status)) return 'ready';
  return 'working';
}

export function deriveMarketingOperations(documents: Pick<ReportingDocuments, 'contents' | 'scenes' | 'assets' | 'flowJobs' | 'publishingJobs'>, now = new Date()): MarketingDashboardResponse['operations'] {
  const today = now.toISOString().slice(0, 10);
  const pipelines = new Map(documents.contents.map((content) => [content.id, derivePipelineItem(content, documents.scenes, documents.assets)]));
  const work: MarketingWorkItem[] = documents.contents
    .filter((content) => content.status !== 'test')
    .map((content) => {
      const pipeline = pipelines.get(content.id)!;
      const action = quickAction(content, pipeline);
      return {
        ...pipeline,
        statusGroup: statusGroup(content.status as ContentStatus),
        statusLabel: operationStatusLabels[content.status] ?? 'Đang làm',
        overdue: Boolean(content.dueDate && content.dueDate < today && !completedStatuses.has(content.status)),
        quickAction: action.action,
        quickActionLabel: action.label,
      };
    })
    .sort((left, right) => Number(right.priority === 'high') - Number(left.priority === 'high') || Number(right.overdue) - Number(left.overdue) || right.updatedAt.localeCompare(left.updatedAt));

  const actions: MarketingTodayAction[] = [];
  for (const content of documents.contents) {
    if (completedStatuses.has(content.status) || content.status === 'test') continue;
    const pipeline = pipelines.get(content.id)!;
    const assets = documents.assets.filter((asset) => asset.contentDocId === content.id);
    const flowNeedsManual = documents.flowJobs.some((job) => job.contentDocId === content.id && job.status === 'needs_manual');
    const copies = Object.values(content.platformCopies ?? {});
    const copiesNeedReview = copies.length > 0 && copies.some((copy) => copy?.status !== 'approved');
    const finalMissing = content.type === 'video' && assets.some((asset) => asset.kind === 'scene_take') && !content.finalVideoAssetId && !assets.some((asset) => asset.kind === 'video_final' && asset.selected);
    const wordpressMissing = content.type === 'article' && ['approved', 'ready_to_publish', 'scheduled'].includes(content.status) && !content.wordpressDraft;
    const youtubeMissing = content.type === 'video' && ['approved', 'ready_to_publish', 'scheduled'].includes(content.status) && !documents.publishingJobs.some((job) => job.contentDocId === content.id && job.status === 'succeeded');
    const overdue = Boolean(content.dueDate && content.dueDate < today);
    let reason: MarketingTodayAction['reason'] = 'continue_work';
    let label = `${content.title} — tiếp tục ${pipeline.currentStep.toLocaleLowerCase('vi')}`;
    if (overdue) { reason = 'overdue'; label = `${content.title} — đã quá hạn`; }
    else if (flowNeedsManual) { reason = 'flow_needs_manual'; label = `${content.title} — Google Flow cần kiểm tra`; }
    else if (content.status === 'review') { reason = 'review'; label = `${content.title} — cần duyệt`; }
    else if (finalMissing) { reason = 'missing_final'; label = `${content.title} — cần hậu kỳ`; }
    else if (copiesNeedReview) { reason = 'copies_review'; label = `${content.title} — nội dung nền tảng cần duyệt`; }
    else if (wordpressMissing) { reason = 'wordpress_draft'; label = `${content.title} — cần tạo WordPress Draft`; }
    else if (youtubeMissing) { reason = 'youtube_upload'; label = `${content.title} — chưa tải lên YouTube`; }
    const action = quickAction(content, pipeline);
    actions.push({
      id: `${content.id}:${reason}`, contentDocId: content.id, contentId: content.contentId, title: content.title,
      type: content.type, label, reason, priority: content.priority ?? 'normal', ...(content.dueDate ? { dueDate: content.dueDate } : {}), quickAction: action.action,
    });
  }
  const reasonRank: Record<MarketingTodayAction['reason'], number> = { overdue: 0, flow_needs_manual: 1, review: 2, missing_final: 3, copies_review: 4, wordpress_draft: 5, youtube_upload: 6, continue_work: 7 };
  actions.sort((left, right) => Number(right.priority === 'high') - Number(left.priority === 'high') || reasonRank[left.reason] - reasonRank[right.reason] || String(left.dueDate ?? '9999').localeCompare(String(right.dueDate ?? '9999')));
  return { work, today: actions.slice(0, 8) };
}

function publishedPlatformEntries(contents: ContentRecord[]) {
  return contents.flatMap((content) => (content.platforms ?? [])
    .filter((publication) => publication.status === 'published')
    .map((publication) => ({ content, publication })));
}

function daysAgo(days: number, now: Date): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return date.toISOString().slice(0, 10);
}

function numberValue(value: unknown): number {
  const numeric = Number(value ?? 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function reportRow(payload: UnknownRecord): Record<string, unknown> {
  const headers = Array.isArray(payload.columnHeaders) ? payload.columnHeaders as Array<{ name?: string }> : [];
  const row = Array.isArray(payload.rows) && Array.isArray(payload.rows[0]) ? payload.rows[0] as unknown[] : [];
  return Object.fromEntries(headers.map((header, index) => [String(header.name ?? index), row[index]]));
}

async function jsonRequest(fetchImpl: typeof fetch, url: URL | string, accessToken: string): Promise<UnknownRecord> {
  const response = await fetchImpl(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(30_000),
  });
  const payload = await response.json() as UnknownRecord;
  if (!response.ok) throw new Error(`YOUTUBE_REPORTING_REQUEST_FAILED_${response.status}`);
  return payload;
}

export class YouTubeReportingClient {
  private readonly fetchImpl: typeof fetch;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly refreshToken: string;
  private readonly expectedChannelId: string;

  constructor(options: YouTubeReportingOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.clientId = (options.clientId ?? config.youtubeOAuthClientId).trim();
    this.clientSecret = (options.clientSecret ?? config.youtubeOAuthClientSecret).trim();
    this.refreshToken = (options.refreshToken ?? config.youtubeRefreshToken).trim();
    this.expectedChannelId = (options.expectedChannelId ?? config.youtubeChannelId).trim();
  }

  async read(from: string, to: string, publishingJobs: PublishingJobRecord[], contents: ContentRecord[], now = new Date()) {
    if (!this.clientId || !this.clientSecret || !this.refreshToken || !this.expectedChannelId) throw new Error('YOUTUBE_OAUTH_NOT_CONFIGURED');
    const accessToken = await this.accessToken();
    const channelUrl = new URL('https://youtube.googleapis.com/youtube/v3/channels');
    channelUrl.search = new URLSearchParams({ part: 'id,snippet,statistics', mine: 'true' }).toString();
    const channelPayload = await jsonRequest(this.fetchImpl, channelUrl, accessToken);
    const channels = Array.isArray(channelPayload.items) ? channelPayload.items as UnknownRecord[] : [];
    const channel = channels.find((item) => item.id === this.expectedChannelId);
    if (!channel) throw new Error('YOUTUBE_CHANNEL_MISMATCH');
    const statistics = (channel.statistics ?? {}) as UnknownRecord;
    const snippet = (channel.snippet ?? {}) as UnknownRecord;
    const [range, last7Days, last28Days, topVideos] = await Promise.all([
      this.metrics(accessToken, from, to),
      this.metrics(accessToken, daysAgo(7, now), now.toISOString().slice(0, 10)),
      this.metrics(accessToken, daysAgo(28, now), now.toISOString().slice(0, 10)),
      this.topVideos(accessToken, from, to, publishingJobs, contents),
    ]);
    return {
      status: 'connected' as const,
      auth: 'pass' as const,
      channelId: this.expectedChannelId,
      channelTitle: String(snippet.title ?? ''),
      videoCount: numberValue(statistics.videoCount),
      range,
      last7Days,
      last28Days,
      topVideos,
    };
  }

  private async accessToken(): Promise<string> {
    const response = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: this.clientId, client_secret: this.clientSecret, refresh_token: this.refreshToken, grant_type: 'refresh_token' }),
      signal: AbortSignal.timeout(30_000),
    });
    const payload = await response.json() as { access_token?: string };
    if (!response.ok || !payload.access_token) throw new Error('YOUTUBE_REFRESH_TOKEN_EXCHANGE_FAILED');
    return payload.access_token;
  }

  private async metrics(accessToken: string, from: string, to: string): Promise<YouTubePeriodMetrics> {
    const url = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    url.search = new URLSearchParams({
      ids: 'channel==MINE', startDate: from, endDate: to,
      metrics: 'views,estimatedMinutesWatched,subscribersGained,likes,comments',
    }).toString();
    const values = reportRow(await jsonRequest(this.fetchImpl, url, accessToken));
    return {
      from, to,
      views: numberValue(values.views),
      watchMinutes: numberValue(values.estimatedMinutesWatched),
      subscribersGained: numberValue(values.subscribersGained),
      likes: numberValue(values.likes),
      comments: numberValue(values.comments),
    };
  }

  private async topVideos(
    accessToken: string,
    from: string,
    to: string,
    publishingJobs: PublishingJobRecord[],
    contents: ContentRecord[],
  ): Promise<YouTubeContentMetric[]> {
    const analyticsUrl = new URL('https://youtubeanalytics.googleapis.com/v2/reports');
    analyticsUrl.search = new URLSearchParams({
      ids: 'channel==MINE', startDate: from, endDate: to,
      metrics: 'views,estimatedMinutesWatched,likes', dimensions: 'video', sort: '-views', maxResults: '10',
    }).toString();
    const analytics = await jsonRequest(this.fetchImpl, analyticsUrl, accessToken);
    const headers = Array.isArray(analytics.columnHeaders) ? analytics.columnHeaders as Array<{ name?: string }> : [];
    const rows = Array.isArray(analytics.rows) ? analytics.rows as unknown[][] : [];
    const videoIndex = headers.findIndex((item) => item.name === 'video');
    const videoIds = rows.map((row) => String(row[videoIndex] ?? '')).filter(Boolean);
    if (videoIds.length === 0) return [];
    const videoUrl = new URL('https://youtube.googleapis.com/youtube/v3/videos');
    videoUrl.search = new URLSearchParams({ part: 'snippet', id: videoIds.join(',') }).toString();
    const videosPayload = await jsonRequest(this.fetchImpl, videoUrl, accessToken);
    const videos = new Map((Array.isArray(videosPayload.items) ? videosPayload.items as UnknownRecord[] : [])
      .map((item) => [String(item.id ?? ''), (item.snippet ?? {}) as UnknownRecord]));
    const contentById = new Map(contents.map((content) => [content.id, content]));
    const jobByVideo = new Map(publishingJobs.filter((job) => job.videoId).map((job) => [job.videoId!, job]));
    return rows.map((row) => {
      const values = Object.fromEntries(headers.map((header, index) => [String(header.name ?? index), row[index]]));
      const videoId = String(values.video ?? '');
      const job = jobByVideo.get(videoId);
      const content = job ? contentById.get(job.contentDocId) : undefined;
      const snippet = videos.get(videoId);
      return {
        videoId,
        ...(content ? { contentDocId: content.id, contentId: content.contentId } : {}),
        title: content?.title ?? String(snippet?.title ?? videoId),
        ...(snippet?.publishedAt ? { publishedAt: String(snippet.publishedAt) } : {}),
        views: numberValue(values.views),
        watchMinutes: numberValue(values.estimatedMinutesWatched),
        likes: numberValue(values.likes),
      };
    });
  }
}

export function buildMarketingDashboard(
  documents: ReportingDocuments,
  youtube: MarketingDashboardResponse['youtube'],
  from: string,
  to: string,
  now = new Date(),
): MarketingDashboardResponse {
  const month = now.toISOString().slice(0, 7);
  const entries = publishedPlatformEntries(documents.contents);
  const byPlatform: Partial<Record<Platform, number>> = {};
  for (const { publication } of entries) byPlatform[publication.platform] = (byPlatform[publication.platform] ?? 0) + 1;
  const contentInRange = documents.contents.filter((content) => inDateRange(content.updatedAt, from, to));
  const completedInRange = contentInRange.filter((content) => completedStatuses.has(content.status));
  const agent = documents.localAgents.find((item) => item.id === 'ancv-windows-01') ?? documents.localAgents[0];
  const agentOnline = Boolean(agent?.status === 'online' && now.getTime() - new Date(isoDate(agent.lastSeen) ?? 0).getTime() < 45_000);
  const flowNeedsManual = documents.flowJobs.filter((job) => job.status === 'needs_manual').length;
  const publishingErrors = documents.publishingJobs.filter((job) => job.status === 'needs_manual').length;
  const connector = (platform: Platform) => documents.connectors.find((item) => item.platform === platform);
  const ga4Connected = connector('ga4')?.status === 'available';
  const gscConnected = connector('search_console')?.status === 'available';
  const wordpressConnected = ['available', 'partially_available'].includes(connector('website')?.status ?? '');
  const reportPublications = entries.filter(({ publication }) => inDateRange(publication.publishedAt, from, to));
  const pipeline = documents.contents
    .map((content) => derivePipelineItem(content, documents.scenes, documents.assets))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const youtubePublishedThisMonth = documents.publishingJobs.filter((job) => job.status === 'succeeded' && inMonth(job.completedAt, month)).length;
  const socialPublishedThisMonth = entries.filter(({ publication }) => socialPlatforms.has(publication.platform) && inMonth(publication.publishedAt, month)).length;
  const websiteArticlesThisMonth = documents.contents.filter((content) => content.type === 'article' && (
    inMonth(content.wordpressDraft?.createdAt, month)
    || (content.platforms ?? []).some((item) => item.platform === 'website' && item.status === 'published' && inMonth(item.publishedAt, month))
  )).length;
  const aiOperational = documents.openAIStatus === 'available';
  const flowStatus = agentOnline ? (flowNeedsManual > 0 ? 'partial' : 'operational') : 'manual';
  const missingSources = [!ga4Connected ? 'GA4' : '', !gscConnected ? 'Search Console' : '', youtube.status !== 'connected' ? 'YouTube' : ''].filter(Boolean);

  return {
    generatedAt: now.toISOString(),
    range: { from, to },
    content: {
      total: documents.contents.length,
      inProgress: documents.contents.filter((content) => workingStatuses.has(content.status)).length,
      awaitingApproval: documents.contents.filter((content) => content.status === 'review').length,
      readyToPublish: documents.contents.filter((content) => ['approved', 'ready_to_publish', 'scheduled'].includes(content.status)).length,
      completed: documents.contents.filter((content) => completedStatuses.has(content.status)).length,
    },
    month: {
      videos: documents.contents.filter((content) => content.type === 'video' && inMonth(content.createdAt, month)).length,
      websiteArticles: websiteArticlesThisMonth,
      youtubePublished: youtubePublishedThisMonth,
      socialPublished: socialPublishedThisMonth,
    },
    pending: {
      flowNeedsManual,
      publishingErrors,
      localAgentOffline: !agentOnline,
      awaitingApproval: documents.contents.filter((content) => content.status === 'review').length,
    },
    publishing: { total: entries.length, byPlatform },
    pipeline,
    operations: deriveMarketingOperations(documents, now),
    youtube,
    analytics: {
      ga4: { status: ga4Connected ? 'connected' : 'not_connected', label: ga4Connected ? 'Đã kết nối' : 'Chưa kết nối thuộc tính' },
      searchConsole: { status: gscConnected ? 'connected' : 'not_connected', label: gscConnected ? 'Đã kết nối' : 'Chưa kết nối thuộc tính' },
    },
    health: [
      { key: 'ai', label: 'AI', status: aiOperational ? 'operational' : 'partial', detail: aiOperational ? 'Hoạt động' : 'Cần kiểm tra cấu hình' },
      { key: 'flow', label: 'Google Flow', status: flowStatus, detail: agentOnline ? (flowNeedsManual ? `${flowNeedsManual} tác vụ cần xử lý` : 'Sẵn sàng · Experimental') : 'Vận hành thủ công' },
      { key: 'local_agent', label: 'Local Agent', status: agentOnline ? 'operational' : 'offline', detail: agentOnline ? 'Online' : 'Offline' },
      { key: 'youtube', label: 'YouTube', status: youtube.status === 'connected' ? 'operational' : 'partial', detail: youtube.status === 'connected' ? 'Đã kết nối dữ liệu' : 'Dữ liệu không khả dụng' },
      { key: 'wordpress', label: 'WordPress', status: wordpressConnected ? 'partial' : 'manual', detail: wordpressConnected ? 'Kết nối bán tự động' : 'Đăng thủ công' },
      { key: 'ga4', label: 'GA4', status: ga4Connected ? 'operational' : 'not_connected', detail: ga4Connected ? 'Đã kết nối' : 'Chưa kết nối thuộc tính' },
      { key: 'search_console', label: 'Search Console', status: gscConnected ? 'operational' : 'not_connected', detail: gscConnected ? 'Đã kết nối' : 'Chưa kết nối thuộc tính' },
    ],
    report: {
      completedVideos: completedInRange.filter((content) => content.type === 'video').length,
      completedArticles: completedInRange.filter((content) => content.type === 'article').length,
      publishedPosts: reportPublications.length,
      pendingContents: contentInRange.filter((content) => !completedStatuses.has(content.status)).length,
      ...(youtube.range ? { youtubeViews: youtube.range.views, youtubeWatchMinutes: youtube.range.watchMinutes } : {}),
      availableSources: ['Firestore', ...(youtube.status === 'connected' ? ['YouTube'] : []), ...(ga4Connected ? ['GA4'] : []), ...(gscConnected ? ['Search Console'] : [])],
      missingSources,
    },
  };
}

async function collection<T>(name: string): Promise<T[]> {
  const snapshot = await db().collection(name).get();
  return snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as T));
}

export async function getMarketingDashboard(from: string, to: string, now = new Date()): Promise<MarketingDashboardResponse> {
  const [contents, scenes, assets, publishingJobs, flowJobs, localAgents, connectors, openAISetting] = await Promise.all([
    collection<ContentRecord>('contents'),
    collection<SceneRecord>('scenes'),
    collection<MediaAssetRecord>('mediaAssets'),
    collection<PublishingJobRecord>('publishingJobs'),
    collection<FlowJobRecord>('flowJobs'),
    collection<LocalAgentRecord>('localAgents'),
    collection<ConnectorRecord>('connectors'),
    db().collection('systemSettings').doc('openai').get(),
  ]);
  let youtube: MarketingDashboardResponse['youtube'];
  try {
    youtube = await new YouTubeReportingClient().read(from, to, publishingJobs, contents, now);
  } catch (error) {
    youtube = {
      status: 'unavailable', auth: 'unavailable', topVideos: [],
      message: error instanceof Error ? error.message : 'YOUTUBE_REPORTING_UNAVAILABLE',
    };
  }
  return buildMarketingDashboard({
    contents, scenes, assets, publishingJobs, flowJobs, localAgents, connectors,
    openAIStatus: String(openAISetting.data()?.status ?? ''),
  }, youtube, from, to, now);
}
