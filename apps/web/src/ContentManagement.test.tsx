// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ContentManagementSettings, ContentRecord, LocalAgentRecord } from '@ancv/shared';
import { ChannelConfigModal, ContentManagementPage } from './components/ContentManagement';
import { channelStatusForContent } from './lib/content-management';

afterEach(cleanup);

const video = {
  id: 'video-1', contentId: 'ANCV-VID-2026-001', type: 'video', title: 'Video bảo vệ nhà máy', topic: 'Nhà máy', body: '', status: 'scheduled',
  platforms: [
    { platform: 'youtube', mode: 'semi_automatic', status: 'scheduled', scheduledAt: '2026-09-01T00:00:00Z' },
    { platform: 'facebook', mode: 'manual', status: 'published', publishedAt: '2026-08-19T00:00:00Z' },
  ], createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-19T08:00:00Z', createdBy: 'editor',
} as ContentRecord;
const article = {
  id: 'article-1', contentId: 'ANCV-ART-2026-001', type: 'article', title: 'Bài viết dịch vụ bảo vệ', topic: 'Dịch vụ', body: '', status: 'approved',
  platforms: [{ platform: 'zalo', mode: 'manual', status: 'manual_pending' }],
  wordpressDraft: { siteUrl: 'https://anninhcanhve.com', postId: 1, featuredMediaId: 2, status: 'future', slug: 'test', yoastMetadata: 'not_synced', createdAt: 'x', createdBy: 'editor', scheduledAt: '2026-09-01T00:00:00Z' },
  createdAt: '2026-08-01T00:00:00Z', updatedAt: '2026-08-18T08:00:00Z', createdBy: 'editor',
} as ContentRecord;
const settings: ContentManagementSettings = { enabledChannels: ['website', 'youtube', 'facebook', 'tiktok', 'zalo', 'linkedin'], customChannels: [] };
const onlineAgent = { id: 'ancv-windows-01', status: 'online', machineName: 'ANCV-PC', lastSeen: new Date().toISOString(), bridgeStatus: 'connected', workspaceAvailable: true, version: '1', createdAt: 'x', updatedAt: 'x', createdBy: 'system' } as LocalAgentRecord;

describe('Content management status mapping', () => {
  it('derives channel states from existing automation/manual evidence', () => {
    expect(channelStatusForContent(video, 'youtube')).toBe('scheduled');
    expect(channelStatusForContent(video, 'facebook')).toBe('published');
    expect(channelStatusForContent(video, 'website')).toBe('none');
    expect(channelStatusForContent(article, 'website')).toBe('scheduled');
    expect(channelStatusForContent(article, 'youtube')).toBe('none');
    expect(channelStatusForContent(article, 'custom-threads')).toBe('pending');
  });
});

describe('ContentManagementPage', () => {
  it('shows production-shaped rows, searches/filters and opens the existing Content detail', async () => {
    const onOpen = vi.fn();
    render(<ContentManagementPage contents={[video, article]} localAgents={[onlineAgent]} onOpenContent={onOpen} onToast={vi.fn()} loadSettings={async () => settings}/>);
    await screen.findByRole('columnheader', { name: 'Kênh' });
    const table = screen.getByRole('table');
    expect(within(table).queryByRole('columnheader', { name: 'Mã' })).toBeNull();
    expect(within(table).queryByRole('columnheader', { name: 'YouTube' })).toBeNull();
    expect(within(table).queryByText('ANCV-VID-2026-001')).toBeNull();
    expect(within(table).getAllByText('Đã lên lịch').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('YouTube').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Tổng hợp Content')).not.toBeNull();
    const css = readFileSync(resolve(process.cwd(), 'src/ancv-brand.css'), 'utf8');
    expect(css).toContain('overflow-x: hidden');
    expect(css).toContain('@media (max-width: 1100px) and (min-width: 761px)');
    fireEvent.click(within(table).getByRole('button', { name: 'Video bảo vệ nhà máy' }));
    expect(onOpen).toHaveBeenCalledWith(video);
    fireEvent.change(screen.getByLabelText('Tìm Content'), { target: { value: 'ANCV-ART-2026-001' } });
    expect(within(table).queryByText('Video bảo vệ nhà máy')).toBeNull();
    expect(within(table).getByText('Bài viết dịch vụ bảo vệ')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Lọc theo loại'), { target: { value: 'video' } });
    expect(screen.getByText('Không tìm thấy Content phù hợp.')).not.toBeNull();
  });

  it('shows the required Local Agent offline message without queuing a command', async () => {
    const toast = vi.fn(); const openFolder = vi.fn();
    render(<ContentManagementPage contents={[video]} localAgents={[]} onOpenContent={vi.fn()} onToast={toast} loadSettings={async () => settings} openFolder={openFolder}/>);
    fireEvent.click(await screen.findByRole('button', { name: 'Mở thư mục' }));
    expect(toast).toHaveBeenCalledWith('Không thể mở thư mục. Hãy kiểm tra ANCV Local Agent.');
    expect(openFolder).not.toHaveBeenCalled();
  });

  it('queues and waits for the Local Agent when it is online', async () => {
    const toast = vi.fn(); const openFolder = vi.fn(async () => ({ status: 'succeeded' }));
    render(<ContentManagementPage contents={[video]} localAgents={[onlineAgent]} onOpenContent={vi.fn()} onToast={toast} loadSettings={async () => settings} openFolder={openFolder as never}/>);
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Mở thư mục' })); });
    expect(openFolder).toHaveBeenCalledWith('video-1');
    expect(toast).toHaveBeenCalledWith('Đã mở thư mục Content.');
  });
});

describe('ChannelConfigModal', () => {
  it('toggles a default channel and adds one manual custom channel', async () => {
    const onSave = vi.fn(async () => undefined);
    render(<ChannelConfigModal settings={settings} onClose={vi.fn()} onSave={onSave}/>);
    fireEvent.click(screen.getByLabelText('TikTok'));
    fireEvent.change(screen.getByLabelText('Tên kênh mới'), { target: { value: 'Threads' } });
    fireEvent.click(screen.getByRole('button', { name: /Thêm kênh/ }));
    expect((screen.getByLabelText('Threads') as HTMLInputElement).checked).toBe(true);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Lưu cấu hình' })); });
    await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      enabledChannels: ['website', 'youtube', 'facebook', 'zalo', 'linkedin'],
      customChannels: [expect.objectContaining({ name: 'Threads', enabled: true })],
    })));
  });
});
