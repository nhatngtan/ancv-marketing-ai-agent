import type { ContentType } from '@ancv/shared';
import { db } from '../firebase.js';

export async function allocateContentId(type: ContentType, now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const prefix = type === 'video' ? 'VID' : 'ART';
  const counterRef = db().collection('systemCounters').doc(`${type}-${year}`);
  const sequence = await db().runTransaction(async (transaction) => {
    const snapshot = await transaction.get(counterRef);
    const next = (snapshot.data()?.value ?? 0) + 1;
    transaction.set(counterRef, { value: next, updatedAt: now.toISOString(), status: 'active' }, { merge: true });
    return next;
  });
  return `ANCV-${prefix}-${year}-${String(sequence).padStart(3, '0')}`;
}

