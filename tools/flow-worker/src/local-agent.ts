import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { dirname } from "node:path";
import type {
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
import { persistLocalVideo } from "./local-storage.js";
import { findNewFlowOutputIds } from "./flow-ui.js";
import { processPlaywrightJob } from "./worker.js";

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

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

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
      const command = await this.nextLocalCommand();
      if (command) await this.processLocalCommand(command);
      const job = await this.nextFlowJob();
      if (job) await this.processFlowJob(job);
      if (!command && !job) await sleep(2_000);
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
        startedAt: now,
        updatedAt: now,
        workerInstanceId: this.config.agentId,
      });
      transaction.update(firestore.collection("scenes").doc(job.sceneId), {
        flowStatus: "processing",
        updatedAt: now,
      });
      return { ...job, status: "processing", startedAt: now, updatedAt: now };
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
    if (job.executionMode === "playwright_fallback") {
      await processPlaywrightJob(job);
      return;
    }
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
    let generateClicked = false;
    try {
      const mapping = await this.profiles.open(
        job.flowAccountId,
        job.flowProjectUrl,
      );
      await sleep(2_000);
      await this.bridge.sendCommand(
        job.flowAccountId,
        "prepare_flow",
        {},
        30_000,
      );
      const initialInspection = (await this.bridge.sendCommand(
        job.flowAccountId,
        "inspect_flow",
        {},
        30_000,
      )) as FlowInspection;
      const inspection =
        initialInspection.session === "ready"
          ? await this.waitForStableOutputInspection(
              job.flowAccountId,
              initialInspection,
            )
          : initialInspection;
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
      if (inspection.session === "needs_login") {
        await this.failFlowJob(
          job,
          "Google Flow yêu cầu đăng nhập thủ công.",
          "needs_login",
        );
        return;
      }
      if (inspection.session === "needs_verification") {
        await this.failFlowJob(
          job,
          "Google Flow yêu cầu xác minh thủ công.",
          "needs_verification",
        );
        return;
      }
      if (
        inspection.session !== "ready" ||
        !inspection.x1 ||
        !inspection.generate ||
        !inspection.prompt
      )
        throw new Error(inspection.limitation ?? "FLOW_PREFLIGHT_UNCERTAIN");
      const expectedProject =
        job.flowProjectUrl.match(/\/project\/([^/?#]+)/)?.[1];
      if (
        !expectedProject ||
        !inspection.url.includes(`/project/${expectedProject}`)
      )
        throw new Error("FLOW_PROJECT_MISMATCH");

      const filled = (await this.bridge.sendCommand(
        job.flowAccountId,
        "fill_prompt",
        { prompt: job.prompt },
        30_000,
      )) as { filled?: boolean };
      if (!filled.filled) throw new Error("FLOW_PROMPT_FILL_FAILED");
      const baselineIds = new Set(inspection.outputIds ?? []);
      const intentAt = new Date().toISOString();
      await firestore
        .collection("flowJobs")
        .doc(job.id)
        .update({
          generateIntentAt: intentAt,
          generateClicks: 0,
          baselineOutputIds: [...baselineIds],
          updatedAt: intentAt,
        });
      const clicked = (await this.bridge.sendCommand(
        job.flowAccountId,
        "click_generate",
        { baselineOutputIds: [...baselineIds] },
        30_000,
      )) as {
        clicked?: boolean;
        dispatched?: boolean;
        matches?: number;
        inputMethod?: string;
        acceptanceSignal?: boolean;
        generationRequestObserved?: boolean;
        responseStatus?: number | null;
        processingObserved?: boolean;
        debuggerDetached?: boolean;
      };
      generateClicked = Boolean(clicked.dispatched);
      if (generateClicked) {
        await firestore.collection("flowJobs").doc(job.id).update({
          generateClicks: 1,
          generateInputMethod: clicked.inputMethod ?? "cdp_mouse",
          generationAcceptanceSignal: Boolean(clicked.acceptanceSignal),
          generationRequestObserved: Boolean(clicked.generationRequestObserved),
          generationResponseStatus: clicked.responseStatus ?? null,
          processingObserved: Boolean(clicked.processingObserved),
          updatedAt: new Date().toISOString(),
        });
      }
      if (!clicked.clicked || !clicked.dispatched || clicked.matches !== 1)
        throw new Error(
          `FLOW_GENERATE_AMBIGUOUS matches=${clicked.matches ?? 0}`,
        );
      if (!clicked.debuggerDetached) throw new Error("FLOW_DEBUGGER_NOT_DETACHED");
      if (!clicked.acceptanceSignal)
        throw new Error("FLOW_GENERATE_NOT_ACCEPTED_NO_RETRY");

      const deadline = Date.now() + 15 * 60_000;
      let output: FlowInspection | null = null;
      let newOutputId: string | null = null;
      while (Date.now() < deadline) {
        await sleep(5_000);
        output = (await this.bridge.sendCommand(
          job.flowAccountId,
          "inspect_flow",
          {},
          30_000,
        )) as FlowInspection;
        const candidates = findNewFlowOutputIds([...baselineIds], output.outputIds ?? [], output.detailId);
        if (candidates.length === 1) { newOutputId = candidates[0]!; break; }
        if (candidates.length > 1) throw new Error(`FLOW_OUTPUT_AMBIGUOUS_NEW_IDS:${candidates.length}`);
        if (output.generationError) throw new Error('FLOW_GENERATION_FAILED_NO_RETRY');
      }
      if (!output || !newOutputId)
        throw new Error(output?.processing ? "FLOW_OUTPUT_STILL_PROCESSING_NO_RETRY" : "FLOW_OUTPUT_TIMEOUT_NO_RETRY");
      await firestore.collection("flowJobs").doc(job.id).update({ flowDetailId: newOutputId, updatedAt: new Date().toISOString() });
      const opened = (await this.bridge.sendCommand(
        job.flowAccountId,
        "open_output",
        { outputId: newOutputId },
        30_000,
      )) as { opened?: boolean };
      if (!opened.opened) throw new Error("FLOW_OUTPUT_OPEN_FAILED");
      await sleep(1_500);
      const download = (await this.bridge.sendCommand(
        job.flowAccountId,
        "download_latest",
        {},
        150_000,
      )) as { filename?: string; bytesReceived?: number };
      if (!download.filename || Number(download.bytesReceived ?? 0) < 1_024)
        throw new Error("FLOW_DOWNLOAD_INVALID");
      const asset = await persistLocalVideo(job, download.filename);
      console.log(
        JSON.stringify({
          event: "local_agent_flow_succeeded",
          jobId: job.id,
          assetId: asset.id,
          storageType: "local",
          relativePath: asset.relativePath,
          generateClicks: 1,
        }),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      await this.failFlowJob(
        job,
        `Local Agent dừng an toàn: ${detail}${generateClicked ? "; Generate đã xảy ra, không retry." : ""}`,
      );
      console.log(
        JSON.stringify({
          event: "local_agent_flow_stopped",
          jobId: job.id,
          generateClicked,
          error: detail,
        }),
      );
    }
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
