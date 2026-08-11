import { loginAccount, preflightAccount } from './account.js';
import { runWorker } from './worker.js';

const [command, accountId] = process.argv.slice(2);

if (command === 'login') {
  if (!accountId) throw new Error('Usage: npm run flow:login -- account-01');
  await loginAccount(accountId);
} else if (command === 'preflight') {
  if (!accountId) throw new Error('Usage: npm run flow:preflight -- account-01');
  await preflightAccount(accountId);
} else if (command === 'worker') {
  await runWorker();
} else {
  throw new Error('FLOW_COMMAND_REQUIRED: login | preflight | worker');
}
