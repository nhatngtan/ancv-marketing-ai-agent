import { loginAccount, preflightAccount } from './account.js';
import { runWorker } from './worker.js';
import { preflightLocalAgent, runLocalAgent } from './local-agent.js';
import { configureLocalAgent } from './configure-local-agent.js';

const [command, accountId] = process.argv.slice(2);

if (command === 'login') {
  if (!accountId) throw new Error('Usage: npm run flow:login -- account-01');
  await loginAccount(accountId);
} else if (command === 'preflight') {
  if (!accountId) throw new Error('Usage: npm run flow:preflight -- account-01');
  await preflightAccount(accountId);
} else if (command === 'worker') {
  await runWorker();
} else if (command === 'local-configure') {
  console.log(JSON.stringify({ event: 'local_agent_configured', configPath: configureLocalAgent() }));
} else if (command === 'local-agent') {
  await runLocalAgent();
} else if (command === 'local-preflight') {
  if (!accountId) throw new Error('Usage: npm run local:preflight -- account-01');
  await preflightLocalAgent(accountId);
} else {
  throw new Error('FLOW_COMMAND_REQUIRED: login | preflight | worker | local-configure | local-agent | local-preflight');
}
