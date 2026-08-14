import type { ContentRecord, ContentType, Platform } from '@ancv/shared';
import type { Firestore } from 'firebase-admin/firestore';
import { db } from '../firebase.js';

const VIDEO_PLATFORMS: Platform[] = ['youtube', 'tiktok', 'facebook', 'zalo', 'linkedin'];
const ARTICLE_PLATFORMS: Platform[] = ['website', 'facebook', 'zalo', 'linkedin'];

export type CreateContentInput =
  | { type: 'video'; title: string }
  | {
      type: 'article'; title: string; topic: string; body?: string; objective?: string;
      shortDescription?: string; sourceMaterial?: string; notes?: string; desiredLength?: string;
      platforms?: Platform[];
    };

function contentIdForSequence(type: ContentType, year: number, sequence: number): string {
  return `ANCV-${type === 'video' ? 'VID' : 'ART'}-${year}-${String(sequence).padStart(3, '0')}`;
}

export function buildContentRecord(input: CreateContentInput, id: string, contentId: string, uid: string, now: Date): ContentRecord {
  const timestamp = now.toISOString();
  const platforms = input.type === 'video' ? VIDEO_PLATFORMS : (input.platforms?.length ? input.platforms : ARTICLE_PLATFORMS);
  const common = {
    id, contentId, type: input.type, title: input.title, topic: input.type === 'video' ? input.title : input.topic,
    body: input.type === 'video' ? '' : (input.body ?? ''), status: 'draft' as const,
    createdAt: timestamp, updatedAt: timestamp, createdBy: uid, platformCopies: {},
    platforms: platforms.map((platform) => ({ platform, status: 'manual_pending' as const, mode: 'manual' as const })),
  };
  if (input.type === 'video') return { ...common, characterReferences: [], visualStyle: {} };
  return {
    ...common,
    ...(input.objective !== undefined ? { objective: input.objective } : {}),
    ...(input.shortDescription !== undefined ? { shortDescription: input.shortDescription } : {}),
    ...(input.sourceMaterial !== undefined ? { sourceMaterial: input.sourceMaterial } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.desiredLength !== undefined ? { desiredLength: input.desiredLength } : {}),
  };
}

export async function createContentWithId(input: CreateContentInput, uid: string, now = new Date(), store: Firestore = db()): Promise<ContentRecord> {
  const year = now.getUTCFullYear();
  const counterRef = store.collection('systemCounters').doc(`${input.type}-${year}`);
  const contentRef = store.collection('contents').doc();
  return store.runTransaction(async (transaction) => {
    const counter = await transaction.get(counterRef);
    const sequence = Number(counter.data()?.value ?? 0) + 1;
    const record = buildContentRecord(input, contentRef.id, contentIdForSequence(input.type, year, sequence), uid, now);
    transaction.set(counterRef, { value: sequence, updatedAt: now.toISOString(), status: 'active' }, { merge: true });
    transaction.set(contentRef, record);
    return record;
  });
}

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
