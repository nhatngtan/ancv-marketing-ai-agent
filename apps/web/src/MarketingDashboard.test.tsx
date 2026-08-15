// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MarketingDashboardResponse } from '@ancv/shared';

const response: MarketingDashboardResponse = {
  generatedAt: '2026-08-15T00:00:00.000Z', range: { from: '2026-08-01', to: '2026-08-15' },
  content: { total: 3, inProgress: 1, awaitingApproval: 1, readyToPublish: 0, completed: 1 },
  month: { videos: 1, websiteArticles: 1, youtubePublished: 1, socialPublished: 0 },
  pending: { flowNeedsManual: 2, publishingErrors: 0, localAgentOffline: false, awaitingApproval: 1 },
  publishing: { total: 1, byPlatform: { youtube: 1 } },
  pipeline: [{ id: 'one', contentId: 'ANCV-VID-2026-001', title: 'Video ANCV', type: 'video', status: 'review', currentStep: 'Video Raw', progress: 50, platforms: [{ platform: 'youtube', status: 'pending' }], updatedAt: '2026-08-15T00:00:00.000Z' }],
  youtube: { status: 'unavailable', auth: 'unavailable', topVideos: [], message: 'upstream unavailable' },
  analytics: { ga4: { status: 'not_connected', label: 'Chưa kết nối thuộc tính' }, searchConsole: { status: 'not_connected', label: 'Chưa kết nối thuộc tính' } },
  health: [{ key: 'local_agent', label: 'Local Agent', status: 'operational', detail: 'Online' }],
  report: { completedVideos: 1, completedArticles: 0, publishedPosts: 1, pendingContents: 2, availableSources: ['Firestore'], missingSources: ['YouTube', 'GA4', 'Search Console'] },
};

vi.mock('./lib/repository', () => ({ fetchMarketingDashboard: vi.fn(async () => response) }));
const { MarketingDashboard } = await import('./components/MarketingDashboard');

describe('Marketing Dashboard safe states', () => {
  it('renders real content counts and unavailable connectors without fake analytics', async () => {
    render(<MarketingDashboard contents={[]}/>);
    expect(await screen.findByText('Video ANCV')).not.toBeNull();
    expect(screen.getByText('Flow cần xử lý thủ công').parentElement?.textContent).toContain('2');
    expect(screen.getByText('Dữ liệu YouTube không khả dụng')).not.toBeNull();
    expect(screen.getAllByText('Chưa kết nối thuộc tính')).toHaveLength(2);
    expect(screen.queryByText('0 lượt xem')).toBeNull();
  });
});
