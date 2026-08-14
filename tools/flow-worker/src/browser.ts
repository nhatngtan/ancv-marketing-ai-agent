import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import { startDebugChrome } from './chrome.js';

export interface AccountBrowserSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  close: () => Promise<void>;
}

export async function connectAccountContext(accountId: string, expectedProfileDirectory?: string): Promise<AccountBrowserSession> {
  const launched = await startDebugChrome(accountId, expectedProfileDirectory);
  let browser: Browser;
  try {
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${launched.port}`, { timeout: 15_000 });
  } catch (error) {
    launched.process.kill();
    throw error;
  }
  const context = browser.contexts()[0];
  if (!context) {
    await browser.close().catch(() => undefined);
    launched.process.kill();
    throw new Error('FLOW_CDP_CONTEXT_NOT_FOUND');
  }
  const pages = context.pages();
  const page = [...pages].reverse().find((candidate) => candidate.url().includes('labs.google/fx'))
    ?? pages[pages.length - 1]
    ?? await context.newPage();
  return {
    browser,
    context,
    page,
    close: async () => {
      await browser.close().catch(() => undefined);
      if (launched.process.exitCode === null) launched.process.kill();
    },
  };
}
