import { spawn, type ChildProcess } from 'node:child_process';
import { readFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { accountProfilePath, chromeExecutable, ensureLocalDirectories, flowConfig, loadLocalAgentConfig, type LocalProfileMapping } from './config.js';

function automationProfile(accountId: string, expectedProfileDirectory?: string): LocalProfileMapping {
  if (!expectedProfileDirectory) return { logicalId: accountId, kind: 'managed', userDataDir: accountProfilePath(accountId) };
  const configured = loadLocalAgentConfig().profiles.find((profile) => profile.logicalId === accountId);
  const mapping = configured ?? { logicalId: accountId, kind: 'managed' as const, userDataDir: accountProfilePath(accountId) };
  if (expectedProfileDirectory && mapping.profileDirectory !== expectedProfileDirectory) {
    throw new Error(`FLOW_PROFILE_MAPPING_MISMATCH expected=${expectedProfileDirectory} actual=${mapping.profileDirectory ?? 'managed'}`);
  }
  return mapping;
}

export function chromeLoginArgs(accountId: string): string[] {
  return [
    `--user-data-dir=${accountProfilePath(accountId)}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    flowConfig.flowUrl,
  ];
}

export function chromeAutomationArgs(accountId: string, expectedProfileDirectory?: string): string[] {
  const profile = automationProfile(accountId, expectedProfileDirectory);
  return [
    `--user-data-dir=${profile.userDataDir}`,
    ...(profile.profileDirectory ? [`--profile-directory=${profile.profileDirectory}`] : []),
    '--remote-debugging-address=127.0.0.1',
    '--remote-debugging-port=0',
    '--no-first-run',
    '--no-default-browser-check',
    '--restore-last-session',
  ];
}

export function openLoginChrome(accountId: string): void {
  ensureLocalDirectories(accountId);
  const child = spawn(chromeExecutable(), chromeLoginArgs(accountId), {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

function devToolsActivePortPath(accountId: string, expectedProfileDirectory?: string): string {
  return join(automationProfile(accountId, expectedProfileDirectory).userDataDir, 'DevToolsActivePort');
}

export async function startDebugChrome(accountId: string, expectedProfileDirectory?: string): Promise<{ process: ChildProcess; port: number }> {
  const profile = automationProfile(accountId, expectedProfileDirectory);
  if (profile.kind === 'managed') ensureLocalDirectories(accountId);
  const portFile = devToolsActivePortPath(accountId, expectedProfileDirectory);
  await unlink(portFile).catch(() => undefined);
  const chromeProcess = spawn(chromeExecutable(), chromeAutomationArgs(accountId, expectedProfileDirectory), {
    stdio: 'ignore',
    windowsHide: false,
  });
  const deadline = Date.now() + flowConfig.cdpStartupTimeoutMs;
  while (Date.now() < deadline) {
    if (chromeProcess.exitCode !== null) throw new Error('FLOW_CHROME_PROFILE_IN_USE_OR_START_FAILED');
    const contents = await readFile(portFile, 'utf8').catch(() => '');
    const port = Number(contents.split(/\r?\n/, 1)[0]);
    if (Number.isInteger(port) && port > 0 && port <= 65_535) return { process: chromeProcess, port };
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  chromeProcess.kill();
  throw new Error('FLOW_CDP_START_TIMEOUT_CLOSE_LOGIN_CHROME');
}
