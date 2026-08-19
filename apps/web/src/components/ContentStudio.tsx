/* eslint-disable react-hooks/set-state-in-effect -- Firestore snapshots intentionally refresh editor drafts. */
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  FileImage,
  FolderOpen,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Upload,
  Video,
  X,
} from "lucide-react";
import { evaluateArticleSeo, type ArticleSeoData } from "@ancv/shared";
import type {
  CharacterReference,
  ContentRecord,
  ContentType,
  FlowAccountRecord,
  FlowJobRecord,
  LocalAgentRecord,
  MediaAssetRecord,
  Platform,
  PlatformCopy,
  SceneRecord,
} from "@ancv/shared";
import { Badge } from "./Badge";
import { EmptyState } from "./EmptyState";
import {
  approveContent,
  approvePlatformCopy,
  breakdownScenes,
  createFlowJob,
  createScene,
  deleteScene,
  downloadSceneList,
  duplicateScene,
  generateArticle,
  generateArticleImage,
  generateArticleSocialCopies,
  generatePlatformCopy,
  generateVideoPlatformCopies,
  markManualPublished,
  markReady,
  regeneratePrompt,
  regenerateScene,
  reorderScenes,
  savePlatformCopy,
  saveAssetMetadata,
  saveScene,
  selectAsset,
  subscribeAssets,
  subscribeFlowAccounts,
  subscribeFlowJobs,
  subscribeScenes,
  openSceneFolder,
  openVideoFolder,
  openMediaAsset,
  publishWordPress,
  publishYouTube,
  registerVideoFinal,
  setContentStatus,
  updateContent,
  uploadMedia,
} from "../lib/repository";
import { prepareSocialHandoff } from "../lib/social-handoff";
import { flowErrorMessage, flowProgressLabel } from "../lib/flow-status";
import { articleSaveStateLabel, shouldConfirmArticleRegeneration } from "../lib/article-seo";

function AdvancedSection({
  label,
  children,
  className = "",
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <details className={`advanced-section ${className}`}>
      <summary>
        <span>{label}</span>
        <ChevronDown size={16} />
      </summary>
      <div className="advanced-section-body">{children}</div>
    </details>
  );
}

function SegmentedControl<T extends string | number>({
  value,
  options,
  onChange,
  label,
  disabled = false,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <div className="composer-control">
      <span>{label}</span>
      <div className="segmented-control" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            type="button"
            key={String(option.value)}
            className={value === option.value ? "active" : ""}
            aria-pressed={value === option.value}
            disabled={disabled}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function PublishActionModal({
  label,
  busy,
  onClose,
  onSubmit,
}: {
  label: string;
  busy: boolean;
  onClose: () => void;
  onSubmit: (mode: "now" | "schedule", scheduledAt?: string) => void;
}) {
  const [mode, setMode] = useState<"now" | "schedule">("now");
  const [dateTime, setDateTime] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "schedule" && !dateTime) return;
    const scheduledAt = mode === "schedule" ? new Date(dateTime).toISOString() : undefined;
    const message = mode === "schedule" ? `Xác nhận lên lịch ${label}?` : `Xác nhận đăng ${label} ngay?`;
    if (!window.confirm(message)) return;
    onSubmit(mode, scheduledAt);
  };
  return <div className="modal-wrap"><button className="modal-scrim" onClick={onClose}/><form className="modal publish-choice-modal" onSubmit={submit}>
    <div className="modal-head"><div><span className="eyebrow">{label.toUpperCase()}</span><h2>Đăng / Lên lịch</h2></div><button type="button" onClick={onClose}><X/></button></div>
    <fieldset><legend>Chọn thời điểm</legend><div className="publish-choice-options">
      <label><input type="radio" name={`${label}-mode`} checked={mode === "now"} onChange={() => setMode("now")}/> Đăng ngay</label>
      <label><input type="radio" name={`${label}-mode`} checked={mode === "schedule"} onChange={() => setMode("schedule")}/> Lên lịch</label>
    </div></fieldset>
    {mode === "schedule" && <label>Ngày và giờ<input type="datetime-local" required value={dateTime} onChange={(event) => setDateTime(event.target.value)}/></label>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Hủy</button><button className="primary" disabled={busy}><CalendarClock size={15}/>{mode === "schedule" ? "Xác nhận lên lịch" : "Xác nhận đăng"}</button></div>
  </form></div>;
}

const platformLabels: Record<string, string> = {
  youtube: "YouTube",
  tiktok: "TikTok",
  facebook: "Facebook",
  zalo: "Zalo",
  linkedin: "LinkedIn",
  website: "Website",
};
const statusLabels: Record<string, string> = {
  idea: "Ý tưởng",
  draft: "Bản nháp",
  generating: "Đang tạo Content",
  in_production: "Đang sản xuất",
  post_production: "Chờ hậu kỳ",
  awaiting_copy: "Chờ tạo mô tả",
  review: "Chờ duyệt",
  approved: "Đã duyệt",
  ready_to_publish: "Sẵn sàng đăng",
  scheduled: "Đã lên lịch",
  published: "Đã đăng",
  partially_published: "Đã đăng một phần",
  archived: "Lưu trữ",
  test: "TEST",
};
const flowAccountStatusLabels: Record<string, string> = {
  ready: "Sẵn sàng",
  needs_login: "Cần đăng nhập",
  needs_verification: "Cần xác minh",
  unavailable: "Không khả dụng",
};
function flowAccountLabel(item: FlowAccountRecord) {
  return item.email && !item.label.includes(item.email)
    ? `${item.label} — ${item.email}`
    : item.label;
}

export function ContentStudioPage({
  type,
  contents,
  localAgents,
  openContentId,
  onOpened,
  onCreate,
  onToast,
}: {
  type: ContentType;
  contents: ContentRecord[];
  localAgents: LocalAgentRecord[];
  openContentId: string | null;
  onOpened: () => void;
  onCreate: () => void;
  onToast: (text: string) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => {
    if (openContentId && contents.some((item) => item.id === openContentId)) {
      setSelectedId(openContentId);
      onOpened();
    }
  }, [contents, onOpened, openContentId]);
  const selected = contents.find((item) => item.id === selectedId) ?? null;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            {type === "video"
              ? "VIDEO CONTENT STUDIO"
              : "ARTICLE CONTENT STUDIO"}
          </span>
          <h1>{type === "video" ? "Content Video" : "Content Bài viết"}</h1>
          <p>
            {type === "video"
              ? "MASTER SCRIPT → Scene → Prompt Google Flow → Video Raw → CapCut → Video Final → Social Copy."
              : "Chủ đề → Article Draft → Hình AI → phiên bản nền tảng → duyệt → sẵn sàng đăng."}
          </p>
        </div>
        <button className="primary" onClick={onCreate}>
          <Plus size={18} />
          Tạo {type === "video" ? "Video" : "Bài viết"}
        </button>
      </div>
      <section className="panel table-panel">
        {contents.length === 0 ? (
          <EmptyState text="Chưa có Content trong nhóm này." />
        ) : (
          <div className="data-table">
            <div className="table-header">
              <span>Content</span>
              <span>Trạng thái</span>
              <span>Nền tảng</span>
              <span>Cập nhật</span>
            </div>
            {contents.map((item) => (
              <button
                className="table-row"
                key={item.id}
                onClick={() => setSelectedId(item.id)}
              >
                <span>
                  <strong>{item.title}</strong>
                  <small>
                    {item.contentId}
                    {item.testContent ? " · TEST" : ""}
                  </small>
                </span>
                <span>
                  <Badge
                    tone={
                      item.status === "ready_to_publish" ||
                      item.status === "published"
                        ? "success"
                        : "info"
                    }
                  >
                    {statusLabels[item.status] ?? item.status}
                  </Badge>
                </span>
                <span className="platform-stack">
                  {(item.platforms ?? []).map((platform) => (
                    <i key={platform.platform}>
                      {platformLabels[platform.platform]?.[0]}
                    </i>
                  ))}
                </span>
                <span>{formatDate(item.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </section>
      {selected && (
        <StudioDrawer
          key={selected.id}
          content={selected}
          localAgents={localAgents}
          onClose={() => setSelectedId(null)}
          onToast={onToast}
        />
      )}
    </>
  );
}

function formatDate(value: unknown) {
  if (value && typeof value === "object" && "toDate" in value)
    return (value as { toDate: () => Date })
      .toDate()
      .toLocaleDateString("vi-VN");
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("vi-VN");
}

function StudioDrawer({
  content,
  localAgents,
  onClose,
  onToast,
}: {
  content: ContentRecord;
  localAgents: LocalAgentRecord[];
  onClose: () => void;
  onToast: (text: string) => void;
}) {
  const [tab, setTab] = useState<"script" | "generate" | "complete" | "editor" | "media" | "copies">(
    content.type === "video" ? "script" : "editor",
  );
  const [scenes, setScenes] = useState<SceneRecord[]>([]);
  const [assets, setAssets] = useState<MediaAssetRecord[]>([]);
  const [flowAccounts, setFlowAccounts] = useState<FlowAccountRecord[]>([]);
  const [flowJobs, setFlowJobs] = useState<FlowJobRecord[]>([]);
  const [busy, setBusy] = useState("");
  useEffect(() => subscribeScenes(content.id, setScenes), [content.id]);
  useEffect(() => subscribeAssets(content.id, setAssets), [content.id]);
  useEffect(() => subscribeFlowAccounts(setFlowAccounts), []);
  useEffect(() => subscribeFlowJobs(content.id, setFlowJobs), [content.id]);
  const act = async (
    key: string,
    action: () => Promise<unknown>,
    done: string,
  ) => {
    if (busy) return;
    setBusy(key);
    try {
      await action();
      onToast(done);
    } catch (error) {
      onToast(error instanceof Error ? error.message : "Tác vụ thất bại.");
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <button className="drawer-scrim" onClick={onClose} aria-label="Đóng" />
      <aside
        className={`drawer studio-drawer ${content.type === "video" ? "video-studio-modal" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`studio-title-${content.id}`}
      >
        <div className="drawer-head">
          <div>
            <span className="eyebrow">{content.contentId}</span>
            <h2 id={`studio-title-${content.id}`}>{content.title}</h2>
            <Badge
              tone={content.status === "ready_to_publish" ? "success" : "info"}
            >
              {statusLabels[content.status] ?? content.status}
            </Badge>
          </div>
          <button onClick={onClose} aria-label="Đóng Content">
            <X />
          </button>
        </div>
        <div className={`studio-tabs ${content.type === "video" ? "video-steps" : ""}`}>
          {content.type === "video" ? <>
            <button
              className={tab === "script" ? "active" : ""}
              onClick={() => setTab("script")}
            >
              <b>1</b> Kịch bản
            </button>
            <button className={tab === "generate" ? "active" : ""} onClick={() => setTab("generate")}>
              <b>2</b> Tạo video <span>{scenes.length}</span>
            </button>
            <button className={tab === "complete" ? "active" : ""} onClick={() => setTab("complete")}>
              <b>3</b> Hoàn tất
            </button>
          </> : <>
            <button className={tab === "editor" ? "active" : ""} onClick={() => setTab("editor")}>Nội dung</button>
            <button className={tab === "media" ? "active" : ""} onClick={() => setTab("media")}>Media ({assets.length})</button>
            <button className={tab === "copies" ? "active" : ""} onClick={() => setTab("copies")}>Bản nền tảng</button>
          </>}
        </div>
        <div className="drawer-body studio-body">
          {content.type === "video" && tab === "script" && <VideoEditor content={content} scenes={scenes} busy={busy} act={act} />}
          {content.type === "article" && tab === "editor" && <ArticleEditor content={content} assets={assets} busy={busy} act={act} />}
          {content.type === "video" && tab === "generate" && (
            <SceneEditor
              content={content}
              scenes={scenes}
              assets={assets}
              flowAccounts={flowAccounts}
              flowJobs={flowJobs}
              localAgents={localAgents}
              busy={busy}
              act={act}
            />
          )}
          {content.type === "article" && tab === "media" && (
            <MediaPanel
              content={content}
              scenes={scenes}
              assets={assets}
              busy={busy}
              act={act}
            />
          )}
          {content.type === "article" && tab === "copies" && (
            <><CopyEditor content={content} busy={busy} act={act} /><ArticleDistributionPanel content={content} assets={assets} busy={busy} act={act} /></>
          )}
          {content.type === "video" && tab === "complete" && <>
            <MediaPanel content={content} scenes={scenes} assets={assets} busy={busy} act={act} />
            <section className="completion-copies"><div className="section-title"><div><span className="step-label">Bản nền tảng</span><h3>Nội dung đăng</h3></div></div></section>
            <CopyEditor content={content} busy={busy} act={act} />
            <PublishingPanel content={content} assets={assets} busy={busy} act={act} />
          </>}
          {(content.type === "article" || tab === "complete") && <section className="approval-bar">
            <div>
              <strong>Duyệt Content cuối cùng</strong>
              <p>Chỉ Content đã duyệt mới có thể chuyển sang sẵn sàng đăng.</p>
            </div>
            <button
              className="secondary"
              disabled={!!busy}
              onClick={() =>
                act(
                  "approve",
                  () => approveContent(content.id),
                  "Đã duyệt Content.",
                )
              }
            >
              <Check size={15} /> Duyệt Content
            </button>
            <button
              className="primary"
              disabled={!!busy || content.status !== "approved"}
              onClick={() =>
                act(
                  "ready",
                  () => markReady(content.id),
                  "Content đã sẵn sàng đăng.",
                )
              }
            >
              <Check size={15} /> Sẵn sàng đăng
            </button>
          </section>}
        </div>
      </aside>
    </>
  );
}

function VideoEditor({
  content,
  scenes,
  busy,
  act,
}: {
  content: ContentRecord;
  scenes: SceneRecord[];
  busy: string;
  act: (k: string, a: () => Promise<unknown>, d: string) => void;
}) {
  const [title, setTitle] = useState(content.title);
  const [script, setScript] = useState(content.masterScript ?? "");
  const [style, setStyle] = useState(content.visualStyle ?? {});
  const [characters, setCharacters] = useState<CharacterReference[]>(
    content.characterReferences ?? [],
  );
  const [dirty, setDirty] = useState(false);
  const saveVersion = useRef(0);
  const touch = () => {
    saveVersion.current += 1;
    setDirty(true);
  };
  useEffect(() => {
    setTitle(content.title);
    setScript(content.masterScript ?? "");
    setStyle(content.visualStyle ?? {});
    setCharacters(content.characterReferences ?? []);
    setDirty(false);
    saveVersion.current = 0;
  }, [
    content.id,
    content.title,
    content.masterScript,
    content.visualStyle,
    content.characterReferences,
  ]);
  useEffect(() => {
    if (!dirty) return;
    const version = saveVersion.current;
    const timer = setTimeout(() => {
      updateContent(content.id, {
        title,
        topic: title,
        masterScript: script,
        visualStyle: style,
        characterReferences: characters,
      })
        .then(() => {
          if (saveVersion.current === version) setDirty(false);
        })
        .catch(() => undefined);
    }, 1200);
    return () => clearTimeout(timer);
  }, [dirty, title, script, style, characters, content.id]);
  const breakdown = () => {
    const replace = scenes.length > 0;
    if (
      replace &&
      !window.confirm(
        `Tạo lại toàn bộ ${scenes.length} scene? Dữ liệu scene hiện tại sẽ được thay thế.`,
      )
    )
      return;
    act(
      "breakdown",
      () => breakdownScenes(content.id, replace),
      "AI đã chia cảnh và lưu dữ liệu có cấu trúc.",
    );
  };
  return (
    <>
      <section>
        <div className="section-title">
          <div>
            <span className="step-label">Bước 1</span>
            <h3>Kịch bản</h3>
            <small>{dirty ? "Đang tự lưu…" : "Đã lưu"}</small>
          </div>
          <button
            className="primary"
            disabled={!!busy || script.trim().length < 30}
            onClick={breakdown}
          >
            <Sparkles size={15} />
            {busy === "breakdown"
              ? "Đang phân tích…"
              : "Tạo Scene"}
          </button>
        </div>
        <label>
          Tên Video
          <input value={title} onChange={(event) => { setTitle(event.target.value); touch(); }} />
        </label>
        <label>MASTER SCRIPT</label>
        <textarea
          className="long-editor"
          value={script}
          onChange={(e) => {
            setScript(e.target.value);
            touch();
          }}
          rows={14}
          placeholder="Dán MASTER SCRIPT do bạn chuẩn bị bên ngoài hệ thống"
        />
        <p className="field-help">
          AI không tự viết MASTER SCRIPT. Nút AI chỉ chạy khi bạn chủ động bấm.
        </p>
      </section>
      <AdvancedSection label="Cài đặt nâng cao">
        <div className="advanced-block">
          <h4>Visual Style & Continuity</h4>
          <div className="form-grid">
            <label>
              Phong cách
              <input
                value={style.style ?? ""}
                onChange={(e) => {
                  setStyle({ ...style, style: e.target.value });
                  touch();
                }}
              />
            </label>
            <label>
              Ánh sáng
              <input
                value={style.lighting ?? ""}
                onChange={(e) => {
                  setStyle({ ...style, lighting: e.target.value });
                  touch();
                }}
              />
            </label>
            <label>
              Camera style
              <input
                value={style.cameraStyle ?? ""}
                onChange={(e) => {
                  setStyle({ ...style, cameraStyle: e.target.value });
                  touch();
                }}
              />
            </label>
          </div>
          <label>
            Continuity instructions
            <textarea
              value={style.continuityInstructions ?? ""}
              onChange={(e) => {
                setStyle({ ...style, continuityInstructions: e.target.value });
                touch();
              }}
            />
          </label>
        </div>
        <div className="advanced-block">
          <div className="section-title">
            <div>
              <h4>Character References</h4>
              <small>Chỉ dùng khi cần giữ nhân vật nhất quán.</small>
            </div>
            <button
              className="small-action"
              onClick={() => {
                setCharacters([
                  ...characters,
                  { id: crypto.randomUUID(), name: "Nhân vật mới" },
                ]);
                touch();
              }}
            >
              <Plus size={14} />
              Thêm nhân vật
            </button>
          </div>
          {characters.length === 0 ? (
            <p className="field-help">Chưa có Character Reference.</p>
          ) : (
            characters.map((character, index) => (
              <div className="character-card" key={character.id}>
                <input
                  value={character.name}
                  onChange={(e) => {
                    const next = [...characters];
                    next[index] = { ...character, name: e.target.value };
                    setCharacters(next);
                    touch();
                  }}
                />
                <textarea
                  value={character.appearance ?? ""}
                  placeholder="Ngoại hình, trang phục, ghi chú"
                  onChange={(e) => {
                    const next = [...characters];
                    next[index] = { ...character, appearance: e.target.value };
                    setCharacters(next);
                    touch();
                  }}
                />
                <button
                  aria-label={`Xóa ${character.name}`}
                  onClick={() => {
                    setCharacters(
                      characters.filter((item) => item.id !== character.id),
                    );
                    touch();
                  }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>
      </AdvancedSection>
    </>
  );
}

function ArticleEditor({
  content,
  assets,
  busy,
  act,
}: {
  content: ContentRecord;
  assets: MediaAssetRecord[];
  busy: string;
  act: (k: string, a: () => Promise<unknown>, d: string) => void;
}) {
  const [body, setBody] = useState(content.body ?? "");
  const [objective, setObjective] = useState(content.objective ?? "");
  const [seo, setSeo] = useState<ArticleSeoData>(content.articleSeo ?? {
    seoTitle: "", h1: "", slug: "", metaDescription: "", focusKeyword: "", suggestedInternalLinks: [], faq: [], imageAltTextSuggestions: [],
  });
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"saving" | "saved" | "error">("saved");
  const saveVersion = useRef(0);
  const touch = () => {
    saveVersion.current += 1;
    setDirty(true);
    setSaveState("saving");
  };
  useEffect(() => {
    setBody(content.body ?? "");
    setObjective(content.objective ?? "");
    setSeo(content.articleSeo ?? { seoTitle: "", h1: "", slug: "", metaDescription: "", focusKeyword: "", suggestedInternalLinks: [], faq: [], imageAltTextSuggestions: [] });
    setDirty(false);
    setSaveState("saved");
    saveVersion.current = 0;
  }, [content.id, content.body, content.objective, content.articleSeo]);
  useEffect(() => {
    if (!dirty) return;
    const version = saveVersion.current;
    const timer = setTimeout(
      () =>
        updateContent(content.id, { body, objective, articleSeo: seo })
          .then(() => {
            if (saveVersion.current === version) {
              setDirty(false);
              setSaveState("saved");
            }
          })
          .catch(() => {
            if (saveVersion.current === version) setSaveState("error");
          }),
      1200,
    );
    return () => clearTimeout(timer);
  }, [dirty, body, objective, seo, content.id]);
  const generate = () => {
    const replace = shouldConfirmArticleRegeneration(body);
    if (
      replace &&
      !window.confirm(
        "Tạo draft AI mới sẽ thay nội dung hiện tại. Bạn đã lưu bản cần giữ chưa?",
      )
    )
      return;
    act(
      "article",
      async () => {
        await updateContent(content.id, { body, objective, articleSeo: seo });
        return generateArticle(content.id, replace);
      },
      "Bài Website chuẩn SEO đã được tạo.",
    );
  };
  const selectedImage = assets.find((asset) => asset.kind === "article_image" && asset.id === content.selectedImageId)
    ?? assets.find((asset) => asset.kind === "article_image" && asset.selected);
  const quality = evaluateArticleSeo({ seo, body, selectedImageAltText: selectedImage?.altText });
  const patchSeo = (changes: Partial<ArticleSeoData>) => { setSeo((current) => ({ ...current, ...changes })); touch(); };
  return (
    <>
      <section>
        <div className="section-title">
          <div>
            <span className="step-label">Bài Website gốc</span>
            <h3>Article chuẩn SEO</h3>
            <small className={`save-state ${saveState}`}>{articleSaveStateLabel(saveState)}</small>
          </div>
          <button className="primary" disabled={!!busy} onClick={generate}>
            <Sparkles size={15} />
            {busy === "article" ? "Đang viết…" : "Tạo bài chuẩn SEO bằng AI"}
          </button>
        </div>
        <label>Mục tiêu bài viết hoặc yêu cầu thêm<textarea rows={3} value={objective} onChange={(event) => { setObjective(event.target.value); touch(); }} /></label>
      </section>
      <section className="article-seo-fields">
        <div className="section-title"><div><span className="step-label">SEO</span><h3>Thông tin tìm kiếm</h3></div></div>
        <label>Từ khóa chính (không bắt buộc)<input value={seo.focusKeyword} onChange={(event) => patchSeo({ focusKeyword: event.target.value })} placeholder="Để trống để AI tự xác định 01 focus keyword" /></label>
        <label>SEO Title<input value={seo.seoTitle} onChange={(event) => patchSeo({ seoTitle: event.target.value })} /></label>
        <label>H1<input value={seo.h1} onChange={(event) => patchSeo({ h1: event.target.value })} /></label>
        <label>Slug<input value={seo.slug} onChange={(event) => patchSeo({ slug: event.target.value.toLowerCase() })} placeholder="vi-du-slug-khong-dau" /></label>
        <label>Meta Description<textarea rows={3} value={seo.metaDescription} onChange={(event) => patchSeo({ metaDescription: event.target.value })} /></label>
      </section>
      <section>
        <div className="section-title"><div><span className="step-label">Nội dung</span><h3>Article Body</h3></div></div>
        <textarea
          className="long-editor"
          rows={22}
          value={body}
          onChange={(e) => {
            setBody(e.target.value);
            touch();
          }}
          placeholder="Bài Website canonical sẽ xuất hiện tại đây. Dùng ## và ### cho H2/H3."
        />
      </section>
      <section className="seo-quality-panel">
        <div className="section-title"><div><span className="step-label">Quality gate</span><h3>Kiểm tra SEO nhẹ</h3><small>Checklist kỹ thuật, không phải cam kết thứ hạng Google.</small></div></div>
        <div className="seo-check-grid">{quality.checks.map((item) => <div className={item.passed ? "passed" : "pending"} key={item.key}><Check size={14} /> {item.label}</div>)}</div>
        {quality.warnings.length > 0 && <div className="seo-warnings">{quality.warnings.map((warning) => <small key={warning}>{warning}</small>)}</div>}
      </section>
      {(seo.suggestedInternalLinks.length > 0 || seo.faq.length > 0 || seo.imageAltTextSuggestions.length > 0) && <AdvancedSection label="Gợi ý SEO bổ sung">
        {seo.suggestedInternalLinks.length > 0 && <div><strong>Internal links</strong><ul>{seo.suggestedInternalLinks.map((item) => <li key={item}>{item}</li>)}</ul></div>}
        {seo.faq.length > 0 && <div><strong>FAQ</strong>{seo.faq.map((item) => <div key={item.question}><b>{item.question}</b><p>{item.answer}</p></div>)}</div>}
        {seo.imageAltTextSuggestions.length > 0 && <div><strong>Alt text gợi ý</strong><ul>{seo.imageAltTextSuggestions.map((item) => <li key={item}>{item}</li>)}</ul></div>}
      </AdvancedSection>}
      <section className="factual-note">
        <strong>Factual Safety</strong>
        <p>
          AI chỉ được dùng dữ liệu trong input và Thông tin Công ty; các trường
          chưa xác minh sẽ không được khẳng định.
        </p>
      </section>
    </>
  );
}

function SceneEditor({
  content,
  scenes,
  assets,
  flowAccounts,
  flowJobs,
  localAgents,
  busy,
  act,
}: {
  content: ContentRecord;
  scenes: SceneRecord[];
  assets: MediaAssetRecord[];
  flowAccounts: FlowAccountRecord[];
  flowJobs: FlowJobRecord[];
  localAgents: LocalAgentRecord[];
  busy: string;
  act: (k: string, a: () => Promise<unknown>, d: string) => void;
}) {
  const [drafts, setDrafts] = useState<SceneRecord[]>(scenes);
  const pendingChanges = useRef<Record<string, Partial<SceneRecord>>>({});
  const saveTimers = useRef<Record<string, number>>({});
  const [saveStates, setSaveStates] = useState<Record<string, "saving" | "saved" | "error">>({});
  useEffect(() => {
    setDrafts(scenes.map((scene) => ({ ...scene, ...(pendingChanges.current[scene.id] ?? {}) })));
  }, [scenes]);
  useEffect(() => () => Object.values(saveTimers.current).forEach((timer) => window.clearTimeout(timer)), []);
  const persistPending = async (sceneId: string) => {
    const changes = pendingChanges.current[sceneId];
    if (!changes || Object.keys(changes).length === 0) return;
    delete pendingChanges.current[sceneId];
    window.clearTimeout(saveTimers.current[sceneId]);
    setSaveStates((current) => ({ ...current, [sceneId]: "saving" }));
    try {
      await saveScene(content.id, sceneId, changes);
      setSaveStates((current) => ({ ...current, [sceneId]: "saved" }));
    } catch (error) {
      pendingChanges.current[sceneId] = { ...changes, ...(pendingChanges.current[sceneId] ?? {}) };
      setSaveStates((current) => ({ ...current, [sceneId]: "error" }));
      throw error;
    }
  };
  const patch = (index: number, change: Partial<SceneRecord>) => {
    const currentScene = drafts[index];
    if (!currentScene) return;
    setDrafts((current) => current.map((item, i) => (i === index ? { ...item, ...change } : item)));
    pendingChanges.current[currentScene.id] = { ...(pendingChanges.current[currentScene.id] ?? {}), ...change };
    setSaveStates((current) => ({ ...current, [currentScene.id]: "saving" }));
    window.clearTimeout(saveTimers.current[currentScene.id]);
    saveTimers.current[currentScene.id] = window.setTimeout(() => { persistPending(currentScene.id).catch(() => undefined); }, 800);
  };
  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= drafts.length) return;
    const next = [...drafts];
    const current = next[index];
    const other = next[target];
    if (!current || !other) return;
    next[index] = other;
    next[target] = current;
    setDrafts(next);
    act(
      "reorder",
      () =>
        reorderScenes(
          content.id,
          next.map((item) => item.id),
        ),
      "Đã đổi thứ tự scene.",
    );
  };
  const defaultAccount =
    flowAccounts.find((item) => item.status === "ready")?.id ??
    flowAccounts[0]?.id ??
    "";
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const accountId = selectedAccountId || defaultAccount;
  const account = flowAccounts.find((item) => item.id === accountId);
  const currentRatio = content.visualStyle?.aspectRatio === "9:16" ? "9:16" : "16:9";
  const localAgent =
    localAgents.find((item) => item.id === "ancv-windows-01") ?? localAgents[0];
  const [heartbeatNow, setHeartbeatNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setHeartbeatNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);
  const localAgentOnline = Boolean(
    localAgent?.status === "online" &&
    heartbeatNow - new Date(localAgent.lastSeen).getTime() < 45000,
  );
  const queueScene = async (scene: SceneRecord) => {
    await persistPending(scene.id);
    const durationEstimate = [4, 6, 8, 10].includes(scene.durationEstimate) ? scene.durationEstimate : 6;
    await createFlowJob(content.id, scene.id, accountId, {
      generationPrompt: scene.generationPrompt.trim(),
      durationEstimate,
      aspectRatio: currentRatio,
    });
  };
  return (
    <>
      <section>
        <div className="section-title">
          <div>
            <span className="step-label">Bước 2</span>
            <h3>Tạo video</h3>
            <small>Mỗi Scene tạo đúng một Video Raw. Google Flow vẫn là tính năng thử nghiệm.</small>
          </div>
          <button
            className="small-action"
            onClick={() =>
              act(
                "new-scene",
                () => createScene(content.id, { title: "Scene mới" }),
                "Đã thêm scene.",
              )
            }
          >
            <Plus size={14} />
            Thêm scene
          </button>
        </div>
        <div className="project-flow-settings">
          <SegmentedControl
            label="Tỷ lệ"
            value={currentRatio}
            options={[{ value: "9:16", label: "9:16" }, { value: "16:9", label: "16:9" }]}
            onChange={(aspectRatio) => act("project-ratio", () => updateContent(content.id, { visualStyle: { ...(content.visualStyle ?? {}), aspectRatio } }), `Đã chọn tỷ lệ ${aspectRatio}.`)}
            disabled={Boolean(busy)}
          />
          <label>
            Tài khoản Flow
            <select value={accountId} onChange={(event) => setSelectedAccountId(event.target.value)}>
              <option value="">Chưa chọn tài khoản Flow</option>
              {flowAccounts.map((item) => <option key={item.id} value={item.id}>{flowAccountLabel(item)} — {flowAccountStatusLabels[item.status]}</option>)}
            </select>
          </label>
          <Badge tone={localAgentOnline ? "success" : "danger"}>
            {localAgentOnline ? "Máy xử lý sẵn sàng" : "Máy xử lý đang offline"}
          </Badge>
        </div>
      </section>
      {drafts.length === 0 ? (
        <section>
          <EmptyState text="Chưa có Scene. Mở bước Kịch bản và bấm Tạo Scene." />
        </section>
      ) : (
        drafts.map((scene, index) => {
          const job = flowJobs.find((item) => item.sceneId === scene.id);
          const active = job && ["queued", "processing"].includes(job.status);
          return (
            <section className="scene-card" key={scene.id}>
              <div className="scene-card-head">
                <div className="scene-heading">
                  <strong>Scene {String(scene.sceneNumber).padStart(2, "0")}</strong>
                  <input
                    aria-label={`Tên Scene ${scene.sceneNumber}`}
                    value={scene.title}
                    onChange={(e) => patch(index, { title: e.target.value })}
                  />
                </div>
                <small className={`scene-save-state ${saveStates[scene.id] === "error" ? "error" : ""}`}>
                  {saveStates[scene.id] === "saving" ? "Đang tự lưu…" : saveStates[scene.id] === "error" ? "Chưa lưu được" : "Đã lưu"}
                </small>
                {job && (
                  <Badge
                    tone={
                      job.status === "succeeded"
                        ? "success"
                        : job.status === "needs_manual"
                          ? "danger"
                          : "warning"
                    }
                  >
                    {flowProgressLabel(job)}
                  </Badge>
                )}
              </div>
              <FlowComposer
                scene={scene}
                account={account}
                active={Boolean(active)}
                localAgentOnline={localAgentOnline}
                busy={busy}
                job={job}
                onPromptChange={(generationPrompt) =>
                  patch(index, { generationPrompt })
                }
                onDurationChange={(durationEstimate) => patch(index, { durationEstimate })}
                onGenerate={() =>
                  act(
                    `flow-${scene.id}`,
                    () => queueScene(scene),
                    "Đã đưa scene vào hàng chờ Flow Worker.",
                  )
                }
              />
              <TakeList content={content} scene={scene} assets={assets} busy={busy} act={act} />
              <AdvancedSection label="Chi tiết Scene">
                <label>
                  Narration
                  <textarea rows={3} value={scene.narration} onChange={(e) => patch(index, { narration: e.target.value })} />
                </label>
                <label>
                  Mô tả hình ảnh
                  <textarea
                    value={scene.visualDescription}
                    onChange={(e) =>
                      patch(index, { visualDescription: e.target.value })
                    }
                  />
                </label>
                <div className="form-grid">
                  <label>
                    Camera
                    <input
                      value={scene.cameraDirection}
                      onChange={(e) =>
                        patch(index, { cameraDirection: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Bối cảnh
                    <input
                      value={scene.environment}
                      onChange={(e) =>
                        patch(index, { environment: e.target.value })
                      }
                    />
                  </label>
                </div>
                <label>
                  Continuity
                  <textarea
                    value={scene.continuityNotes}
                    onChange={(e) =>
                      patch(index, { continuityNotes: e.target.value })
                    }
                  />
                </label>
                <div className="scene-detail-actions">
                  <button className="secondary" onClick={() => navigator.clipboard.writeText(scene.generationPrompt)}><Clipboard size={14} /> Copy Prompt</button>
                  <button className="secondary" onClick={() => move(index, -1)}>↑ Di chuyển lên</button>
                  <button className="secondary" onClick={() => move(index, 1)}>↓ Di chuyển xuống</button>
                  <button className="secondary" onClick={() => act(`duplicate-${scene.id}`, () => duplicateScene(content.id, scene.id), "Đã duplicate scene.")}><Copy size={14} /> Duplicate</button>
                  <button className="secondary" onClick={() => { if (window.confirm("Xóa scene này?")) act(`delete-${scene.id}`, () => deleteScene(content.id, scene.id), "Đã xóa scene."); }}><Trash2 size={14} /> Xóa</button>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        act(
                          `prompt-${scene.id}`,
                          () => regeneratePrompt(content.id, scene.id),
                          "Đã tạo prompt mới.",
                        )
                      }
                    ><RefreshCw size={14} /> Regenerate Prompt</button>
                    <button
                      className="secondary"
                      disabled={!!busy}
                      onClick={() =>
                        act(
                          `regen-${scene.id}`,
                          () => regenerateScene(content.id, scene.id),
                          "Đã regenerate scene.",
                        )
                      }
                    ><Sparkles size={14} /> Regenerate Scene</button>
                </div>
              </AdvancedSection>
            </section>
          );
        })
      )}
    </>
  );
}

function FlowComposer({
  scene,
  account,
  active,
  localAgentOnline,
  busy,
  job,
  onPromptChange,
  onDurationChange,
  onGenerate,
}: {
  scene: SceneRecord;
  account?: FlowAccountRecord;
  active: boolean;
  localAgentOnline: boolean;
  busy: string;
  job?: FlowJobRecord;
  onPromptChange: (value: string) => void;
  onDurationChange: (value: number) => void;
  onGenerate: () => void;
}) {
  const durationOptions = [4, 6, 8, 10];
  const selectedDuration = durationOptions.includes(scene.durationEstimate) ? scene.durationEstimate : 6;
  const disabledReason = !scene.generationPrompt.trim()
    ? "Nhập Prompt Google Flow để tiếp tục."
    : !localAgentOnline
      ? "Máy xử lý đang offline."
      : !account
        ? "Chưa chọn tài khoản Flow."
        : account.status !== "ready"
          ? "Tài khoản Flow cần đăng nhập lại."
          : active
            ? "Đang tạo video…"
            : "";
  const disabled = Boolean(busy || disabledReason);
  return (
    <div className="flow-composer">
      <div className="flow-composer-title">
        <div>
          <strong>Prompt Google Flow</strong>
        </div>
      </div>
      <textarea
        className="prompt-editor"
        rows={7}
        value={scene.generationPrompt}
        placeholder="Mô tả video cần tạo trong Google Flow…"
        onChange={(e) => onPromptChange(e.target.value)}
      />
      <div className="flow-composer-controls">
        <SegmentedControl
          label="Thời lượng"
          value={selectedDuration}
          options={durationOptions.map((value) => ({ value, label: `${value}s` }))}
          onChange={onDurationChange}
          disabled={Boolean(busy)}
        />
        <button
          className="primary composer-generate"
          disabled={disabled}
          title={disabledReason || "Tạo video cho Scene này"}
          onClick={onGenerate}
        >
          {active && job ? flowProgressLabel(job) : "Tạo video"}
          {!active && <ArrowRight size={16} />}
        </button>
      </div>
      {(disabledReason || job?.error) && (
        <small className={job?.error ? "composer-error" : "composer-help"}>
          {flowErrorMessage(job?.error) || disabledReason}
        </small>
      )}
    </div>
  );
}

function TakeList({
  content,
  scene,
  assets,
  busy,
  act,
}: {
  content: ContentRecord;
  scene: SceneRecord;
  assets: MediaAssetRecord[];
  busy: string;
  act: (k: string, a: () => Promise<unknown>, d: string) => void;
}) {
  const takes = assets.filter(
    (item) => item.kind === "scene_take" && item.sceneId === scene.id,
  );
  return (
    <div className="take-box">
      <div className="take-box-head">
        <div>
          <strong>Video Raw</strong>
        </div>
        <button
          className="small-action"
          disabled={!!busy}
          onClick={() =>
            act(
              `open-folder-${scene.id}`,
              () => openSceneFolder(content.id, scene.id),
              "Đã gửi lệnh mở thư mục Scene tới Local Agent.",
            )
          }
        >
          <FolderOpen size={14} /> Mở file/thư mục
        </button>
      </div>
      {takes.length === 0 ? (
        <div className="take-empty">
          <Video size={20} />
          <span>Chưa có Video Raw cho Scene này.</span>
        </div>
      ) : (
        takes.map((take) => (
          <div className="take-item" key={take.id}>
            <div className="take-preview">
              {take.storageType !== "local" && take.downloadUrl ? (
                <video src={take.downloadUrl} preload="metadata" muted />
              ) : (
                <Video size={22} />
              )}
            </div>
            <div className="take-info">
              <strong>Scene {String(scene.sceneNumber).padStart(2, "0")} — Take {String(take.takeNumber ?? 1).padStart(2, "0")}</strong>
              <span>{take.fileName}</span>
              <Badge tone={take.storageType === "local" ? "info" : "neutral"}>
                {take.storageType === "local" ? "Lưu trên máy" : "Cloud"}
              </Badge>
            </div>
            <div className="take-actions">
              {take.downloadUrl && (
                <a className="small-action" href={take.downloadUrl} target="_blank" rel="noreferrer">Xem</a>
              )}
              <button
                className="small-action"
                onClick={() =>
                  act(
                    `select-${take.id}`,
                    () => selectAsset(content.id, assets, take),
                    "Đã chọn take.",
                  )
                }
              >
                <Check size={12} /> {take.selected ? "Đang chọn" : "Chọn Take"}
              </button>
            </div>
          </div>
        ))
      )}
      <AdvancedSection label="Tùy chọn Cloud" className="cloud-options">
        <p className="field-help">Chỉ dùng khi cần lưu thêm một Video Raw lên Firebase Storage.</p>
        <label className="upload-button">
          <Upload size={14} /> Upload Cloud
          <input
            type="file"
            accept="video/*"
            disabled={!!busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file)
                act(
                  `upload-${scene.id}`,
                  () =>
                    uploadMedia(
                      content,
                      file,
                      "scene_take",
                      scene.id,
                      takes.length + 1,
                    ),
                  "Đã upload Video Raw.",
                );
            }}
          />
        </label>
      </AdvancedSection>
    </div>
  );
}

function MediaPanel({
  content,
  scenes,
  assets,
  busy,
  act,
}: {
  content: ContentRecord;
  scenes: SceneRecord[];
  assets: MediaAssetRecord[];
  busy: string;
  act: (k: string, a: () => Promise<unknown>, d: string) => void;
}) {
  const [prompt, setPrompt] = useState(
    `Hình minh họa chuyên nghiệp cho bài viết: ${content.topic}. Không chữ, không logo giả, không thông tin chưa xác minh.`,
  );
  const finalCandidates = content.finalDetection?.status === "multiple" ? content.finalDetection.candidates ?? [] : [];
  const articleImages = assets.filter((item) => item.kind === "article_image");
  const finals = assets.filter((item) => item.kind === "video_final");
  const rawTakes = assets.filter((item) => item.kind === "scene_take");
  const scenesWithRaw = scenes.filter((scene) =>
    rawTakes.some((asset) => asset.sceneId === scene.id),
  ).length;
  const download = () =>
    act(
      "download-scenes",
      async () => {
        const blob = await downloadSceneList(content.id);
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = `${content.contentId}-scenes.tsv`;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      "Đã tải danh sách scene.",
    );
  return (
    <>
      {content.type === "video" ? (
        <>
          <section className="media-workflow-section">
            <div className="section-title">
              <div>
                <span className="step-label">Bước 4</span>
                <h3>Video Raw</h3>
                <small>{scenesWithRaw}/{scenes.length} Scene đã có Video Raw</small>
              </div>
            </div>
            <div className="media-scene-list">
              {scenes.map((scene) => {
                const sceneTakes = rawTakes.filter((asset) => asset.sceneId === scene.id);
                return (
                  <div key={scene.id}>
                    <span><strong>Scene {String(scene.sceneNumber).padStart(2, "0")}</strong>{scene.title}</span>
                    <Badge tone={sceneTakes.length ? "success" : "neutral"}>
                      {sceneTakes.length ? `${sceneTakes.length} Take` : "Chưa có Raw"}
                    </Badge>
                    <button
                      className="small-action"
                      disabled={!!busy}
                      onClick={() =>
                        act(
                          `open-folder-media-${scene.id}`,
                          () => openSceneFolder(content.id, scene.id),
                          "Đã gửi lệnh mở thư mục Scene tới Local Agent.",
                        )
                      }
                    ><FolderOpen size={13} /> Mở thư mục</button>
                  </div>
                );
              })}
            </div>
          </section>
          <section className="media-workflow-section capcut-handoff">
            <div className="section-title">
              <div>
                <h3>CapCut / Hậu kỳ</h3>
                <small>CapCut nằm ngoài hệ thống. Export file hoàn chỉnh vào thư mục <strong>Video Final</strong>.</small>
              </div>
              <div className="handoff-actions">
                <button className="secondary" onClick={() => act("open-video-folder", () => openVideoFolder(content.id), "Đã gửi lệnh mở thư mục Video.")}><FolderOpen size={14} /> Mở thư mục Video</button>
                <button className="secondary" onClick={download}><Download size={14} /> Tải danh sách Scene</button>
              </div>
            </div>
            <button
              className="secondary"
              disabled={
                !scenes.length ||
                scenes.some(
                  (scene) =>
                    !assets.some(
                      (asset) =>
                        asset.kind === "scene_take" &&
                        asset.sceneId === scene.id &&
                        asset.selected,
                    ),
                )
              }
              onClick={() =>
                act(
                  "post-production",
                  () => setContentStatus(content.id, "post_production"),
                  "Đã chuyển sang Chờ hậu kỳ.",
                )
              }
            >
              <Check size={14} /> Đủ Video Raw — Chuyển sang Chờ hậu kỳ
            </button>
          </section>
          <section className="media-workflow-section final-video-section">
            <div>
              <span className="step-label">Video Final</span>
              <h3>Hoàn tất hậu kỳ</h3>
              <p className="field-help">Video Final giữ trên máy tại <strong>{content.contentId}/Video Final</strong>. Hệ thống chỉ lưu metadata tương đối.</p>
            </div>
            <div className="handoff-actions">
              <button className="secondary" disabled={!!busy} onClick={() => act("open-video-folder-final", () => openVideoFolder(content.id), "Đã mở thư mục dự án Video.")}><FolderOpen size={14} /> Mở thư mục Video</button>
            </div>
            {finalCandidates.length > 0 && (
              <div className="final-candidate-list">
                {finalCandidates.map((candidate) => (
                  <div className="asset-row" key={candidate.relativePath}>
                    <span>{candidate.fileName}</span>
                    <span>{Math.round((candidate.sizeBytes / 1024 / 1024) * 10) / 10} MB</span>
                    <button className="small-action" disabled={!!busy} onClick={() => act(`register-final-${candidate.fileName}`, () => registerVideoFinal(content.id, candidate.relativePath), "Video Final đã sẵn sàng.")}><Check size={12} /> Chọn file này</button>
                  </div>
                ))}
              </div>
            )}
            {finals.some((asset) => asset.id === content.finalVideoAssetId) ? (
              <div className="take-empty final-ready"><Check size={20} /><span>Video Final đã sẵn sàng</span></div>
            ) : finalCandidates.length === 0 ? (
              <div className="take-empty"><Video size={20} /><span>Đang chờ file export từ CapCut…</span></div>
            ) : null}
          </section>
        </>
      ) : (
        <>
          <section>
            <h3>Tạo hình bằng AI</h3>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={5}
            />
            <div className="image-options">
              <select id="image-size" defaultValue="1024x1024">
                <option>1024x1024</option>
                <option>1536x1024</option>
                <option>1024x1536</option>
              </select>
              <select id="image-quality" defaultValue="low">
                <option value="low">Low — tiết kiệm</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
              <button
                className="primary"
                disabled={!!busy || prompt.length < 10}
                onClick={() => {
                  const size = (
                    document.getElementById("image-size") as HTMLSelectElement
                  ).value;
                  const quality = (
                    document.getElementById(
                      "image-quality",
                    ) as HTMLSelectElement
                  ).value;
                  act(
                    "image",
                    () =>
                      generateArticleImage(content.id, prompt, size, quality),
                    "Đã tạo và lưu ảnh vào Cloud Storage.",
                  );
                }}
              >
                <FileImage size={15} />
                {busy === "image" ? "Đang tạo…" : "Tạo hình ảnh"}
              </button>
            </div>
          </section>
          <section>
            <h3>Thư viện ảnh</h3>
            <div className="image-grid">
              {articleImages.map((asset) => (
                <article key={asset.id}>
                  <img src={asset.downloadUrl} alt={asset.altText || asset.fileName} />
                  <small>
                    {asset.quality} · {Math.round(asset.sizeBytes / 1024)} KB
                  </small>
                  <label>Alt Text<input id={`alt-${asset.id}`} defaultValue={asset.altText ?? ""} placeholder="Mô tả đúng nội dung ảnh" /></label>
                  <label>Caption (không bắt buộc)<input id={`caption-${asset.id}`} defaultValue={asset.caption ?? ""} /></label>
                  <label>Tiêu đề ảnh (không bắt buộc)<input id={`media-title-${asset.id}`} defaultValue={asset.mediaTitle ?? ""} /></label>
                  <button className="small-action" disabled={!!busy} onClick={() => act(`save-image-meta-${asset.id}`, () => saveAssetMetadata(asset.id, {
                    altText: (document.getElementById(`alt-${asset.id}`) as HTMLInputElement).value.trim(),
                    caption: (document.getElementById(`caption-${asset.id}`) as HTMLInputElement).value.trim(),
                    mediaTitle: (document.getElementById(`media-title-${asset.id}`) as HTMLInputElement).value.trim(),
                  }), "Đã lưu Alt Text và metadata ảnh.")}><Save size={12} /> Lưu metadata</button>
                  <button
                    className="small-action"
                    onClick={() =>
                      act(
                        `select-${asset.id}`,
                        () => selectAsset(content.id, assets, asset),
                        "Đã chọn ảnh chính.",
                      )
                    }
                  >
                    <Check size={12} />
                    {asset.selected ? "Ảnh chính" : "Chọn ảnh chính"}
                  </button>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </>
  );
}
function CopyEditor({
  content,
  busy,
  act,
}: {
  content: ContentRecord;
  busy: string;
  act: (k: string, a: () => Promise<unknown>, d: string) => void;
}) {
  const platforms: Platform[] =
    content.type === "video"
      ? ["tiktok", "youtube", "facebook", "zalo", "linkedin"]
      : ["facebook", "zalo", "linkedin"];
  const [drafts, setDrafts] = useState<Partial<Record<Platform, PlatformCopy>>>(
    content.platformCopies ?? {},
  );
  const [batchFailures, setBatchFailures] = useState<Array<{platform:Platform;message:string}>>([]);
  const serverCopies = useRef(content.platformCopies ?? {});
  useEffect(() => {
    const previousServerCopies = serverCopies.current;
    const nextServerCopies = content.platformCopies ?? {};
    setDrafts((currentDrafts) => {
      const merged = { ...nextServerCopies };
      for (const platform of Object.keys(currentDrafts) as Platform[]) {
        const current = currentDrafts[platform];
        const previousServer = previousServerCopies[platform];
        const hasUnsavedChanges =
          JSON.stringify(current) !== JSON.stringify(previousServer);
        if (hasUnsavedChanges && current) merged[platform] = current;
      }
      return merged;
    });
    serverCopies.current = nextServerCopies;
  }, [content.platformCopies, content.id]);
  return (
    <>
      {content.type === "video" && (
        <section className="copy-batch-cta">
          <div>
            <h3>Tạo nội dung cho 5 nền tảng</h3>
            <p>Tạo lần lượt TikTok, YouTube, Facebook, Zalo và LinkedIn. Bản đã có sẽ được giữ nguyên.</p>
          </div>
          <button
            className="primary"
            disabled={!!busy || !content.finalVideoAssetId}
            onClick={() => act("copies-all", async () => {
              const result = await generateVideoPlatformCopies(content);
              setBatchFailures(result.failed);
              if (result.failed.length) throw new Error(`Đã giữ ${result.succeeded.length}/5 bản; ${result.failed.length} nền tảng cần thử riêng.`);
            }, "Đã tạo nội dung 5 nền tảng.")}
          ><Sparkles size={15} /> {busy === "copies-all" ? "Đang tạo lần lượt…" : "Tạo nội dung 5 nền tảng"}</button>
          {batchFailures.length > 0 && <div className="copy-batch-errors">{batchFailures.map((failure) => <small key={failure.platform}><strong>{platformLabels[failure.platform]}:</strong> {failure.message}</small>)}</div>}
        </section>
      )}
      {content.type === "article" && (
        <section className="copy-batch-cta">
          <div><h3>Tạo nội dung mạng xã hội</h3><p>Tạo tuần tự Facebook, Zalo và LinkedIn từ Article Website đã lưu. Bản đã có không bị ghi đè.</p></div>
          <button className="primary" disabled={!!busy || !content.body.trim()} onClick={() => act("article-copies-all", async () => {
            const result = await generateArticleSocialCopies(content);
            setBatchFailures(result.failed);
            if (result.failed.length) throw new Error(`Đã giữ ${result.succeeded.length}/3 bản; ${result.failed.length} nền tảng cần thử riêng.`);
          }, "Đã tạo nội dung mạng xã hội.")}><Sparkles size={15} /> {busy === "article-copies-all" ? "Đang tạo lần lượt…" : "Tạo nội dung mạng xã hội"}</button>
          {batchFailures.length > 0 && <div className="copy-batch-errors">{batchFailures.map((failure) => <small key={failure.platform}><strong>{platformLabels[failure.platform]}:</strong> {failure.message}</small>)}</div>}
        </section>
      )}
      {platforms.map((platform) => {
        const copy = drafts[platform];
        return (
          <section className="copy-card" key={platform}>
            <div className="section-title">
              <div>
                <h3>{platformLabels[platform]}</h3>
                <small>
                  {platform === "tiktok"
                    ? "Đúng 01 câu ngắn"
                    : platform === "linkedin"
                      ? "Bản chuyên nghiệp B2B"
                      : "Phiên bản riêng cho nền tảng"}
                </small>
              </div>
              <Badge tone={copy?.status === "approved" ? "success" : "neutral"}>
                {copy?.status === "approved" ? "Đã duyệt" : "Bản nháp"}
              </Badge>
            </div>
            {platform === "youtube" && (
              <input
                placeholder="Tiêu đề YouTube"
                value={copy?.title ?? ""}
                onChange={(e) =>
                  setDrafts({
                    ...drafts,
                    [platform]: {
                      ...(copy ?? blankCopy(platform)),
                      title: e.target.value,
                    },
                  })
                }
              />
            )}
            <textarea
              rows={platform === "tiktok" ? 3 : 8}
              placeholder="Chưa có Content. Bấm Generate."
              value={copy?.text ?? ""}
              onChange={(e) =>
                setDrafts({
                  ...drafts,
                  [platform]: {
                    ...(copy ?? blankCopy(platform)),
                    text: e.target.value,
                  },
                })
              }
            />
            <div className="platform-copy-actions">
              {!copy && (
                <button
                  className="primary"
                  disabled={!!busy}
                  onClick={() =>
                    act(
                      `copy-${platform}`,
                      () => generatePlatformCopy(content.id, platform, false),
                      `Đã tạo bản ${platformLabels[platform]}.`,
                    )
                  }
                ><Sparkles size={14} /> Tạo bản {platformLabels[platform]}</button>
              )}
              <button
                className="secondary"
                disabled={!copy}
                onClick={() => navigator.clipboard.writeText(copy?.text ?? "")}
              >
                <Clipboard size={14} /> Copy
              </button>
              <button
                className="secondary"
                disabled={!copy}
                onClick={() =>
                  copy &&
                  act(
                    `save-copy-${platform}`,
                    async () => {
                      await savePlatformCopy(content.id, platform, copy);
                      serverCopies.current = {
                        ...serverCopies.current,
                        [platform]: copy,
                      };
                    },
                    "Đã lưu bản chỉnh sửa.",
                  )
                }
              >
                <Save size={14} /> Lưu
              </button>
              <button
                className="primary"
                disabled={!copy}
                onClick={() =>
                  act(
                    `approve-copy-${platform}`,
                    () => approvePlatformCopy(content.id, platform),
                    "Đã duyệt bản nền tảng.",
                  )
                }
              >
                <Check size={14} /> Duyệt
              </button>
              {copy && (
                <details className="scene-more-menu platform-more-menu">
                  <summary aria-label={`Thêm tác vụ ${platformLabels[platform]}`}><MoreHorizontal size={17} /></summary>
                  <div>
                    <button
                      disabled={!!busy}
                      onClick={() => {
                        if (
                          !window.confirm(
                            `Tạo draft ${platformLabels[platform]} mới? Bản hiện tại sẽ được thay thế sau xác nhận này.`,
                          )
                        ) return;
                        act(
                          `copy-${platform}`,
                          () => generatePlatformCopy(content.id, platform, true),
                          `Đã tạo bản ${platformLabels[platform]}.`,
                        );
                      }}
                    ><RefreshCw size={14} /> Regenerate</button>
                    <button
                      onClick={() => {
                        const url = window.prompt(
                          `URL bài ${platformLabels[platform]} đã đăng thủ công:`,
                        );
                        if (url !== null)
                          act(
                            `publish-${platform}`,
                            () => markManualPublished(content.id, platform, url.trim() || undefined),
                            "Đã ghi nhận đăng thủ công.",
                          );
                      }}
                    ><Check size={14} /> Đã đăng thủ công</button>
                  </div>
                </details>
              )}
            </div>
          </section>
        );
      })}
    </>
  );
}

async function runSocialHandoff(content: ContentRecord, platform: Platform, media?: MediaAssetRecord) {
  return prepareSocialHandoff(content, platform, media, {
    copyText: (value) => navigator.clipboard.writeText(value),
    openExternal: (url) => { window.open(url, "_blank", "noopener,noreferrer"); },
    openLocalAsset: (contentDocId, assetId) => openMediaAsset(contentDocId, assetId),
  });
}

function ArticleDistributionPanel({ content, assets, busy, act }: { content: ContentRecord; assets: MediaAssetRecord[]; busy: string; act: (k: string, a: () => Promise<unknown>, d: string) => void }) {
  const [showPublish, setShowPublish] = useState(false);
  const selectedImage = assets.find((asset) => asset.kind === "article_image" && asset.id === content.selectedImageId)
    ?? assets.find((asset) => asset.kind === "article_image" && asset.selected);
  const quality = evaluateArticleSeo({ seo: content.articleSeo, body: content.body, selectedImageAltText: selectedImage?.altText });
  const socialPlatforms: Platform[] = ["facebook", "zalo", "linkedin"];
  const articleApproved = Boolean(content.approvedAt);
  const socialApproved = socialPlatforms.every((platform) => content.platformCopies?.[platform]?.status === "approved");
  const wordpressReady = articleApproved && quality.checks.every((item) => item.passed) && Boolean(selectedImage?.altText);
  const websitePublication = content.platforms.find((item) => item.platform === "website");
  return <section className="publishing-panel article-distribution-panel">
    <div className="section-title"><div><span className="step-label">Phân phối</span><h3>Website & mạng xã hội</h3><small>Đăng Website hoặc chuẩn bị nội dung để đăng thủ công lên mạng xã hội.</small></div></div>
    <div className="article-completion-summary">
      <div><strong>Bài Website</strong><small>{articleApproved ? "✓ Nội dung đã duyệt" : "Chờ duyệt"}</small></div>
      <div><strong>SEO</strong><small>{quality.checks.filter((item) => item.passed).length}/{quality.checks.length} mục đạt</small></div>
      <div><strong>Hình ảnh</strong><small>{selectedImage?.altText ? "✓ Ảnh chính + Alt Text" : "Chưa đủ ảnh chính/Alt Text"}</small></div>
      <div><strong>Social</strong><small>{socialApproved ? "✓ 3/3 đã duyệt" : "Chờ duyệt đủ 3 bản"}</small></div>
    </div>
    <div className="publishing-row"><div><strong>Website</strong><small>{websitePublication?.status === "published" ? "Đã đăng" : websitePublication?.status === "scheduled" ? "Đã lên lịch" : wordpressReady ? "Sẵn sàng" : "Cần duyệt bài, SEO và ảnh chính"}</small></div><button className="primary" disabled={!!busy || !wordpressReady || ["published", "scheduled"].includes(websitePublication?.status ?? "")} onClick={() => setShowPublish(true)}><CalendarClock size={14} /> Đăng / Lên lịch</button></div>
    {socialPlatforms.map((platform) => {
      const copy = content.platformCopies?.[platform];
      const publication = content.platforms.find((item) => item.platform === platform);
      return <div className="publishing-row" key={platform}><div><strong>{platformLabels[platform]}</strong><small>{publication?.status === "published" ? "Đã đăng" : "Đăng thủ công"}</small></div>
        <button className="secondary" disabled={!!busy || copy?.status !== "approved" || publication?.status === "published"} onClick={() => act(`article-handoff-${platform}`, () => runSocialHandoff(content, platform, selectedImage), `Nội dung đã được sao chép. Hãy dán và đăng trên ${platformLabels[platform]}.`)}><ExternalLink size={14} /> Chuẩn bị đăng</button>
        <button className="secondary" disabled={!!busy || publication?.status === "published"} onClick={() => { const url = window.prompt(`Post URL ${platformLabels[platform]} (không bắt buộc):`, ""); if (url === null) return; act(`article-manual-${platform}`, () => markManualPublished(content.id, platform, url.trim() || undefined), `Đã đánh dấu ${platformLabels[platform]} là đã đăng.`); }}><Check size={14} /> Đã đăng</button>
      </div>;
    })}
    {showPublish && <PublishActionModal
      label="Website"
      busy={!!busy}
      onClose={() => setShowPublish(false)}
      onSubmit={(mode, scheduledAt) => {
        setShowPublish(false);
        act("wordpress-publish", () => publishWordPress(content.id, mode, scheduledAt), mode === "schedule" ? "Website đã lên lịch." : "Website đã đăng.");
      }}
    />}
  </section>;
}

function PublishingPanel({
  content,
  assets,
  busy,
  act,
}: {
  content: ContentRecord;
  assets: MediaAssetRecord[];
  busy: string;
  act: (k: string, a: () => Promise<unknown>, d: string) => void;
}) {
  const [showPublish, setShowPublish] = useState(false);
  const final = assets.find((asset) => asset.id === content.finalVideoAssetId);
  const youtubeCopy = content.platformCopies?.youtube;
  const youtubePublication = content.platforms.find((item) => item.platform === "youtube");
  const contentApproved = Boolean(content.approvedAt) && ["approved", "ready_to_publish", "partially_published", "scheduled", "published"].includes(content.status);
  const youtubeReady = Boolean(final?.storageType === "local" && youtubeCopy?.status === "approved" && contentApproved && !["published", "scheduled"].includes(youtubePublication?.status ?? ""));
  const manualPlatforms: Platform[] = ["facebook", "tiktok", "zalo", "linkedin"];
  return (
    <section className="publishing-panel">
      <div className="section-title"><div><span className="step-label">Đăng video</span><h3>Phân phối</h3><small>Đăng YouTube hoặc chuẩn bị nội dung để đăng thủ công lên mạng xã hội.</small></div></div>
      <div className="publishing-row youtube-publishing-row">
        <div><strong>YouTube</strong><small>{youtubePublication?.status === "published" ? "Đã đăng" : youtubePublication?.status === "scheduled" ? "Đã lên lịch" : youtubeReady ? "Sẵn sàng" : "Cần Video Final và nội dung đã duyệt"}</small></div>
        <button className="primary" disabled={!!busy || !youtubeReady} onClick={() => setShowPublish(true)}><CalendarClock size={14} /> Đăng / Lên lịch</button>
      </div>
      {manualPlatforms.map((platform) => {
        const copy = content.platformCopies?.[platform];
        const publication = content.platforms.find((item) => item.platform === platform);
        return (
          <div className="publishing-row" key={platform}>
            <div><strong>{platformLabels[platform]}</strong><small>{publication?.status === "published" ? "Đã đăng" : "Đăng thủ công"}</small></div>
            <button className="secondary" disabled={!!busy || copy?.status !== "approved" || publication?.status === "published"} onClick={() => act(`handoff-${platform}`, () => runSocialHandoff(content, platform, final), `Nội dung đã được sao chép. Hãy dán và đăng trên ${platformLabels[platform]}.`)}><ExternalLink size={14} /> Chuẩn bị đăng</button>
            <button className="secondary" disabled={!!busy || publication?.status === "published"} onClick={() => {
              const url = window.prompt(`Post URL ${platformLabels[platform]} (không bắt buộc, có thể để trống):`, "");
              if (url === null) return;
              act(`manual-${platform}`, () => markManualPublished(content.id, platform, url.trim() || undefined), `Đã đánh dấu ${platformLabels[platform]} là đã đăng.`);
            }}><Check size={14} /> Đã đăng</button>
          </div>
        );
      })}
      {showPublish && <PublishActionModal
        label="YouTube"
        busy={!!busy}
        onClose={() => setShowPublish(false)}
        onSubmit={(mode, scheduledAt) => {
          setShowPublish(false);
          act("youtube-publish", () => publishYouTube(content.id, mode, scheduledAt), mode === "schedule" ? "YouTube đã lên lịch." : "YouTube đã đăng.");
        }}
      />}
    </section>
  );
}
function blankCopy(platform: Platform): PlatformCopy {
  return { platform, text: "", status: "draft", version: 1 };
}
