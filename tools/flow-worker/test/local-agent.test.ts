import { describe, expect, it } from 'vitest';
import type { FlowAccountRecord, FlowJobRecord } from '@ancv/shared';
import { assertLocalFinalRelativePath, buildLocalFinalAsset, LocalFinalStabilityRegistry, LocalFinalStabilityTracker, localFinalFolderRelativePath, localVideoRelativePath } from '../src/local-storage.js';
import { pathInsideWorkspace, type LocalAgentConfig } from '../src/config.js';
import { findNewFlowOutputIds } from '../src/flow-ui.js';
import { downloadReadinessFailure, findNewCompletedDownloads, flowJobTempRelativePath, runDownloadReadinessStateMachine } from '../src/worker.js';
import { parseChromeProfiles } from '../src/chrome-profile-scanner.js';
import { runAgentIteration } from '../src/local-agent.js';
import { assertFlowRuntimeSnapshot } from '../src/flow-runtime.js';
import { extractGoogleAccountEmails } from '../src/google-account.js';

const config: LocalAgentConfig = {
  agentId: 'ancv-windows-01', machineName: 'TEST', workspaceRoot: 'D:\\ANCV Marketing',
  bridgeHost: '127.0.0.1', bridgePort: 32187, bridgeToken: 'a'.repeat(64), profiles: [],
};

describe('local-first paths', () => {
  it('creates deterministic ANCV scene/take names', () => {
    const job = { contentId: 'ANCV-VID-2026-004', sceneNumber: 2 } as FlowJobRecord;
    expect(localVideoRelativePath(job, 3)).toBe('Projects/ANCV-VID-2026-004/Video Raw/Scene-02/ANCV-VID-2026-004_S02_T03.mp4');
  });

  it('rejects traversal outside the workspace', () => {
    expect(() => pathInsideWorkspace(config, '../secret.txt')).toThrow('LOCAL_PATH_INVALID');
  });

  it('registers Final as relative local metadata without a Storage object', () => {
    const relativePath = `${localFinalFolderRelativePath('ANCV-VID-2026-004')}/final.mp4`;
    expect(assertLocalFinalRelativePath('ANCV-VID-2026-004', relativePath)).toBe(relativePath);
    const asset = buildLocalFinalAsset({
      contentDocId: 'content-1', contentId: 'ANCV-VID-2026-004', createdBy: 'local-agent', now: '2026-08-15T00:00:00.000Z',
      candidate: { relativePath, fileName: 'final.mp4', sizeBytes: 2048, contentType: 'video/mp4', checksumSha256: 'a'.repeat(64) },
    });
    expect(asset).toMatchObject({ storageType: 'local', relativePath, source: 'manual_local', selected: true });
    expect(asset.storagePath).toBeUndefined();
    expect(asset.downloadUrl).toBeUndefined();
    expect(JSON.stringify(asset)).not.toContain('D:\\');
  });

  it('rejects an absolute or nested Final path', () => {
    expect(() => assertLocalFinalRelativePath('ANCV-VID-2026-004', 'D:/Final/final.mp4')).toThrow('LOCAL_FINAL_PATH_INVALID');
    expect(() => assertLocalFinalRelativePath('ANCV-VID-2026-004', 'Projects/ANCV-VID-2026-004/Video Final/sub/final.mp4')).toThrow('LOCAL_FINAL_PATH_INVALID');
  });
});

describe('automatic Video Final stability', () => {
  const first = { relativePath: 'Projects/ANCV-VID-2026-004/Video Final/final.mp4', sizeBytes: 2048, modifiedAtMs: 100 };
  const second = { relativePath: 'Projects/ANCV-VID-2026-004/Video Final/final-v2.mp4', sizeBytes: 4096, modifiedAtMs: 200 };

  it('does not register while a file is still changing and becomes stable only after the wait window', () => {
    const tracker = new LocalFinalStabilityTracker(10_000);
    expect(tracker.observe([first], 0)).toEqual([]);
    expect(tracker.observe([{ ...first, sizeBytes: 3072, modifiedAtMs: 150 }], 8_000)).toEqual([]);
    expect(tracker.observe([{ ...first, sizeBytes: 3072, modifiedAtMs: 150 }], 17_999)).toEqual([]);
    expect(tracker.observe([{ ...first, sizeBytes: 3072, modifiedAtMs: 150 }], 18_000)).toEqual([first.relativePath]);
  });

  it('returns each stable path once per scan so the caller can refuse ambiguous multiple files', () => {
    const tracker = new LocalFinalStabilityTracker(1_000);
    expect(tracker.observe([first, second], 0)).toEqual([]);
    expect(tracker.observe([first, second], 1_000)).toEqual([first.relativePath, second.relativePath].sort());
  });

  it('keeps stability isolated when different Content folders are scanned between polls', () => {
    const registry = new LocalFinalStabilityRegistry(1_000);
    const other = { ...first, relativePath: 'Projects/ANCV-VID-2026-005/Video Final/final.mp4' };
    expect(registry.observe('ANCV-VID-2026-004', [first], 0)).toEqual([]);
    expect(registry.observe('ANCV-VID-2026-005', [other], 0)).toEqual([]);
    expect(registry.observe('ANCV-VID-2026-004', [first], 1_000)).toEqual([first.relativePath]);
    expect(registry.observe('ANCV-VID-2026-005', [other], 1_000)).toEqual([other.relativePath]);
  });

  it('drops a disappeared file and does not treat its replacement as already stable', () => {
    const tracker = new LocalFinalStabilityTracker(1_000);
    tracker.observe([first], 0);
    expect(tracker.observe([], 2_000)).toEqual([]);
    expect(tracker.observe([first], 3_000)).toEqual([]);
  });
});

describe('Flow output detection', () => {
  it('uses stable output IDs instead of lazy thumbnail counts', () => {
    expect(findNewFlowOutputIds(['a', 'b', 'c'], ['a', 'b', 'c'])).toEqual([]);
    expect(findNewFlowOutputIds(['a', 'b', 'c'], ['a', 'b', 'c', 'd'])).toEqual(['d']);
  });

  it('detects a new detail navigation when grid links are virtualized', () => {
    expect(findNewFlowOutputIds(['a', 'b', 'c'], [], 'd')).toEqual(['d']);
    expect(findNewFlowOutputIds(['a', 'b', 'c'], [], 'b')).toEqual([]);
  });
});

describe('Flow download detection', () => {
  it('ignores baseline files and incomplete Chrome downloads', () => {
    expect(findNewCompletedDownloads(
      ['old.mp4'],
      ['old.mp4', 'new.mp4.crdownload', 'new.mp4'],
    )).toEqual(['new.mp4']);
  });

  it('uses a dedicated workspace temp directory per job', () => {
    const job = { id: 'scene-01', contentId: 'ANCV-VID-2026-004', sceneNumber: 2 } as FlowJobRecord;
    expect(flowJobTempRelativePath(job)).toBe('.tmp/flow/scene-01/ANCV-VID-2026-004_S02_T01.mp4');
  });

  it('waits through repeated disabled polls and clicks Download exactly once when enabled', async () => {
    let clock = 0;
    let probes = 0;
    let downloadClicks = 0;
    const states: string[] = [];
    const result = await runDownloadReadinessStateMachine({
      deadlineAt: 10_000,
      pollIntervalMs: 1_000,
      now: () => clock,
      wait: async (milliseconds) => { clock += milliseconds; },
      probe: async () => {
        probes += 1;
        return probes < 4
          ? { state: 'OUTPUT_RENDERING' as const, control: null }
          : { state: 'DOWNLOAD_READY' as const, control: { id: 'download' } };
      },
      onState: async (state) => { states.push(state); },
      download: async () => { downloadClicks += 1; },
    });
    expect(result).toEqual({ status: 'downloaded' });
    expect(downloadClicks).toBe(1);
    expect(states).toEqual(['OUTPUT_DETECTED', 'OUTPUT_RENDERING', 'OUTPUT_READY', 'DOWNLOAD_READY', 'DOWNLOAD']);
  });

  it('times out while Download remains disabled without changing the single Generate click', async () => {
    let clock = 0;
    let downloadClicks = 0;
    const generateClicks = 1;
    const result = await runDownloadReadinessStateMachine({
      deadlineAt: 3_000,
      pollIntervalMs: 1_000,
      now: () => clock,
      wait: async (milliseconds) => { clock += milliseconds; },
      probe: async () => ({ state: 'OUTPUT_RENDERING' as const, control: null }),
      onState: async () => undefined,
      download: async () => { downloadClicks += 1; },
    });
    expect(result).toEqual({ status: 'timeout' });
    expect(downloadReadinessFailure(result)).toEqual({ status: 'needs_manual', error: 'FLOW_OUTPUT_NOT_READY_TIMEOUT' });
    expect(downloadClicks).toBe(0);
    expect(generateClicks).toBe(1);
  });
});

describe('safe Chrome profile scanning', () => {
  it('returns only safe profile metadata and ignores unrelated Local State fields', () => {
    const records = parseChromeProfiles({
      profile: { info_cache: {
        'Profile 42': { name: 'Nhat', gaia_name: 'Nguyen Nhat', user_name: 'NHAT@example.com' },
        'Unsafe/Path': { name: 'ignored', user_name: 'secret@example.com' },
      } },
      password_manager: { token: 'must-not-leak' },
    } as never, '2026-08-12T00:00:00.000Z');
    expect(records).toEqual([{ chromeProfileId: 'Profile 42', profileLabel: 'Nhat', email: 'nhat@example.com', detectedAt: '2026-08-12T00:00:00.000Z' }]);
    expect(JSON.stringify(records)).not.toContain('must-not-leak');
  });
});

describe('Local Agent iteration resilience', () => {
  it('survives a transient pre-generate error and processes the job once on the next iteration', async () => {
    let iteration = 0;
    let processedJobs = 0;
    let errorHeartbeats = 0;
    const work = async () => {
      iteration += 1;
      if (iteration === 1) throw new Error('FIRESTORE_TEMPORARY_UNAVAILABLE');
      processedJobs += 1;
    };
    expect(await runAgentIteration(work, async () => { errorHeartbeats += 1; }, async () => undefined)).toBe(false);
    expect(await runAgentIteration(work, async () => { errorHeartbeats += 1; }, async () => undefined)).toBe(true);
    expect(errorHeartbeats).toBe(1);
    expect(processedJobs).toBe(1);
  });
});

describe('Flow runtime fail-closed checks', () => {
  const account = {
    status: 'ready', profileKind: 'managed', managedProfileId: 'flow-gold',
    email: 'ashimigold@gmail.com', projectUrl: 'https://labs.google/fx/vi/tools/flow/project/project-1',
  } as FlowAccountRecord;
  const job = {
    profileKind: 'managed', managedProfileId: 'flow-gold', expectedAccount: 'ashimigold@gmail.com',
    flowProjectUrl: 'https://labs.google/fx/vi/tools/flow/project/project-1',
  } as FlowJobRecord;
  const mapping = {
    logicalId: 'flow-gold', kind: 'managed' as const,
    userDataDir: 'C:\\Users\\ANCV-MK\\AppData\\Local\\ANCV\\flow-profiles\\gold',
    expectedAccount: 'ashimigold@gmail.com',
  };

  it('rejects a project snapshot mismatch', () => {
    expect(() => assertFlowRuntimeSnapshot({ ...job, flowProjectUrl: 'https://labs.google/fx/vi/tools/flow/project/wrong' }, account, mapping))
      .toThrow('FLOW_PROJECT_MAPPING_MISMATCH');
  });

  it('accepts the matching managed GOLD snapshot', () => {
    expect(() => assertFlowRuntimeSnapshot(job, account, mapping)).not.toThrow();
  });
});

describe('Google Account verification metadata', () => {
  it('extracts only the active account email from the Google Account control', () => {
    expect(extractGoogleAccountEmails([
      'Tài khoản Google: Ashimi GOLD (ashimigold@gmail.com), Cảnh báo quan trọng về tài khoản',
    ])).toEqual(['ashimigold@gmail.com']);
  });
});
