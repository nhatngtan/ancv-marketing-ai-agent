#!/usr/bin/env node

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';

const backendRequire = createRequire(new URL('../services/backend/package.json', import.meta.url));
const { applicationDefault, initializeApp } = backendRequire('firebase-admin/app');
const { getAuth } = backendRequire('firebase-admin/auth');
const { getFirestore } = backendRequire('firebase-admin/firestore');
const { getStorage } = backendRequire('firebase-admin/storage');

const projectId = 'ancv-marketing-ai-agent';
const backendUrl = process.env.ANCV_BACKEND_URL ?? 'https://ancv-marketing-backend-er6fbprpra-as.a.run.app';
const adminEmail = 'nhat.ngtan@gmail.com';
const execute = process.argv.includes('--execute-one-scene');
if (!execute) throw new Error('Refusing to Generate without --execute-one-scene.');

const env = readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8');
const apiKey = env.match(/^VITE_FIREBASE_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY_MISSING');
initializeApp({ credential: applicationDefault(), projectId, serviceAccountId: `firebase-adminsdk-fbsvc@${projectId}.iam.gserviceaccount.com`, storageBucket: `${projectId}.firebasestorage.app` });
const firestore = getFirestore();
const bucket = getStorage().bucket();

function assert(value, message) { if (!value) throw new Error(`ASSERTION_FAILED:${message}`); }
const sleep = (milliseconds) => new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

async function main() {
  const user = await getAuth().getUserByEmail(adminEmail);
  const customToken = await getAuth().createCustomToken(user.uid);
  const exchange = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }), signal: AbortSignal.timeout(30_000),
  });
  const token = await exchange.json();
  assert(exchange.ok && token.idToken, 'Firebase test authentication failed');

  const now = new Date().toISOString();
  const contentRef = firestore.collection('contents').doc();
  const sceneRef = firestore.collection('scenes').doc();
  const contentId = `ANCV-VID-2026-LOCALTEST-${Date.now().toString().slice(-6)}`;
  await contentRef.set({
    id: contentRef.id, contentId, type: 'video', title: 'ANCV PHASE 2D.3 LOCAL AGENT TEST', topic: 'Kiểm tra local-first một Scene',
    body: '', masterScript: 'TEST only. One short neutral security scene. No production claim.', status: 'test', testContent: true,
    platforms: [], createdAt: now, updatedAt: now, createdBy: user.uid,
  });
  await sceneRef.set({
    id: sceneRef.id, contentDocId: contentRef.id, contentId, sceneNumber: 1, title: 'Local Agent smoke', durationEstimate: 5,
    narration: '', visualDescription: 'A calm cinematic exterior of a modern office building at dawn, no logos, no text.',
    cameraDirection: 'Locked wide shot with subtle slow push-in.', environment: 'Modern office exterior at dawn.', characters: [], continuityNotes: 'No branding and no readable text.',
    generationPrompt: 'Cinematic realistic 5-second video, modern office building exterior at dawn, calm blue-gold light, subtle slow camera push-in, no people, no logos, no text, 16:9.',
    status: 'approved', flowStatus: 'not_started', createdAt: now, updatedAt: now, createdBy: user.uid,
  });
  const [beforeFiles] = await bucket.getFiles({ prefix: `content/${contentRef.id}/` });
  assert(beforeFiles.length === 0, 'fixture Cloud Storage prefix must start empty');

  const response = await fetch(`${backendUrl}/v1/flow/jobs`, {
    method: 'POST', headers: { authorization: `Bearer ${token.idToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ contentDocId: contentRef.id, sceneId: sceneRef.id, flowAccountId: 'account-01' }), signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  assert(response.status === 201, `flow job create failed ${response.status}:${JSON.stringify(body)}`);
  assert(body.job.executionMode === 'local_agent' && body.job.storageStrategy === 'local_first', 'job strategy mismatch');

  const deadline = Date.now() + 18 * 60_000;
  let job;
  while (Date.now() < deadline) {
    job = (await firestore.collection('flowJobs').doc(sceneRef.id).get()).data();
    if (job?.status === 'succeeded' || job?.status === 'needs_manual') break;
    await sleep(5_000);
  }
  assert(job?.status === 'succeeded', `job did not succeed:${job?.error ?? job?.status ?? 'timeout'}`);
  assert(job.generateClicks === 1, 'Generate must be clicked exactly once');
  const assets = await firestore.collection('mediaAssets').where('flowJobId', '==', sceneRef.id).get();
  assert(assets.size === 1, `expected one asset, got ${assets.size}`);
  const asset = assets.docs[0].data();
  assert(asset.storageType === 'local' && asset.relativePath && !asset.downloadUrl, 'asset must be local metadata only');
  const configPath = resolve(process.env.LOCALAPPDATA, 'ANCV', 'local-agent', 'config.json');
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  const localFile = resolve(config.workspaceRoot, ...asset.relativePath.split('/'));
  assert(existsSync(localFile) && statSync(localFile).size > 1024, 'local MP4 missing or empty');
  const [afterFiles] = await bucket.getFiles({ prefix: `content/${contentRef.id}/` });
  assert(afterFiles.length === 0, 'Flow smoke must not upload Firebase Storage');
  const scene = (await sceneRef.get()).data();
  assert(scene.flowStatus === 'succeeded', 'scene status mismatch');
  await contentRef.update({ status: 'archived', testContent: true, archivedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  console.log(JSON.stringify({ result: 'PASS', contentId, sceneId: sceneRef.id, jobId: sceneRef.id, generateClicks: job.generateClicks, assetId: asset.id, storageType: asset.storageType, relativePath: asset.relativePath, fileSize: statSync(localFile).size, firebaseUploads: afterFiles.length, scene: scene.flowStatus, job: job.status, duplicateAssets: assets.size - 1 }));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
