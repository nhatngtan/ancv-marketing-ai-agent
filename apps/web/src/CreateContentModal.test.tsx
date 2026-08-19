// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { CreateContentModal, QuickWorkModal } from './App';

afterEach(cleanup);

describe('CreateContentModal reliability', () => {
  it('uses a wide desktop Video modal with an explicit mobile layout', () => {
    render(<CreateContentModal type="video" onClose={vi.fn()} onSaved={vi.fn()} createAction={vi.fn() as never} />);
    const modal = document.querySelector('.modal');
    expect(modal?.classList.contains('create-content-modal')).toBe(true);
    expect(modal?.classList.contains('video-create-modal')).toBe(true);
    const css = readFileSync(resolve(process.cwd(), 'src/ancv-brand.css'), 'utf8');
    expect(css).toContain('.video-create-modal { width: min(920px, 96vw); }');
    expect(css).toContain('.create-content-modal, .video-create-modal, .article-create-modal');
  });

  it('keeps the Video form open and shows a clear error when creation fails', async () => {
    const onSaved = vi.fn();
    const createAction = vi.fn(async () => { throw Object.assign(new Error('failed'), { code: 'INTERNAL_ERROR' }); });
    render(<CreateContentModal type="video" onClose={vi.fn()} onSaved={onSaved} createAction={createAction} />);
    const input = screen.getByLabelText('Tên / Chủ đề Video');
    fireEvent.change(input, { target: { value: 'TEST VIDEO E2E' } });
    await act(async () => { fireEvent.submit(input.closest('form')!); });
    expect((await screen.findByRole('alert')).textContent).toContain('Không thể tạo Video. Hệ thống chưa lưu dữ liệu. Vui lòng thử lại. (INTERNAL_ERROR)');
    expect((input as HTMLInputElement).value).toBe('TEST VIDEO E2E');
    await waitFor(() => expect((screen.getByRole('button', { name: 'Tạo Video' }) as HTMLButtonElement).disabled).toBe(false));
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('creates an Article from only a topic and optional notes while keeping advanced options closed', async () => {
    const saved = { id: 'article-1', contentId: 'ANCV-ART-2026-123', type: 'article', title: 'An ninh nhà máy', topic: 'An ninh nhà máy', body: '', status: 'draft', platforms: [], createdAt: '', updatedAt: '', createdBy: '' } as const;
    const createAction = vi.fn(async () => saved); const onSaved = vi.fn();
    render(<CreateContentModal type="article" onClose={vi.fn()} onSaved={onSaved} createAction={createAction as never}/>);
    expect(screen.queryByLabelText('Tiêu đề')).toBeNull();
    expect((screen.getByText('Tùy chọn nâng cao').closest('details') as HTMLDetailsElement).open).toBe(false);
    fireEvent.change(screen.getByLabelText(/Bạn muốn viết về chủ đề gì/), { target: { value: 'An ninh nhà máy' } });
    fireEvent.change(screen.getByLabelText(/Ghi chú thêm/), { target: { value: 'Chỉ dùng dữ kiện đã xác minh' } });
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Tạo bài viết' })); });
    expect(createAction).toHaveBeenCalledWith(expect.objectContaining({
      type: 'article', title: 'An ninh nhà máy', topic: 'An ninh nhà máy', notes: 'Chỉ dùng dữ kiện đã xác minh',
      platforms: ['website', 'facebook', 'zalo', 'linkedin'],
    }));
    expect(onSaved).toHaveBeenCalledWith(saved);
  });
});

describe('QuickWorkModal', () => {
  it('creates a high-priority Video with deadline and opens the saved Content', async () => {
    const saved = { id: 'video-1', contentId: 'ANCV-VID-2026-123', type: 'video', title: 'Video UAT', topic: 'Video UAT', body: '', status: 'draft', platforms: [], createdAt: '', updatedAt: '', createdBy: '' } as const;
    const onSaved = vi.fn(); const createAction = vi.fn(async () => saved);
    render(<QuickWorkModal onClose={vi.fn()} onSaved={onSaved} createAction={createAction as never}/>);
    fireEvent.change(screen.getByLabelText('Tiêu đề / Chủ đề'), { target: { value: 'Video UAT' } });
    fireEvent.change(screen.getByLabelText(/Yêu cầu thêm/), { target: { value: 'Fixture test' } });
    fireEvent.change(screen.getByLabelText(/Ngày dự kiến hoàn thành/), { target: { value: '2026-08-20' } });
    fireEvent.change(screen.getByLabelText('Ưu tiên'), { target: { value: 'high' } });
    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: /Tạo công việc/ }).closest('form')!); });
    expect(createAction).toHaveBeenCalledWith({ type: 'video', title: 'Video UAT', notes: 'Fixture test', dueDate: '2026-08-20', priority: 'high' });
    expect(onSaved).toHaveBeenCalledWith(saved);
  });

  it('creates a Website Article with the title reused as topic', async () => {
    const saved = { id: 'article-1', contentId: 'ANCV-ART-2026-123', type: 'article', title: 'Bài UAT', topic: 'Bài UAT', body: '', status: 'draft', platforms: [], createdAt: '', updatedAt: '', createdBy: '' } as const;
    const createAction = vi.fn(async () => saved);
    render(<QuickWorkModal onClose={vi.fn()} onSaved={vi.fn()} createAction={createAction as never}/>);
    fireEvent.change(screen.getByLabelText('Loại'), { target: { value: 'article' } });
    fireEvent.change(screen.getByLabelText('Tiêu đề / Chủ đề'), { target: { value: 'Bài UAT' } });
    await act(async () => { fireEvent.submit(screen.getByRole('button', { name: /Tạo công việc/ }).closest('form')!); });
    expect(createAction).toHaveBeenCalledWith(expect.objectContaining({ type: 'article', title: 'Bài UAT', topic: 'Bài UAT', priority: 'normal', platforms: ['website','facebook','zalo','linkedin'] }));
  });
});
