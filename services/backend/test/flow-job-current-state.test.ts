import type { Firestore } from 'firebase-admin/firestore';
import { describe, expect, it } from 'vitest';
import { createFlowJobWithCurrentState } from '../src/modules/flow-service.js';

type FakeRef = { id: string; path: string };

function flowStore() {
  const data = new Map<string, Record<string, unknown>>([
    ['contents/content-1', { id: 'content-1', contentId: 'ANCV-VID-2026-009', type: 'video', visualStyle: { lighting: 'soft' } }],
    ['scenes/scene-1', { id: 'scene-1', contentDocId: 'content-1', sceneNumber: 1, generationPrompt: 'OLD', durationEstimate: 4 }],
    ['flowAccounts/account-01', { id: 'account-01', status: 'ready', email: 'ashimigold@gmail.com', chromeProfileId: 'Profile 44', projectUrl: 'https://labs.google/fx/vi/tools/flow/project/project-1' }],
    ['systemSettings/browserProfiles', {
      mappings: { google_flow: { platform: 'google_flow', machineId: 'ancv-windows-01', chromeProfileId: 'Profile 44', profileLabel: 'GOLD', updatedAt: '2026-08-14T00:00:00.000Z', updatedBy: 'admin' } },
      validations: { google_flow: { profileStatus: 'ready', platformStatus: 'ready_for_write_test', validatedAt: '2026-08-14T00:00:00.000Z', chromeProfileId: 'Profile 44', detectedAccount: 'ashimigold@gmail.com' } },
    }],
  ]);
  const store = {
    collection(name: string) { return { doc(id: string): FakeRef { return { id, path: `${name}/${id}` }; } }; },
    async runTransaction<T>(callback: (transaction: {
      get: (reference: FakeRef) => Promise<{ exists: boolean; data: () => Record<string, unknown> | undefined }>;
      set: (reference: FakeRef, value: Record<string, unknown>) => void;
      update: (reference: FakeRef, value: Record<string, unknown>) => void;
    }) => Promise<T>): Promise<T> {
      const staged = new Map(data);
      const result = await callback({
        get: async (reference) => ({ exists: staged.has(reference.path), data: () => staged.get(reference.path) }),
        set: (reference, value) => { staged.set(reference.path, value); },
        update: (reference, value) => { staged.set(reference.path, { ...(staged.get(reference.path) ?? {}), ...value }); },
      });
      data.clear(); staged.forEach((value, key) => data.set(key, value));
      return result;
    },
  };
  return { store: store as unknown as Firestore, data };
}

describe('Flow job current Scene state', () => {
  it('persists and queues NEW prompt instead of stale Firestore prompt', async () => {
    const fake = flowStore();
    const job = await createFlowJobWithCurrentState({
      contentDocId: 'content-1', sceneId: 'scene-1', flowAccountId: 'account-01',
      generationPrompt: 'NEW', durationEstimate: 8, aspectRatio: '9:16',
    }, 'editor-1', fake.store);
    expect(job.prompt).toBe('NEW');
    expect(job.durationEstimate).toBe(8);
    expect(job.aspectRatio).toBe('9:16');
    expect(job.chromeProfileId).toBe('Profile 44');
    expect(job.flowAccountEmail).toBe('ashimigold@gmail.com');
    expect(fake.data.get('scenes/scene-1')).toMatchObject({ generationPrompt: 'NEW', durationEstimate: 8, flowStatus: 'queued' });
    expect(fake.data.get('contents/content-1')).toMatchObject({ visualStyle: { lighting: 'soft', aspectRatio: '9:16' } });
    expect([...fake.data.keys()].filter((key) => key === 'flowJobs/scene-1')).toHaveLength(1);
  });
});
