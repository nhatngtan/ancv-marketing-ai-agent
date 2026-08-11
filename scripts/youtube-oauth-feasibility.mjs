import { createHash, randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { createServer } from "node:http";

const PROJECT_ID = "ancv-marketing-ai-agent";
const EXPECTED_CHANNEL_ID = "UCy-H7__UvdWcTbUax3RGDcA";
const EXPECTED_CHANNEL_TITLE = "Giải Pháp An Ninh Cảnh Vệ";
const LOGIN_HINT = "ancv.marketing@gmail.com";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.readonly",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim();
const gcpAccessToken = process.env.GCP_ACCESS_TOKEN?.trim();

if (!clientId || !clientSecret || !gcpAccessToken) {
  throw new Error("Missing OAuth or GCP credentials in process environment.");
}

const base64Url = (buffer) =>
  buffer
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");

const state = base64Url(randomBytes(32));
const codeVerifier = base64Url(randomBytes(64));
const codeChallenge = base64Url(
  createHash("sha256").update(codeVerifier).digest(),
);

let resolveCallback;
let rejectCallback;
const callbackPromise = new Promise((resolve, reject) => {
  resolveCallback = resolve;
  rejectCallback = reject;
});

const server = createServer((request, response) => {
  try {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (url.pathname !== "/oauth2callback") {
      response.writeHead(404).end("Not found");
      return;
    }

    const error = url.searchParams.get("error");
    const returnedState = url.searchParams.get("state");
    const code = url.searchParams.get("code");

    if (error) {
      response
        .writeHead(400, { "Content-Type": "text/plain; charset=utf-8" })
        .end("OAuth was not completed. You may close this window.");
      rejectCallback(new Error(`OAuth consent failed: ${error}`));
      return;
    }

    if (returnedState !== state || !code) {
      response
        .writeHead(400, { "Content-Type": "text/plain; charset=utf-8" })
        .end("OAuth callback validation failed. You may close this window.");
      rejectCallback(new Error("OAuth callback state/code validation failed."));
      return;
    }

    response
      .writeHead(200, { "Content-Type": "text/plain; charset=utf-8" })
      .end("ANCV YouTube authorization received. You may close this window.");
    resolveCallback(code);
  } catch (error) {
    response.writeHead(500).end("OAuth callback failed.");
    rejectCallback(error);
  }
});

await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();
if (!address || typeof address === "string") {
  server.close();
  throw new Error("Could not determine OAuth callback port.");
}

const redirectUri = `http://127.0.0.1:${address.port}/oauth2callback`;
const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authorizationUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope: SCOPES.join(" "),
  access_type: "offline",
  prompt: "consent select_account",
  include_granted_scopes: "true",
  login_hint: LOGIN_HINT,
  state,
  code_challenge: codeChallenge,
  code_challenge_method: "S256",
}).toString();

const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const chrome = spawn(chromePath, ["--new-window", authorizationUrl.toString()], {
  detached: true,
  stdio: "ignore",
});
chrome.unref();

console.log(
  `Chrome đã mở. Hãy đăng nhập/consent bằng ${LOGIN_HINT}; helper chỉ chờ callback localhost.`,
);

let authorizationCode;
let callbackTimeout;
try {
  authorizationCode = await Promise.race([
    callbackPromise,
    new Promise((_, reject) =>
      (callbackTimeout = setTimeout(
        () => reject(new Error("OAuth callback timed out after 10 minutes.")),
        10 * 60 * 1000,
      )),
    ),
  ]);
} finally {
  clearTimeout(callbackTimeout);
  server.close();
}

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code: authorizationCode,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  }),
});

const tokenBody = await tokenResponse.json();
if (!tokenResponse.ok || !tokenBody.access_token) {
  throw new Error(
    `OAuth token exchange failed with HTTP ${tokenResponse.status}: ${tokenBody.error ?? "unknown_error"}`,
  );
}

const grantedScopes = String(tokenBody.scope ?? "")
  .split(" ")
  .filter(Boolean)
  .sort();
const missingScopes = SCOPES.filter((scope) => !grantedScopes.includes(scope));
if (missingScopes.length > 0) {
  throw new Error(`OAuth consent is missing ${missingScopes.length} required scope(s).`);
}

const apiHeaders = { Authorization: `Bearer ${tokenBody.access_token}` };
const channelsResponse = await fetch(
  "https://youtube.googleapis.com/youtube/v3/channels?part=id,snippet,contentDetails&mine=true",
  { headers: apiHeaders },
);
const channelsBody = await channelsResponse.json();
if (!channelsResponse.ok) {
  throw new Error(`channels.list failed with HTTP ${channelsResponse.status}.`);
}

const channels = Array.isArray(channelsBody.items) ? channelsBody.items : [];
const expectedChannel = channels.find((channel) => channel.id === EXPECTED_CHANNEL_ID);
if (!expectedChannel) {
  throw new Error(
    `ACCOUNT/CHANNEL MISMATCH: expected ${EXPECTED_CHANNEL_ID}; authorized response contained ${channels.length} channel(s). Refresh token was not stored.`,
  );
}

const analyticsUrl = new URL(
  "https://youtubeanalytics.googleapis.com/v2/reports",
);
analyticsUrl.search = new URLSearchParams({
  ids: "channel==MINE",
  startDate: "2026-08-01",
  endDate: "2026-08-07",
  metrics: "views",
  dimensions: "day",
}).toString();
const analyticsResponse = await fetch(analyticsUrl, { headers: apiHeaders });
const analyticsBody = await analyticsResponse.json();

if (!tokenBody.refresh_token) {
  throw new Error(
    "OAuth response did not include a refresh token; nothing was stored.",
  );
}

const storeResponse = await fetch(
  `https://secretmanager.googleapis.com/v1/projects/${PROJECT_ID}/secrets/youtube-refresh-token:addVersion`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${gcpAccessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      payload: {
        data: Buffer.from(tokenBody.refresh_token, "utf8").toString("base64"),
      },
    }),
  },
);
if (!storeResponse.ok) {
  throw new Error(
    `Could not store the YouTube refresh token in Secret Manager (HTTP ${storeResponse.status}).`,
  );
}

const sanitizedResult = {
  oauth: "PASS",
  requestedScopes: SCOPES,
  grantedScopes,
  channel: {
    id: expectedChannel.id,
    title: expectedChannel.snippet?.title ?? null,
    expectedTitle: EXPECTED_CHANNEL_TITLE,
    result: "PASS",
  },
  analytics: {
    httpStatus: analyticsResponse.status,
    result: analyticsResponse.ok ? "PASS" : "FAIL",
    rowCount: Array.isArray(analyticsBody.rows) ? analyticsBody.rows.length : 0,
    errorReason: analyticsResponse.ok
      ? null
      : analyticsBody.error?.errors?.[0]?.reason ??
        analyticsBody.error?.status ??
        "unknown_error",
  },
  refreshTokenStorage: "Secret Manager: youtube-refresh-token",
};

console.log(JSON.stringify(sanitizedResult, null, 2));
