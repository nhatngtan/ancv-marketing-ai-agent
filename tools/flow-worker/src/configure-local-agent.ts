import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { accountProfilePath, createBridgeToken, localAgentConfigPath } from './config.js';

export function configureLocalAgent(workspaceRoot = process.env.ANCV_LOCAL_WORKSPACE || 'D:\\ANCV Marketing'): string {
  const root = resolve(workspaceRoot);
  const configPath = localAgentConfigPath();
  const previous = existsSync(configPath) ? JSON.parse(readFileSync(configPath, 'utf8')) as { profiles?: Array<{ logicalId?: string; expectedAccount?: string }> } : {};
  const expectedAccount = process.env.ANCV_FLOW_ACCOUNT_EMAIL
    || previous.profiles?.find((profile) => profile.logicalId === 'account-01')?.expectedAccount;
  mkdirSync(join(root, 'Projects'), { recursive: true });
  mkdirSync(dirname(configPath), { recursive: true });
  const config = {
    agentId: 'ancv-windows-01', machineName: hostname(), workspaceRoot: root,
    bridgeHost: '127.0.0.1', bridgePort: 32187, bridgeToken: createBridgeToken(),
    profiles: [{ logicalId: 'account-01', kind: 'managed', userDataDir: accountProfilePath('account-01'), ...(expectedAccount ? { expectedAccount } : {}) }],
  };
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  return configPath;
}
