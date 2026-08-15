import type { BrowserContext } from 'playwright-core';

const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig;

export function extractGoogleAccountEmails(labels: string[]): string[] {
  return [...new Set(labels.flatMap((label) => label.match(emailPattern) ?? []).map((email) => email.toLowerCase()))];
}

export async function verifyGoogleAccount(
  context: BrowserContext,
  expectedAccount: string,
): Promise<{ expectedAccount: string; verifiedAccount: string; verifiedAt: string }> {
  const expected = expectedAccount.trim().toLowerCase();
  if (!expected) throw new Error('FLOW_EXPECTED_ACCOUNT_REQUIRED');
  const page = await context.newPage();
  try {
    await page.goto('https://myaccount.google.com/', { waitUntil: 'domcontentloaded', timeout: 30_000 });
    const accountControl = page.locator('[aria-label^="Google Account:"], [aria-label^="Tài khoản Google:"]');
    await accountControl.first().waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined);
    const labels = await accountControl.evaluateAll((elements) => elements.map((element) => element.getAttribute('aria-label') ?? ''));
    const emails = extractGoogleAccountEmails(labels);
    if (emails.length === 0) throw new Error('FLOW_ACCOUNT_NOT_DETECTED');
    if (emails.length > 1) throw new Error(`FLOW_ACCOUNT_AMBIGUOUS:${emails.length}`);
    const verifiedAccount = emails[0]!;
    if (verifiedAccount !== expected) throw new Error(`FLOW_ACCOUNT_MISMATCH expected=${expected} actual=${verifiedAccount}`);
    return { expectedAccount: expected, verifiedAccount, verifiedAt: new Date().toISOString() };
  } finally {
    await page.close().catch(() => undefined);
  }
}
