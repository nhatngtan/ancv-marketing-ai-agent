import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { basename, extname } from "node:path";
import { stat } from "node:fs/promises";

const PROJECT_ID = "ancv-marketing-ai-agent";
const EXPECTED_CHANNEL_ID = "UCy-H7__UvdWcTbUax3RGDcA";
const videoPath = process.argv[2];
const clientId = process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
const clientSecret = process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim();
const refreshToken = process.env.YOUTUBE_REFRESH_TOKEN?.trim();
const gcpAccessToken = process.env.GCP_ACCESS_TOKEN?.trim();

if (!videoPath || !clientId || !clientSecret || !refreshToken || !gcpAccessToken) {
  throw new Error("Missing video path or required in-memory credentials.");
}

if (extname(videoPath).toLowerCase() !== ".mp4") {
  throw new Error("The feasibility upload accepts exactly one MP4 file.");
}

const fileInfo = await stat(videoPath);
if (!fileInfo.isFile() || fileInfo.size === 0) {
  throw new Error("The selected MP4 is unavailable or empty.");
}

const hash = createHash("sha256");
for await (const chunk of createReadStream(videoPath)) hash.update(chunk);
const fileSha256 = hash.digest("hex");
const intentId = `youtube-private-${fileSha256.slice(0, 24)}`;
const title = `TEST PRIVATE - ANCV API - ${basename(videoPath, extname(videoPath))}`.slice(
  0,
  100,
);
const now = new Date().toISOString();
const firestoreBase = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const firestoreHeaders = {
  Authorization: `Bearer ${gcpAccessToken}`,
  "Content-Type": "application/json",
};

const stringValue = (value) => ({ stringValue: String(value) });
const integerValue = (value) => ({ integerValue: String(value) });
const booleanValue = (value) => ({ booleanValue: Boolean(value) });

const intentFields = {
  id: stringValue(intentId),
  platform: stringValue("youtube"),
  testType: stringValue("private_video_upload"),
  status: stringValue("upload_intent"),
  createdAt: stringValue(now),
  updatedAt: stringValue(now),
  createdBy: stringValue("nhat.ngtan@gmail.com"),
  testedAt: stringValue(now),
  testedBy: stringValue("nhat.ngtan@gmail.com"),
  expectedChannelId: stringValue(EXPECTED_CHANNEL_ID),
  privacyStatus: stringValue("private"),
  title: stringValue(title),
  fileName: stringValue(basename(videoPath)),
  fileSize: integerValue(fileInfo.size),
  fileSha256: stringValue(fileSha256),
  uploadAttempts: integerValue(1),
  retryPolicy: stringValue("none"),
};

const intentDocumentUrl = `${firestoreBase}/connectorTests/${intentId}`;
const existingIntent = await fetch(intentDocumentUrl, {
  headers: { Authorization: `Bearer ${gcpAccessToken}` },
});
if (existingIntent.ok) {
  throw new Error(
    `Duplicate protection stopped the upload: connectorTests/${intentId} already exists.`,
  );
}
if (existingIntent.status !== 404) {
  throw new Error(`Could not check upload intent (HTTP ${existingIntent.status}).`);
}

const createIntent = await fetch(
  `${firestoreBase}/connectorTests?documentId=${encodeURIComponent(intentId)}`,
  {
    method: "POST",
    headers: firestoreHeaders,
    body: JSON.stringify({ fields: intentFields }),
  },
);
if (!createIntent.ok) {
  throw new Error(`Could not persist upload intent (HTTP ${createIntent.status}).`);
}

const updateIntent = async (extraFields) => {
  const response = await fetch(intentDocumentUrl, {
    method: "PATCH",
    headers: firestoreHeaders,
    body: JSON.stringify({
      fields: {
        ...intentFields,
        ...extraFields,
        updatedAt: stringValue(new Date().toISOString()),
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`Could not update upload evidence (HTTP ${response.status}).`);
  }
};

let uploadPhase = "before_youtube_write";
try {
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
    throw new Error(`Refresh-token exchange failed (HTTP ${tokenResponse.status}).`);
  }

  const youtubeHeaders = { Authorization: `Bearer ${tokenBody.access_token}` };
  const channelResponse = await fetch(
    "https://youtube.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true",
    { headers: youtubeHeaders },
  );
  const channelBody = await channelResponse.json();
  const channel = Array.isArray(channelBody.items)
    ? channelBody.items.find((item) => item.id === EXPECTED_CHANNEL_ID)
    : null;
  if (!channelResponse.ok || !channel) {
    throw new Error("ACCOUNT/CHANNEL MISMATCH before upload; YouTube was not written.");
  }

  uploadPhase = "resumable_session_requested";
  const initiateResponse = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        ...youtubeHeaders,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Length": String(fileInfo.size),
        "X-Upload-Content-Type": "video/mp4",
      },
      body: JSON.stringify({
        snippet: {
          title,
          description:
            "TEST PRIVATE - YouTube API feasibility của QUẢN TRỊ MARKETING AI AGENT - ANCV. Không công khai.",
          categoryId: "22",
        },
        status: {
          privacyStatus: "private",
          selfDeclaredMadeForKids: false,
        },
      }),
      signal: AbortSignal.timeout(60_000),
    },
  );
  const uploadLocation = initiateResponse.headers.get("location");
  if (!initiateResponse.ok || !uploadLocation) {
    throw new Error(
      `YouTube resumable session failed (HTTP ${initiateResponse.status}).`,
    );
  }

  uploadPhase = "video_bytes_sent";
  const uploadResponse = await fetch(uploadLocation, {
    method: "PUT",
    headers: {
      "Content-Length": String(fileInfo.size),
      "Content-Type": "video/mp4",
    },
    body: createReadStream(videoPath),
    duplex: "half",
    signal: AbortSignal.timeout(30 * 60 * 1000),
  });
  const uploadedVideo = await uploadResponse.json();
  if (!uploadResponse.ok || !uploadedVideo.id) {
    throw new Error(`YouTube upload failed (HTTP ${uploadResponse.status}).`);
  }

  uploadPhase = "metadata_verification";
  const verifyResponse = await fetch(
    `https://youtube.googleapis.com/youtube/v3/videos?part=id,snippet,status&id=${encodeURIComponent(uploadedVideo.id)}`,
    { headers: youtubeHeaders },
  );
  const verifyBody = await verifyResponse.json();
  const verifiedVideo = Array.isArray(verifyBody.items)
    ? verifyBody.items.find((item) => item.id === uploadedVideo.id)
    : null;
  const verificationPassed =
    verifyResponse.ok &&
    verifiedVideo?.snippet?.channelId === EXPECTED_CHANNEL_ID &&
    verifiedVideo?.snippet?.title === title &&
    verifiedVideo?.status?.privacyStatus === "private";

  if (!verificationPassed) {
    await updateIntent({
      status: stringValue("manual_review"),
      videoId: stringValue(uploadedVideo.id),
      verificationPassed: booleanValue(false),
      uploadPhase: stringValue(uploadPhase),
    });
    throw new Error(
      `Video ${uploadedVideo.id} exists but strict PRIVATE metadata verification failed; no retry was attempted.`,
    );
  }

  await updateIntent({
    status: stringValue("available"),
    videoId: stringValue(uploadedVideo.id),
    actualChannelId: stringValue(verifiedVideo.snippet.channelId),
    actualPrivacyStatus: stringValue(verifiedVideo.status.privacyStatus),
    verificationPassed: booleanValue(true),
    uploadPhase: stringValue("completed"),
  });

  console.log(
    JSON.stringify(
      {
        result: "PASS",
        videoId: uploadedVideo.id,
        channelId: verifiedVideo.snippet.channelId,
        title: verifiedVideo.snippet.title,
        privacyStatus: verifiedVideo.status.privacyStatus,
        fileName: basename(videoPath),
        fileSize: fileInfo.size,
        uploadAttempts: 1,
        retried: false,
        evidenceDocument: `connectorTests/${intentId}`,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const uncertain = uploadPhase !== "before_youtube_write";
  try {
    await updateIntent({
      status: stringValue(uncertain ? "manual_review" : "error"),
      uploadPhase: stringValue(uploadPhase),
      error: stringValue(error instanceof Error ? error.message : "unknown_error"),
    });
  } catch {
    // Preserve the original failure; credentials and tokens are never logged.
  }
  throw error;
}
