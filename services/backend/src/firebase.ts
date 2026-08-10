import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

let database: Firestore | null = null;

export function db(): Firestore {
  if (database) return database;
  if (!getApps().length) {
    initializeApp({ credential: applicationDefault() });
  }
  database = getFirestore();
  database.settings({ ignoreUndefinedProperties: true });
  return database;
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

