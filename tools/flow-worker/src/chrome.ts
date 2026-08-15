import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { readFile, unlink } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { automationProfilesRoot, chromeExecutable, dataRoot, ensureLocalDirectories, flowConfig, loadLocalAgentConfig, type LocalProfileMapping } from './config.js';

function pathInside(root: string, target: string): boolean {
  const resolvedRoot = resolve(root);
  const resolvedTarget = resolve(target);
  return resolvedTarget === resolvedRoot || resolvedTarget.startsWith(`${resolvedRoot}${sep}`);
}

export function assertManagedFlowProfile(mapping: LocalProfileMapping, expectedProfileId?: string): LocalProfileMapping {
  if (mapping.kind !== 'managed') throw new Error('FLOW_SYSTEM_PROFILE_NOT_ALLOWED');
  if (expectedProfileId && mapping.logicalId !== expectedProfileId) {
    throw new Error(`FLOW_PROFILE_MAPPING_MISMATCH expected=${expectedProfileId} actual=${mapping.logicalId}`);
  }
  if (!pathInside(automationProfilesRoot(), mapping.userDataDir) && !pathInside(dataRoot(), mapping.userDataDir)) {
    throw new Error('FLOW_MANAGED_PROFILE_OUTSIDE_ANCV_ROOT');
  }
  return mapping;
}

export function resolveManagedFlowProfile(accountId: string, expectedProfileId?: string): LocalProfileMapping {
  const configured = loadLocalAgentConfig().profiles.find((profile) => profile.logicalId === accountId);
  if (!configured) throw new Error(`LOCAL_PROFILE_MAPPING_NOT_FOUND:${accountId}`);
  return assertManagedFlowProfile(configured, expectedProfileId);
}

export function chromeLoginArgs(accountId: string): string[] {
  const profile = resolveManagedFlowProfile(accountId);
  return [
    `--user-data-dir=${profile.userDataDir}`,
    ...(profile.profileDirectory ? [`--profile-directory=${profile.profileDirectory}`] : []),
    '--no-first-run',
    '--no-default-browser-check',
    '--new-window',
    flowConfig.flowUrl,
  ];
}

export function chromeAutomationArgs(accountId: string, expectedProfileId?: string): string[] {
  const profile = resolveManagedFlowProfile(accountId, expectedProfileId);
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
  const profile = resolveManagedFlowProfile(accountId);
  ensureLocalDirectories();
  mkdirSync(profile.userDataDir, { recursive: true });
  const child = spawn(chromeExecutable(), chromeLoginArgs(accountId), {
    detached: true,
    stdio: 'ignore',
    windowsHide: false,
  });
  child.unref();
}

function devToolsActivePortPath(accountId: string, expectedProfileId?: string): string {
  return join(resolveManagedFlowProfile(accountId, expectedProfileId).userDataDir, 'DevToolsActivePort');
}

export async function startDebugChrome(accountId: string, expectedProfileId?: string): Promise<{ process: ChildProcess; port: number }> {
  const profile = resolveManagedFlowProfile(accountId, expectedProfileId);
  ensureLocalDirectories();
  mkdirSync(profile.userDataDir, { recursive: true });
  const portFile = devToolsActivePortPath(accountId, expectedProfileId);
  await unlink(portFile).catch(() => undefined);
  const chromeProcess = spawn(chromeExecutable(), chromeAutomationArgs(accountId, expectedProfileId), {
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
