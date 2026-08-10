import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = emulatorAvailable ? describe : describe.skip;

suite('Firestore production rules', () => {
  let environment: RulesTestEnvironment;
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'demo-ancv-marketing',
      firestore: { rules: readFileSync(resolve(process.cwd(), '../../firebase/firestore.rules'), 'utf8') },
    });
  });
  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await setDoc(doc(adminDb, 'users', 'admin-user'), { role: 'admin', status: 'active' });
      await setDoc(doc(adminDb, 'users', 'editor-user'), { role: 'editor', status: 'active' });
      await setDoc(doc(adminDb, 'users', 'viewer-user'), { role: 'viewer', status: 'active' });
      await setDoc(doc(adminDb, 'contents', 'existing'), { createdBy: 'editor-user', createdAt: 'x', updatedAt: 'x', status: 'draft', title: 'Existing' });
    });
  });
  afterAll(async () => environment.cleanup());

  it('denies unauthenticated reads', async () => {
    await assertFails(getDoc(doc(environment.unauthenticatedContext().firestore(), 'contents', 'existing')));
  });
  it('allows viewers to read but not write content', async () => {
    const viewerDb = environment.authenticatedContext('viewer-user').firestore();
    await assertSucceeds(getDoc(doc(viewerDb, 'contents', 'existing')));
    await assertFails(setDoc(doc(viewerDb, 'contents', 'new'), { createdBy: 'viewer-user', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), status: 'draft' }));
  });
  it('allows active editors to create auditable content', async () => {
    const editorDb = environment.authenticatedContext('editor-user').firestore();
    await assertSucceeds(setDoc(doc(editorDb, 'contents', 'new'), { createdBy: 'editor-user', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), status: 'draft', title: 'Safe' }));
  });
  it('prevents self role escalation', async () => {
    const uid = 'new-user';
    const database = environment.authenticatedContext(uid).firestore();
    await assertFails(setDoc(doc(database, 'users', uid), { role: 'admin', status: 'active' }));
    await assertSucceeds(setDoc(doc(database, 'users', uid), { role: 'viewer', status: 'pending' }));
  });
  it('blocks client access to counters', async () => {
    await assertFails(getDoc(doc(environment.authenticatedContext('admin-user').firestore(), 'systemCounters', 'video-2026')));
  });
});

