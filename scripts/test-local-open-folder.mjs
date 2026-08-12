#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const backendRequire = createRequire(new URL('../services/backend/package.json', import.meta.url));
const { applicationDefault, initializeApp } = backendRequire('firebase-admin/app');
const { getAuth } = backendRequire('firebase-admin/auth');
const { getFirestore } = backendRequire('firebase-admin/firestore');
const projectId = 'ancv-marketing-ai-agent';
const backendUrl = process.env.ANCV_BACKEND_URL ?? 'https://ancv-marketing-backend-er6fbprpra-as.a.run.app';
const env = readFileSync(new URL('../apps/web/.env.local', import.meta.url), 'utf8');
const apiKey = env.match(/^VITE_FIREBASE_API_KEY=(.+)$/m)?.[1]?.trim().replace(/^['"]|['"]$/g, '');
if (!apiKey) throw new Error('VITE_FIREBASE_API_KEY_MISSING');
initializeApp({ credential: applicationDefault(), projectId, serviceAccountId: `firebase-adminsdk-fbsvc@${projectId}.iam.gserviceaccount.com` });
const firestore = getFirestore();
const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

const user = await getAuth().getUserByEmail('nhat.ngtan@gmail.com');
const customToken = await getAuth().createCustomToken(user.uid);
const exchange = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(apiKey)}`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: customToken, returnSecureToken: true }), signal: AbortSignal.timeout(30_000),
});
const token = await exchange.json();
if (!exchange.ok || !token.idToken) throw new Error('FIREBASE_TEST_AUTH_FAILED');
const contents = await firestore.collection('contents').where('title', '==', 'ANCV PHASE 2D.3 LOCAL AGENT TEST').get();
const content = contents.docs.sort((left, right) => String(right.data().createdAt).localeCompare(String(left.data().createdAt)))[0];
if (!content) throw new Error('LOCAL_AGENT_TEST_CONTENT_NOT_FOUND');
const scenes = await firestore.collection('scenes').where('contentDocId', '==', content.id).get();
const scene = scenes.docs[0];
if (!scene) throw new Error('LOCAL_AGENT_TEST_SCENE_NOT_FOUND');
const response = await fetch(`${backendUrl}/v1/flow/local-commands/open-scene-folder`, {
  method: 'POST', headers: { authorization: `Bearer ${token.idToken}`, 'content-type': 'application/json' },
  body: JSON.stringify({ contentDocId: content.id, sceneId: scene.id, agentId: 'ancv-windows-01' }), signal: AbortSignal.timeout(30_000),
});
const body = await response.json();
if (response.status !== 201 || !body.command?.id) throw new Error(`OPEN_FOLDER_CREATE_FAILED:${response.status}`);
let command;
for (let attempt = 0; attempt < 15; attempt += 1) {
  command = (await firestore.collection('localCommands').doc(body.command.id).get()).data();
  if (command?.status === 'succeeded' || command?.status === 'needs_manual') break;
  await sleep(1_000);
}
if (command?.status !== 'succeeded') throw new Error(`OPEN_FOLDER_NOT_SUCCEEDED:${command?.error ?? command?.status}`);
console.log(JSON.stringify({ result: 'PASS', commandId: body.command.id, status: command.status, relativePath: command.relativePath }));
