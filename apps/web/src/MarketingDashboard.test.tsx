// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { MarketingDashboardResponse } from '@ancv/shared';

const response: MarketingDashboardResponse = {
  generatedAt: '2026-08-15T00:00:00.000Z', range: { from: '2026-08-01', to: '2026-08-15' },
  content: { total: 3, inProgress: 1, awaitingApproval: 1, readyToPublish: 0, completed: 1 },
  month: { videos: 1, websiteArticles: 1, youtubePublished: 1, socialPublished: 0 },
  pending: { flowNeedsManual: 2, publishingErrors: 0, localAgentOffline: false, awaitingApproval: 1 },
  publishing: { total: 1, byPlatform: { youtube: 1 } },
  pipeline: [{ id: 'one', contentId: 'ANCV-VID-2026-001', title: 'Video ANCV', type: 'video', status: 'review', currentStep: 'Video Raw', progress: 50, priority: 'normal', platforms: [{ platform: 'youtube', status: 'pending' }], updatedAt: '2026-08-15T00:00:00.000Z' }],
  operations: {
    today: [{ id: 'one:review', contentDocId: 'one', contentId: 'ANCV-VID-2026-001', title: 'Video ANCV', type: 'video', label: 'Video ANCV — cần duyệt', reason: 'review', priority: 'normal', quickAction: 'open_script' }],
    work: [{ id: 'one', contentId: 'ANCV-VID-2026-001', title: 'Video ANCV', type: 'video', status: 'review', currentStep: 'Video Raw', progress: 50, priority: 'normal', platforms: [{ platform: 'youtube', status: 'pending' }], updatedAt: '2026-08-15T00:00:00.000Z', statusGroup: 'review', statusLabel: 'Cần duyệt', overdue: false, quickAction: 'open_script', quickActionLabel: 'Mở Kịch bản' }],
  },
  youtube: { status: 'unavailable', auth: 'unavailable', topVideos: [], message: 'upstream unavailable' },
  analytics: { ga4: { status: 'not_connected', label: 'Chưa kết nối thuộc tính' }, searchConsole: { status: 'not_connected', label: 'Chưa kết nối thuộc tính' } },
  health: [{ key: 'local_agent', label: 'Local Agent', status: 'operational', detail: 'Online' }],
  report: { completedVideos: 1, completedArticles: 0, publishedPosts: 1, pendingContents: 2, availableSources: ['Firestore'], missingSources: ['YouTube', 'GA4', 'Search Console'], priorities: [] },
};

vi.mock('./lib/repository', () => ({ fetchMarketingDashboard: vi.fn(async () => response), archiveContent: vi.fn(), completeContent: vi.fn(), openVideoFolder: vi.fn() }));
const { MarketingDashboard } = await import('./components/MarketingDashboard');
const repository = await import('./lib/repository');

afterEach(cleanup);

describe('Marketing Dashboard safe states', () => {
  it('renders real content counts and unavailable connectors without fake analytics', async () => {
    render(<MarketingDashboard contents={[]}/>);
    expect(await screen.findByText('Video ANCV')).not.toBeNull();
    expect(screen.getByText('Flow cần kiểm tra').parentElement?.textContent).toContain('2');
    expect(screen.getByText('Dữ liệu YouTube không khả dụng')).not.toBeNull();
    expect(screen.getAllByText('Chưa kết nối thuộc tính')).toHaveLength(2);
    expect(screen.queryByText('0 lượt xem')).toBeNull();
  });

  it('searches work by Content ID without a search service', async () => {
    render(<MarketingDashboard contents={[{ id: 'one', contentId: 'ANCV-VID-2026-001', type: 'video', title: 'Video ANCV', topic: 'Nhà máy', body: '', status: 'review', platforms: [], createdAt: '', updatedAt: '', createdBy: '' }]}/>);
    const input = await screen.findByLabelText('Tìm công việc');
    fireEvent.change(input, { target: { value: 'ANCV-VID-2026-001' } });
    const workList = document.querySelector('.work-list');
    expect(workList).not.toBeNull();
    expect(within(workList as HTMLElement).getByRole('button', { name: /Video ANCV.*ANCV-VID-2026-001/ })).not.toBeNull();
    fireEvent.change(input, { target: { value: 'không có' } });
    expect(screen.getByText('Không tìm thấy công việc phù hợp.')).not.toBeNull();
  });

  it('requires confirmation before completion and supports soft archive', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<MarketingDashboard contents={[]}/>);
    await screen.findByText('Video ANCV');
    fireEvent.click(screen.getByRole('button', { name: /Đánh dấu hoàn tất/ }));
    expect(confirm).toHaveBeenCalledWith('Xác nhận ANCV-VID-2026-001 đã hoàn tất?');
    expect(repository.completeContent).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    fireEvent.click(screen.getByRole('button', { name: /Đánh dấu hoàn tất/ }));
    expect(repository.completeContent).toHaveBeenCalledWith('one');
    fireEvent.click(screen.getByRole('button', { name: /Lưu trữ/ }));
    expect(repository.archiveContent).toHaveBeenCalledWith('one');
  });
});
