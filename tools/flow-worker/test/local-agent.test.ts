import { describe, expect, it } from 'vitest';
import type { FlowJobRecord } from '@ancv/shared';
import { localVideoRelativePath } from '../src/local-storage.js';
import { pathInsideWorkspace, type LocalAgentConfig } from '../src/config.js';
import { findNewFlowOutputIds } from '../src/flow-ui.js';
import { findNewCompletedDownloads, flowJobTempRelativePath } from '../src/worker.js';

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
});
