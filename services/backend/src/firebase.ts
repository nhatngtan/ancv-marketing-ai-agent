import { applicationDefault, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

let database: Firestore | null = null;

function firebaseApp(): App {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp({
    credential: applicationDefault(),
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || undefined,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  });
}

export function firebaseAuth() { return getAuth(firebaseApp()); }

export function db(): Firestore {
  if (database) return database;
  database = getFirestore(firebaseApp());
  database.settings({ ignoreUndefinedProperties: true });
  return database;
}

export function storageBucket() {
  return getStorage(firebaseApp()).bucket();
}

export async function checkFirestore(): Promise<'operational' | 'configuration_required' | 'error'> {
  if (process.env.SKIP_FIRESTORE_HEALTH === 'true') return 'configuration_required';
  try {
    await db().collection('_health').doc('probe').get();
    return 'operational';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/credential|project|default credentials/i.test(message)) return 'configuration_required';
    return 'error';
  }
}
