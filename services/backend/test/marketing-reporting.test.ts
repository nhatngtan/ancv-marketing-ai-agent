import { describe, expect, it, vi } from 'vitest';
import type { ConnectorRecord, ContentRecord, MarketingDashboardResponse, PublishingJobRecord } from '@ancv/shared';
import { buildMarketingDashboard, deriveMarketingOperations, derivePipelineItem, YouTubeReportingClient } from '../src/services/marketing-reporting.js';

const now = new Date('2026-08-15T08:00:00.000Z');

function content(overrides: Partial<ContentRecord>): ContentRecord {
  return {
    id: 'content-1', contentId: 'ANCV-VID-2026-001', type: 'video', title: 'Content test', topic: 'Test', body: '',
    createdAt: '2026-08-10T00:00:00.000Z', updatedAt: '2026-08-14T00:00:00.000Z', createdBy: 'tester', status: 'draft', platforms: [],
    ...overrides,
  };
}

function connector(platform: ConnectorRecord['platform'], status: ConnectorRecord['status']): ConnectorRecord {
  return {
    id: platform, platform, status, authenticationStatus: status, publishingCapability: 'unverified', analyticsCapability: 'unverified',
    scopes: [], quotaNotes: '', reviewStatus: 'not_tested', testedAt: null, testedBy: null, limitations: [],
    recommendedMode: 'manual', mode: 'manual', adminOverride: false,
    createdAt: now.toISOString(), updatedAt: now.toISOString(), createdBy: 'system',
  };
}

const youtubeUnavailable: MarketingDashboardResponse['youtube'] = {
  status: 'unavailable', auth: 'unavailable', topVideos: [], message: 'not configured',
};

describe('marketing reporting aggregation', () => {
  it('derives the video and article pipelines only from persisted evidence', () => {
    const video = content({ masterScript: 'Script', finalVideoAssetId: 'final', platformCopies: { youtube: { platform: 'youtube', title: 'T', text: 'M', status: 'approved', version: 1 } } });
    expect(derivePipelineItem(video, [{ id: 'scene-1', contentDocId: video.id, sceneNumber: 1 } as never], [])).toMatchObject({ currentStep: 'Đăng Content', progress: 84 });
    const article = content({ id: 'article-1', type: 'article', contentId: 'ANCV-ART-2026-001', body: 'Draft', articleSeo: { seoTitle: 'SEO' } as never, selectedImageId: 'image-1' });
    expect(derivePipelineItem(article, [], [])).toMatchObject({ currentStep: 'Nội dung mạng xã hội', progress: 62 });
  });

  it('counts approvals, needs_manual, publications, month totals and grounded report range', () => {
    const records = [
      content({ id: 'video-review', status: 'review' }),
      content({ id: 'video-done', status: 'published', platforms: [{ platform: 'youtube', mode: 'semi_automatic', status: 'published', publishedAt: '2026-08-12T00:00:00.000Z' }] }),
      content({ id: 'article-done', type: 'article', contentId: 'ANCV-ART-2026-001', status: 'partially_published', wordpressDraft: { siteUrl: 'https://anninhcanhve.com', postId: 1, featuredMediaId: 2, status: 'draft', slug: 'test', yoastMetadata: 'not_synced', createdAt: '2026-08-13T00:00:00.000Z', createdBy: 'tester' }, platforms: [{ platform: 'facebook', mode: 'manual', status: 'published', publishedAt: '2026-08-13T00:00:00.000Z' }] }),
    ];
    const result = buildMarketingDashboard({
      contents: records, scenes: [], assets: [],
      publishingJobs: [{ id: 'yt', contentDocId: 'video-done', status: 'succeeded', completedAt: '2026-08-12T00:00:00.000Z' } as PublishingJobRecord],
      flowJobs: [{ id: 'flow', contentDocId: 'video-review', status: 'needs_manual' } as never], localAgents: [], connectors: [], openAIStatus: 'available',
    }, youtubeUnavailable, '2026-08-01', '2026-08-15', now);
    expect(result.content).toMatchObject({ awaitingApproval: 1, completed: 1 });
    expect(result.pending).toMatchObject({ flowNeedsManual: 1, localAgentOffline: true, awaitingApproval: 1 });
    expect(result.month).toMatchObject({ youtubePublished: 1, socialPublished: 1, websiteArticles: 1 });
    expect(result.publishing).toMatchObject({ total: 2, byPlatform: { youtube: 1, facebook: 1 } });
    expect(result.report).toMatchObject({ completedVideos: 1, completedArticles: 0, publishedPosts: 2, pendingContents: 2 });
  });

  it('never fabricates GA4 or Search Console data when connectors are unavailable', () => {
    const result = buildMarketingDashboard({
      contents: [], scenes: [], assets: [], publishingJobs: [], flowJobs: [], localAgents: [],
      connectors: [connector('ga4', 'partially_available'), connector('search_console', 'not_tested')],
    }, youtubeUnavailable, '2026-08-01', '2026-08-15', now);
    expect(result.analytics.ga4).toEqual({ status: 'not_connected', label: 'Chưa kết nối thuộc tính' });
    expect(result.analytics.searchConsole).toEqual({ status: 'not_connected', label: 'Chưa kết nối thuộc tính' });
    expect(result.report).not.toHaveProperty('ga4');
    expect(result.report.missingSources).toEqual(expect.arrayContaining(['GA4', 'Search Console', 'YouTube']));
  });

  it('keeps legacy Content without platform arrays readable', () => {
    const legacy = content({ platforms: undefined as never });
    const result = buildMarketingDashboard({
      contents: [legacy], scenes: [], assets: [], publishingJobs: [], flowJobs: [], localAgents: [], connectors: [],
    }, youtubeUnavailable, '2026-08-01', '2026-08-15', now);
    expect(result.publishing.total).toBe(0);
    expect(result.pipeline[0]?.platforms).toEqual([]);
    expect(result.operations.work[0]).toMatchObject({ priority: 'normal', overdue: false });
  });

  it('derives deadline, priority, progress, today action and quick action without a task collection', () => {
    const video = content({ id: 'video-overdue', dueDate: '2026-08-14', priority: 'high', masterScript: 'Script' });
    const article = content({ id: 'article-review', contentId: 'ANCV-ART-2026-002', type: 'article', title: 'Bài cần duyệt', body: 'Bài SEO', status: 'review' });
    const operations = deriveMarketingOperations({ contents: [video, article], scenes: [], assets: [], flowJobs: [], publishingJobs: [] }, now);
    expect(operations.work[0]).toMatchObject({ id: 'video-overdue', priority: 'high', overdue: true, progress: 15, quickAction: 'open_script' });
    expect(operations.today[0]).toMatchObject({ contentDocId: 'video-overdue', reason: 'overdue', priority: 'high' });
    expect(operations.today[1]).toMatchObject({ contentDocId: 'article-review', reason: 'review' });
  });

  it('does not report an online Local Agent when its heartbeat is stale', () => {
    const result = buildMarketingDashboard({
      contents: [], scenes: [], assets: [], publishingJobs: [], flowJobs: [], connectors: [],
      localAgents: [{ id: 'ancv-windows-01', status: 'online', lastSeen: '2026-08-15T07:58:00.000Z' } as never],
    }, youtubeUnavailable, '2026-08-01', '2026-08-15', now);
    expect(result.pending.localAgentOffline).toBe(true);
    expect(result.health.find((item) => item.key === 'local_agent')?.status).toBe('offline');
  });

  it('excludes archived and explicit TEST fixtures from operational workload and Today Actions', () => {
    const legacyActive = content({ id: 'legacy-active', status: 'draft', testContent: undefined });
    const archived = content({ id: 'archived', status: 'archived', dueDate: '2026-08-01' });
    const statusTest = content({ id: 'status-test', status: 'test', dueDate: '2026-08-01' });
    const flaggedTest = content({ id: 'flagged-test', status: 'draft', testContent: true, dueDate: '2026-08-01' });
    const result = buildMarketingDashboard({
      contents: [legacyActive, archived, statusTest, flaggedTest], scenes: [], assets: [], publishingJobs: [], flowJobs: [], localAgents: [], connectors: [],
    }, youtubeUnavailable, '2026-08-01', '2026-08-15', now);
    expect(result.content).toEqual({ total: 1, inProgress: 1, awaitingApproval: 0, readyToPublish: 0, completed: 0 });
    expect(result.operations.work.map((item) => item.id)).toEqual(['legacy-active']);
    expect(result.operations.today).toEqual([]);
    expect(result.pipeline.map((item) => item.id)).toEqual(['legacy-active']);
  });

  it('shows only grounded actionable work and limits weekly priorities to three', () => {
    const finalReady = content({ id: 'final-ready', status: 'awaiting_copy', finalVideoAssetId: 'final-1' });
    const review = content({ id: 'review', status: 'review' });
    const overdue = content({ id: 'overdue', status: 'draft', dueDate: '2026-08-14' });
    const copyReview = content({ id: 'copy-review', status: 'draft', platformCopies: { facebook: { platform: 'facebook', text: 'Draft', status: 'draft', version: 1 } } });
    const result = buildMarketingDashboard({
      contents: [finalReady, review, overdue, copyReview], scenes: [], assets: [], publishingJobs: [], flowJobs: [], localAgents: [], connectors: [],
    }, youtubeUnavailable, '2026-08-09', '2026-08-15', now);
    expect(result.operations.today.map((item) => item.reason)).toEqual(['overdue', 'review', 'final_ready', 'copies_review']);
    expect(result.report.priorities).toHaveLength(3);
    expect(result.report.priorities).toEqual(result.operations.today.slice(0, 3).map((item) => ({ contentId: item.contentId, label: item.label })));
  });

  it('keeps an approved Article actionable even when its WordPress Draft already exists', () => {
    const article = content({
      id: 'article-ready', contentId: 'ANCV-ART-2026-009', type: 'article', status: 'approved',
      wordpressDraft: { siteUrl: 'https://anninhcanhve.com', postId: 9, featuredMediaId: 10, status: 'draft', slug: 'article-ready', yoastMetadata: 'not_synced', createdAt: now.toISOString(), createdBy: 'tester' },
    });
    const operations = deriveMarketingOperations({ contents: [article], scenes: [], assets: [], flowJobs: [], publishingJobs: [] }, now);
    expect(operations.today[0]).toMatchObject({ contentDocId: 'article-ready', reason: 'wordpress_draft', label: 'Content test — chưa đăng Website' });
  });

  it('returns operational counts to baseline after a fixture is soft archived', () => {
    const baseline = content({ id: 'baseline', status: 'draft' });
    const fixture = content({ id: 'fixture', status: 'review' });
    const before = buildMarketingDashboard({
      contents: [baseline, fixture], scenes: [], assets: [], publishingJobs: [], flowJobs: [], localAgents: [], connectors: [],
    }, youtubeUnavailable, '2026-08-01', '2026-08-15', now);
    const after = buildMarketingDashboard({
      contents: [baseline, { ...fixture, status: 'archived' }], scenes: [], assets: [], publishingJobs: [], flowJobs: [], localAgents: [], connectors: [],
    }, youtubeUnavailable, '2026-08-01', '2026-08-15', now);
    expect(before.content).toMatchObject({ total: 2, awaitingApproval: 1 });
    expect(after.content).toMatchObject({ total: 1, awaitingApproval: 0, completed: 0 });
    expect(after.operations.work.map((item) => item.id)).toEqual(['baseline']);
    expect(after.operations.today.every((item) => item.contentDocId !== 'fixture')).toBe(true);
  });
});

describe('YouTube reporting', () => {
  it('maps real Analytics video IDs back to ANCV Content without exposing the token', async () => {
    const responses = [
      { access_token: 'access-secret' },
      { items: [{ id: 'channel-1', snippet: { title: 'ANCV' }, statistics: { videoCount: '4' } }] },
      { columnHeaders: [{ name: 'views' }, { name: 'estimatedMinutesWatched' }, { name: 'subscribersGained' }, { name: 'likes' }, { name: 'comments' }], rows: [[12, 34, 1, 2, 3]] },
      { columnHeaders: [{ name: 'views' }, { name: 'estimatedMinutesWatched' }, { name: 'subscribersGained' }, { name: 'likes' }, { name: 'comments' }], rows: [[7, 8, 0, 1, 0]] },
      { columnHeaders: [{ name: 'views' }, { name: 'estimatedMinutesWatched' }, { name: 'subscribersGained' }, { name: 'likes' }, { name: 'comments' }], rows: [[28, 50, 2, 4, 1]] },
      { columnHeaders: [{ name: 'video' }, { name: 'views' }, { name: 'estimatedMinutesWatched' }, { name: 'likes' }], rows: [['video-1', 10, 20, 2]] },
      { items: [{ id: 'video-1', snippet: { title: 'YouTube title', publishedAt: '2026-08-10T00:00:00Z' } }] },
    ];
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200, headers: { 'content-type': 'application/json' } }));
    const client = new YouTubeReportingClient({ fetchImpl: fetchImpl as typeof fetch, clientId: 'id', clientSecret: 'secret', refreshToken: 'refresh', expectedChannelId: 'channel-1' });
    const internal = content({ id: 'doc-1', title: 'Tên Content ANCV' });
    const result = await client.read('2026-08-01', '2026-08-15', [{ videoId: 'video-1', contentDocId: 'doc-1' } as PublishingJobRecord], [internal], now);
    expect(result).toMatchObject({ status: 'connected', auth: 'pass', videoCount: 4, range: { views: 12, watchMinutes: 34 } });
    expect(result.topVideos[0]).toMatchObject({ videoId: 'video-1', contentDocId: 'doc-1', title: 'Tên Content ANCV', views: 10, watchMinutes: 20, likes: 2 });
    expect(JSON.stringify(result)).not.toContain('access-secret');
  });
});
