import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { deleteObject, getBytes, ref, uploadBytes } from 'firebase/storage';

const emulatorAvailable = Boolean(process.env.FIREBASE_STORAGE_EMULATOR_HOST) && Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = emulatorAvailable ? describe : describe.skip;
const contentPath = 'content/content-1/asset.mp4';
const flowErrorPath = 'flow-errors/job-1/evidence.png';

suite('Storage production rules', () => {
  let environment: RulesTestEnvironment;

  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'demo-ancv-marketing-storage',
      firestore: { rules: readFileSync(resolve(process.cwd(), '../../firebase/firestore.rules'), 'utf8') },
      storage: { rules: readFileSync(resolve(process.cwd(), '../../firebase/storage.rules'), 'utf8') },
    });
  });

  beforeEach(async () => {
    await environment.clearFirestore();
    await environment.clearStorage();
    await environment.withSecurityRulesDisabled(async (context) => {
      const database = context.firestore();
      await setDoc(doc(database, 'users', 'admin-user'), { role: 'admin', status: 'active' });
      await setDoc(doc(database, 'users', 'editor-user'), { role: 'editor', status: 'active' });
      await setDoc(doc(database, 'users', 'viewer-user'), { role: 'viewer', status: 'active' });
      await setDoc(doc(database, 'users', 'inactive-user'), { role: 'viewer', status: 'pending' });
      await uploadBytes(ref(context.storage(), contentPath), new Uint8Array([0, 1, 2, 3]));
      await uploadBytes(ref(context.storage(), flowErrorPath), new Uint8Array([4, 5, 6, 7]));
    });
  });

  afterAll(async () => environment.cleanup());

  async function assertReadDenied(uid?: string) {
    const storage = uid ? environment.authenticatedContext(uid).storage() : environment.unauthenticatedContext().storage();
    await assertFails(getBytes(ref(storage, contentPath)));
    await assertFails(getBytes(ref(storage, flowErrorPath)));
  }

  it('denies anonymous, missing-user and inactive identities', async () => {
    await assertReadDenied();
    await assertReadDenied('missing-user');
    await assertReadDenied('inactive-user');
  });

  it('allows an active viewer to read Content and Flow evidence but denies writes', async () => {
    const storage = environment.authenticatedContext('viewer-user').storage();
    await assertSucceeds(getBytes(ref(storage, contentPath)));
    await assertSucceeds(getBytes(ref(storage, flowErrorPath)));
    await assertFails(uploadBytes(ref(storage, 'content/content-1/viewer.mp4'), new Uint8Array([1])));
    await assertFails(deleteObject(ref(storage, contentPath)));
  });

  it('allows an active editor to read and write Content but not Flow evidence', async () => {
    const storage = environment.authenticatedContext('editor-user').storage();
    await assertSucceeds(getBytes(ref(storage, contentPath)));
    await assertSucceeds(getBytes(ref(storage, flowErrorPath)));
    await assertSucceeds(uploadBytes(ref(storage, 'content/content-1/editor.mp4'), new Uint8Array([1, 2])));
    await assertFails(uploadBytes(ref(storage, 'flow-errors/job-1/editor.png'), new Uint8Array([1])));
    await assertFails(deleteObject(ref(storage, contentPath)));
  });

  it('allows an active admin to manage Content while Flow evidence remains read-only', async () => {
    const storage = environment.authenticatedContext('admin-user').storage();
    await assertSucceeds(getBytes(ref(storage, contentPath)));
    await assertSucceeds(getBytes(ref(storage, flowErrorPath)));
    await assertSucceeds(uploadBytes(ref(storage, 'content/content-1/admin.mp4'), new Uint8Array([1, 2])));
    await assertSucceeds(deleteObject(ref(storage, contentPath)));
    await assertFails(uploadBytes(ref(storage, 'flow-errors/job-1/admin.png'), new Uint8Array([1])));
  });
});
