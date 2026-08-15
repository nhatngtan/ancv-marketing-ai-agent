import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type {
  BrowserPlatform,
  BrowserPlatformStatus,
  BrowserProfileMapping,
  BrowserProfileStatus,
  FlowAccountRecord,
  FlowJobRecord,
  LocalCommandRecord,
} from "@ancv/shared";
import { firestore } from "./firebase.js";
import {
  ensureLocalDirectories,
  loadLocalAgentConfig,
  pathInsideWorkspace,
} from "./config.js";
import { BridgeServer } from "./bridge-server.js";
import { ChromeProfileManager } from "./profile-manager.js";
import { processPlaywrightJob } from "./worker.js";
import { assertFlowRuntimeSnapshot } from "./flow-runtime.js";
import { scanChromeProfiles } from "./chrome-profile-scanner.js";

interface FlowInspection {
  url: string;
  session: "ready" | "needs_login" | "needs_verification" | "unavailable";
  prompt?: boolean;
  video?: boolean;
  generate?: boolean;
  x1?: boolean;
  outputCount?: number;
  outputIds?: string[];
  detailId?: string | null;
  view?: 'project' | 'detail';
  processing?: boolean;
  generationError?: boolean;
  emptyState?: boolean;
  email?: string | null;
  limitation?: string | null;
}

interface SocialInspection {
  platform: BrowserPlatform;
  session: "ready" | "needs_login" | "needs_verification";
  account?: string | null;
  entity?: string | null;
  composer?: boolean;
  media?: boolean;
  publish?: boolean;
  privacy?: boolean;
}

const socialUrls: Record<Exclude<BrowserPlatform, "google_flow">, string> = {
  facebook: "https://www.facebook.com/",
  tiktok: "https://www.tiktok.com/upload",
  linkedin: "https://www.linkedin.com/feed/",
  zalo: "https://oa.zalo.me/manage/oa",
};

const sleep = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export function safeIterationErrorCode(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  const code = value.match(/^[A-Z][A-Z0-9_:-]{2,80}/)?.[0];
  return code ?? (error instanceof Error ? error.name : "UNKNOWN_ERROR");
}

export async function runAgentIteration(
  iteration: () => Promise<void>,
  onError: (errorCode: string) => Promise<void>,
  backoff: () => Promise<void> = () => sleep(2_000),
): Promise<boolean> {
  try {
    await iteration();
    return true;
  } catch (error) {
    await onError(safeIterationErrorCode(error)).catch(() => undefined);
    await backoff();
    return false;
  }
}

function outputSignature(inspection: FlowInspection): string {
  return [...new Set(inspection.outputIds ?? [])].sort().join("|");
}

export class LocalAgent {
  private readonly config = loadLocalAgentConfig();
  private readonly bridge = new BridgeServer(this.config);
  private readonly profiles = new ChromeProfileManager(
    this.config,
    this.bridge,
  );
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private stopped = false;

  async startBridge(): Promise<void> {
    ensureLocalDirectories();
    await this.bridge.start();
  }

  async start(): Promise<void> {
    await this.startBridge();
    await this.markInterruptedJobs();
    await this.heartbeat("starting");
    this.heartbeatTimer = setInterval(
      () => this.heartbeat("online").catch(() => undefined),
      15_000,
    );
    await this.heartbeat("online");
    console.log(
      JSON.stringify({
        event: "local_agent_ready",
        agentId: this.config.agentId,
        machineName: this.config.machineName,
        bridge: `${this.config.bridgeHost}:${this.config.bridgePort}`,
        storage: "local_first",
      }),
    );
    while (!this.stopped) {
      await runAgentIteration(async () => {
        const command = await this.nextLocalCommand();
        if (command) await this.processLocalCommand(command);
        const job = await this.nextFlowJob();
        if (job) await this.processFlowJob(job);
        if (!command && !job) await sleep(2_000);
      }, async (errorCode) => {
        console.log(JSON.stringify({ event: "local_agent_iteration_error", errorCode }));
        await this.heartbeat("error", "Lỗi tạm thời; Local Agent sẽ tiếp tục.").catch(() => undefined);
        await this.markInterruptedJobs().catch(() => undefined);
      });
    }
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    await this.heartbeat("offline").catch(() => undefined);
    await this.profiles.close();
    await this.bridge.close();
  }

  async preflight(accountId: string): Promise<FlowInspection> {
    const account = (
      await firestore.collection("flowAccounts").doc(accountId).get()
    ).data() as FlowAccountRecord | undefined;
    if (!account?.projectUrl) throw new Error("FLOW_PROJECT_URL_REQUIRED");
    const mapping = await this.profiles.open(accountId, account.projectUrl);
    await sleep(2_000);
    await this.bridge.sendCommand(accountId, "prepare_flow", {}, 30_000);
    await sleep(1_000);
    const inspection = (await this.bridge.sendCommand(
      accountId,
      "inspect_flow",
      {},
      30_000,
    )) as FlowInspection;
    const expected = (
      mapping.expectedAccount ??
      account.email ??
      ""
    ).toLowerCase();
    const actual = inspection.email?.toLowerCase() ?? null;
    if (expected && actual && expected !== actual)
      throw new Error(
        `FLOW_ACCOUNT_MISMATCH expected=${expected} actual=${actual}`,
      );
    if (inspection.session !== "ready" || !inspection.x1)
      throw new Error(
        inspection.limitation ?? `FLOW_PREFLIGHT_${inspection.session}`,
      );
    await firestore.collection("flowAccounts").doc(accountId).set(
      {
        status: "ready",
        lastCheckedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        limitation: null,
        transport: "ancv_browser_bridge_loopback",
        logicalProfileId: accountId,
      },
      { merge: true },
    );
    console.log(
      JSON.stringify({
        event: "local_agent_flow_preflight",
        accountId,
        session: inspection.session,
        prompt: inspection.prompt,
        video: inspection.video,
        generate: inspection.generate,
        x1: inspection.x1,
        outputCount: inspection.outputCount,
        email: actual,
        bridge: "connected",
      }),
    );
    return inspection;
  }

  private async waitForStableOutputInspection(
    accountId: string,
    initial?: FlowInspection,
  ): Promise<FlowInspection> {
    const startedAt = Date.now();
    const minimumObservationMs = 8_000;
    const deadline = startedAt + 20_000;
    let inspection =
      initial ??
      ((await this.bridge.sendCommand(
        accountId,
        "inspect_flow",
        {},
        30_000,
      )) as FlowInspection);
    let signature = outputSignature(inspection);
    let stableSamples = 1;

    while (Date.now() < deadline) {
      await sleep(2_000);
      const next = (await this.bridge.sendCommand(
        accountId,
        "inspect_flow",
        {},
        30_000,
      )) as FlowInspection;
      const nextSignature = outputSignature(next);
      stableSamples = nextSignature === signature ? stableSamples + 1 : 1;
      signature = nextSignature;
      inspection = next;
      if (
        Date.now() - startedAt >= minimumObservationMs &&
        stableSamples >= 3 &&
        ((inspection.outputIds?.length ?? 0) > 0 || inspection.emptyState)
      )
        return inspection;
    }

    throw new Error("FLOW_OUTPUT_BASELINE_UNSTABLE");
  }

  async diagnose(accountId: string): Promise<unknown> {
    const account = (
      await firestore.collection("flowAccounts").doc(accountId).get()
    ).data() as FlowAccountRecord | undefined;
    if (!account?.projectUrl) throw new Error("FLOW_PROJECT_URL_REQUIRED");
    await this.profiles.open(accountId, account.projectUrl);
    await sleep(2_000);
    const initial = (await this.bridge.sendCommand(
      accountId,
      "inspect_flow",
      {},
      30_000,
    )) as FlowInspection;
    const inspection =
      initial.session === "ready"
        ? await this.waitForStableOutputInspection(accountId, initial)
        : initial;
    const diagnostic = await this.bridge.sendCommand(
      accountId,
      "diagnose_flow",
      {},
      30_000,
    );
    console.log(
      JSON.stringify({
        event: "local_agent_flow_diagnostic",
        accountId,
        inspection,
        diagnostic,
      }),
    );
    return { inspection, diagnostic };
  }

  private async heartbeat(
    status: "starting" | "online" | "offline" | "error",
    limitation: string | null = null,
  ): Promise<void> {
    const now = new Date().toISOString();
    const ref = firestore.collection("localAgents").doc(this.config.agentId);
    const existing = await ref.get();
    await ref.set(
      {
        id: this.config.agentId,
        machineName: this.config.machineName,
        status,
        lastSeen: now,
        bridgeStatus:
          this.profiles.currentProfileId() &&
          this.bridge.isConnected(this.profiles.currentProfileId()!)
            ? "connected"
            : "disconnected",
        currentProfileId: this.profiles.currentProfileId(),
        workspaceAvailable: await stat(this.config.workspaceRoot)
          .then((value) => value.isDirectory())
          .catch(() => false),
        version: "0.1.0",
        limitation,
        createdAt: existing.data()?.createdAt ?? now,
        updatedAt: now,
        createdBy: existing.data()?.createdBy ?? "ancv-local-agent",
      },
      { merge: true },
    );
  }

  private async markInterruptedJobs(): Promise<void> {
    const snapshot = await firestore
      .collection("flowJobs")
      .where("status", "==", "processing")
      .get();
    const jobs = snapshot.docs.filter(
      (document) =>
        ["local_agent", "playwright_fallback"].includes(
          (document.data() as FlowJobRecord).executionMode ?? "",
        ),
    );
    if (!jobs.length) return;
    const now = new Date().toISOString();
    const batch = firestore.batch();
    jobs.forEach((document) => {
      const job = document.data() as FlowJobRecord;
      batch.update(document.ref, {
        status: "needs_manual",
        stage: "needs_manual",
        error: "Local Agent restart khi job đang xử lý; không tự Generate lại.",
        updatedAt: now,
      });
      batch.update(firestore.collection("scenes").doc(job.sceneId), {
        flowStatus: "needs_manual",
        updatedAt: now,
      });
    });
    await batch.commit();
  }

  private async nextFlowJob(): Promise<FlowJobRecord | null> {
    const snapshot = await firestore
      .collection("flowJobs")
      .where("status", "==", "queued")
      .get();
    const candidate = snapshot.docs
      .map((document) => document.data() as FlowJobRecord)
      .filter((job) =>
        ["local_agent", "playwright_fallback"].includes(
          job.executionMode ?? "",
        ),
      )
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (!candidate) return null;
    const ref = firestore.collection("flowJobs").doc(candidate.id);
    return firestore.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      const job = current.data() as FlowJobRecord | undefined;
      if (
        !job ||
        job.status !== "queued" ||
        !["local_agent", "playwright_fallback"].includes(
          job.executionMode ?? "",
        )
      )
        return null;
      const now = new Date().toISOString();
      transaction.update(ref, {
        status: "processing",
        stage: "opening_flow",
        startedAt: now,
        updatedAt: now,
        workerInstanceId: this.config.agentId,
      });
      transaction.update(firestore.collection("scenes").doc(job.sceneId), {
        flowStatus: "processing",
        updatedAt: now,
      });
      return { ...job, status: "processing", stage: "opening_flow", startedAt: now, updatedAt: now };
    });
  }

  private async failFlowJob(
    job: FlowJobRecord,
    error: string,
    accountStatus?: FlowAccountRecord["status"],
  ): Promise<void> {
    const now = new Date().toISOString();
    const batch = firestore.batch();
    batch.update(firestore.collection("flowJobs").doc(job.id), {
      status: "needs_manual",
      stage: "needs_manual",
      error: error.slice(0, 500),
      updatedAt: now,
    });
    batch.update(firestore.collection("scenes").doc(job.sceneId), {
      flowStatus: "needs_manual",
      updatedAt: now,
    });
    if (accountStatus)
      batch.update(
        firestore.collection("flowAccounts").doc(job.flowAccountId),
        {
          status: accountStatus,
          limitation: error.slice(0, 500),
          updatedAt: now,
          lastCheckedAt: now,
        },
      );
    await batch.commit();
  }

  private async processFlowJob(job: FlowJobRecord): Promise<void> {
    const account = (
      await firestore.collection("flowAccounts").doc(job.flowAccountId).get()
    ).data() as FlowAccountRecord | undefined;
    if (!account || account.status !== "ready") {
      await this.failFlowJob(
        job,
        "Tài khoản Flow chưa sẵn sàng.",
        account?.status ?? "needs_login",
      );
      return;
    }
    try {
      assertFlowRuntimeSnapshot(job, account, this.profiles.mapping(job.flowAccountId));
    } catch (error) {
      await this.failFlowJob(job, error instanceof Error ? error.message : "FLOW_RUNTIME_MAPPING_INVALID", "unavailable");
      return;
    }
    if (job.executionMode === "playwright_fallback") {
      await processPlaywrightJob(job);
      return;
    }
    await this.failFlowJob(job, "FLOW_LEGACY_EXECUTION_MODE_DISABLED");
  }

  private async nextLocalCommand(): Promise<LocalCommandRecord | null> {
    const snapshot = await firestore
      .collection("localCommands")
      .where("status", "==", "queued")
      .get();
    const candidate = snapshot.docs
      .map((document) => document.data() as LocalCommandRecord)
      .filter((command) => command.agentId === this.config.agentId)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt))[0];
    if (!candidate) return null;
    const ref = firestore.collection("localCommands").doc(candidate.id);
    return firestore.runTransaction(async (transaction) => {
      const current = await transaction.get(ref);
      const command = current.data() as LocalCommandRecord | undefined;
      if (!command || command.status !== "queued") return null;
      const now = new Date().toISOString();
      transaction.update(ref, { status: "processing", updatedAt: now });
      return { ...command, status: "processing", updatedAt: now };
    });
  }

  private async processLocalCommand(
    command: LocalCommandRecord,
  ): Promise<void> {
    const ref = firestore.collection("localCommands").doc(command.id);
    try {
      if (command.command === "scan_profiles") {
        const profiles = await scanChromeProfiles();
        const settingsRef = firestore.collection("systemSettings").doc("browserProfiles");
        const existing = await settingsRef.get();
        const now = new Date().toISOString();
        const currentMappings = existing.data()?.mappings ?? {};
        const flowLocalMapping = this.config.profiles.find((item) => item.logicalId === "account-01" && item.kind === "system");
        let mappings = currentMappings;
        if (!currentMappings.google_flow && flowLocalMapping?.profileDirectory) {
          const metadata = profiles.find((item) => item.chromeProfileId === flowLocalMapping.profileDirectory);
          if (metadata) mappings = {
            ...currentMappings,
            google_flow: {
              platform: "google_flow",
              machineId: this.config.agentId,
              chromeProfileId: metadata.chromeProfileId,
              profileLabel: metadata.profileLabel,
              updatedAt: now,
              updatedBy: "ancv-local-agent-migration",
            },
          };
        }
        await settingsRef.set({
          id: "browserProfiles", status: "active", machineId: this.config.agentId,
          profiles, mappings, lastScanAt: now, updatedAt: now,
          createdAt: existing.data()?.createdAt ?? now,
          createdBy: existing.data()?.createdBy ?? "ancv-local-agent",
        }, { merge: true });
        await ref.update({ status: "succeeded", completedAt: now, updatedAt: now, error: null, result: { profileCount: profiles.length } });
        return;
      }

      if (command.command === "validate_profile") {
        await this.validateBrowserProfile(command);
        const now = new Date().toISOString();
        await ref.update({ status: "succeeded", completedAt: now, updatedAt: now, error: null });
        return;
      }

      if (!command.relativePath) throw new Error("LOCAL_PATH_REQUIRED");
      const target = pathInsideWorkspace(this.config, command.relativePath);
      if (command.command === "open_folder")
        await mkdir(target, { recursive: true });
      const info = await stat(target);
      const folder = info.isDirectory() ? target : dirname(target);
      const child = spawn("explorer.exe", [folder], {
        detached: true,
        stdio: "ignore",
        windowsHide: false,
      });
      child.unref();
      const now = new Date().toISOString();
      await ref.update({
        status: "succeeded",
        completedAt: now,
        updatedAt: now,
        error: null,
      });
    } catch (error) {
      const now = new Date().toISOString();
      if (command.command === "validate_profile" && command.platform) {
        const message = error instanceof Error ? error.message : String(error);
        const profileStatus: BrowserProfileStatus = /BRIDGE/.test(message) ? "bridge_required" : "unavailable";
        await firestore.collection("systemSettings").doc("browserProfiles").update({
          [`validations.${command.platform}`]: {
            profileStatus, platformStatus: "unavailable", validatedAt: now,
            chromeProfileId: command.chromeProfileId ?? "", detail: message.slice(0, 300),
          },
          updatedAt: now,
        }).catch(() => undefined);
      }
      await ref.update({
        status: "needs_manual",
        error: (error instanceof Error ? error.message : String(error)).slice(
          0,
          500,
        ),
        updatedAt: now,
      });
    }
  }

  private async validateBrowserProfile(command: LocalCommandRecord): Promise<void> {
    if (!command.platform || !command.chromeProfileId) throw new Error("PROFILE_VALIDATION_INPUT_REQUIRED");
    const settingsRef = firestore.collection("systemSettings").doc("browserProfiles");
    const settings = await settingsRef.get();
    const mapping = settings.data()?.mappings?.[command.platform] as BrowserProfileMapping | undefined;
    if (!mapping || mapping.chromeProfileId !== command.chromeProfileId) throw new Error("PROFILE_MAPPING_CHANGED");
    const now = new Date().toISOString();
    if (command.platform === "google_flow") {
      await settingsRef.update({ validations: {
        ...(settings.data()?.validations ?? {}),
        google_flow: { profileStatus: "unavailable", platformStatus: "unavailable", validatedAt: now, chromeProfileId: command.chromeProfileId, detail: "Google Flow chỉ dùng ANCV managed profile; System Chrome profile bị từ chối.", detectedAccount: null },
      }, updatedAt: now });
      throw new Error("FLOW_SYSTEM_PROFILE_NOT_ALLOWED_USE_MANAGED_PREFLIGHT");
    }
    const logicalId = `profile-${command.platform}`;
    await this.profiles.openSystemProfile(logicalId, command.chromeProfileId, socialUrls[command.platform]);
    await sleep(3_000);
    const inspection = await this.bridge.sendCommand(logicalId, "inspect_social", { platform: command.platform }, 30_000) as SocialInspection;
    const profileStatus: BrowserProfileStatus = inspection.session === "ready" ? "ready" : inspection.session === "needs_login" ? "login_required" : "unavailable";
    const controlsReady = Boolean(inspection.composer && inspection.media && inspection.publish && (command.platform !== "tiktok" || inspection.privacy));
    const identityReady = command.platform === "facebook" || command.platform === "linkedin" || command.platform === "zalo" ? Boolean(inspection.entity) : Boolean(inspection.account);
    const platformStatus: BrowserPlatformStatus = inspection.session === "needs_verification" ? "verification_required"
      : inspection.session === "needs_login" ? "login_required"
      : controlsReady && identityReady ? "ready_for_write_test"
      : "verification_required";
    const missing = [!inspection.composer && "composer", !inspection.media && "media", !inspection.publish && "publish", command.platform === "tiktok" && !inspection.privacy && "privacy", !identityReady && "account/page"].filter(Boolean).join(", ");
    await settingsRef.update({ validations: {
      ...(settings.data()?.validations ?? {}),
      [command.platform]: {
        profileStatus, platformStatus, validatedAt: now, chromeProfileId: command.chromeProfileId,
        detail: missing ? `Chưa xác minh: ${missing}` : null,
        detectedAccount: inspection.account ?? null, detectedEntity: inspection.entity ?? null,
      },
    }, updatedAt: now });
  }
}

export async function runLocalAgent(): Promise<void> {
  const agent = new LocalAgent();
  const stop = () => agent.stop().finally(() => process.exit(0));
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await agent.start();
}

export async function preflightLocalAgent(accountId: string): Promise<void> {
  const agent = new LocalAgent();
  try {
    await agent.startBridge();
    await agent.preflight(accountId);
  } finally {
    await agent.stop();
  }
}

export async function diagnoseLocalAgent(accountId: string): Promise<void> {
  const agent = new LocalAgent();
  try {
    await agent.startBridge();
    await agent.diagnose(accountId);
  } finally {
    await agent.stop();
  }
}
