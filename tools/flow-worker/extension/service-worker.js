const BRIDGE_URL = 'http://127.0.0.1:32187';
let polling = false;

function allowedAutomationUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && [
      'labs.google', 'www.facebook.com', 'facebook.com', 'business.facebook.com',
      'www.tiktok.com', 'tiktok.com', 'www.linkedin.com', 'linkedin.com',
      'oa.zalo.me', 'zalo.me', 'chat.zalo.me',
    ].includes(url.hostname);
  } catch { return false; }
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const bridgeId = async () => {
  const current = await chrome.storage.local.get(['bridgeId']);
  if (current.bridgeId) return current.bridgeId;
  const id = crypto.randomUUID();
  await chrome.storage.local.set({ bridgeId: id });
  return id;
};

async function registerBridge(profileId, nonce) {
  const id = await bridgeId();
  const response = await fetch(`${BRIDGE_URL}/v1/bridge/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ profileId, nonce, bridgeId: id }),
  });
  if (!response.ok) throw new Error(`register ${response.status}`);
  const result = await response.json();
  await chrome.storage.local.set({ profileId, bridgeToken: result.token });
  startPolling();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== 'ancv-bridge-setup') return false;
  (async () => {
    await registerBridge(message.profileId, message.nonce);
    sendResponse({ ok: true });
  })().catch(() => sendResponse({ ok: false }));
  return true;
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (!changeInfo.url?.startsWith(`${BRIDGE_URL}/setup?`)) return;
  const url = new URL(changeInfo.url);
  const profileId = url.searchParams.get('profileId');
  const nonce = url.searchParams.get('nonce');
  const next = url.searchParams.get('next');
  if (!profileId || !nonce || !next || !allowedAutomationUrl(next)) return;
  registerBridge(profileId, nonce).then(() => chrome.tabs.update(tabId, { url: next })).catch(() => undefined);
});

function isVisible(element) {
  const style = window.getComputedStyle(element);
  const rect = element.getBoundingClientRect();
  return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
}

function controlText(element) {
  return `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.replace(/\s+/g, ' ').trim();
}

function inspectFlowPage() {
  const visible = (element) => {
    const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const text = (element) => `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.replace(/\s+/g, ' ').trim();
  const url = location.href;
  const bodyText = (document.body?.innerText ?? '').slice(0, 30000);
  if (/accounts\.google\.com|signin/i.test(url)) return { url, session: 'needs_login' };
  if (/captcha|verify (it'?s you|your identity)|xác minh (danh tính|tài khoản)|2-step verification|xác minh 2 bước|unusual activity/i.test(bodyText)) {
    return { url, session: 'needs_verification', limitation: 'Google yêu cầu xác minh thủ công.' };
  }
  const controls = [...document.querySelectorAll('button,[role="button"],[role="tab"],textarea,[role="textbox"],[contenteditable="true"]')].filter(visible);
  const prompt = controls.find((element) => {
    const label = text(element);
    return element.tagName === 'TEXTAREA' || element.getAttribute('role') === 'textbox' || /prompt|describe|mô tả/i.test(label);
  });
  const video = controls.find((element) => /^(video\s*·|video$|veo)/i.test(text(element)));
  const generate = controls.find((element) => /^(arrow_forward\s*)?(generate|generate video|tạo|tạo video)$/i.test(text(element)));
  const x1 = controls.some((element) => /^video\s*·.*x1$/i.test(text(element)))
    || controls.some((element) => /^x1$/i.test(text(element)) && element.getAttribute('aria-selected') === 'true');
  const accountHref = [...document.querySelectorAll('a[href*="accounts.google.com/AccountChooser"][href*="Email="]')]
    .map((element) => element.getAttribute('href')).find(Boolean);
  let email = null;
  try { email = accountHref ? new URL(accountHref, location.href).searchParams.get('Email')?.trim().toLowerCase() ?? null : null; } catch { email = null; }
  if (!email) {
    const labels = [...document.querySelectorAll('[aria-label*="@"]')]
      .map((element) => element.getAttribute('aria-label') ?? '');
    email = labels.map((label) => label.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase() ?? null).find(Boolean) ?? null;
  }
  const previews = [...document.querySelectorAll('img[alt*="video" i]')].filter(visible);
  const outputIds = [...new Set([...document.querySelectorAll('a[href*="/edit/"]')]
    .map((element) => element.getAttribute('href')?.match(/\/edit\/([^/?#]+)/)?.[1] ?? null)
    .filter(Boolean))];
  const detailId = location.pathname.match(/\/edit\/([^/?#]+)/)?.[1] ?? null;
  const emptyState = /no (?:videos|generations|outputs) yet|create your first (?:video|generation)/i.test(bodyText);
  const processing = /generating|processing|rendering|đang tạo|đang xử lý/i.test(bodyText);
  const generationError = /generation failed|failed to generate|generation error|tạo không thành công|tạo thất bại/i.test(bodyText);
  return {
    url,
    session: prompt && video && generate && x1 ? 'ready' : 'unavailable',
    prompt: Boolean(prompt), video: Boolean(video), generate: Boolean(generate), x1,
    outputCount: outputIds.length || previews.length, outputIds, detailId,
    view: detailId ? 'detail' : 'project', processing, generationError, emptyState, email,
    limitation: prompt && video && generate && x1 ? null : 'Không xác định chắc chắn prompt/Video/Generate/x1.',
  };
}

function prepareFlowPage() {
  const isVisibleElement = (element) => { const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0; };
  const text = (element) => `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.replace(/\s+/g, ' ').trim();
  const visible = (selector) => [...document.querySelectorAll(selector)].filter(isVisibleElement);
  const controls = visible('button,[role="button"],[role="tab"]');
  const model = controls.find((element) => /^video\s*·|veo|nano banana/i.test(text(element)));
  model?.click();
  const videoTab = controls.find((element) => /^video$/i.test(text(element)));
  videoTab?.click();
  const x1 = controls.find((element) => /^x1$/i.test(text(element)));
  x1?.click();
  return { prepared: true };
}

function fillPrompt(prompt) {
  const visible = (element) => { const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0; };
  const text = (element) => `${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('placeholder') ?? ''}`.trim();
  const candidates = [...document.querySelectorAll('textarea,[role="textbox"],[contenteditable="true"]')].filter(visible);
  const target = candidates.find((element) => /prompt|describe|mô tả/i.test(text(element))) ?? candidates[0];
  if (!target) return { filled: false };
  target.focus();
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
    const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(target), 'value')?.set;
    setter?.call(target, prompt);
  } else {
    target.textContent = prompt;
  }
  target.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: prompt }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
  return { filled: true, length: prompt.length };
}

function clickGenerate() {
  const visible = (element) => { const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0; };
  const text = (element) => `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.replace(/\s+/g, ' ').trim();
  const candidates = [...document.querySelectorAll('button,[role="button"]')].filter(visible);
  const generate = candidates.filter((element) => /^(arrow_forward\s*)?(generate|generate video|tạo|tạo video)$/i.test(text(element)));
  if (generate.length !== 1) return { clicked: false, matches: generate.length };
  generate[0].click();
  return { clicked: true, matches: 1 };
}

function openLatestVideo() {
  const visible = (element) => { const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0; };
  if (/\/project\/[^/]+\/edit\//.test(location.pathname)) return { opened: true };
  const previews = [...document.querySelectorAll('img[alt*="video" i]')].filter(visible);
  const latest = previews.at(-1);
  const button = latest?.closest('button');
  if (!button) return { opened: false, count: previews.length };
  button.click();
  return { opened: true, count: previews.length };
}

function openOutput(outputId) {
  if (!/^[a-z0-9-]{8,80}$/i.test(outputId)) return { opened: false, reason: 'OUTPUT_ID_INVALID' };
  const current = location.pathname.match(/\/edit\/([^/?#]+)/)?.[1];
  if (current === outputId) return { opened: true, outputId };
  const link = [...document.querySelectorAll('a[href*="/edit/"]')]
    .find((element) => element.getAttribute('href')?.includes(`/edit/${outputId}`));
  if (!link) return { opened: false, reason: 'OUTPUT_LINK_NOT_FOUND' };
  link.click();
  return { opened: true, outputId };
}

function clickDownloadControl() {
  const visible = (element) => { const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect(); return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0; };
  const text = (element) => `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.replace(/\s+/g, ' ').trim();
  const candidates = [...document.querySelectorAll('button,a,[role="menuitem"]')].filter(visible);
  const controls = candidates.filter((element) => /^(download|tải xuống)$/i.test(text(element)));
  if (controls.length !== 1) return { clicked: false, matches: controls.length };
  controls[0].click();
  return { clicked: true, matches: 1 };
}

function diagnoseFlowPage() {
  const visible = (element) => {
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 240);
  const pathname = (value) => {
    if (!value) return null;
    try { return new URL(value, location.href).pathname; } catch { return null; }
  };
  const evidence = (element) => {
    const rect = element.getBoundingClientRect();
    const link = element.closest('a[href]');
    const button = element.closest('button,[role="button"]');
    return {
      tag: element.tagName.toLowerCase(), visible: visible(element),
      alt: clean(element.getAttribute('alt')) || null,
      ariaLabel: clean(element.getAttribute('aria-label')) || null,
      text: clean(element.textContent) || null,
      dataTestId: clean(element.getAttribute('data-testid')) || null,
      hrefPath: pathname(link?.getAttribute('href')),
      sourcePath: pathname(element.getAttribute('src')),
      buttonLabel: clean(button?.getAttribute('aria-label') || button?.textContent) || null,
      top: Math.round(rect.top), left: Math.round(rect.left), width: Math.round(rect.width), height: Math.round(rect.height),
    };
  };
  const selectors = [
    'img[alt*="video" i]', 'video', 'a[href*="/edit/"]',
    '[data-testid*="video" i]', '[data-testid*="output" i]', '[data-testid*="generation" i]',
  ];
  const nodes = [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))];
  const statusPattern = /generat|processing|render|queued|failed|error|đang tạo|đang xử lý|thất bại|lỗi|hoàn tất|complete/i;
  const statusTexts = [...document.querySelectorAll('[role="status"],[aria-live],button,p,span')]
    .filter((element) => visible(element))
    .map((element) => clean(element.getAttribute('aria-label') || element.textContent))
    .filter((text) => text && text.length <= 240 && statusPattern.test(text));
  const relevantTestIds = [...document.querySelectorAll('[data-testid]')]
    .map((element) => element.getAttribute('data-testid'))
    .filter((value) => value && /video|output|generat|media|asset/i.test(value));
  return {
    url: location.href,
    title: document.title,
    capturedAt: new Date().toISOString(),
    documentState: document.readyState,
    scroll: { y: Math.round(window.scrollY), height: document.documentElement.scrollHeight, viewport: window.innerHeight },
    counts: {
      visibleVideoAltImages: [...document.querySelectorAll('img[alt*="video" i]')].filter(visible).length,
      totalVideoAltImages: document.querySelectorAll('img[alt*="video" i]').length,
      visibleVideoElements: [...document.querySelectorAll('video')].filter(visible).length,
      totalVideoElements: document.querySelectorAll('video').length,
      editLinks: document.querySelectorAll('a[href*="/edit/"]').length,
      diagnosticNodes: nodes.length,
    },
    statusTexts: [...new Set(statusTexts)].slice(0, 40),
    relevantTestIds: [...new Set(relevantTestIds)].slice(0, 40),
    outputs: nodes.slice(0, 40).map(evidence),
  };
}

async function flowTab() {
  const tabs = await chrome.tabs.query({ url: 'https://labs.google/*' });
  return tabs.find((tab) => tab.active) ?? tabs.at(-1) ?? null;
}

async function runInFlow(func, args = []) {
  const tab = await flowTab();
  if (!tab?.id) throw new Error('FLOW_TAB_NOT_FOUND');
  const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func, args });
  return result[0]?.result;
}

function inspectSocialPage(platform) {
  const visible = (element) => {
    const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();
  const controls = [...document.querySelectorAll('button,a,[role="button"],[role="textbox"],[contenteditable="true"],input')].filter(visible);
  const label = (element) => clean(`${element.getAttribute('aria-label') ?? ''} ${element.getAttribute('placeholder') ?? ''} ${element.textContent ?? ''}`);
  const labels = controls.map(label);
  const bodyText = clean(document.body?.innerText ?? '').slice(0, 50000);
  const url = location.href;
  const loginPattern = /\blog[ -]?in\b|\bsign[ -]?in\b|đăng nhập|connexion/i;
  const verificationPattern = /captcha|two-factor|2-step|security check|verify (?:your|it'?s)|xác minh|checkpoint/i;
  const onLoginUrl = /\/login|\/signin|accounts\./i.test(location.pathname + location.hostname);
  const needsVerification = verificationPattern.test(bodyText);
  const platformPatterns = {
    facebook: { composer: /what'?s on your mind|bạn đang nghĩ gì|create post|tạo bài viết/i, media: /photo\/video|ảnh\/video|reel/i, publish: /^(post|đăng)$/i },
    tiktok: { composer: /caption|mô tả/i, media: /select (?:a )?video|upload|tải (?:video )?lên/i, publish: /^(post|đăng)$/i, privacy: /who can watch|ai có thể xem|privacy|quyền riêng tư/i },
    linkedin: { composer: /start a post|bắt đầu một bài đăng|create a post/i, media: /add media|media|photo|video|ảnh/i, publish: /^(post|đăng)$/i },
    zalo: { composer: /soạn bài|tạo bài viết|nội dung|composer/i, media: /hình ảnh|video|media|tải lên/i, publish: /^(xuất bản|đăng bài|đăng)$/i },
  };
  const patterns = platformPatterns[platform] ?? platformPatterns.facebook;
  const composer = labels.some((value) => patterns.composer.test(value));
  const media = labels.some((value) => patterns.media.test(value)) || Boolean(document.querySelector('input[type="file"]'));
  const publish = labels.some((value) => patterns.publish.test(value));
  const privacy = patterns.privacy ? labels.some((value) => patterns.privacy.test(value)) : undefined;
  const prominentLogin = labels.some((value) => loginPattern.test(value) && value.length < 80);
  const session = needsVerification ? 'needs_verification' : (onLoginUrl || (prominentLogin && !composer && !media)) ? 'needs_login' : 'ready';
  const email = labels.map((value) => value.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i)?.[0]?.toLowerCase() ?? null).find(Boolean) ?? null;
  const entity = bodyText.match(/(?:Giải Pháp )?An Ninh Cảnh Vệ|ANCV/i)?.[0] ?? null;
  return {
    url, platform, session, account: email, entity,
    composer, media, publish, ...(privacy === undefined ? {} : { privacy }),
    checkedAt: new Date().toISOString(),
  };
}

async function runInActiveTab(func, args = []) {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.id || !allowedAutomationUrl(tab.url ?? '')) throw new Error('SOCIAL_TAB_NOT_FOUND');
  const result = await chrome.scripting.executeScript({ target: { tabId: tab.id }, world: 'MAIN', func, args });
  return result[0]?.result;
}

function nativeInputTarget(kind) {
  const visible = (element) => {
    const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  const label = (element) => `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`.replace(/\s+/g, ' ').trim();
  const visibleButtons = [...document.querySelectorAll('button')].filter(visible);
  const candidates = kind === 'config'
    ? visibleButtons.filter((element) => /^video\b.*x1$/i.test(label(element)))
    : [...document.querySelectorAll('button,[role="button"]')].filter(visible)
      .filter((element) => /^(arrow_forward\s*)?(generate|generate video|tạo|tạo video)$/i.test(label(element)));
  if (candidates.length !== 1) return {
    ready: false, matches: candidates.length, reason: 'TARGET_AMBIGUOUS',
    diagnosticLabels: kind === 'config' ? visibleButtons.map(label).filter((value) => /video|x1/i.test(value)).slice(0, 10) : undefined,
  };
  const target = candidates[0];
  const disabled = target instanceof HTMLButtonElement ? target.disabled : target.getAttribute('aria-disabled') === 'true';
  const rect = target.getBoundingClientRect();
  const x = rect.left + rect.width / 2; const y = rect.top + rect.height / 2;
  const top = document.elementFromPoint(x, y);
  const unobstructed = Boolean(top && (top === target || target.contains(top)));
  return { ready: !disabled && unobstructed, matches: 1, disabled, unobstructed, x, y };
}

function configMenuOpen() {
  const visible = (element) => {
    const style = window.getComputedStyle(element); const rect = element.getBoundingClientRect();
    return style.visibility !== 'hidden' && style.display !== 'none' && rect.width > 0 && rect.height > 0;
  };
  return [...document.querySelectorAll('[role="menu"]')].some(visible)
    || [...document.querySelectorAll('[role="tab"]')].some((element) => visible(element) && /^x1$/i.test((element.textContent ?? '').trim()));
}

function generateAcceptanceState(baselineOutputIds) {
  const inspection = inspectFlowPage();
  const baseline = new Set(Array.isArray(baselineOutputIds) ? baselineOutputIds : []);
  const newOutputIds = (inspection.outputIds ?? []).filter((id) => !baseline.has(id));
  const prompt = [...document.querySelectorAll('textarea,[role="textbox"],[contenteditable="true"]')].find(isVisible);
  const promptValue = prompt instanceof HTMLTextAreaElement || prompt instanceof HTMLInputElement ? prompt.value : prompt?.textContent ?? '';
  const generate = [...document.querySelectorAll('button,[role="button"]')].filter(isVisible)
    .find((element) => /^(arrow_forward\s*)?(generate|generate video|tạo|tạo video)$/i.test(controlText(element)));
  const generateDisabled = generate instanceof HTMLButtonElement ? generate.disabled : generate?.getAttribute('aria-disabled') === 'true';
  return {
    accepted: Boolean(inspection.processing || inspection.generationError || newOutputIds.length || !promptValue.trim() || generateDisabled),
    processing: Boolean(inspection.processing), promptCleared: !promptValue.trim(),
    generateDisabled: Boolean(generateDisabled), newOutputIds,
  };
}

async function dispatchNativeClick(tabId, point) {
  const debuggee = { tabId };
  await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', clickCount: 1 });
  await chrome.debugger.sendCommand(debuggee, 'Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', clickCount: 1 });
}

async function nativeInputTest() {
  const tab = await flowTab();
  if (!tab?.id) throw new Error('FLOW_TAB_NOT_FOUND');
  const target = await runInFlow(nativeInputTarget, ['config']);
  if (!target?.ready) return { passed: false, attached: false, detached: true, matches: target?.matches ?? 0, reason: target?.reason ?? 'CONFIG_TARGET_UNSAFE', diagnosticLabels: target?.diagnosticLabels ?? [] };
  const beforeOpen = await runInFlow(configMenuOpen);
  let attached = false;
  let afterOpen = beforeOpen;
  try {
    await chrome.debugger.attach({ tabId: tab.id }, '1.3'); attached = true;
    await dispatchNativeClick(tab.id, target);
    await sleep(250);
    afterOpen = await runInFlow(configMenuOpen);
  } finally {
    if (attached) await chrome.debugger.detach({ tabId: tab.id });
  }
  return { passed: beforeOpen !== afterOpen, attached: true, dispatched: true, detached: true, beforeOpen, afterOpen };
}

async function nativeGenerate(baselineOutputIds) {
  const tab = await flowTab();
  if (!tab?.id) throw new Error('FLOW_TAB_NOT_FOUND');
  const inspection = await runInFlow(inspectFlowPage);
  if (inspection?.session !== 'ready' || !inspection.video || !inspection.x1) return { clicked: false, dispatched: false, matches: 0, reason: 'FLOW_GENERATE_PREFLIGHT_UNSAFE' };
  const target = await runInFlow(nativeInputTarget, ['generate']);
  if (!target?.ready) return { clicked: false, dispatched: false, matches: target?.matches ?? 0, reason: target?.reason ?? 'GENERATE_TARGET_UNSAFE' };
  let attached = false; let generationRequestObserved = false; let responseStatus = null;
  const requestIds = new Set(); const debuggee = { tabId: tab.id };
  const onEvent = (source, method, params) => {
    if (source.tabId !== tab.id) return;
    if (method === 'Network.requestWillBeSent') {
      try {
        const url = new URL(params.request?.url ?? '');
        if (params.request?.method === 'POST' && url.hostname === 'labs.google' && url.pathname.startsWith('/fx/api/') && /generat|create|video|media/i.test(url.pathname)) {
          generationRequestObserved = true;
          if (params.requestId) requestIds.add(params.requestId);
        }
      } catch { /* Never log request data. */ }
    }
    if (method === 'Network.responseReceived' && requestIds.has(params.requestId) && Number.isInteger(params.response?.status)) responseStatus = params.response.status;
  };
  try {
    await chrome.debugger.attach(debuggee, '1.3'); attached = true;
    chrome.debugger.onEvent.addListener(onEvent);
    await chrome.debugger.sendCommand(debuggee, 'Network.enable');
    await dispatchNativeClick(tab.id, target);
    const deadline = Date.now() + 10_000; let acceptance = null;
    while (Date.now() < deadline) {
      await sleep(250);
      acceptance = await runInFlow(generateAcceptanceState, [baselineOutputIds]);
      if (acceptance?.accepted || generationRequestObserved) break;
    }
    return {
      clicked: true, dispatched: true, matches: 1, inputMethod: 'cdp_mouse', clickCount: 1,
      debuggerAttached: true, debuggerDetached: true,
      acceptanceSignal: Boolean(acceptance?.accepted || generationRequestObserved),
      generationRequestObserved, responseStatus, processingObserved: Boolean(acceptance?.processing),
    };
  } finally {
    chrome.debugger.onEvent.removeListener(onEvent);
    if (attached) await chrome.debugger.detach(debuggee);
  }
}

async function execute(command) {
  if (command.type === 'open_url') {
    if (!allowedAutomationUrl(command.payload.url)) throw new Error('AUTOMATION_URL_DENIED');
    const target = new URL(command.payload.url);
    const tabs = target.hostname === 'labs.google'
      ? await chrome.tabs.query({ url: 'https://labs.google/*' })
      : await chrome.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (tab?.id) await chrome.tabs.update(tab.id, { url: command.payload.url, active: true });
    else await chrome.tabs.create({ url: command.payload.url, active: true });
    return { opened: true };
  }
  if (command.type === 'inspect_social') return runInActiveTab(inspectSocialPage, [command.payload.platform]);
  if (command.type === 'inspect_flow') return runInFlow(inspectFlowPage);
  if (command.type === 'diagnose_flow') return runInFlow(diagnoseFlowPage);
  if (command.type === 'prepare_flow') return runInFlow(prepareFlowPage);
  if (command.type === 'fill_prompt') return runInFlow(fillPrompt, [command.payload.prompt]);
  if (command.type === 'test_native_input') return nativeInputTest();
  if (command.type === 'click_generate') throw new Error('FLOW_BRIDGE_GENERATE_DISABLED_USE_PLAYWRIGHT');
  if (command.type === 'open_latest_video') return runInFlow(openLatestVideo);
  if (command.type === 'open_output') return runInFlow(openOutput, [command.payload.outputId]);
  if (command.type === 'download_latest') {
    const before = new Set((await chrome.downloads.search({ limit: 20 })).map((item) => item.id));
    const clicked = await runInFlow(clickDownloadControl);
    if (!clicked?.clicked) return clicked;
    const deadline = Date.now() + 120000;
    while (Date.now() < deadline) {
      const downloads = await chrome.downloads.search({ limit: 20 });
      const created = downloads.find((item) => !before.has(item.id));
      if (created?.state === 'complete' && created.filename) return { clicked: true, filename: created.filename, bytesReceived: created.bytesReceived };
      if (created?.state === 'interrupted') throw new Error(`DOWNLOAD_INTERRUPTED:${created.error ?? 'unknown'}`);
      await sleep(500);
    }
    throw new Error('DOWNLOAD_TIMEOUT');
  }
  throw new Error(`UNSUPPORTED_COMMAND:${command.type}`);
}

async function pollOnce() {
  const config = await chrome.storage.local.get(['profileId', 'bridgeToken']);
  if (!config.profileId || !config.bridgeToken) return;
  const id = await bridgeId();
  const headers = { 'x-ancv-bridge-token': config.bridgeToken, 'x-ancv-bridge-id': id };
  await fetch(`${BRIDGE_URL}/v1/bridge/heartbeat`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ profileId: config.profileId }) });
  const response = await fetch(`${BRIDGE_URL}/v1/bridge/commands/next?profileId=${encodeURIComponent(config.profileId)}`, { headers });
  if (response.status === 204) return;
  if (!response.ok) throw new Error(`command poll ${response.status}`);
  const command = await response.json();
  try {
    const result = await execute(command);
    await fetch(`${BRIDGE_URL}/v1/bridge/commands/${encodeURIComponent(command.id)}/result`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ ok: true, result }) });
  } catch (error) {
    await fetch(`${BRIDGE_URL}/v1/bridge/commands/${encodeURIComponent(command.id)}/result`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json' }, body: JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) }) });
  }
}

async function pollingLoop() {
  while (polling) {
    try { await pollOnce(); } catch { /* Fail closed; the local agent heartbeat will show disconnected. */ }
    await sleep(1000);
  }
}

function startPolling() {
  if (polling) return;
  polling = true;
  pollingLoop();
}

chrome.runtime.onStartup.addListener(startPolling);
chrome.runtime.onInstalled.addListener(startPolling);
startPolling();
