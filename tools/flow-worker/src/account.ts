import type { FlowAccountRecord, FlowAccountStatus } from '@ancv/shared';
import { connectAccountContext } from './browser.js';
import { openLoginChrome } from './chrome.js';
import { flowConfig, pathInsideDataRoot, validateAccountId } from './config.js';
import { firestore } from './firebase.js';
import { describeVisibleControls, detectGoogleAccountEmail, flowProjectBaseUrl, isSingleOutputSelected, openExistingFlowProject, openModelMenuForDiagnostics, waitForFlowUi } from './flow-ui.js';

async function saveAccount(
  accountId: string,
  status: FlowAccountStatus,
  changes: Partial<FlowAccountRecord> = {},
): Promise<void> {
  const ref = firestore.collection('flowAccounts').doc(accountId);
  const existing = (await ref.get()).data() as FlowAccountRecord | undefined;
  const now = new Date().toISOString();
  await ref.set({
    id: accountId,
    label: existing?.label ?? changes.label ?? `Flow ${accountId.replace(/^account-/, '').padStart(2, '0')}`,
    email: changes.email ?? existing?.email ?? '',
    projectUrl: changes.projectUrl ?? existing?.projectUrl ?? '',
    status,
    limitation: changes.limitation ?? null,
    lastCheckedAt: now,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    createdBy: existing?.createdBy ?? 'flow-worker-local',
  }, { merge: true });
}

export async function loginAccount(accountIdRaw: string): Promise<void> {
  const accountId = validateAccountId(accountIdRaw);
  await saveAccount(accountId, 'needs_login', {
    limitation: 'Đang chờ đăng nhập thủ công bằng Google Chrome thật.',
  });
  openLoginChrome(accountId);
  console.log(`FLOW_LOGIN_CHROME_OPEN account=${accountId}`);
  console.log('Tự đăng nhập/2FA, mở một Flow Project, sau đó đóng toàn bộ cửa sổ Chrome của profile này. Không bấm Generate.');
}

export async function preflightAccount(accountIdRaw: string): Promise<void> {
  const accountId = validateAccountId(accountIdRaw);
  const account = (await firestore.collection('flowAccounts').doc(accountId).get()).data() as FlowAccountRecord | undefined;
  const session = await connectAccountContext(accountId);
  const { page } = session;
  try {
    const restoredUrl = page.url();
    const restoredProjectUrl = flowProjectBaseUrl(restoredUrl);
    const targetUrl = flowProjectBaseUrl(account?.projectUrl ?? '') || restoredProjectUrl || flowConfig.flowUrl;
    await openExistingFlowProject(page, targetUrl, flowConfig.flowUrl);
    let inspection = await waitForFlowUi(page);
    const detectedEmail = await detectGoogleAccountEmail(page);
    if (account?.email && detectedEmail && account.email.toLowerCase() !== detectedEmail) {
      inspection = { ...inspection, session: 'unavailable', limitation: `FLOW_ACCOUNT_MISMATCH expected=${account.email} actual=${detectedEmail}` };
    }
    if (inspection.session !== 'ready') {
      if (inspection.prompt && !inspection.video) await openModelMenuForDiagnostics(page);
      const screenshotPath = pathInsideDataRoot('errors', `preflight-${accountId}-${Date.now()}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: false }).catch(() => undefined);
      console.log(JSON.stringify({
        event: 'flow_preflight_controls',
        accountId,
        screenshotPath,
        controls: await describeVisibleControls(page),
      }));
    }
    await saveAccount(accountId, inspection.session, {
      projectUrl: flowProjectBaseUrl(inspection.url) || flowProjectBaseUrl(account?.projectUrl ?? ''),
      limitation: inspection.limitation,
      email: detectedEmail ?? account?.email,
    });
    console.log(JSON.stringify({
      accountId,
      transport: 'real_chrome_cdp_localhost',
      session: inspection.session,
      url: inspection.url,
      prompt: inspection.prompt?.key ?? null,
      video: inspection.video?.key ?? null,
      generate: inspection.generate?.key ?? null,
      outputCount: await isSingleOutputSelected(page) ? 1 : null,
      email: detectedEmail,
      limitation: inspection.limitation ?? null,
    }));
    if (inspection.session !== 'ready') process.exitCode = 2;
  } finally {
    await session.close();
  }
}
