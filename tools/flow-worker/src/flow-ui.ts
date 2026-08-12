import type { Locator, Page } from 'playwright-core';

export interface FlowUiInspection {
  url: string;
  session: 'ready' | 'needs_login' | 'needs_verification' | 'unavailable';
  prompt: LocatedControl | null;
  video: LocatedControl | null;
  generate: LocatedControl | null;
  limitation?: string;
}

export interface LocatedControl { key: string; locator: Locator }

export function flowProjectBaseUrl(value: string): string {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^(\/fx\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?tools\/flow\/project\/[^/]+)/);
    return url.protocol === 'https:' && url.hostname === 'labs.google' && match
      ? `${url.origin}${match[1]}`
      : '';
  } catch {
    return '';
  }
}

export async function detectGoogleAccountEmail(page: Page): Promise<string | null> {
  const accountLinks = page.locator('a[href*="accounts.google.com/AccountChooser"][href*="Email="]');
  for (let index = 0; index < await accountLinks.count(); index += 1) {
    const href = await accountLinks.nth(index).getAttribute('href');
    if (!href) continue;
    const email = new URL(href).searchParams.get('Email')?.trim().toLowerCase();
    if (email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return email;
  }
  return null;
}

export interface VisibleControlSummary {
  tag: string;
  role: string;
  ariaLabel: string;
  placeholder: string;
  title: string;
  text: string;
  href: string;
}

export async function describeVisibleControls(page: Page): Promise<VisibleControlSummary[]> {
  return page.locator('a,button,[role="button"],[role="tab"],textarea,input,[contenteditable="true"]').evaluateAll((elements) => (
    elements.flatMap((element) => {
      const html = element as HTMLElement;
      const bounds = html.getBoundingClientRect();
      const style = window.getComputedStyle(html);
      if (bounds.width <= 0 || bounds.height <= 0 || style.visibility === 'hidden' || style.display === 'none') return [];
      const role = html.getAttribute('role') ?? '';
      const tag = html.tagName.toLowerCase();
      const mayExposeOnlyUiLabel = tag === 'button' || role === 'button' || role === 'tab';
      return [{
        tag,
        role,
        ariaLabel: (html.getAttribute('aria-label') ?? '').slice(0, 120),
        placeholder: (html.getAttribute('placeholder') ?? '').slice(0, 120),
        title: (html.getAttribute('title') ?? '').slice(0, 120),
        text: mayExposeOnlyUiLabel ? (html.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 120) : '',
        href: html instanceof HTMLAnchorElement ? html.href.slice(0, 240) : '',
      }];
    }).slice(0, 100)
  ));
}

async function uniqueVisible(candidates: LocatedControl[]): Promise<LocatedControl | null> {
  for (const candidate of candidates) {
    const count = await candidate.locator.count();
    const visible: Locator[] = [];
    for (let index = 0; index < count; index += 1) {
      const item = candidate.locator.nth(index);
      if (await item.isVisible()) visible.push(item);
    }
    if (visible.length === 1) return { key: candidate.key, locator: visible[0]! };
    if (visible.length > 1) return null;
  }
  return null;
}

export async function openExistingFlowProject(page: Page, preferredUrl: string, flowHomeUrl: string): Promise<void> {
  const targetUrl = preferredUrl || flowHomeUrl;
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  if (/\/project\/[^/]+\/edit\//.test(page.url())) {
    const backToProject = page.locator('button').filter({ hasText: /Quay lại dự án|Back to project/i }).first();
    if (await backToProject.isVisible().catch(() => false)) {
      await backToProject.click({ timeout: 15_000 });
      await page.waitForURL((url) => !url.pathname.includes('/edit/'), { timeout: 30_000 });
    }
  }
  const projectLinks = page.locator('a[href*="/project/"]');
  const editorInput = page.locator('textarea,[contenteditable="true"]').first();
  await Promise.race([
    projectLinks.first().waitFor({ state: 'visible', timeout: 30_000 }),
    editorInput.waitFor({ state: 'visible', timeout: 30_000 }),
  ]).catch(() => undefined);
  await page.waitForTimeout(1_500);
  if (/\/project\/[^/]+\/edit\//.test(page.url())) {
    const backToProject = page.locator('button').filter({ hasText: /Quay lại dự án|Back to project/i }).first();
    if (await backToProject.isVisible().catch(() => false)) {
      await backToProject.click({ timeout: 15_000 });
      await page.waitForURL((url) => !url.pathname.includes('/edit/'), { timeout: 30_000 });
    }
  }
  if (await projectLinks.first().isVisible().catch(() => false)) {
    const projectId = preferredUrl.match(/\/project\/([^/?#]+)/)?.[1];
    const preferredLink = projectId ? page.locator(`a[href*="/project/${projectId}"]`).first() : null;
    const selectedLink = preferredLink && await preferredLink.isVisible().catch(() => false)
      ? preferredLink
      : projectLinks.first();
    await selectedLink.click({ timeout: 15_000 });
    await page.waitForURL((url) => url.pathname.includes('/project/'), { timeout: 30_000 });
  }
}

export async function inspectFlowUi(page: Page): Promise<FlowUiInspection> {
  const url = page.url();
  if (/accounts\.google\.com|signin/i.test(url)) return { url, session: 'needs_login', prompt: null, video: null, generate: null };
  const pageText = (await page.locator('body').innerText().catch(() => '')).slice(0, 20_000);
  if (/captcha|verify (it'?s you|your identity)|xác minh (danh tính|tài khoản)|2-step verification|xác minh 2 bước|unusual activity/i.test(pageText)) {
    return { url, session: 'needs_verification', prompt: null, video: null, generate: null, limitation: 'Google yêu cầu xác minh thủ công.' };
  }
  const prompt = await uniqueVisible([
    { key: 'prompt-aria', locator: page.getByRole('textbox', { name: /prompt|describe|mô tả/i }) },
    { key: 'prompt-placeholder', locator: page.locator('textarea[placeholder*="prompt" i], textarea[placeholder*="describe" i]') },
    { key: 'prompt-contenteditable', locator: page.locator('[contenteditable="true"][role="textbox"]') },
    { key: 'prompt-textarea', locator: page.locator('textarea') },
  ]);
  const video = await uniqueVisible([
    { key: 'video-selected-chip', locator: page.locator('button').filter({ hasText: /^Video\s*·/i }) },
    { key: 'video-model', locator: page.getByRole('button', { name: /Veo/i }) },
    { key: 'video-tab', locator: page.getByRole('tab', { name: /Video$/i }) },
    { key: 'video-button', locator: page.getByRole('button', { name: /^video$/i }) },
    { key: 'video-text-button', locator: page.locator('button').filter({ hasText: /^video$/i }) },
  ]);
  const generate = await uniqueVisible([
    { key: 'generate-arrow-button', locator: page.locator('button').filter({ hasText: /arrow_forward\s*(Tạo|Generate)$/i }) },
    { key: 'generate-button', locator: page.getByRole('button', { name: /^(generate|generate video|tạo|tạo video)$/i }) },
    { key: 'generate-text-button', locator: page.locator('button').filter({ hasText: /^(generate|generate video|tạo|tạo video)$/i }) },
  ]);
  if (!prompt || !video || !generate) {
    return { url, session: 'unavailable', prompt, video, generate, limitation: 'Không xác định chắc chắn prompt/Video/Generate trên UI hiện tại.' };
  }
  return { url, session: 'ready', prompt, video, generate };
}

export async function waitForFlowUi(page: Page, timeoutMs = 30_000): Promise<FlowUiInspection> {
  const deadline = Date.now() + timeoutMs;
  await closeMediaDetailIfOpen(page).catch(() => false);
  let inspection = await inspectFlowUi(page);
  if (inspection.prompt && !inspection.video) {
    await ensureVideoMode(page);
    inspection = await inspectFlowUi(page);
  }
  if (inspection.prompt && inspection.video) {
    if (!await ensureSingleOutput(page)) {
      return { ...inspection, session: 'unavailable', limitation: 'Không xác nhận được cấu hình một output (x1); không cho phép Generate.' };
    }
    await closeMediaDetailIfOpen(page);
    inspection = await inspectFlowUi(page);
  }
  while (inspection.session === 'unavailable' && Date.now() < deadline) {
    await page.waitForTimeout(2_000);
    await closeMediaDetailIfOpen(page).catch(() => false);
    inspection = await inspectFlowUi(page);
  }
  return inspection;
}

export async function closeMediaDetailIfOpen(page: Page): Promise<boolean> {
  await page.waitForTimeout(750);
  if (!/\/project\/[^/]+\/edit\//.test(page.url())) return false;
  const backToProject = page.locator('button').filter({ hasText: /Quay lại dự án|Back to project/i }).first();
  await backToProject.waitFor({ state: 'visible', timeout: 10_000 });
  await backToProject.click({ timeout: 15_000 });
  await page.waitForURL((url) => !url.pathname.includes('/edit/'), { timeout: 30_000 });
  return true;
}

export async function openGenerationModeMenu(page: Page): Promise<boolean> {
  const mode = await uniqueVisible([
    { key: 'mode-agent-button', locator: page.getByRole('button', { name: /^(Tác nhân|Agent|Ingredients)$/i }) },
    { key: 'mode-agent-text', locator: page.locator('button').filter({ hasText: /^(Tác nhân|Agent|Ingredients)$/i }) },
  ]);
  if (!mode) return false;
  await mode.locator.click({ timeout: 15_000 });
  await page.waitForTimeout(500);
  return true;
}

export async function openModelMenuForDiagnostics(page: Page): Promise<boolean> {
  const agentInstructions = page.getByRole('button', { name: /Hướng dẫn cho tác nhân|Agent instructions/i });
  if (await agentInstructions.isVisible().catch(() => false)) {
    const agentToggle = page.getByRole('button', { name: /^(Tác nhân|Agent)$/i });
    if (await agentToggle.isVisible().catch(() => false)) {
      await agentToggle.click({ timeout: 15_000 });
      await page.waitForTimeout(500);
    }
  }
  const model = await uniqueVisible([
    { key: 'selected-video-model-button', locator: page.locator('button').filter({ hasText: /^Video\s*·/i }) },
    { key: 'model-button', locator: page.getByRole('button', { name: /Nano Banana|Veo/i }) },
    { key: 'model-text-button', locator: page.locator('button').filter({ hasText: /Nano Banana|Veo/i }) },
  ]);
  if (!model) return false;
  await model.locator.click({ timeout: 15_000 });
  await page.waitForTimeout(500);
  return true;
}

export async function ensureVideoMode(page: Page): Promise<boolean> {
  const selectedVideoModel = await uniqueVisible([
    { key: 'video-model', locator: page.getByRole('button', { name: /Veo/i }) },
  ]);
  if (selectedVideoModel) return true;
  if (!await openModelMenuForDiagnostics(page)) return false;
  const videoTab = await uniqueVisible([
    { key: 'video-tab', locator: page.getByRole('tab', { name: /Video$/i }) },
    { key: 'video-tab-text', locator: page.locator('[role="tab"]').filter({ hasText: /Video$/i }) },
  ]);
  if (!videoTab) return false;
  await videoTab.locator.click({ timeout: 15_000 });
  await page.waitForTimeout(1_000);
  return Boolean(await uniqueVisible([
    { key: 'video-model', locator: page.getByRole('button', { name: /Veo/i }) },
    { key: 'video-tab-selected', locator: page.getByRole('tab', { name: /Video$/i }).filter({ has: page.locator('[aria-selected="true"]') }) },
  ]));
}

export async function ensureSingleOutput(page: Page): Promise<boolean> {
  if (await isSingleOutputSelected(page)) return true;
  let x1Tab = await uniqueVisible([
    { key: 'output-count-x1', locator: page.getByRole('tab', { name: /^x1$/i }) },
    { key: 'output-count-x1-text', locator: page.locator('[role="tab"]').filter({ hasText: /^x1$/i }) },
  ]);
  if (!x1Tab) {
    if (!await openModelMenuForDiagnostics(page)) return false;
    x1Tab = await uniqueVisible([
      { key: 'output-count-x1', locator: page.getByRole('tab', { name: /^x1$/i }) },
      { key: 'output-count-x1-text', locator: page.locator('[role="tab"]').filter({ hasText: /^x1$/i }) },
    ]);
  }
  if (!x1Tab) return false;
  await x1Tab.locator.click({ timeout: 15_000 });
  await page.waitForTimeout(500);
  return await isSingleOutputSelected(page)
    || await x1Tab.locator.getAttribute('aria-selected') === 'true';
}

export async function isSingleOutputSelected(page: Page): Promise<boolean> {
  return page.locator('button').filter({ hasText: /^Video\s*·.*x1$/i }).first().isVisible().catch(() => false);
}

async function visibleVideoPreviews(page: Page): Promise<Locator[]> {
  const candidates = page.getByAltText(/video/i);
  const visible: Locator[] = [];
  for (let index = 0; index < await candidates.count(); index += 1) {
    const candidate = candidates.nth(index);
    if (await candidate.isVisible()) visible.push(candidate);
  }
  return visible;
}

export async function countVisibleVideoPreviews(page: Page): Promise<number> {
  return (await visibleVideoPreviews(page)).length;
}

export async function getFlowOutputIds(page: Page): Promise<string[]> {
  const hrefs = await page.locator('a[href*="/edit/"]').evaluateAll((links) => links.map((link) => (link as HTMLAnchorElement).href));
  return [...new Set(hrefs.map((href) => href.match(/\/edit\/([^/?#]+)/)?.[1]).filter((value): value is string => Boolean(value)))];
}

export async function getStableFlowOutputIds(page: Page): Promise<string[]> {
  const startedAt = Date.now();
  const deadline = startedAt + 20_000;
  let previousSignature = '';
  let stableSamples = 0;
  while (Date.now() < deadline) {
    const ids = await getFlowOutputIds(page);
    const signature = [...ids].sort().join('|');
    stableSamples = signature === previousSignature ? stableSamples + 1 : 1;
    previousSignature = signature;
    const bodyText = await page.locator('body').innerText().catch(() => '');
    const explicitEmptyState = /no (?:videos|generations|outputs) yet|create your first (?:video|generation)/i.test(bodyText);
    if (Date.now() - startedAt >= 8_000 && stableSamples >= 3 && (ids.length > 0 || explicitEmptyState)) return ids;
    await page.waitForTimeout(2_000);
  }
  throw new Error('FLOW_OUTPUT_BASELINE_UNSTABLE');
}

export function findNewFlowOutputIds(baselineIds: string[], currentIds: string[], detailId?: string | null): string[] {
  const baseline = new Set(baselineIds);
  return [...new Set([
    ...currentIds.filter((id) => !baseline.has(id)),
    ...(detailId && !baseline.has(detailId) ? [detailId] : []),
  ])];
}

export async function openFlowOutputById(page: Page, outputId: string): Promise<boolean> {
  if (!/^[a-z0-9-]{8,80}$/i.test(outputId)) return false;
  if (page.url().includes(`/edit/${outputId}`)) return true;
  const link = page.locator(`a[href*="/edit/${outputId}"]`).first();
  if (await link.isVisible().catch(() => false)) {
    await link.click({ timeout: 15_000 });
  } else {
    const projectUrl = flowProjectBaseUrl(page.url());
    if (!projectUrl) return false;
    await page.goto(`${projectUrl}/edit/${outputId}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
  }
  await page.waitForURL((url) => url.pathname.includes(`/edit/${outputId}`), { timeout: 30_000 });
  return true;
}

export async function openLatestVideoDetail(page: Page): Promise<boolean> {
  if (/\/project\/[^/]+\/edit\//.test(page.url())) return true;
  const previews = await visibleVideoPreviews(page);
  const latestPreview = previews[previews.length - 1];
  if (!latestPreview) return false;
  const previewButton = latestPreview.locator('xpath=ancestor::button[1]');
  if (!await previewButton.isVisible().catch(() => false)) return false;
  await previewButton.click({ timeout: 15_000 });
  await page.waitForURL((url) => /\/project\/[^/]+\/edit\//.test(url.pathname), { timeout: 30_000 });
  return true;
}

export async function findDownloadControl(page: Page): Promise<LocatedControl | null> {
  const previews = await visibleVideoPreviews(page);
  const latestPreview = previews[previews.length - 1];
  if (latestPreview) await latestPreview.hover().catch(() => undefined);
  let download = await uniqueVisible([
    { key: 'download-button', locator: page.getByRole('button', { name: /download|tải xuống/i }) },
    { key: 'download-link', locator: page.getByRole('link', { name: /download|tải xuống/i }) },
    { key: 'download-menuitem', locator: page.getByRole('menuitem', { name: /download|tải xuống/i }) },
  ]);
  if (download || !latestPreview) return download;
  let container = latestPreview;
  for (let depth = 0; depth < 6 && !download; depth += 1) {
    container = container.locator('..');
    const more = await uniqueVisible([
      { key: 'output-more', locator: container.getByRole('button', { name: /more|khác|tuỳ chọn|tùy chọn/i }) },
    ]);
    if (!more) continue;
    await more.locator.click({ timeout: 10_000 });
    await page.waitForTimeout(300);
    download = await uniqueVisible([
      { key: 'download-menuitem', locator: page.getByRole('menuitem', { name: /download|tải xuống/i }) },
      { key: 'download-button', locator: page.getByRole('button', { name: /download|tải xuống/i }) },
    ]);
  }
  return download;
}
