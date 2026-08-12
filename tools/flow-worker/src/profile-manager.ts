import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { LocalAgentConfig, LocalProfileMapping } from './config.js';
import { chromeExecutable } from './config.js';
import type { BridgeServer } from './bridge-server.js';

const extensionPath = fileURLToPath(new URL('../extension', import.meta.url));

export class ChromeProfileManager {
  private current: { mapping: LocalProfileMapping; process: ChildProcess } | null = null;

  constructor(private readonly config: LocalAgentConfig, private readonly bridge: BridgeServer) {}

  mapping(logicalId: string): LocalProfileMapping {
    const mapping = this.config.profiles.find((profile) => profile.logicalId === logicalId);
    if (!mapping) throw new Error(`LOCAL_PROFILE_MAPPING_NOT_FOUND:${logicalId}`);
    return mapping;
  }

  async open(logicalId: string, url: string): Promise<LocalProfileMapping> {
    const mapping = this.mapping(logicalId);
    if (this.current?.mapping.logicalId !== logicalId || this.current.process.exitCode !== null) {
      await this.close();
      const setupUrl = this.bridge.setupUrl(logicalId, url);
      const args = [
        `--user-data-dir=${mapping.userDataDir}`,
        ...(mapping.profileDirectory ? [`--profile-directory=${mapping.profileDirectory}`] : []),
        `--load-extension=${extensionPath}`,
        '--no-first-run',
        '--no-default-browser-check',
        '--new-window',
        setupUrl,
      ];
      const process = spawn(chromeExecutable(), args, { stdio: 'ignore', windowsHide: false });
      this.current = { mapping, process };
    }
    await this.bridge.waitForConnection(logicalId, 45_000);
    await this.bridge.sendCommand(logicalId, 'open_url', { url }, 30_000);
    return mapping;
  }

  async close(): Promise<void> {
    if (!this.current) return;
    if (this.current.process.exitCode === null) this.current.process.kill();
    this.current = null;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  currentProfileId(): string | null { return this.current?.mapping.logicalId ?? null; }
}
