import { addDoc, collection, doc, getDoc, onSnapshot, orderBy, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { DEFAULT_CONNECTORS, type AIUsageRecord, type ArticleSeoData, type BrowserPlatform, type BrowserProfileSettings, type CompanyProfile, type ConnectorRecord, type ContentRecord, type FlowAccountRecord, type FlowJobRecord, type LocalAgentRecord, type LocalCommandRecord, type LocalFinalCandidate, type MarketingDashboardResponse, type MediaAssetRecord, type Platform, type PlatformCopy, type PublishingJobRecord, type Role, type SceneRecord, type WordPressDraftJobRecord, type WordPressDraftState } from '@ancv/shared';
import { auth, firebaseConfigured, firestore, storage } from './firebase';

type TrackedOperation = 'create_content' | 'create_scenes' | 'create_flow_job';
type CreateContentInput =
  | { type: 'video'; title: string }
  | { type: 'article'; title: string; topic: string; body?: string; objective?: string; shortDescription?: string; sourceMaterial?: string; notes?: string; desiredLength?: string; platforms: Platform[] };

class ApiRequestError extends Error {
  constructor(message: string, readonly code: string) { super(message); this.name = 'ApiRequestError'; }
}

function errorCode(error: unknown): string {
  if (error instanceof ApiRequestError) return error.code;
  if (error instanceof DOMException && error.name === 'AbortError') return 'REQUEST_TIMEOUT';
  return error instanceof Error ? error.name : 'UNKNOWN_ERROR';
}

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
    if (!response.ok) {
      const payload = result as { message?: string; error?: string };
      throw new ApiRequestError(payload.message ?? payload.error ?? 'Yêu cầu thất bại.', payload.error ?? `HTTP_${response.status}`);
    }
    return result as T;
  } finally { clearTimeout(timer); }
}

async function trackedApi<T>(operation: TrackedOperation, path: string, init: RequestInit, context: { contentId?: string; sceneId?: string } = {}, timeoutMs = 90_000): Promise<T> {
  const requestId = crypto.randomUUID();
  try {
    return await api<T>(path, { ...init, headers: { ...init.headers, 'x-request-id': requestId } }, timeoutMs);
  } catch (error) {
    console.error('ANCV_ACTION_ERROR', { operation, requestId, ...context, errorCode: errorCode(error), timestamp: new Date().toISOString() });
    throw error;
  }
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

export function buildCreateContentPayload(input: CreateContentInput): CreateContentInput {
  if (input.type === 'video') return { type: 'video', title: input.title.trim() };
  return {
    type: 'article', title: input.title.trim(), topic: input.topic.trim(), platforms: input.platforms,
    ...(input.body !== undefined ? { body: input.body } : {}),
    ...(input.objective !== undefined ? { objective: input.objective } : {}),
    ...(input.shortDescription !== undefined ? { shortDescription: input.shortDescription } : {}),
    ...(input.sourceMaterial !== undefined ? { sourceMaterial: input.sourceMaterial } : {}),
    ...(input.notes !== undefined ? { notes: input.notes } : {}),
    ...(input.desiredLength !== undefined ? { desiredLength: input.desiredLength } : {}),
  };
}

export async function createContent(input: CreateContentInput): Promise<ContentRecord> {
  const payload = buildCreateContentPayload(input);
  if (firebaseConfigured) return (await trackedApi<{content:ContentRecord}>('create_content', '/v1/content', { method: 'POST', body: JSON.stringify(payload) })).content;
  const now = new Date(); const id = crypto.randomUUID(); const videoPlatforms: Platform[] = ['youtube','tiktok','facebook','zalo','linkedin'];
  const articlePlatforms = input.type === 'article' ? input.platforms : [];
  const record: ContentRecord = {
    id, contentId: `ANCV-${input.type === 'video' ? 'VID' : 'ART'}-${now.getFullYear()}-LOCAL-${String(Date.now()).slice(-5)}`,
    type: input.type, title: input.title, topic: input.type === 'video' ? input.title : input.topic, body: input.type === 'article' ? (input.body ?? '') : '',
    status: 'draft', createdAt: now.toISOString(), updatedAt: now.toISOString(), createdBy: 'demo-user', platformCopies: {},
    platforms: (input.type === 'video' ? videoPlatforms : articlePlatforms).map((platform) => ({ platform, status: 'manual_pending', mode: 'manual' })),
    ...(input.type === 'video' ? { characterReferences: [], visualStyle: {} } : {}),
  };
  writeLocal([record, ...readLocal()]); return record;
}
export async function updateContent(id: string, changes: Partial<ContentRecord>) { if (!firestore) { writeLocal(readLocal().map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item)); return; } await updateDoc(doc(firestore, 'contents', id), { ...changes, updatedAt: serverTimestamp() }); }
export async function removeContent(id: string) { if (!firestore) { writeLocal(readLocal().filter((item) => item.id !== id)); return; } await updateDoc(doc(firestore, 'contents', id), { status: 'archived', testContent: true, updatedAt: serverTimestamp() }); }

export async function createScene(contentId: string, scene: Partial<SceneRecord> & { title: string }) { return trackedApi<SceneRecord>('create_scenes', `/v1/content/${contentId}/scenes`, { method: 'POST', body: JSON.stringify(scene) }, { contentId }); }
export async function saveScene(contentId: string, sceneId: string, changes: Partial<SceneRecord>) { return api(`/v1/content/${contentId}/scenes/${sceneId}`, { method: 'PATCH', body: JSON.stringify(changes) }); }
export async function deleteScene(contentId: string, sceneId: string) { return api(`/v1/content/${contentId}/scenes/${sceneId}`, { method: 'DELETE' }); }
export async function duplicateScene(contentId: string, sceneId: string) { return api<SceneRecord>(`/v1/content/${contentId}/scenes/${sceneId}/duplicate`, { method: 'POST', body: '{}' }); }
export async function reorderScenes(contentId: string, sceneIds: string[]) { return api(`/v1/content/${contentId}/scenes/reorder`, { method: 'POST', body: JSON.stringify({ sceneIds }) }); }
export async function breakdownScenes(contentId: string, replaceExisting = false) { return trackedApi<{jobId:string;scenes:SceneRecord[]}>('create_scenes', `/v1/ai/content/${contentId}/scenes/breakdown`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), replaceExisting }) }, { contentId }, 120_000); }
export async function regenerateScene(contentId: string, sceneId: string) { return api<{scene:SceneRecord}>(`/v1/ai/content/${contentId}/scenes/${sceneId}/regenerate`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) }, 120_000); }
export async function regeneratePrompt(contentId: string, sceneId: string) { return api<{generationPrompt:string}>(`/v1/ai/content/${contentId}/scenes/${sceneId}/prompt`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID() }) }, 120_000); }
export async function createFlowJob(contentDocId: string, sceneId: string, flowAccountId: string, current: { generationPrompt: string; durationEstimate: number; aspectRatio: '9:16' | '16:9' }) { return trackedApi<{job:FlowJobRecord}>('create_flow_job', '/v1/flow/jobs', { method: 'POST', body: JSON.stringify({ contentDocId, sceneId, flowAccountId, ...current }) }, { contentId: contentDocId, sceneId }); }
export async function openSceneFolder(contentDocId: string, sceneId: string) { return api('/v1/flow/local-commands/open-scene-folder', { method: 'POST', body: JSON.stringify({ contentDocId, sceneId, agentId: 'ancv-windows-01' }) }); }
export async function openVideoFolder(contentDocId: string) { return api('/v1/flow/local-commands/open-video-folder', { method: 'POST', body: JSON.stringify({ contentDocId, agentId: 'ancv-windows-01' }) }); }
export async function waitLocalCommand(commandId: string, timeoutMs = 120_000): Promise<LocalCommandRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { command } = await api<{command:LocalCommandRecord}>(`/v1/flow/local-commands/${commandId}`);
    if (command.status === 'succeeded') return command;
    if (command.status === 'needs_manual') throw new Error(command.error || 'Local Agent không thể hoàn tất yêu cầu.');
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error('Local Agent chưa phản hồi trong thời gian chờ.');
}
export async function scanVideoFinal(contentDocId: string): Promise<LocalFinalCandidate[]> {
  const { command } = await api<{command:LocalCommandRecord}>('/v1/flow/local-commands/scan-video-final', { method: 'POST', body: JSON.stringify({ contentDocId, agentId: 'ancv-windows-01' }) });
  const completed = await waitLocalCommand(command.id);
  return (completed.result?.candidates ?? []) as LocalFinalCandidate[];
}
export async function registerVideoFinal(contentDocId: string, relativePath: string): Promise<MediaAssetRecord> {
  const { command } = await api<{command:LocalCommandRecord}>('/v1/flow/local-commands/register-video-final', { method: 'POST', body: JSON.stringify({ contentDocId, relativePath, agentId: 'ancv-windows-01' }) });
  const completed = await waitLocalCommand(command.id);
  return completed.result?.asset as MediaAssetRecord;
}
export async function generateArticle(contentId: string, replaceExisting = false) { return api<{article:ArticleSeoData & {body:string}}>(`/v1/ai/content/${contentId}/article`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), replaceExisting }) }, 120_000); }
export async function generatePlatformCopy(contentId: string, platform: Platform, replaceExisting = false) { return api<{copy:PlatformCopy}>(`/v1/ai/content/${contentId}/platform-copy/${platform}`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), replaceExisting }) }, 120_000); }
export async function generateVideoPlatformCopies(
  content: ContentRecord,
  generate: (contentId: string, platform: Platform, replaceExisting: boolean) => Promise<unknown> = generatePlatformCopy,
): Promise<{ succeeded: Platform[]; failed: Array<{platform:Platform;message:string}> }> {
  const platforms: Platform[] = ['tiktok', 'youtube', 'facebook', 'zalo', 'linkedin'];
  const succeeded: Platform[] = [];
  const failed: Array<{platform:Platform;message:string}> = [];
  for (const platform of platforms) {
    if (content.platformCopies?.[platform]) { succeeded.push(platform); continue; }
    try { await generate(content.id, platform, false); succeeded.push(platform); }
    catch (error) { failed.push({ platform, message: error instanceof Error ? error.message : 'Không thể tạo nội dung.' }); }
  }
  return { succeeded, failed };
}
export async function generateArticleSocialCopies(
  content: ContentRecord,
  generate: (contentId: string, platform: Platform, replaceExisting: boolean) => Promise<unknown> = generatePlatformCopy,
): Promise<{ succeeded: Platform[]; failed: Array<{platform:Platform;message:string}> }> {
  const platforms: Platform[] = ['facebook', 'zalo', 'linkedin'];
  const succeeded: Platform[] = [];
  const failed: Array<{platform:Platform;message:string}> = [];
  for (const platform of platforms) {
    if (content.platformCopies?.[platform]) { succeeded.push(platform); continue; }
    try { await generate(content.id, platform, false); succeeded.push(platform); }
    catch (error) { failed.push({ platform, message: error instanceof Error ? error.message : 'Không thể tạo nội dung.' }); }
  }
  return { succeeded, failed };
}
export async function approvePlatformCopy(contentId: string, platform: Platform) { return api<{copy:PlatformCopy}>(`/v1/ai/content/${contentId}/platform-copy/${platform}/approve`, { method: 'POST', body: '{}' }); }
export async function generateArticleImage(contentId: string, prompt: string, size = '1024x1024', quality = 'low') { return api<{asset:MediaAssetRecord}>(`/v1/ai/content/${contentId}/images`, { method: 'POST', body: JSON.stringify({ idempotencyKey: crypto.randomUUID(), prompt, size, quality }) }, 180_000); }
export async function saveAssetMetadata(assetId: string, changes: Pick<MediaAssetRecord, 'altText' | 'caption' | 'mediaTitle'>) { if (!firestore) return; await updateDoc(doc(firestore, 'mediaAssets', assetId), { ...changes, updatedAt: serverTimestamp() }); }
export async function approveContent(contentId: string) { return api(`/v1/content/${contentId}/approve`, { method: 'POST', body: '{}' }); }
export async function markReady(contentId: string) { return api(`/v1/content/${contentId}/ready`, { method: 'POST', body: '{}' }); }
export async function setContentStatus(contentId: string, status: string) { return api(`/v1/content/${contentId}/status`, { method: 'POST', body: JSON.stringify({ status }) }); }
export async function markManualPublished(contentId: string, platform: Platform, postUrl?: string, note?: string) { return api(`/v1/content/${contentId}/manual-publish`, { method: 'POST', body: JSON.stringify({ platform, ...(postUrl ? { postUrl } : {}), note }) }); }
export async function createWordPressDraft(contentId: string) { return api<{job:WordPressDraftJobRecord;draft:WordPressDraftState;duplicateCount:number;idempotentReplay:boolean}>(`/v1/publishing/wordpress/${contentId}/draft`, { method: 'POST', body: '{}' }, 180_000); }
export async function getYouTubePublishingJob(jobId: string) { return api<{job:PublishingJobRecord}>(`/v1/publishing/youtube/jobs/${jobId}`); }
export async function publishYouTubePrivate(contentId: string): Promise<PublishingJobRecord> {
  const started = await api<{job:PublishingJobRecord}> (`/v1/publishing/youtube/${contentId}/private`, { method: 'POST', body: JSON.stringify({ confirmPrivate: true, idempotencyKey: crypto.randomUUID() }) });
  let job = started.job;
  const stagingDeadline = Date.now() + 30 * 60_000;
  while (job.status === 'staging' && Date.now() < stagingDeadline) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    job = (await getYouTubePublishingJob(job.id)).job;
  }
  if (job.status === 'succeeded') return job;
  if (job.status === 'needs_manual') throw new Error(job.error || 'YouTube job cần xử lý thủ công.');
  if (job.status === 'uploading') {
    const uploadDeadline = Date.now() + 35 * 60_000;
    while (job.status === 'uploading' && Date.now() < uploadDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 3_000));
      job = (await getYouTubePublishingJob(job.id)).job;
    }
    if (job.status === 'succeeded') return job;
    throw new Error(job.error || 'YouTube upload chưa có kết quả chắc chắn; hệ thống không retry.');
  }
  if (job.status !== 'staged') throw new Error('Video Final chưa staging xong; hệ thống không retry.');
  const executed = await api<{job:PublishingJobRecord}>(`/v1/publishing/youtube/jobs/${job.id}/execute`, { method: 'POST', body: '{}' }, 35 * 60_000);
  if (executed.job.status !== 'succeeded') throw new Error(executed.job.error || 'YouTube upload cần xử lý thủ công.');
  return executed.job;
}
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
export async function getCurrentUserRole(): Promise<Role | null> {
  if (!firestore || !auth?.currentUser) return null;
  const snapshot = await getDoc(doc(firestore, 'users', auth.currentUser.uid));
  return (snapshot.data()?.role as Role | undefined) ?? null;
}
export interface BrowserProfilesResponse {
  settings: BrowserProfileSettings | null;
  agent: { id: string; status: string; lastSeen: string | null; online: boolean };
}
export async function getBrowserProfiles() { return api<BrowserProfilesResponse>('/v1/flow/browser-profiles'); }
export async function scanBrowserProfiles() { return api<{command:LocalCommandRecord}>('/v1/flow/browser-profiles/scan', { method: 'POST', body: '{}' }); }
export async function saveBrowserProfileMappings(mappings: Partial<Record<BrowserPlatform,string>>) { return api<{settings:BrowserProfileSettings}>('/v1/flow/browser-profiles/mappings', { method: 'PUT', body: JSON.stringify(mappings) }); }
export async function testBrowserProfile(platform: BrowserPlatform) { return api<{command:LocalCommandRecord}>('/v1/flow/browser-profiles/test', { method: 'POST', body: JSON.stringify({ platform }) }); }
export async function waitBrowserCommand(commandId: string, timeoutMs = 75_000): Promise<LocalCommandRecord> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { command } = await api<{command:LocalCommandRecord}>(`/v1/flow/browser-profiles/commands/${commandId}`);
    if (command.status === 'succeeded' || command.status === 'needs_manual') return command;
    await new Promise((resolve) => setTimeout(resolve, 1_500));
  }
  throw new Error('Local Agent chưa phản hồi trong thời gian chờ.');
}
export async function downloadSceneList(contentId: string) { const backendUrl = import.meta.env.VITE_BACKEND_URL; const token = await auth?.currentUser?.getIdToken(); if (!backendUrl || !token) throw new Error('Cần đăng nhập.'); const response = await fetch(`${backendUrl}/v1/content/${contentId}/scene-list.tsv`, { headers: { authorization: `Bearer ${token}` } }); if (!response.ok) throw new Error('Không thể tải danh sách scene.'); return response.blob(); }

export async function testConnector(platform: 'ga4' | 'search_console' | 'website', url?: string) { return api<{status:string}>('/connectors/test', { method: 'POST', body: JSON.stringify(platform === 'website' ? { platform, url } : { platform }) }); }
export async function fetchBackendHealth() { const backendUrl = import.meta.env.VITE_BACKEND_URL; if (!backendUrl) return null; const response = await fetch(`${backendUrl}/health`); if (!response.ok) throw new Error('Backend health request failed.'); return response.json() as Promise<{ status: string; checkedAt: string; dependencies: Record<string, string> }>; }
export async function fetchMarketingDashboard(from: string, to: string) {
  return api<MarketingDashboardResponse>(`/v1/reports/marketing-dashboard?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);
}
