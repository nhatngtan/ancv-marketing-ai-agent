import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, mkdir, open, stat, unlink } from 'node:fs/promises';
import { dirname, extname } from 'node:path';
import type { FlowJobRecord, MediaAssetRecord } from '@ancv/shared';
import { firestore } from './firebase.js';
import { loadLocalAgentConfig, pathInsideWorkspace } from './config.js';

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
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
    status: 'succeeded', assetId: asset.id, storageType: 'local', relativePath,
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
