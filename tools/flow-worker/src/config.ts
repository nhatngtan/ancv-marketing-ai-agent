import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { randomBytes } from 'node:crypto';

const accountPattern = /^[a-z0-9][a-z0-9-]{1,48}$/;

export function validateAccountId(accountId: string): string {
  if (!accountPattern.test(accountId)) throw new Error('FLOW_ACCOUNT_ID_INVALID');
  return accountId;
}

export function dataRoot(): string {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return resolve(process.env.FLOW_WORKER_DATA || join(localAppData, 'ANCV', 'flow-worker-data'));
}

export interface LocalProfileMapping {
  logicalId: string;
  kind: 'managed' | 'system';
  userDataDir: string;
  profileDirectory?: string;
  expectedAccount?: string;
}

export interface LocalAgentConfig {
  agentId: string;
  machineName: string;
  workspaceRoot: string;
  bridgeHost: '127.0.0.1';
  bridgePort: number;
  bridgeToken: string;
  profiles: LocalProfileMapping[];
}

export function localAgentConfigPath(): string {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return resolve(localAppData, 'ANCV', 'local-agent', 'config.json');
}

export function loadLocalAgentConfig(): LocalAgentConfig {
  const configPath = localAgentConfigPath();
  if (!existsSync(configPath)) throw new Error(`LOCAL_AGENT_CONFIG_NOT_FOUND:${configPath}`);
  const parsed = JSON.parse(readFileSync(configPath, 'utf8')) as Partial<LocalAgentConfig>;
  const workspaceRoot = resolve(String(parsed.workspaceRoot ?? ''));
  const port = Number(parsed.bridgePort ?? 32187);
  if (!workspaceRoot || !Number.isInteger(port) || port < 1_024 || port > 65_535) throw new Error('LOCAL_AGENT_CONFIG_INVALID');
  if (parsed.bridgeHost !== '127.0.0.1') throw new Error('LOCAL_AGENT_BRIDGE_MUST_BIND_LOOPBACK');
  if (!parsed.bridgeToken || String(parsed.bridgeToken).length < 32) throw new Error('LOCAL_AGENT_BRIDGE_TOKEN_INVALID');
  return {
    agentId: validateAccountId(String(parsed.agentId ?? 'ancv-windows-01')),
    machineName: String(parsed.machineName ?? hostname()),
    workspaceRoot,
    bridgeHost: '127.0.0.1',
    bridgePort: port,
    bridgeToken: String(parsed.bridgeToken),
    profiles: Array.isArray(parsed.profiles) ? parsed.profiles.map((profile) => ({
      logicalId: validateAccountId(profile.logicalId),
      kind: profile.kind === 'system' ? 'system' : 'managed',
      userDataDir: resolve(profile.userDataDir),
      profileDirectory: profile.profileDirectory ? String(profile.profileDirectory) : undefined,
      expectedAccount: profile.expectedAccount ? String(profile.expectedAccount).toLowerCase() : undefined,
    })) : [],
  };
}

export function pathInsideWorkspace(config: LocalAgentConfig, relativePath: string): string {
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) throw new Error('LOCAL_PATH_INVALID');
  const root = resolve(config.workspaceRoot);
  const target = resolve(root, ...normalized.split('/'));
  if (!target.startsWith(`${root}${sep}`)) throw new Error('LOCAL_PATH_OUTSIDE_WORKSPACE');
  return target;
}

export function createBridgeToken(): string {
  return randomBytes(32).toString('hex');
}

export function pathInsideDataRoot(...parts: string[]): string {
  const root = dataRoot();
  const target = resolve(root, ...parts);
  if (target !== root && !target.startsWith(`${root}${sep}`)) throw new Error('FLOW_PATH_OUTSIDE_DATA_ROOT');
  return target;
}

export function accountProfilePath(accountId: string): string {
  return pathInsideDataRoot(validateAccountId(accountId));
}

export function ensureLocalDirectories(accountId?: string): void {
  const directories = [dataRoot(), pathInsideDataRoot('downloads'), pathInsideDataRoot('errors')];
  if (accountId) directories.push(accountProfilePath(accountId));
  directories.forEach((directory) => mkdirSync(directory, { recursive: true }));
}

export function chromeExecutable(): string {
  const candidates = [
    process.env.FLOW_CHROME_PATH,
    process.env.PROGRAMFILES && join(process.env.PROGRAMFILES, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env['PROGRAMFILES(X86)'] && join(process.env['PROGRAMFILES(X86)'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
    process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].filter((value): value is string => Boolean(value));
  const executable = candidates.find((candidate) => existsSync(candidate));
  if (!executable) throw new Error('FLOW_CHROME_NOT_FOUND');
  return executable;
}

export const flowConfig = {
  projectId: process.env.FLOW_FIREBASE_PROJECT || 'ancv-marketing-ai-agent',
  storageBucket: process.env.FLOW_STORAGE_BUCKET || 'ancv-marketing-ai-agent.firebasestorage.app',
  flowUrl: process.env.FLOW_URL || 'https://labs.google/fx/tools/flow',
  pollIntervalMs: Number(process.env.FLOW_POLL_INTERVAL_MS || 5_000),
  loginTimeoutMs: Number(process.env.FLOW_LOGIN_TIMEOUT_MS || 15 * 60_000),
  cdpStartupTimeoutMs: Number(process.env.FLOW_CDP_STARTUP_TIMEOUT_MS || 30_000),
  generationTimeoutMs: Number(process.env.FLOW_GENERATION_TIMEOUT_MS || 15 * 60_000),
};
