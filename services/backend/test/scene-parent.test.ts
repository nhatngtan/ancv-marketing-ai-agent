import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { deleteSceneForContent, reorderScenesForContent, updateSceneForContent } from '../src/modules/content-service.js';

type FakeReference = { id: string; path: string; get: () => Promise<FakeSnapshot>; update: (changes: Record<string, unknown>) => Promise<void>; delete: () => Promise<void> };
type FakeSnapshot = { exists: boolean; data: () => Record<string, unknown> | undefined };

function fakeSceneStore() {
  const data = new Map<string, Record<string, unknown>>([
    ['scenes/scene-1', { id: 'scene-1', contentDocId: 'content-1', sceneNumber: 1, title: 'Scene 1' }],
    ['scenes/scene-2', { id: 'scene-2', contentDocId: 'content-1', sceneNumber: 2, title: 'Scene 2' }],
    ['scenes/foreign', { id: 'foreign', contentDocId: 'content-2', sceneNumber: 1, title: 'Foreign' }],
  ]);
  let commits = 0;
  const reference = (name: string, id: string): FakeReference => {
    const path = `${name}/${id}`;
    return {
      id, path,
      get: async () => ({ exists: data.has(path), data: () => data.get(path) }),
      update: async (changes) => { data.set(path, { ...(data.get(path) ?? {}), ...changes }); },
      delete: async () => { data.delete(path); },
    };
  };
  const store = {
    collection(name: string) { return { doc(id: string) { return reference(name, id); } }; },
    async getAll(...references: FakeReference[]) { return Promise.all(references.map((item) => item.get())); },
    batch() {
      const updates: Array<{ reference: FakeReference; changes: Record<string, unknown> }> = [];
      return {
        update(item: FakeReference, changes: Record<string, unknown>) { updates.push({ reference: item, changes }); },
        async commit() { updates.forEach(({ reference: item, changes }) => data.set(item.path, { ...(data.get(item.path) ?? {}), ...changes })); commits += 1; },
      };
    },
  };
  return { store: store as unknown as Firestore, data, commits: () => commits };
}

describe('Scene parent lock', () => {
  it('allows PATCH and DELETE when the Scene belongs to the Content', async () => {
    const fake = fakeSceneStore();
    await updateSceneForContent(fake.store, 'content-1', 'scene-1', { title: 'Updated' });
    expect(fake.data.get('scenes/scene-1')?.title).toBe('Updated');
    await deleteSceneForContent(fake.store, 'content-1', 'scene-2');
    expect(fake.data.has('scenes/scene-2')).toBe(false);
  });

  it('denies PATCH when the Scene belongs to another Content', async () => {
    const fake = fakeSceneStore();
    await expect(updateSceneForContent(fake.store, 'content-1', 'foreign', { title: 'Corrupted' })).rejects.toMatchObject({ message: 'SCENE_NOT_FOUND', statusCode: 404 });
    expect(fake.data.get('scenes/foreign')?.title).toBe('Foreign');
  });

  it('denies DELETE when the Scene belongs to another Content', async () => {
    const fake = fakeSceneStore();
    await expect(deleteSceneForContent(fake.store, 'content-1', 'foreign')).rejects.toMatchObject({ message: 'SCENE_NOT_FOUND', statusCode: 404 });
    expect(fake.data.has('scenes/foreign')).toBe(true);
  });

  it('rejects a mixed-parent reorder without partial mutation', async () => {
    const fake = fakeSceneStore();
    const before = new Map(fake.data);
    await expect(reorderScenesForContent(fake.store, 'content-1', ['scene-2', 'foreign', 'scene-1'], '2026-08-16T00:00:00.000Z')).rejects.toMatchObject({ message: 'SCENE_NOT_FOUND', statusCode: 404 });
    expect(fake.commits()).toBe(0);
    expect(fake.data).toEqual(before);
  });

  it('atomically reorders Scenes belonging to the same Content', async () => {
    const fake = fakeSceneStore();
    await reorderScenesForContent(fake.store, 'content-1', ['scene-2', 'scene-1'], '2026-08-16T00:00:00.000Z');
    expect(fake.commits()).toBe(1);
    expect(fake.data.get('scenes/scene-2')?.sceneNumber).toBe(1);
    expect(fake.data.get('scenes/scene-1')?.sceneNumber).toBe(2);
  });
});
