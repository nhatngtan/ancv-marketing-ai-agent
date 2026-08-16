import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const suite = emulatorAvailable ? describe : describe.skip;
const sensitiveCollections = [
  'contents', 'videoProjects', 'scenes', 'mediaAssets', 'publishingJobs', 'connectors',
  'connectorTests', 'socialMetrics', 'websiteMetrics', 'seoMetrics', 'reports',
  'workflowRuns', 'systemAlerts', 'systemSettings', 'aiJobs', 'aiUsage', 'auditLogs',
  'flowAccounts', 'flowJobs', 'localAgents', 'localCommands',
] as const;

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
      await setDoc(doc(adminDb, 'users', 'inactive-user'), { role: 'viewer', status: 'pending' });
      await setDoc(doc(adminDb, 'users', 'unknown-role-user'), { role: 'owner', status: 'active' });
      for (const collectionName of sensitiveCollections) {
        await setDoc(doc(adminDb, collectionName, 'existing'), { createdBy: 'editor-user', createdAt: 'x', updatedAt: 'x', status: 'draft', title: 'Existing' });
      }
    });
  });
  afterAll(async () => environment.cleanup());

  it('denies unauthenticated reads across every sensitive collection', async () => {
    const database = environment.unauthenticatedContext().firestore();
    await Promise.all(sensitiveCollections.map((collectionName) => assertFails(getDoc(doc(database, collectionName, 'existing')))));
  });
  it('denies authenticated users without a user record', async () => {
    const database = environment.authenticatedContext('missing-user').firestore();
    await Promise.all(sensitiveCollections.map((collectionName) => assertFails(getDoc(doc(database, collectionName, 'existing')))));
  });
  it('denies pending/inactive users', async () => {
    const database = environment.authenticatedContext('inactive-user').firestore();
    await Promise.all(sensitiveCollections.map((collectionName) => assertFails(getDoc(doc(database, collectionName, 'existing')))));
  });
  it('denies active users with an unknown role', async () => {
    const database = environment.authenticatedContext('unknown-role-user').firestore();
    await Promise.all(sensitiveCollections.map((collectionName) => assertFails(getDoc(doc(database, collectionName, 'existing')))));
  });
  it('allows viewers to read every sensitive collection but not write content', async () => {
    const viewerDb = environment.authenticatedContext('viewer-user').firestore();
    await Promise.all(sensitiveCollections.map((collectionName) => assertSucceeds(getDoc(doc(viewerDb, collectionName, 'existing')))));
    await assertFails(setDoc(doc(viewerDb, 'contents', 'new'), { createdBy: 'viewer-user', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), status: 'draft' }));
  });
  it('allows active editors to read and create auditable content without admin-only writes', async () => {
    const editorDb = environment.authenticatedContext('editor-user').firestore();
    await Promise.all(sensitiveCollections.map((collectionName) => assertSucceeds(getDoc(doc(editorDb, collectionName, 'existing')))));
    await assertSucceeds(setDoc(doc(editorDb, 'contents', 'new'), { createdBy: 'editor-user', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), status: 'draft', title: 'Safe' }));
    await assertFails(setDoc(doc(editorDb, 'connectors', 'new'), { createdBy: 'editor-user', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), status: 'available' }));
  });
  it('allows active admins to read, perform admin-only writes and delete managed content', async () => {
    const adminDb = environment.authenticatedContext('admin-user').firestore();
    await Promise.all(sensitiveCollections.map((collectionName) => assertSucceeds(getDoc(doc(adminDb, collectionName, 'existing')))));
    await assertSucceeds(setDoc(doc(adminDb, 'connectors', 'new'), { createdBy: 'admin-user', createdAt: serverTimestamp(), updatedAt: serverTimestamp(), status: 'available' }));
    await assertSucceeds(deleteDoc(doc(adminDb, 'contents', 'existing')));
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
