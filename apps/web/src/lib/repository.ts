import { addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { DEFAULT_CONNECTORS, type AIUsageRecord, type CompanyProfile, type ConnectorRecord, type ContentRecord, type ContentType, type FlowAccountRecord, type FlowJobRecord, type LocalAgentRecord, type MediaAssetRecord, type Platform, type PlatformCopy, type SceneRecord } from '@ancv/shared';
import { auth, firebaseConfigured, firestore, storage } from './firebase';

const demoContents: ContentRecord[] = [{ id: 'demo-video', contentId: 'ANCV-VID-2026-001', type: 'video', title: 'Video mẫu ANCV', topic: 'An ninh doanh nghiệp', body: '', masterScript: 'MASTER SCRIPT được nhập từ bên ngoài hệ thống.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'demo-user', status: 'draft', platforms: ['youtube','facebook','tiktok','zalo','linkedin'].map((platform) => ({ platform: platform as Platform, mode: 'manual', status: 'manual_pending' })) }];
function readLocal(): ContentRecord[] { try { return JSON.parse(localStorage.getItem('ancv-demo-contents') ?? 'null') ?? demoContents; } catch { return demoContents; } }
function writeLocal(records: ContentRecord[]) { localStorage.setItem('ancv-demo-contents', JSON.stringify(records)); window.dispatchEvent(new Event('ancv-data')); }

async function api<T>(path: string, init?: RequestInit, timeoutMs = 90_000): Promise<T> {
  const backendUrl = import.meta.env.VITE_BACKEND_URL; const token = await auth?.currentUser?.getIdToken();
  if (!backendUrl || !token) throw new Error('Cần đăng nhập bằng tài khoản đã được cấp quyền.');
  const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${backendUrl}${path}`, { ...init, signal: controller.signal, headers: { ...(init?.body ? { 'content-type': 'application/json' } : {}), authorization: `Bearer ${token}`, ...init?.headers } });
    const result = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error((result as { message?: string; error?: string }).message ?? (result as { error?: string }).error ?? 'Yêu cầu thất bại.');
    return result as T;
  } finally { clearTimeout(timer); }
}

export function subscribeContents(callback: (records: ContentRecord[]) => void): () => void {
  if (!firebaseConfigured || !firestore) { const notify = () => callback(readLocal()); notify(); window.addEventListener('ancv-data', notify); return () => window.removeEventListener('ancv-data', notify); }
  return onSnapshot(query(collection(firestore, 'contents'), orderBy('updatedAt', 'desc')), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ContentRecord))));
}
export function subscribeConnectors(callback: (records: ConnectorRecord[]) => void): () => void {
  if (!firebaseConfigured || !firestore) { callback(DEFAULT_CONNECTORS); return () => undefined; }
  return onSnapshot(collection(firestore, 'connectors'), (snapshot) => callback(snapshot.empty ? DEFAULT_CONNECTORS : snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ConnectorRecord))));
}
export function subscribeScenes(contentDocId: string, callback: (records: SceneRecord[]) => void): () => void {
  if (!firestore) { callback([]); return () => undefined; }
  return onSnapshot(query(collection(firestore, 'scenes'), where('contentDocId', '==', contentDocId)), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as SceneRecord)).sort((a,b) => a.sceneNumber-b.sceneNumber)));
}
export function subscribeAssets(contentDocId: string, callback: (records: MediaAssetRecord[]) => void): () => void {
  if (!firestore) { callback([]); return () => undefined; }
  return onSnapshot(query(collection(firestore, 'mediaAssets'), where('contentDocId', '==', contentDocId)), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as MediaAssetRecord)).sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt)))));
}
export function subscribeFlowAccounts(callback: (records: FlowAccountRecord[]) => void): () => void {
  if (!firestore) { callback([]); return () => undefined; }
  return onSnapshot(collection(firestore, 'flowAccounts'), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FlowAccountRecord)).sort((a,b) => a.label.localeCompare(b.label))));
}
export function subscribeFlowJobs(contentDocId: string, callback: (records: FlowJobRecord[]) => void): () => void {
  if (!firestore) { callback([]); return () => undefined; }
  return onSnapshot(query(collection(firestore, 'flowJobs'), where('contentDocId', '==', contentDocId)), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as FlowJobRecord))));
}
export function subscribeLocalAgents(callback: (records: LocalAgentRecord[]) => void): () => void {
  if (!firestore) { callback([]); return () => undefined; }
  return onSnapshot(collection(firestore, 'localAgents'), (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as LocalAgentRecord))));
}
export function subscribeMonthlyAIUsage(callback: (summary: { requests: number; totalTokens: number; images: number }) => void): () => void {
  if (!firestore) { callback({ requests: 0, totalTokens: 0, images: 0 }); return () => undefined; }
  const month = new Date().toISOString().slice(0,7);
  return onSnapshot(collection(firestore, 'aiUsage'), (snapshot) => { const records = snapshot.docs.map((item) => item.data() as AIUsageRecord).filter((item) => String(item.createdAt).startsWith(month)); callback({ requests: records.length, totalTokens: records.reduce((sum,item) => sum + Number(item.totalTokens ?? 0),0), images: records.reduce((sum,item) => sum + Number(item.imageCount ?? 0),0) }); });
}

export async function createContent(input: { type: ContentType; title: string; topic: string; body: string; masterScript?: string; objective?: string; shortDescription?: string; sourceMaterial?: string; notes?: string; desiredLength?: string; platforms: Platform[] }) {
  const now = new Date(); let contentId = `ANCV-${input.type === 'video' ? 'VID' : 'ART'}-${now.getFullYear()}-LOCAL-${String(Date.now()).slice(-5)}`;
  if (firebaseConfigured) contentId = (await api<{contentId:string}>('/v1/content/allocate-id', { method: 'POST', body: JSON.stringify({ type: input.type }) })).contentId;
  const uid = auth?.currentUser?.uid ?? 'demo-user'; const record = { ...input, contentId, status: 'draft', createdAt: now.toISOString(), updatedAt: now.toISOString(), createdBy: uid, characterReferences: [], visualStyle: {}, platformCopies: {}, platforms: input.platforms.map((platform) => ({ platform, status: 'manual_pending' as const, mode: 'manual' as const })) };
  if (!firebaseConfigured || !firestore) { writeLocal([{ id: crypto.randomUUID(), ...record }, ...readLocal()]); return; }
  await addDoc(collection(firestore, 'contents'), { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}
export async function updateContent(id: string, changes: Partial<ContentRecord>) { if (!firestore) { writeLocal(readLocal().map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item)); return; } await updateDoc(doc(firestore, 'contents', id), { ...changes, updatedAt: serverTimestamp() }); }
export async function removeContent(id: string) { if (!firestore) { writeLocal(readLocal().filter((item) => item.id !== id)); return; } await updateDoc(doc(firestore, 'contents', id), { status: 'archived', testContent: true, updatedAt: serverTimestamp() }); }

export async function createScene(contentId: string, scene: Partial<SceneRecord> & { title: string }) { return api<SceneRecord>(`/v1/content/${contentId}/scenes`, { method: 'POST', body: JSON.stringify(scene) }); }
export async function saveScene(contentId: string, sceneId: string, changes: Partial<SceneRecord>) { return api(`/v1/content/${contentId}/scenes/${sceneId}`, { method: 'PATCH', body: JSON.stringify(changes) }); }
export async function deleteScene(contentId: string, sceneId: string) { return api(`/v1/content/${contentId}/scenes/${sceneId}`, { method: 'DELETE' }); }
export async function duplicateScene(contentId: string, sceneId: string) { return api<SceneRecord>(`/v1/content/${contentId}/scenes/${sceneId}/duplicate`, { method: 'POST', body: '{}' }); }
export async function reorderScenes(contentId: string, sceneIds: string[]) { return api(`/v1/content/${contentId}/scenes/reorder`, { method: 'POST', body: JSON.stringify({ sceneIds }) }); }
export async function breakdownScenes(contentId: string, replaceExisting = false) { return api<{jobId:string;scenes:SceneRecord[]}>(`/v1/ai/content/${contentId}/scenes/breakdown`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), replaceExisting }) }, 120_000); }
export async function regenerateScene(contentId: string, sceneId: string) { return api<{scene:SceneRecord}>(`/v1/ai/content/${contentId}/scenes/${sceneId}/regenerate`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) }, 120_000); }
export async function regeneratePrompt(contentId: string, sceneId: string) { return api<{generationPrompt:string}>(`/v1/ai/content/${contentId}/scenes/${sceneId}/prompt`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) }, 120_000); }
export async function createFlowJob(contentDocId: string, sceneId: string, flowAccountId: string) { return api<{job:FlowJobRecord}>('/v1/flow/jobs', { method: 'POST', body: JSON.stringify({ contentDocId, sceneId, flowAccountId }) }); }
export async function openSceneFolder(contentDocId: string, sceneId: string) { return api('/v1/flow/local-commands/open-scene-folder', { method: 'POST', body: JSON.stringify({ contentDocId, sceneId, agentId: 'ancv-windows-01' }) }); }
export async function generateArticle(contentId: string, replaceExisting = false) { return api<{article:{title:string;body:string}}>(`/v1/ai/content/${contentId}/article`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), replaceExisting }) }, 120_000); }
export async function generatePlatformCopy(contentId: string, platform: Platform, replaceExisting = false) { return api<{copy:PlatformCopy}>(`/v1/ai/content/${contentId}/platform-copy/${platform}`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), replaceExisting }) }, 120_000); }
export async function approvePlatformCopy(contentId: string, platform: Platform) { return api<{copy:PlatformCopy}>(`/v1/ai/content/${contentId}/platform-copy/${platform}/approve`, { method: 'POST', body: '{}' }); }
export async function generateArticleImage(contentId: string, prompt: string, size = '1024x1024', quality = 'low') { return api<{asset:MediaAssetRecord}>(`/v1/ai/content/${contentId}/images`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), prompt, size, quality }) }, 180_000); }
export async function approveContent(contentId: string) { return api(`/v1/content/${contentId}/approve`, { method: 'POST', body: '{}' }); }
export async function markReady(contentId: string) { return api(`/v1/content/${contentId}/ready`, { method: 'POST', body: '{}' }); }
export async function setContentStatus(contentId: string, status: string) { return api(`/v1/content/${contentId}/status`, { method: 'POST', body: JSON.stringify({ status }) }); }
export async function markManualPublished(contentId: string, platform: Platform, postUrl: string, note?: string) { return api(`/v1/content/${contentId}/manual-publish`, { method: 'POST', body: JSON.stringify({ platform, postUrl, note }) }); }
export async function savePlatformCopy(contentId: string, platform: Platform, copy: PlatformCopy) { if (!firestore) return; await updateDoc(doc(firestore, 'contents', contentId), { [`platformCopies.${platform}`]: { ...copy, editedAt: new Date().toISOString() }, updatedAt: serverTimestamp() }); }

export async function uploadMedia(content: ContentRecord, file: File, kind: 'scene_take' | 'video_final', sceneId?: string, takeNumber = 1): Promise<MediaAssetRecord> {
  if (!firestore || !storage || !auth?.currentUser) throw new Error('Firebase Storage chưa sẵn sàng.'); const uid = auth.currentUser.uid; const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g,'_'); const storagePath = `content/${content.id}/${kind}/${sceneId ?? 'final'}/${crypto.randomUUID()}-${safeName}`;
  const storageRef = ref(storage, storagePath); await uploadBytes(storageRef, file, { contentType: file.type }); const downloadUrl = await getDownloadURL(storageRef); const now = new Date().toISOString();
  const refDoc = await addDoc(collection(firestore, 'mediaAssets'), { contentDocId: content.id, contentId: content.contentId, kind, storagePath, downloadUrl, fileName: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size, sceneId: sceneId ?? null, takeNumber, selected: false, status: 'ready', createdAt: now, updatedAt: now, createdBy: uid });
  await api(`/v1/content/${content.id}/audit`, { method: 'POST', body: JSON.stringify({ action: kind === 'scene_take' ? 'upload_raw' : 'upload_final', detail: { assetId: refDoc.id, sceneId: sceneId ?? null, fileName: file.name } }) });
  return { id: refDoc.id, contentDocId: content.id, contentId: content.contentId, kind, storagePath, downloadUrl, fileName: file.name, contentType: file.type || 'application/octet-stream', sizeBytes: file.size, sceneId, takeNumber, selected: false, status: 'ready', createdAt: now, updatedAt: now, createdBy: uid };
}
export async function selectAsset(contentDocId: string, assets: MediaAssetRecord[], selected: MediaAssetRecord) { if (!firestore) return; const batch = writeBatch(firestore); assets.filter((item) => item.kind === selected.kind && (selected.kind !== 'scene_take' || item.sceneId === selected.sceneId)).forEach((item) => batch.update(doc(firestore!, 'mediaAssets', item.id), { selected: item.id === selected.id, updatedAt: serverTimestamp() })); if (selected.kind === 'article_image') batch.update(doc(firestore, 'contents', contentDocId), { selectedImageId: selected.id, updatedAt: serverTimestamp() }); if (selected.kind === 'video_final') batch.update(doc(firestore, 'contents', contentDocId), { finalVideoAssetId: selected.id, status: 'awaiting_copy', updatedAt: serverTimestamp() }); await batch.commit(); await api(`/v1/content/${contentDocId}/audit`, { method: 'POST', body: JSON.stringify({ action: 'select_asset', detail: { assetId: selected.id, kind: selected.kind, sceneId: selected.sceneId ?? null } }) }); }
export async function getCompanyProfile() { return api<CompanyProfile>('/v1/content/company-profile'); }
export async function saveCompanyProfile(profile: CompanyProfile) { return api<CompanyProfile>('/v1/content/company-profile', { method: 'PUT', body: JSON.stringify(profile) }); }
export async function downloadSceneList(contentId: string) { const backendUrl = import.meta.env.VITE_BACKEND_URL; const token = await auth?.currentUser?.getIdToken(); if (!backendUrl || !token) throw new Error('Cần đăng nhập.'); const response = await fetch(`${backendUrl}/v1/content/${contentId}/scene-list.tsv`, { headers: { authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Không thể tải danh sách scene.'); return response.blob(); }

export async function testConnector(platform: 'ga4' | 'search_console' | 'website', url?: string) { return api<{status:string}>('/connectors/test', { method: 'POST', body: JSON.stringify(platform === 'website' ? { platform, url } : { platform }) }); }
export async function fetchBackendHealth() { const backendUrl = import.meta.env.VITE_BACKEND_URL; if (!backendUrl) return null; const response = await fetch(`${backendUrl}/health`); if (!response.ok) throw new Error('Backend health request failed.'); return response.json() as Promise<{ status: string; checkedAt: string; dependencies: Record<string, string> }>; }
