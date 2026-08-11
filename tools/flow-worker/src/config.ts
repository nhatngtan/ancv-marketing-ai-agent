import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve, sep } from 'node:path';

const accountPattern = /^[a-z0-9][a-z0-9-]{1,48}$/;

export function validateAccountId(accountId: string): string {
  if (!accountPattern.test(accountId)) throw new Error('FLOW_ACCOUNT_ID_INVALID');
  return accountId;
}

export function dataRoot(): string {
  const localAppData = process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local');
  return resolve(process.env.FLOW_WORKER_DATA || join(localAppData, 'ANCV', 'flow-worker-data'));
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
