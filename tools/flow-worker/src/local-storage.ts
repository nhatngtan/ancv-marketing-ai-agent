import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, readdir, stat, unlink } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import type { FlowJobRecord, LocalFinalCandidate, MediaAssetRecord } from '@ancv/shared';
import { firestore } from './firebase.js';
import { loadLocalAgentConfig, pathInsideWorkspace } from './config.js';

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

const finalContentTypes: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.m4v': 'video/x-m4v',
  '.webm': 'video/webm',
};

export function localFinalFolderRelativePath(contentId: string): string {
  if (!/^ANCV-VID-\d{4}-[A-Z0-9-]+$/.test(contentId)) throw new Error('LOCAL_FINAL_CONTENT_ID_INVALID');
  return `Projects/${contentId}/Video Final`;
}

export interface LocalFinalObservation {
  relativePath: string;
  sizeBytes: number;
  modifiedAtMs: number;
}

export class LocalFinalStabilityTracker {
  private readonly samples = new Map<string, { sizeBytes: number; modifiedAtMs: number; stableSince: number }>();

  constructor(private readonly stableForMs = 10_000) {}

  observe(observations: LocalFinalObservation[], now = Date.now()): string[] {
    const present = new Set(observations.map((item) => item.relativePath));
    for (const path of this.samples.keys()) if (!present.has(path)) this.samples.delete(path);
    const stable: string[] = [];
    for (const observation of observations) {
      const previous = this.samples.get(observation.relativePath);
      if (!previous || previous.sizeBytes !== observation.sizeBytes || previous.modifiedAtMs !== observation.modifiedAtMs) {
        this.samples.set(observation.relativePath, { ...observation, stableSince: now });
        continue;
      }
      if (now - previous.stableSince >= this.stableForMs) stable.push(observation.relativePath);
    }
    return stable.sort((left, right) => left.localeCompare(right));
  }
}

export class LocalFinalStabilityRegistry {
  private readonly trackers = new Map<string, LocalFinalStabilityTracker>();

  constructor(private readonly stableForMs = 10_000) {}

  observe(contentId: string, observations: LocalFinalObservation[], now = Date.now()): string[] {
    let tracker = this.trackers.get(contentId);
    if (!tracker) {
      tracker = new LocalFinalStabilityTracker(this.stableForMs);
      this.trackers.set(contentId, tracker);
    }
    return tracker.observe(observations, now);
  }
}

export function assertLocalFinalRelativePath(contentId: string, relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '');
  const prefix = `${localFinalFolderRelativePath(contentId)}/`;
  const fileName = normalized.startsWith(prefix) ? normalized.slice(prefix.length) : '';
  if (!fileName || fileName.includes('/') || fileName === '.' || fileName === '..') throw new Error('LOCAL_FINAL_PATH_INVALID');
  if (!finalContentTypes[extname(fileName).toLowerCase()]) throw new Error('LOCAL_FINAL_FORMAT_UNSUPPORTED');
  return normalized;
}

export async function inspectLocalFinalCandidate(contentId: string, relativePath: string): Promise<LocalFinalCandidate> {
  const normalized = assertLocalFinalRelativePath(contentId, relativePath);
  const config = loadLocalAgentConfig();
  const filePath = pathInsideWorkspace(config, normalized);
  const details = await stat(filePath);
  if (!details.isFile() || details.size < 1_024) throw new Error('LOCAL_FINAL_FILE_INVALID');
  const extension = extname(filePath).toLowerCase();
  if (extension === '.mp4') {
    const handle = await open(filePath, 'r');
    try {
      const header = Buffer.alloc(12);
      await handle.read(header, 0, header.length, 0);
      if (header.subarray(4, 8).toString('ascii') !== 'ftyp') throw new Error('LOCAL_FINAL_MP4_SIGNATURE_INVALID');
    } finally {
      await handle.close();
    }
  }
  const checksumSha256 = await sha256(filePath);
  const afterHash = await stat(filePath);
  if (afterHash.size !== details.size || afterHash.mtimeMs !== details.mtimeMs) throw new Error('LOCAL_FINAL_FILE_CHANGED');
  return {
    relativePath: normalized,
    fileName: normalized.split('/').at(-1) ?? 'video-final',
    sizeBytes: details.size,
    contentType: finalContentTypes[extension] ?? 'application/octet-stream',
    checksumSha256,
  };
}

export async function observeLocalFinalFiles(contentId: string): Promise<LocalFinalObservation[]> {
  const config = loadLocalAgentConfig();
  const relativeFolder = localFinalFolderRelativePath(contentId);
  const folder = pathInsideWorkspace(config, relativeFolder);
  await mkdir(folder, { recursive: true });
  const entries = await readdir(folder, { withFileTypes: true });
  const observations: LocalFinalObservation[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !finalContentTypes[extname(entry.name).toLowerCase()]) continue;
    const relativePath = `${relativeFolder}/${entry.name}`;
    const filePath = pathInsideWorkspace(config, relativePath);
    const details = await stat(filePath);
    if (details.size < 1_024) continue;
    if (extname(entry.name).toLowerCase() === '.mp4') {
      const handle = await open(filePath, 'r');
      try {
        const header = Buffer.alloc(12);
        await handle.read(header, 0, header.length, 0);
        if (header.subarray(4, 8).toString('ascii') !== 'ftyp') continue;
      } finally { await handle.close(); }
    }
    observations.push({ relativePath, sizeBytes: details.size, modifiedAtMs: details.mtimeMs });
  }
  return observations;
}

export async function scanLocalFinalCandidates(contentId: string): Promise<LocalFinalCandidate[]> {
  const config = loadLocalAgentConfig();
  const relativeFolder = localFinalFolderRelativePath(contentId);
  const folder = pathInsideWorkspace(config, relativeFolder);
  await mkdir(folder, { recursive: true });
  const entries = await readdir(folder, { withFileTypes: true });
  const candidates: LocalFinalCandidate[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || !finalContentTypes[extname(entry.name).toLowerCase()]) continue;
    candidates.push(await inspectLocalFinalCandidate(contentId, `${relativeFolder}/${entry.name}`));
  }
  return candidates;
}

export function buildLocalFinalAsset(input: {
  contentDocId: string;
  contentId: string;
  candidate: LocalFinalCandidate;
  createdBy: string;
  now: string;
}): MediaAssetRecord {
  const assetId = `final-${input.contentDocId}-${input.candidate.checksumSha256?.slice(0, 24)}`;
  return {
    id: assetId,
    contentDocId: input.contentDocId,
    contentId: input.contentId,
    kind: 'video_final',
    storageType: 'local',
    relativePath: input.candidate.relativePath,
    fileName: input.candidate.fileName,
    contentType: input.candidate.contentType,
    sizeBytes: input.candidate.sizeBytes,
    checksumSha256: input.candidate.checksumSha256,
    selected: true,
    source: 'manual_local',
    status: 'ready',
    createdAt: input.now,
    updatedAt: input.now,
    createdBy: input.createdBy,
  };
}

export async function registerLocalFinalVideo(input: {
  contentDocId: string;
  contentId: string;
  relativePath: string;
  createdBy: string;
}): Promise<MediaAssetRecord> {
  const candidate = await inspectLocalFinalCandidate(input.contentId, input.relativePath);
  const assetId = `final-${input.contentDocId}-${candidate.checksumSha256?.slice(0, 24)}`;
  const assetRef = firestore.collection('mediaAssets').doc(assetId);
  const existing = await assetRef.get();
  const now = new Date().toISOString();
  const asset: MediaAssetRecord = existing.exists ? existing.data() as MediaAssetRecord : buildLocalFinalAsset({
    contentDocId: input.contentDocId,
    contentId: input.contentId,
    candidate,
    createdBy: input.createdBy,
    now,
  });
  const finals = await firestore.collection('mediaAssets')
    .where('contentDocId', '==', input.contentDocId)
    .where('kind', '==', 'video_final')
    .get();
  const batch = firestore.batch();
  finals.docs.filter((document) => document.id !== assetId).forEach((document) => batch.set(document.ref, { selected: false, updatedAt: now }, { merge: true }));
  batch.set(assetRef, { ...asset, selected: true, updatedAt: now }, { merge: true });
  batch.update(firestore.collection('contents').doc(input.contentDocId), {
    finalVideoAssetId: assetId,
    status: 'awaiting_copy',
    finalDetection: { status: 'ready', candidates: [candidate], checkedAt: now },
    updatedAt: now,
  });
  await batch.commit();
  return { ...asset, selected: true, updatedAt: now };
}

export function localVideoRelativePath(job: FlowJobRecord, takeNumber: number, extension = '.mp4'): string {
  const scene = String(job.sceneNumber).padStart(2, '0');
  const take = String(takeNumber).padStart(2, '0');
  return `Projects/${job.contentId}/Video Raw/Scene-${scene}/${job.contentId}_S${scene}_T${take}${extension}`;
}

export async function persistLocalVideo(job: FlowJobRecord, temporaryPath: string): Promise<MediaAssetRecord> {
  const assetRef = firestore.collection('mediaAssets').doc(`flow-${job.id}`);
  const existingAsset = (await assetRef.get()).data() as MediaAssetRecord | undefined;
  if (existingAsset) return existingAsset;

  const sceneAssets = await firestore.collection('mediaAssets')
    .where('contentDocId', '==', job.contentDocId)
    .where('sceneId', '==', job.sceneId)
    .get();
  const takeNumber = Math.max(0, ...sceneAssets.docs.map((document) => Number(document.data().takeNumber ?? 0))) + 1;
  const extension = extname(temporaryPath).toLowerCase() || '.mp4';
  const relativePath = localVideoRelativePath(job, takeNumber, extension);
  const config = loadLocalAgentConfig();
  const destination = pathInsideWorkspace(config, relativePath);
  await mkdir(dirname(destination), { recursive: true });

  const sourceInfo = await stat(temporaryPath);
  if (!sourceInfo.isFile() || sourceInfo.size < 1_024) throw new Error('LOCAL_VIDEO_TEMP_INVALID');
  const handle = await open(temporaryPath, 'r');
  try {
    const header = Buffer.alloc(12);
    await handle.read(header, 0, header.length, 0);
    if (extension === '.mp4' && header.subarray(4, 8).toString('ascii') !== 'ftyp') throw new Error('LOCAL_VIDEO_MP4_SIGNATURE_INVALID');
  } finally {
    await handle.close();
  }
  await copyFile(temporaryPath, destination);
  const destinationInfo = await stat(destination);
  if (!destinationInfo.isFile() || destinationInfo.size !== sourceInfo.size) throw new Error('LOCAL_VIDEO_COPY_VERIFY_FAILED');
  const [sourceHash, destinationHash] = await Promise.all([sha256(temporaryPath), sha256(destination)]);
  if (sourceHash !== destinationHash) throw new Error('LOCAL_VIDEO_HASH_MISMATCH');

  const now = new Date().toISOString();
  const asset: MediaAssetRecord = {
    id: assetRef.id,
    contentDocId: job.contentDocId,
    contentId: job.contentId,
    kind: 'scene_take',
    storageType: 'local',
    relativePath,
    fileName: relativePath.split('/').at(-1) ?? `${job.contentId}.mp4`,
    contentType: 'video/mp4',
    sizeBytes: destinationInfo.size,
    fileSize: destinationInfo.size,
    mimeType: 'video/mp4',
    sceneId: job.sceneId,
    takeNumber,
    selected: false,
    source: 'google_flow',
    flowAccountId: job.flowAccountId,
    flowJobId: job.id,
    ...(job.executionMode === 'playwright_fallback'
      ? { executionEngine: 'playwright_fallback' as const }
      : {}),
    ...(job.flowDetailId ? { outputId: job.flowDetailId } : {}),
    status: 'ready',
    createdAt: now,
    updatedAt: now,
    createdBy: `local-agent:${job.flowAccountId}`,
  };

  const batch = firestore.batch();
  batch.set(assetRef, asset);
  batch.update(firestore.collection('flowJobs').doc(job.id), {
    status: 'succeeded', stage: 'completed', assetId: asset.id, storageType: 'local', relativePath,
    ...(job.executionMode === 'playwright_fallback'
      ? { executionEngine: 'playwright_fallback' as const }
      : {}),
    completedAt: now, updatedAt: now, error: null,
  });
  batch.update(firestore.collection('scenes').doc(job.sceneId), {
    status: 'used', flowStatus: 'succeeded', lastFlowAssetId: asset.id, updatedAt: now,
  });
  await batch.commit();
  await unlink(temporaryPath);
  return asset;
}
