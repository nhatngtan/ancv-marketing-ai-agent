// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ContentRecord, FlowJobRecord, MediaAssetRecord, SceneRecord } from "@ancv/shared";
import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixtures = vi.hoisted(() => {
  const now = "2026-08-14T09:48:46.000Z";
  return {
    scene: {
      id: "uatP44FlowScene20260814",
      contentDocId: "uatFlowP44Content20260814",
      sceneNumber: 1,
      title: "ANCV Flow E2E",
      durationEstimate: 8,
      narration: "",
      visualDescription: "Nhân viên bảo vệ tại sảnh văn phòng.",
      cameraDirection: "Slow push-in",
      environment: "Modern office",
      characters: [],
      continuityNotes: "",
      generationPrompt: "ANCV UAT Profile 44",
      status: "used",
      flowStatus: "succeeded",
      lastFlowAssetId: "flow-uatP44FlowScene20260814",
      createdAt: now,
      updatedAt: now,
      createdBy: "uat",
    } satisfies SceneRecord,
    asset: {
      id: "flow-uatP44FlowScene20260814",
      contentDocId: "uatFlowP44Content20260814",
      contentId: "ANCV-VID-2026-UAT-P44",
      kind: "scene_take",
      storageType: "local",
      relativePath:
        "Projects/ANCV-VID-2026-UAT-P44/Video Raw/Scene-01/ANCV-VID-2026-UAT-P44_S01_T01.mp4",
      fileName: "ANCV-VID-2026-UAT-P44_S01_T01.mp4",
      contentType: "video/mp4",
      sizeBytes: 2_448_157,
      sceneId: "uatP44FlowScene20260814",
      takeNumber: 1,
      selected: false,
      source: "google_flow",
      flowAccountId: "account-01",
      flowJobId: "uatP44FlowScene20260814",
      outputId: "b6b485f2-7377-4d03-aaea-b7f4ed83e666",
      status: "ready",
      createdAt: now,
      updatedAt: now,
      createdBy: "local-agent:account-01",
    } satisfies MediaAssetRecord,
  };
});

vi.mock("./lib/repository", () => {
  const action = vi.fn(async () => undefined);
  return {
    approveContent: action,
    approvePlatformCopy: action,
    breakdownScenes: action,
    createFlowJob: action,
    createScene: action,
    deleteScene: action,
    downloadSceneList: action,
    duplicateScene: action,
    generateArticle: action,
    generateArticleImage: action,
    generatePlatformCopy: action,
    markManualPublished: action,
    markReady: action,
    openSceneFolder: action,
    openVideoFolder: action,
    regeneratePrompt: action,
    regenerateScene: action,
    reorderScenes: action,
    savePlatformCopy: action,
    saveScene: action,
    selectAsset: action,
    setContentStatus: action,
    updateContent: action,
    uploadMedia: action,
    subscribeScenes: (_contentId: string, callback: (items: SceneRecord[]) => void) => {
      callback([fixtures.scene]);
      return () => undefined;
    },
    subscribeAssets: (_contentId: string, callback: (items: MediaAssetRecord[]) => void) => {
      callback([fixtures.asset]);
      return () => undefined;
    },
    subscribeFlowAccounts: (callback: (items: unknown[]) => void) => {
      callback([]);
      return () => undefined;
    },
    subscribeFlowJobs: (_contentId: string, callback: (items: unknown[]) => void) => {
      callback([]);
      return () => undefined;
    },
  };
});

import { ContentStudioPage } from "./components/ContentStudio";
import { flowErrorMessage, flowProgressLabel } from "./lib/flow-status";

describe("Video Raw local-first UAT", () => {
  it("shows safe Vietnamese progress and error states without technical details", () => {
    expect(flowProgressLabel({ status: "processing", stage: "filling_prompt" } as FlowJobRecord)).toBe("Đang nhập Prompt…");
    expect(flowErrorMessage("FLOW_CDP_START_TIMEOUT_CLOSE_LOGIN_CHROME")).toBe("Không thể kết nối máy xử lý.");
    expect(flowErrorMessage("FLOW_ACCOUNT_MISMATCH expected=a actual=b")).toBe("Sai tài khoản Google Flow.");
  });

  it("shows the recovered Google Flow asset on its Scene", async () => {
    const now = "2026-08-14T09:48:46.000Z";
    const content = {
      id: "uatFlowP44Content20260814",
      contentId: "ANCV-VID-2026-UAT-P44",
      type: "video",
      title: "ANCV PHASE 3 FLOW E2E",
      topic: "ANCV PHASE 3 FLOW E2E",
      body: "",
      masterScript: "UAT one Scene",
      platforms: [],
      testContent: true,
      status: "test",
      createdAt: now,
      updatedAt: now,
      createdBy: "uat",
    } satisfies ContentRecord;

    render(
      <ContentStudioPage
        type="video"
        contents={[content]}
        localAgents={[]}
        openContentId={null}
        onOpened={vi.fn()}
        onCreate={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /ANCV PHASE 3 FLOW E2E/ }));
    const studio = screen.getByRole("dialog", { name: "ANCV PHASE 3 FLOW E2E" });
    expect(studio.classList.contains("video-studio-modal")).toBe(true);
    expect(screen.getByRole("button", { name: /Kịch bản/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Tạo video/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Hoàn tất/ })).toBeTruthy();
    expect(screen.getByText("Cài đặt nâng cao").closest("details")?.hasAttribute("open")).toBe(false);
    const css = readFileSync(resolve(process.cwd(), "src/ancv-brand.css"), "utf8");
    expect(css).toContain("width: 90vw");
    expect(css).toContain("max-width: 1400px");
    expect(css).toContain("height: 90vh");
    expect(css).toContain("width: calc(100vw - 16px)");
    fireEvent.click(screen.getByRole("button", { name: /Tạo video/ }));

    expect(await screen.findByText("Scene 01 — Take 01")).toBeTruthy();
    expect(screen.getByText("ANCV-VID-2026-UAT-P44_S01_T01.mp4")).toBeTruthy();
    expect(screen.getByText("Lưu trên máy")).toBeTruthy();
  });
});
