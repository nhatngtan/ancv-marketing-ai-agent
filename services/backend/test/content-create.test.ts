import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { createContentWithId } from '../src/services/content-id.js';

type FakeRef = { id: string; path: string };

function fakeFirestore(failContentWrite = false) {
  const data = new Map<string, Record<string, unknown>>();
  let nextDocument = 1;
  const store = {
    collection(name: string) {
      return {
        doc(id?: string): FakeRef {
          const documentId = id ?? `content-${nextDocument++}`;
          return { id: documentId, path: `${name}/${documentId}` };
        },
      };
    },
    async runTransaction<T>(callback: (transaction: {
      get: (reference: FakeRef) => Promise<{ data: () => Record<string, unknown> | undefined }>;
      set: (reference: FakeRef, value: Record<string, unknown>, options?: unknown) => void;
    }) => Promise<T>): Promise<T> {
      const pending: Array<{ reference: FakeRef; value: Record<string, unknown> }> = [];
      const result = await callback({
        get: async (reference) => ({ data: () => data.get(reference.path) }),
        set(reference, value) {
          if (failContentWrite && reference.path.startsWith('contents/')) throw new Error('CONTENT_WRITE_FAILED');
          pending.push({ reference, value });
        },
      });
      pending.forEach(({ reference, value }) => data.set(reference.path, value));
      return result;
    },
  };
  return { store: store as unknown as Firestore, data };
}

function hasUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(hasUndefined);
  if (value && typeof value === 'object') return Object.values(value).some(hasUndefined);
  return false;
}

describe('atomic Content creation', () => {
  const now = new Date('2026-08-14T08:00:00.000Z');

  it('creates exactly one Video with fixed platforms and no undefined fields', async () => {
    const fake = fakeFirestore();
    const content = await createContentWithId({ type: 'video', title: 'TEST VIDEO E2E', notes: 'Yêu cầu thêm', dueDate: '2026-08-20', priority: 'high' }, 'editor-1', now, fake.store);
    expect(content.contentId).toBe('ANCV-VID-2026-001');
    expect(content.topic).toBe('TEST VIDEO E2E');
    expect(content.platforms.map((item) => item.platform)).toEqual(['youtube', 'tiktok', 'facebook', 'zalo', 'linkedin']);
    expect(content).toMatchObject({ dueDate: '2026-08-20', priority: 'high', notes: 'Yêu cầu thêm' });
    expect([...fake.data.keys()].filter((key) => key.startsWith('contents/'))).toHaveLength(1);
    expect(hasUndefined(content)).toBe(false);
    expect(content).not.toHaveProperty('objective');
  });

  it('does not commit the counter when Content creation fails', async () => {
    const fake = fakeFirestore(true);
    await expect(createContentWithId({ type: 'video', title: 'Failure fixture' }, 'editor-1', now, fake.store)).rejects.toThrow('CONTENT_WRITE_FAILED');
    expect(fake.data.size).toBe(0);
  });

  it('creates Article without Video-only fields or undefined values', async () => {
    const fake = fakeFirestore();
    const content = await createContentWithId({ type: 'article', title: 'Bài test', topic: 'An ninh', platforms: ['website', 'facebook'] }, 'editor-1', now, fake.store);
    expect(content.contentId).toBe('ANCV-ART-2026-001');
    expect(content.platforms.map((item) => item.platform)).toEqual(['website', 'facebook']);
    expect(content).not.toHaveProperty('visualStyle');
    expect(content).not.toHaveProperty('characterReferences');
    expect(content.priority).toBe('normal');
    expect(hasUndefined(content)).toBe(false);
  });
});
