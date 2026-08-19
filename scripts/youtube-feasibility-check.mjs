const EXPECTED_CHANNEL_ID = "UCy-H7__UvdWcTbUax3RGDcA";
const EXPECTED_CHANNEL_TITLE = "Giải Pháp An Ninh Cảnh Vệ";
const REQUIRED_SCOPES = [
  "https://www.googleapis.com/auth/youtube.force-ssl",
  "https://www.googleapis.com/auth/yt-analytics.readonly",
];

const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim();
const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN?.trim();

if (!clientId || !clientSecret || !refreshToken) {
  throw new Error("Missing YouTube OAuth credentials in process environment.");
}

const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  }),
});
const tokenBody = await tokenResponse.json();
if (!tokenResponse.ok || !tokenBody.access_token) {
  throw new Error(`Refresh-token exchange failed with HTTP ${tokenResponse.status}.`);
}

const tokenInfoResponse = await fetch(
  `https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(tokenBody.access_token)}`,
);
const tokenInfo = await tokenInfoResponse.json();
if (!tokenInfoResponse.ok) {
  throw new Error(`Token introspection failed with HTTP ${tokenInfoResponse.status}.`);
}
const grantedScopes = String(tokenInfo.scope ?? "")
  .split(" ")
  .filter(Boolean)
  .sort();
const missingScopes = REQUIRED_SCOPES.filter(
  (scope) => !grantedScopes.includes(scope),
);

const headers = { Authorization: `Bearer ${tokenBody.access_token}` };
const channelsResponse = await fetch(
  "https://youtube.googleapis.com/youtube/v3/channels?part=id,snippet,contentDetails&mine=true",
  { headers },
);
const channelsBody = await channelsResponse.json();
if (!channelsResponse.ok) {
  throw new Error(`channels.list failed with HTTP ${channelsResponse.status}.`);
}
const channels = Array.isArray(channelsBody.items) ? channelsBody.items : [];
const expectedChannel = channels.find(
  (channel) => channel.id === EXPECTED_CHANNEL_ID,
);
if (!expectedChannel) {
  throw new Error(
    `ACCOUNT/CHANNEL MISMATCH: expected ${EXPECTED_CHANNEL_ID}; response contained ${channels.length} channel(s).`,
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
const analyticsResponse = await fetch(analyticsUrl, { headers });
const analyticsBody = await analyticsResponse.json();

console.log(
  JSON.stringify(
    {
      oauthRefresh: "PASS",
      scopes: {
        requested: REQUIRED_SCOPES,
        granted: grantedScopes,
        missing: missingScopes,
        result: missingScopes.length === 0 ? "PASS" : "PARTIAL",
      },
      channel: {
        id: expectedChannel.id,
        title: expectedChannel.snippet?.title ?? null,
        expectedTitle: EXPECTED_CHANNEL_TITLE,
        result: "PASS",
      },
      analytics: {
        dateRange: ["2026-08-01", "2026-08-07"],
        httpStatus: analyticsResponse.status,
        result: analyticsResponse.ok ? "PASS" : "FAIL",
        rowCount: Array.isArray(analyticsBody.rows)
          ? analyticsBody.rows.length
          : 0,
        errorReason: analyticsResponse.ok
          ? null
          : analyticsBody.error?.errors?.[0]?.reason ??
            analyticsBody.error?.status ??
            "unknown_error",
      },
    },
    null,
    2,
  ),
);
