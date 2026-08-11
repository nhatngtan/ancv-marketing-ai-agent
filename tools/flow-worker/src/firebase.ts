import { applicationDefault, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { flowConfig } from './config.js';

const app = getApps()[0] ?? initializeApp({
  credential: applicationDefault(), projectId: flowConfig.projectId, storageBucket: flowConfig.storageBucket,
});

export const firestore = getFirestore(app);
firestore.settings({ ignoreUndefinedProperties: true });
export const storageBucket = getStorage(app).bucket();
