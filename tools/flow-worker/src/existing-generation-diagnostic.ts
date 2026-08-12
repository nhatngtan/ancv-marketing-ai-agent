import type { FlowAccountRecord, FlowJobRecord } from '@ancv/shared';
import { connectAccountContext } from './browser.js';
import { firestore } from './firebase.js';
import { flowConfig } from './config.js';
import { flowProjectBaseUrl } from './flow-ui.js';

export async function diagnoseExistingGeneration(accountId: string, jobId?: string): Promise<void> {
  const account = (await firestore.collection('flowAccounts').doc(accountId).get()).data() as FlowAccountRecord | undefined;
  const job = jobId ? (await firestore.collection('flowJobs').doc(jobId).get()).data() as FlowJobRecord | undefined : undefined;
  if (!account?.projectUrl) throw new Error('FLOW_PROJECT_URL_REQUIRED');
  const session = await connectAccountContext(accountId);
  try {
    await session.page.goto(account.projectUrl || flowConfig.flowUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    await session.page.waitForTimeout(3_000);
    const images = session.page.locator('img[alt*="video" i]');
    const videos = session.page.locator('video');
    const editLinks = session.page.locator('a[href*="/edit/"]');
    const outputs: Array<Record<string, unknown>> = [];
    let visibleImages = 0;
    for (let index = 0; index < Math.min(await images.count(), 60); index += 1) {
      const image = images.nth(index);
      const isVisible = await image.isVisible().catch(() => false);
      if (isVisible) visibleImages += 1;
      const link = image.locator('xpath=ancestor::a[@href][1]');
      const source = await image.getAttribute('src');
      const href = await link.getAttribute('href').catch(() => null);
      outputs.push({
        index, visible: isVisible, alt: await image.getAttribute('alt'),
        sourcePath: source ? new URL(source, session.page.url()).pathname : null,
        hrefPath: href ? new URL(href, session.page.url()).pathname : null,
      });
    }
    const statusPattern = /generat|processing|render|queued|failed|error|đang tạo|đang xử lý|thất bại|lỗi|hoàn tất|complete/i;
    const statusTexts = (await session.page.locator('[role="status"],[aria-live],button,p,span').allInnerTexts())
      .map((value) => value.replace(/\s+/g, ' ').trim())
      .filter((value) => value && value.length <= 240 && statusPattern.test(value));
    let visibleVideos = 0;
    const videoEvidence: Array<Record<string, unknown>> = [];
    for (let index = 0; index < await videos.count(); index += 1) {
      const video = videos.nth(index);
      const isVisible = await video.isVisible().catch(() => false);
      if (isVisible) visibleVideos += 1;
      const source = await video.getAttribute('src');
      videoEvidence.push({
        index, visible: isVisible,
        sourceKind: source?.startsWith('blob:') ? 'blob' : source ? 'url' : 'none',
        sourcePath: source && !source.startsWith('blob:') ? new URL(source, session.page.url()).pathname : null,
      });
    }
    const normalize = (value: string) => value.replace(/\s+/g, ' ').trim().toLowerCase();
    const bodyText = normalize(await session.page.locator('body').innerText().catch(() => ''));
    const prompt = normalize(job?.prompt ?? '');
    const textboxes = session.page.locator('textarea,[contenteditable="true"]');
    const textboxValues: string[] = [];
    for (let index = 0; index < await textboxes.count(); index += 1) {
      const textbox = textboxes.nth(index);
      const value = await textbox.inputValue().catch(() => textbox.innerText().catch(() => ''));
      if (value) textboxValues.push(normalize(value));
    }
    const promptPrefix = prompt.slice(0, 80);
    const diagnostic = {
      url: session.page.url(), title: await session.page.title(), capturedAt: new Date().toISOString(),
      counts: {
        visibleVideoAltImages: visibleImages, totalVideoAltImages: await images.count(),
        visibleVideoElements: visibleVideos, totalVideoElements: await videos.count(), editLinks: await editLinks.count(),
      },
      statusTexts: [...new Set(statusTexts)].slice(0, 40), outputs,
      editLinkPaths: await editLinks.evaluateAll((links) => links.map((link) => new URL((link as HTMLAnchorElement).href).pathname).slice(0, 40)),
      videoEvidence,
      detailId: session.page.url().match(/\/edit\/([^/?#]+)/)?.[1] ?? null,
      promptExactMatch: Boolean(prompt && (bodyText.includes(prompt) || textboxValues.some((value) => value.includes(prompt)))),
      promptPrefixMatch: Boolean(promptPrefix && (bodyText.includes(promptPrefix) || textboxValues.some((value) => value.includes(promptPrefix)))),
    };
    console.log(JSON.stringify({
      event: 'flow_existing_generation_diagnostic', accountId, jobId: job?.id ?? null,
      expectedProject: flowProjectBaseUrl(account.projectUrl), diagnostic,
    }));
  } finally {
    await session.close();
  }
}
