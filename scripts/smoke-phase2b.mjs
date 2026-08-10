#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

// Resolve the backend workspace's production dependency without duplicating it at the monorepo root.
const backendRequire = createRequire(new URL('../services/backend/package.json', import.meta.url));
const { applicationDefault, initializeApp } = backendRequire('firebase-admin/app');
const { getAuth } = backendRequire('firebase-admin/auth');
const { getFirestore } = backendRequire('firebase-admin/firestore');
const { getStorage } = backendRequire('firebase-admin/storage');

const projectId = 'ancv-marketing-ai-agent';
const adminEmail = 'nhat.ngtan@gmail.com';
const backendUrl = process.env.ANCV_BACKEND_URL ?? 'https://ancv-marketing-backend-er6fbprpra-as.a.run.app';
const execute = process.argv.includes('--execute-paid-smoke');

if (!execute) {
  console.error('Refusing to call paid AI APIs without --execute-paid-smoke.');
  process.exit(2);
}

const firebaseEnv = readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8');
const apiKeyMatch = firebaseEnv.match(/^VITE_FIREBASE_API_KEY=(.+)$/m);
if (!apiKeyMatch) throw new Error('VITE_FIREBASE_API_KEY is missing from apps/web/.env.local');
const apiKey = apiKeyMatch[1].trim().replace(/^['"]|['"]$/g, '');

initializeApp({
  credential: applicationDefault(),
  projectId,
  serviceAccountId: `firebase-adminsdk-fbsvc@${projectId}.iam.gserviceaccount.com`,
  storageBucket: `${projectId}.firebasestorage.app`,
});

const firestore = getFirestore();
const bucket = getStorage().bucket();
const createdRefs = [];
let idToken = '';

function assert(condition, message) {
  if (!condition) throw new Error(`ASSERTION_FAILED: ${message}`);
}

async function api(path, init = {}) {
  const response = await fetch(`${backendUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${idToken}`, 'content-type': 'application/json', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(240_000),
  });
  const raw = await response.text();
  let body;
  try { body = raw ? JSON.parse(raw) : {}; } catch { body = { raw: raw.slice(0, 500) }; }
  if (!response.ok) throw new Error(`HTTP_${response.status} ${path}: ${JSON.stringify(body)}`);
  return body;
}

async function main() {
  const user = await getAuth().getUserByEmail(adminEmail);
  const role = (await firestore.collection('users').doc(user.uid).get()).data();
  assert(role?.status === 'active' && role?.role === 'admin', 'test identity must be an active Firebase admin');

  const customToken = await getAuth().createCustomToken(user.uid);
  const tokenResponse = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }),
    signal: AbortSignal.timeout(30_000),
  });
  const tokenBody = await tokenResponse.json();
  assert(tokenResponse.ok && tokenBody.idToken, 'Firebase custom-token exchange failed');
  idToken = tokenBody.idToken;
  const verifiedIdentity = await getAuth().verifyIdToken(idToken, true);
  assert(verifiedIdentity.uid === user.uid && verifiedIdentity.aud === projectId, 'locally verified Firebase ID token has the wrong identity or audience');

  const [videoAllocation, articleAllocation] = await Promise.all([
    api('/v1/content/allocate-id', { method: 'POST', body: JSON.stringify({ type: 'video' }) }),
    api('/v1/content/allocate-id', { method: 'POST', body: JSON.stringify({ type: 'article' }) }),
  ]);
  const now = new Date().toISOString();
  const videoRef = firestore.collection('contents').doc();
  const articleRef = firestore.collection('contents').doc();
  createdRefs.push(videoRef, articleRef);
  await Promise.all([
    videoRef.set({
      id: videoRef.id, contentId: videoAllocation.contentId, type: 'video', title: 'ANCV PHASE 2B TEST',
      topic: 'Quy trình kiểm tra an ninh đầu ca', status: 'test', testContent: true,
      masterScript: 'Cảnh 1: Người phụ trách an ninh kiểm tra cổng doanh nghiệp vào đầu ca. Cảnh 2: Nhân viên ghi nhận tình trạng và bàn giao theo quy trình nội bộ.',
      body: '', createdAt: now, updatedAt: now, createdBy: user.uid,
    }),
    articleRef.set({
      id: articleRef.id, contentId: articleAllocation.contentId, type: 'article', title: 'ANCV PHASE 2B TEST - ARTICLE',
      topic: 'Các bước chuẩn bị cho quy trình kiểm tra an ninh đầu ca', objective: 'Bài hướng dẫn ngắn, thận trọng và không đưa ra tuyên bố chưa được xác minh.',
      sourceMaterial: 'Chỉ sử dụng thông tin chung trong chủ đề. Không nêu số liệu, chứng nhận, khách hàng, giá hoặc cam kết của ANCV.',
      desiredLength: '150-200 từ', body: '', status: 'test', testContent: true,
      createdAt: now, updatedAt: now, createdBy: user.uid,
    }),
  ]);

  const usageBefore = await firestore.collection('aiUsage').where('createdAt', '>=', now).get();
  const sceneKey = `phase2b-scenes-${randomUUID()}`;
  const breakdown = await api(`/v1/ai/content/${videoRef.id}/scenes/breakdown`, {
    method: 'POST', body: JSON.stringify({ idempotencyKey: sceneKey, replaceExisting: false }),
  });
  assert(Array.isArray(breakdown.scenes) && breakdown.scenes.length > 0, 'scene breakdown returned no scenes');
  const requiredSceneFields = ['sceneNumber','title','durationEstimate','narration','visualDescription','cameraDirection','environment','characters','continuityNotes','generationPrompt','status'];
  for (const scene of breakdown.scenes) for (const field of requiredSceneFields) assert(Object.hasOwn(scene, field), `scene is missing ${field}`);

  const replay = await api(`/v1/ai/content/${videoRef.id}/scenes/breakdown`, {
    method: 'POST', body: JSON.stringify({ idempotencyKey: sceneKey, replaceExisting: false }),
  });
  assert(replay.duplicate === true && replay.jobId === breakdown.jobId, 'idempotency replay did not reuse completed job');

  const videoCopy = await api(`/v1/ai/content/${videoRef.id}/platform-copy/tiktok`, {
    method: 'POST', body: JSON.stringify({ idempotencyKey: `phase2b-copy-${randomUUID()}`, replaceExisting: false }),
  });
  assert(videoCopy.copy?.text && !/[\r\n]/.test(videoCopy.copy.text.trim()), 'TikTok copy must be one short line');

  const article = await api(`/v1/ai/content/${articleRef.id}/article`, {
    method: 'POST', body: JSON.stringify({ idempotencyKey: `phase2b-article-${randomUUID()}`, replaceExisting: false }),
  });
  assert(article.article?.title && article.article?.body?.length > 100, 'article generation returned insufficient structured content');

  const image = await api(`/v1/ai/content/${articleRef.id}/images`, {
    method: 'POST', body: JSON.stringify({
      idempotencyKey: `phase2b-image-${randomUUID()}`,
      prompt: 'A clean editorial illustration of a professional security checklist at a modern business entrance, green and navy palette, no logo, no text, no identifiable person.',
      size: '1024x1024', quality: 'low',
    }),
  });
  assert(image.asset?.storagePath && image.asset?.sizeBytes > 0 && image.asset?.quality === 'low', 'image asset metadata is incomplete');
  const [storageMetadata] = await bucket.file(image.asset.storagePath).getMetadata();
  assert(Number(storageMetadata.size) === image.asset.sizeBytes, 'Cloud Storage object size does not match Firestore metadata');

  const usageAfter = await firestore.collection('aiUsage').where('createdAt', '>=', now).get();
  const smokeUsage = usageAfter.docs.map((doc) => doc.data()).filter((item) => [videoRef.id, articleRef.id].includes(item.contentDocId));
  const operations = smokeUsage.map((item) => item.operation).sort();
  assert(smokeUsage.length === 4, `expected exactly 4 usage records, got ${smokeUsage.length}`);
  for (const operation of ['scene_breakdown','video_social_copy','article_generation','image_generation']) assert(operations.includes(operation), `missing aiUsage operation ${operation}`);
  assert(usageAfter.size - usageBefore.size === 4, 'idempotency replay unexpectedly created extra usage');

  const sceneDocs = await firestore.collection('scenes').where('contentDocId', '==', videoRef.id).get();
  assert(sceneDocs.size === breakdown.scenes.length, 'structured scenes were not persisted correctly');
  const assetDoc = await firestore.collection('mediaAssets').doc(image.asset.id).get();
  assert(assetDoc.exists, 'image metadata was not persisted');

  console.log(JSON.stringify({
    status: 'PASS', identity: adminEmail, videoContentId: videoAllocation.contentId, articleContentId: articleAllocation.contentId,
    scenes: breakdown.scenes.length, structuredSceneFields: requiredSceneFields.length, idempotencyReplay: replay.duplicate,
    tiktokCopyOneLine: true, articleCharacters: article.article.body.length,
    image: { model: image.asset.model, quality: image.asset.quality, storagePath: image.asset.storagePath, sizeBytes: image.asset.sizeBytes },
    aiUsage: smokeUsage.map((item) => ({ operation: item.operation, model: item.model, inputTokens: item.inputTokens, outputTokens: item.outputTokens, totalTokens: item.totalTokens, imageCount: item.imageCount })),
    jobs: [breakdown.jobId, videoCopy.jobId, article.jobId, image.jobId],
  }, null, 2));
}

try {
  await main();
} finally {
  const archivedAt = new Date().toISOString();
  await Promise.all(createdRefs.map((ref) => ref.set({ status: 'archived', testContent: true, smokeTest: { phase: '2B', archivedAt }, updatedAt: archivedAt }, { merge: true })));
}
