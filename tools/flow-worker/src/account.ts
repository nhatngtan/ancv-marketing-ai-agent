import type { FlowAccountRecord, FlowAccountStatus } from '@ancv/shared';
import { connectAccountContext } from './browser.js';
import { openLoginChrome, resolveManagedFlowProfile } from './chrome.js';
import { flowConfig, pathInsideDataRoot, validateAccountId } from './config.js';
import { firestore } from './firebase.js';
import { describeVisibleControls, findFlowApprovalControl, flowProjectBaseUrl, isSingleOutputSelected, openExistingFlowProject, openModelMenuForDiagnostics, waitForFlowUi } from './flow-ui.js';
import { verifyGoogleAccount } from './google-account.js';

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
    expectedAccount: changes.expectedAccount ?? existing?.expectedAccount ?? existing?.email ?? '',
    verifiedAccount: changes.verifiedAccount ?? existing?.verifiedAccount ?? '',
    verifiedAt: changes.verifiedAt ?? existing?.verifiedAt ?? '',
    projectUrl: changes.projectUrl ?? existing?.projectUrl ?? '',
    profileKind: changes.profileKind ?? existing?.profileKind,
    managedProfileId: changes.managedProfileId ?? existing?.managedProfileId,
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
  const mapping = resolveManagedFlowProfile(accountId, accountId);
  await saveAccount(accountId, 'needs_login', {
    profileKind: 'managed',
    managedProfileId: mapping.logicalId,
    ...(mapping.expectedAccount ? { email: mapping.expectedAccount, expectedAccount: mapping.expectedAccount } : {}),
    limitation: 'Đang chờ đăng nhập thủ công bằng Google Chrome thật.',
  });
  openLoginChrome(accountId);
  console.log(`FLOW_LOGIN_CHROME_OPEN account=${accountId}`);
  console.log('Tự đăng nhập/2FA, mở một Flow Project, sau đó đóng toàn bộ cửa sổ Chrome của profile này. Không bấm Generate.');
}

export async function preflightAccount(accountIdRaw: string): Promise<void> {
  const accountId = validateAccountId(accountIdRaw);
  const account = (await firestore.collection('flowAccounts').doc(accountId).get()).data() as FlowAccountRecord | undefined;
  const mapping = resolveManagedFlowProfile(accountId, account?.managedProfileId ?? accountId);
  const expectedAccount = mapping.expectedAccount ?? account?.email ?? '';
  const session = await connectAccountContext(accountId, mapping.logicalId);
  const { page } = session;
  try {
    let verification: Awaited<ReturnType<typeof verifyGoogleAccount>> | null = null;
    let verificationError = '';
    try { verification = await verifyGoogleAccount(session.context, expectedAccount); }
    catch (error) { verificationError = error instanceof Error ? error.message : 'FLOW_ACCOUNT_VERIFICATION_FAILED'; }
    const restoredUrl = page.url();
    const restoredProjectUrl = flowProjectBaseUrl(restoredUrl);
    const targetUrl = flowProjectBaseUrl(account?.projectUrl ?? '') || restoredProjectUrl || flowConfig.flowUrl;
    await openExistingFlowProject(page, targetUrl, flowConfig.flowUrl);
    let inspection = await waitForFlowUi(page);
    if (verificationError) {
      const limitation = verificationError;
      inspection = {
        ...inspection,
        session: limitation === 'FLOW_ACCOUNT_NOT_DETECTED' ? 'needs_login' : 'unavailable',
        limitation,
      };
    }
    const expectedProject = flowProjectBaseUrl(account?.projectUrl ?? '');
    const actualProject = flowProjectBaseUrl(inspection.url);
    if (expectedProject && actualProject !== expectedProject) {
      inspection = { ...inspection, session: 'unavailable', limitation: 'FLOW_PROJECT_MISMATCH' };
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
      profileKind: 'managed',
      managedProfileId: mapping.logicalId,
      limitation: inspection.limitation,
      email: expectedAccount,
      expectedAccount,
      ...(verification ? { verifiedAccount: verification.verifiedAccount, verifiedAt: verification.verifiedAt } : {}),
    });
    console.log(JSON.stringify({
      accountId,
      transport: 'real_chrome_cdp_localhost',
      profileKind: mapping.kind,
      managedProfileId: mapping.logicalId,
      session: inspection.session,
      url: inspection.url,
      prompt: inspection.prompt?.key ?? null,
      video: inspection.video?.key ?? null,
      generate: inspection.generate?.key ?? null,
      approvalUi: (await findFlowApprovalControl(page))?.key ?? 'not_visible_before_generate',
      approvalSupported: false,
      outputCount: await isSingleOutputSelected(page) ? 1 : null,
      expectedAccount,
      verifiedAccount: verification?.verifiedAccount ?? null,
      verifiedAt: verification?.verifiedAt ?? null,
      limitation: inspection.limitation ?? null,
    }));
    if (inspection.session !== 'ready') process.exitCode = 2;
  } finally {
    await session.close();
  }
}
