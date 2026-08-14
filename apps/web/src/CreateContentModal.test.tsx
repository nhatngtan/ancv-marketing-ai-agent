// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreateContentModal } from './App';

describe('CreateContentModal reliability', () => {
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
});
