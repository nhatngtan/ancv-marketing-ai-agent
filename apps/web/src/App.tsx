import { useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3, CalendarDays, Check, ChevronRight, CircleAlert, Clipboard, FileText,
  Globe2, HeartPulse, LayoutDashboard, Link2, LogIn, Menu, Plus, Search, Settings, Share2,
  ShieldCheck, Sparkles, Video, X,
} from 'lucide-react';
import {
  connectorModeVi, connectorStatusVi, type ConnectorRecord, type ContentRecord, type ContentType,
  type HealthItem, type LocalAgentRecord, type Platform, type PublishingStatus,
} from '@ancv/shared';
import { Badge } from './components/Badge';
import { EmptyState } from './components/EmptyState';
import { StatCard } from './components/StatCard';
import { ContentStudioPage } from './components/ContentStudio';
import { CompanySettings } from './components/CompanySettings';
import { firebaseConfigured, loginWithGoogle } from './lib/firebase';
import { auth, logout } from './lib/firebase';
import { onAuthStateChanged, type User } from 'firebase/auth';
import { DEFAULT_CONNECTORS } from '@ancv/shared';
import { createContent, fetchBackendHealth, subscribeConnectors, subscribeContents, subscribeLocalAgents, subscribeMonthlyAIUsage, testConnector, updateContent } from './lib/repository';

type PageKey = 'overview' | 'video' | 'article' | 'schedule' | 'social' | 'website' | 'seo' | 'reports' | 'connectors' | 'health' | 'settings';
const nav: Array<{ key: PageKey; label: string; icon: typeof LayoutDashboard }> = [
  { key: 'overview', label: 'Tổng quan', icon: LayoutDashboard }, { key: 'video', label: 'Content Video', icon: Video },
  { key: 'article', label: 'Content Bài viết', icon: FileText }, { key: 'schedule', label: 'Lịch đăng', icon: CalendarDays },
  { key: 'social', label: 'Mạng xã hội', icon: Share2 }, { key: 'website', label: 'Website', icon: Globe2 },
  { key: 'seo', label: 'SEO', icon: Search }, { key: 'reports', label: 'Báo cáo', icon: BarChart3 },
  { key: 'connectors', label: 'Kết nối', icon: Link2 }, { key: 'health', label: 'Tình trạng hệ thống', icon: HeartPulse },
  { key: 'settings', label: 'Cài đặt', icon: Settings },
];

const platformLabels: Record<Platform, string> = {
  youtube: 'YouTube', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', zalo: 'Zalo',
  website: 'Website', ga4: 'GA4', search_console: 'Search Console',
};
const publishLabels: Record<PublishingStatus, string> = {
  pending: 'Chờ xử lý', processing: 'Đang xử lý', published: 'Đã đăng', needs_action: 'Cần xử lý',
  manual_pending: 'Chờ đăng thủ công', failed: 'Thất bại', skipped: 'Bỏ qua',
};

function pageTitle(page: PageKey) { return nav.find((item) => item.key === page)?.label ?? ''; }

export default function App() {
  const [page, setPage] = useState<PageKey>('overview');
  const [contents, setContents] = useState<ContentRecord[]>([]);
  const [connectors, setConnectors] = useState<ConnectorRecord[]>(DEFAULT_CONNECTORS);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCreate, setShowCreate] = useState<ContentType | null>(null);
  const [toast, setToast] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(!firebaseConfigured);
  const [aiUsage, setAIUsage] = useState({ requests: 0, totalTokens: 0, images: 0 });
  const [localAgents, setLocalAgents] = useState<LocalAgentRecord[]>([]);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (currentUser) => { setUser(currentUser); setAuthReady(true); });
  }, []);
  useEffect(() => {
    if (firebaseConfigured && !user) return;
    return subscribeContents(setContents);
  }, [user]);
  useEffect(() => { if (firebaseConfigured && !user) return; return subscribeMonthlyAIUsage(setAIUsage); }, [user]);
  useEffect(() => { if (firebaseConfigured && !user) return; return subscribeLocalAgents(setLocalAgents); }, [user]);
  useEffect(() => {
    if (firebaseConfigured && !user) return;
    return subscribeConnectors(setConnectors);
  }, [user]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(''), 3000); return () => clearTimeout(timer); }, [toast]);

  const openPage = (key: PageKey) => { setPage(key); setMenuOpen(false); };
  const contentType = page === 'video' ? 'video' : page === 'article' ? 'article' : null;

  return <div className="app-shell">
    <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
      <div className="brand"><div className="brand-mark"><ShieldCheck /></div><div><strong>ANCV</strong><span>Marketing AI OS</span></div></div>
      <nav>{nav.map(({ key, label, icon: Icon }) => <button key={key} className={page === key ? 'active' : ''} onClick={() => openPage(key)}><Icon size={18}/><span>{label}</span>{key === 'connectors' && <i>8</i>}</button>)}</nav>
      <div className="sidebar-foot"><Sparkles size={18}/><div><strong>Core ổn định</strong><small>Connector là plugin</small></div></div>
    </aside>
    {menuOpen && <button className="scrim" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
    <main>
      <header className="topbar">
        <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="Mở menu"><Menu /></button>
        <div><p>QUẢN TRỊ MARKETING AI AGENT - ANCV</p><span>{pageTitle(page)}</span></div>
        <div className="account">
          {!firebaseConfigured && <Badge tone="warning">Chế độ cấu hình</Badge>}
          {user ? <button onClick={() => logout()}><span>{user.email}</span></button> : <button onClick={async () => { try { await loginWithGoogle(); } catch { setToast('Không thể đăng nhập Google. Hãy kiểm tra quyền tài khoản.'); } }}><LogIn size={17}/><span>Đăng nhập Google</span></button>}
        </div>
      </header>
      <section className="workspace">
        {!firebaseConfigured && <div className="config-banner"><CircleAlert size={18}/><div><strong>Firebase production chưa được kết nối</strong><span>Giao diện đang dùng dữ liệu demo cô lập. Không connector nào được tự động gọi.</span></div></div>}
        {firebaseConfigured && authReady && !user ? <SignInScreen onLogin={async () => { try { await loginWithGoogle(); } catch { setToast('Tài khoản chưa được cấp quyền truy cập.'); } }}/> : <>
          {page === 'overview' && <Overview contents={contents} connectors={connectors} aiUsage={aiUsage} onNavigate={openPage} />}
          {contentType && <ContentStudioPage type={contentType} contents={contents.filter((item) => item.type === contentType)} localAgents={localAgents} onCreate={() => setShowCreate(contentType)} onToast={setToast} />}
          {page === 'connectors' && <ConnectorsPage connectors={connectors} onToast={setToast}/>} 
          {page === 'health' && <HealthPage connectors={connectors} localAgents={localAgents}/>}
          {page === 'settings' && <CompanySettings onToast={setToast}/>}
          {['schedule','social','website','seo','reports'].includes(page) && <PlaceholderPage page={page} contents={contents} connectors={connectors}/>}
        </>}
      </section>
    </main>
    {showCreate && <CreateContentModal type={showCreate} onClose={() => setShowCreate(null)} onSaved={() => { setShowCreate(null); setToast('Đã tạo Content mới.'); }}/>} 
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>;
}

function SignInScreen({ onLogin }: { onLogin: () => Promise<void> }) {
  return <section className="signin-panel"><div className="brand-mark"><ShieldCheck/></div><span className="eyebrow">KHU VỰC QUẢN TRỊ ANCV</span><h1>Đăng nhập để điều hành Marketing OS</h1><p>Chỉ tài khoản đã được Admin cấp vai trò mới có thể đọc hoặc thay đổi dữ liệu.</p><button className="primary" onClick={onLogin}><LogIn size={18}/>Tiếp tục với Google</button><small>Vai trò quản trị được cấp bằng Firebase Authentication và Firestore.</small></section>;
}

function Overview({ contents, connectors, aiUsage, onNavigate }: { contents: ContentRecord[]; connectors: ConnectorRecord[]; aiUsage: { requests: number; totalTokens: number; images: number }; onNavigate: (page: PageKey) => void }) {
  const published = contents.filter((item) => item.status === 'published' || item.status === 'partially_published').length;
  const actionCount = contents.flatMap((item) => item.platforms).filter((item) => item.status === 'needs_action' || item.status === 'manual_pending').length;
  const analyticsSources = [
    { platform: 'ga4' as const, label: 'GA4' },
    { platform: 'search_console' as const, label: 'Search Console' },
  ].map((source) => ({ ...source, connector: connectors.find((item) => item.platform === source.platform) }));
  return <>
    <div className="hero-row"><div><Badge tone="success">Core Marketing OS</Badge><h1>Điều hành Content rõ ràng,<br/><em>không bị khóa bởi API.</em></h1><p>Quản lý sản xuất, duyệt, đăng đa nền tảng và dữ liệu Marketing trong một luồng an toàn.</p></div><div className="hero-orbit"><span>CORE</span><i className="orbit-one">Content</i><i className="orbit-two">KPI</i><i className="orbit-three">API</i></div></div>
    <div className="stats-grid">
      <StatCard label="Tổng Content" value={contents.length} note="Video & bài viết" icon={FileText} tone="green"/>
      <StatCard label="Đã xuất bản" value={published} note="Bao gồm đăng một phần" icon={Check} tone="blue"/>
      <StatCard label="Cần xử lý" value={actionCount} note="Có thể chuyển thủ công" icon={CircleAlert} tone="amber"/>
      <StatCard label="AI usage tháng này" value={aiUsage.requests} note={`${aiUsage.totalTokens.toLocaleString('vi-VN')} tokens · ${aiUsage.images} ảnh`} icon={Sparkles} tone="violet"/>
    </div>
    <div className="pipeline-strip">
      <div><strong>{contents.filter((item) => item.type === 'video' && item.status === 'in_production').length}</strong><span>Video đang sản xuất</span></div>
      <div><strong>{contents.filter((item) => item.type === 'video' && item.status === 'post_production').length}</strong><span>Video chờ hậu kỳ</span></div>
      <div><strong>{contents.filter((item) => item.type === 'article' && item.status === 'generating').length}</strong><span>Article đang tạo</span></div>
      <div><strong>{contents.filter((item) => item.status === 'review').length}</strong><span>Content chờ duyệt</span></div>
      <div><strong>{contents.filter((item) => item.status === 'ready_to_publish').length}</strong><span>Sẵn sàng đăng</span></div>
      <div><strong>{contents.filter((item) => item.status === 'published').length}</strong><span>Đã đăng</span></div>
    </div>
    <section className="panel analytics-status-panel"><div className="panel-head"><div><span className="eyebrow">ANALYTICS SOURCES</span><h2>Dữ liệu Website & SEO</h2></div></div>
      {analyticsSources.map(({ platform, label, connector }) => <div className="health-row" key={platform}><div className={`health-indicator ${connector?.status === 'available' ? 'operational' : ''}`}></div><div><strong>{label}</strong><small>{connector?.testedAt ? `Kiểm tra lần cuối: ${new Date(connector.testedAt).toLocaleString('vi-VN')}` : 'Chưa có lần kiểm tra thành công'}</small></div><Badge tone={connector?.status === 'available' ? 'success' : 'neutral'}>{connector?.status === 'available' ? 'Đã kết nối' : 'Chưa kết nối'}</Badge></div>)}
    </section>
    <div className="two-columns">
      <section className="panel"><div className="panel-head"><div><span className="eyebrow">PIPELINE GẦN ĐÂY</span><h2>Content đang vận hành</h2></div><button className="text-button" onClick={() => onNavigate('video')}>Xem tất cả <ChevronRight size={16}/></button></div>
        <div className="content-list">{contents.slice(0,4).map((item) => <div className="content-row" key={item.id}><div className={`type-icon ${item.type}`} >{item.type === 'video' ? <Video/> : <FileText/>}</div><div className="grow"><strong>{item.title}</strong><span>{item.contentId}</span></div><Badge tone={item.status === 'partially_published' ? 'warning' : item.status === 'published' ? 'success' : 'info'}>{item.status === 'partially_published' ? 'Đã đăng một phần' : item.status === 'review' ? 'Chờ duyệt' : item.status}</Badge></div>)}</div>
      </section>
      <section className="panel"><div className="panel-head"><div><span className="eyebrow">CONNECTOR LAYER</span><h2>Tình trạng kết nối</h2></div><button className="text-button" onClick={() => onNavigate('connectors')}>Quản lý <ChevronRight size={16}/></button></div>
        <div className="connector-mini">{connectors.slice(0,6).map((item) => <div key={item.id}><span className={`platform-dot ${item.platform}`}>{platformLabels[item.platform][0]}</span><div><strong>{platformLabels[item.platform]}</strong><small>{connectorStatusVi[item.authenticationStatus]}</small></div><Badge tone="neutral">{connectorModeVi[item.mode]}</Badge></div>)}</div>
      </section>
    </div>
  </>;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ContentPage({ type, contents, onCreate, onToast }: { type: ContentType; contents: ContentRecord[]; onCreate: () => void; onToast: (text: string) => void }) {
  const [selected, setSelected] = useState<ContentRecord | null>(null);
  return <>
    <div className="page-heading"><div><span className="eyebrow">{type === 'video' ? 'VIDEO PIPELINE' : 'EDITORIAL PIPELINE'}</span><h1>{type === 'video' ? 'Content Video' : 'Content Bài viết'}</h1><p>{type === 'video' ? 'MASTER SCRIPT được nhập từ bên ngoài; Flow và CapCut luôn có lối tiếp tục thủ công.' : 'Sản xuất bài viết đa nền tảng, từ ý tưởng đến xuất bản.'}</p></div><button className="primary" onClick={onCreate}><Plus size={18}/>Tạo {type === 'video' ? 'Video' : 'Bài viết'}</button></div>
    <section className="panel table-panel">
      {contents.length === 0 ? <EmptyState text="Chưa có Content trong nhóm này."/> : <div className="data-table">
        <div className="table-header"><span>Content</span><span>Trạng thái</span><span>Nền tảng</span><span>Cập nhật</span></div>
        {contents.map((item) => <button className="table-row" key={item.id} onClick={() => setSelected(item)}><span><strong>{item.title}</strong><small>{item.contentId}</small></span><span><Badge tone={item.status.includes('published') ? 'success' : 'info'}>{item.status === 'partially_published' ? 'Đã đăng một phần' : item.status === 'review' ? 'Chờ duyệt' : 'Bản nháp'}</Badge></span><span className="platform-stack">{item.platforms.slice(0,5).map((platform) => <i key={platform.platform}>{platformLabels[platform.platform][0]}</i>)}</span><span>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</span></button>)}
      </div>}
    </section>
    {selected && <ContentDrawer content={selected} onClose={() => setSelected(null)} onToast={onToast}/>} 
  </>;
}

function ContentDrawer({ content, onClose, onToast }: { content: ContentRecord; onClose: () => void; onToast: (text: string) => void }) {
  const copy = async (value: string) => { await navigator.clipboard.writeText(value); onToast('Đã sao chép nội dung.'); };
  const markManual = async (platform: Platform) => {
    const url = window.prompt('Nhập URL bài đã đăng:'); if (!url) return;
    const platforms = content.platforms.map((item) => item.platform === platform ? { ...item, status: 'published' as const, postUrl: url, publishedAt: new Date().toISOString() } : item);
    await updateContent(content.id, { platforms, status: platforms.every((item) => item.status === 'published') ? 'published' : 'partially_published' });
    onToast(`Đã ghi nhận đăng thủ công trên ${platformLabels[platform]}.`); onClose();
  };
  return <><button className="drawer-scrim" onClick={onClose} aria-label="Đóng"/><aside className="drawer"><div className="drawer-head"><div><span className="eyebrow">{content.contentId}</span><h2>{content.title}</h2></div><button onClick={onClose}><X/></button></div>
    <div className="drawer-body"><section><h3>Nội dung sẵn sàng</h3><div className="copy-block"><p>{content.fullDescription || content.body || content.masterScript}</p><button onClick={() => copy(content.fullDescription || content.body || content.masterScript || '')}><Clipboard size={16}/> Sao chép</button></div></section>
      <section><h3>Trạng thái theo nền tảng</h3><div className="publication-list">{content.platforms.map((item) => <div key={item.platform}><span className={`platform-dot ${item.platform}`}>{platformLabels[item.platform][0]}</span><div><strong>{platformLabels[item.platform]}</strong><small>{connectorModeVi[item.mode]}</small></div><Badge tone={item.status === 'published' ? 'success' : item.status === 'needs_action' ? 'danger' : 'warning'}>{publishLabels[item.status]}</Badge>{item.status !== 'published' && <button className="small-action" onClick={() => markManual(item.platform)}>Đã đăng thủ công</button>}</div>)}</div></section>
      {content.type === 'video' && <section className="fallback"><CircleAlert/><div><strong>Flow Worker không bắt buộc</strong><p>Nếu Flow thất bại, upload Video Raw thủ công; sau CapCut, upload Video Final để tiếp tục.</p></div></section>}
    </div></aside></>;
}

function CreateContentModal({ type, onClose, onSaved }: { type: ContentType; onClose: () => void; onSaved: () => void }) {
  const options: Platform[] = type === 'video' ? ['youtube','tiktok','facebook','zalo','linkedin'] : ['website','facebook','zalo','linkedin'];
  const [busy, setBusy] = useState(false);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); const data = new FormData(event.currentTarget);
    try { await createContent({ type, title: String(data.get('title')), topic: String(data.get('topic')), body: '', masterScript: type === 'video' ? String(data.get('masterScript') ?? '') : undefined, objective: type === 'article' ? String(data.get('objective') ?? '') : undefined, shortDescription: type === 'article' ? String(data.get('emphasis') ?? '') : undefined, sourceMaterial: type === 'article' ? String(data.get('sourceMaterial') ?? '') : undefined, notes: type === 'article' ? String(data.get('notes') ?? '') : undefined, desiredLength: type === 'article' ? String(data.get('desiredLength') ?? '') : undefined, platforms: options.filter((platform) => data.get(platform) === 'on') }); onSaved(); }
    finally { setBusy(false); }
  };
  return <div className="modal-wrap"><button className="modal-scrim" onClick={onClose}/><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">TẠO MỚI</span><h2>{type === 'video' ? 'Content Video' : 'Content Bài viết'}</h2></div><button type="button" onClick={onClose}><X/></button></div>
    <label>Tiêu đề<input name="title" required placeholder="Nhập tiêu đề Content"/></label><label>Chủ đề<input name="topic" required placeholder="Chủ đề chiến dịch"/></label>
    {type === 'video' && <label>MASTER SCRIPT<textarea name="masterScript" rows={6} placeholder="Có thể nhập ngay hoặc lưu dự án trước rồi paste sau"/><small>AI không tạo MASTER SCRIPT.</small></label>}
    {type === 'article' && <><label>Mục tiêu bài<input name="objective" placeholder="Không bắt buộc"/></label><label>Thông tin cần nhấn mạnh<textarea name="emphasis" rows={3}/></label><label>Tài liệu nguồn<textarea name="sourceMaterial" rows={4} placeholder="Chỉ AI dùng các dữ kiện được cung cấp/xác minh"/></label><label>Ghi chú<textarea name="notes" rows={3}/></label><label>Độ dài mong muốn<input name="desiredLength" placeholder="Ví dụ: 800–1.000 từ"/></label></>}
    <fieldset><legend>Nền tảng đích</legend><div className="checkboxes">{options.map((platform) => <label key={platform}><input type="checkbox" name={platform} defaultChecked/><span>{platformLabels[platform]}</span></label>)}</div></fieldset>
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Hủy</button><button className="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Tạo Content'}</button></div>
  </form></div>;
}

function ConnectorsPage({ connectors, onToast }: { connectors: ConnectorRecord[]; onToast: (text: string) => void }) {
  const [testing, setTesting] = useState<Platform | null>(null);
  const run = async (platform: Platform) => {
    if (!['ga4', 'search_console', 'website'].includes(platform)) { onToast(`${platformLabels[platform]} chưa có test runner ở Giai đoạn 2A.`); return; }
    let url: string | undefined;
    if (platform === 'website') { url = window.prompt('Nhập URL Website cần kiểm tra (https://...):') ?? undefined; if (!url) return; }
    setTesting(platform);
    try { const result = await testConnector(platform as 'ga4' | 'search_console' | 'website', url); onToast(`Đã lưu kết quả ${platformLabels[platform]}: ${result.status}.`); }
    catch (error) { onToast(error instanceof Error ? error.message : 'Feasibility test thất bại.'); }
    finally { setTesting(null); }
  };
  return <><div className="page-heading"><div><span className="eyebrow">API FEASIBILITY</span><h1>Kết nối</h1><p>Chỉ bật tự động sau khi OAuth, quyền, request nghiệp vụ và refresh token đều PASS thực tế.</p></div></div><div className="connector-grid">{connectors.map((item) => <article className="connector-card" key={item.id}><div className="connector-title"><span className={`platform-dot large ${item.platform}`}>{platformLabels[item.platform][0]}</span><div><h3>{platformLabels[item.platform]}</h3><span>Kiểm tra gần nhất: {item.testedAt ? new Date(item.testedAt).toLocaleString('vi-VN') : 'Chưa có'}</span></div><Badge tone={item.status === 'available' ? 'success' : 'warning'}>{connectorStatusVi[item.status]}</Badge></div><dl><div><dt>OAuth</dt><dd>{connectorStatusVi[item.authenticationStatus]}</dd></div><div><dt>Publishing</dt><dd>{item.publishingCapability === 'unverified' ? 'Chưa xác minh' : item.publishingCapability}</dd></div><div><dt>Analytics</dt><dd>{item.analyticsCapability === 'unverified' ? 'Chưa xác minh' : item.analyticsCapability}</dd></div><div><dt>Mode</dt><dd><Badge tone="neutral">{connectorModeVi[item.mode]}</Badge></dd></div></dl><div className="limitation"><CircleAlert size={16}/><span>{item.limitations[0]}</span></div><button className="test-button" disabled={testing === item.platform} onClick={() => run(item.platform)}><Activity size={16}/>{testing === item.platform ? 'Đang kiểm tra…' : 'Test lại'}</button></article>)}</div></>;
}

function HealthPage({ connectors, localAgents }: { connectors: ConnectorRecord[]; localAgents: LocalAgentRecord[] }) {
  const now = new Date().toISOString();
  const [backend, setBackend] = useState<{ status: string; checkedAt: string; dependencies: Record<string, string> } | null>(null);
  const [heartbeatNow, setHeartbeatNow] = useState(() => Date.now());
  useEffect(() => { fetchBackendHealth().then(setBackend).catch(() => setBackend({ status: 'error', checkedAt: new Date().toISOString(), dependencies: {} })); }, []);
  useEffect(() => { const timer = window.setInterval(() => setHeartbeatNow(Date.now()), 15_000); return () => window.clearInterval(timer); }, []);
  const agent = localAgents.find((item) => item.id === 'ancv-windows-01') ?? localAgents[0];
  const agentOnline = Boolean(agent?.status === 'online' && heartbeatNow - new Date(agent.lastSeen).getTime() < 45_000);
  const groups = useMemo<Record<string, HealthItem[]>>(() => ({
    Core: [
      { key: 'web', label: 'Web App', status: 'operational', checkedAt: now }, { key: 'firebase', label: 'Firebase', status: firebaseConfigured ? 'operational' : 'configuration_required', checkedAt: now },
      { key: 'firestore', label: 'Firestore', status: firebaseConfigured ? 'operational' : 'configuration_required', checkedAt: now }, { key: 'storage', label: 'Storage', status: firebaseConfigured ? 'operational' : 'configuration_required', checkedAt: now },
    ],
    AI: [{ key: 'openai', label: 'OpenAI', status: backend?.dependencies.openai === 'operational' ? 'operational' : backend?.dependencies.openai === 'error' ? 'error' : backend?.dependencies.openai === 'configured_untested' ? 'partial' : 'configuration_required', checkedAt: backend?.checkedAt ?? now, detail: backend?.dependencies.openai === 'operational' ? 'Responses API và Image API đã PASS request thật' : backend?.dependencies.openai === 'configured_untested' ? 'Secret đã mount; chờ live smoke test' : 'Cần kiểm tra Secret Manager' }],
    Publishing: connectors.filter((item) => !['ga4','search_console'].includes(item.platform)).map((item) => ({ key: item.platform, label: platformLabels[item.platform], status: item.mode === 'manual' ? 'manual' : 'partial', checkedAt: now })),
    Analytics: [{ key: 'ga4', label: 'GA4', status: connectors.find((item) => item.platform === 'ga4')?.status === 'available' ? 'operational' : 'configuration_required', checkedAt: now }, { key: 'gsc', label: 'Search Console', status: connectors.find((item) => item.platform === 'search_console')?.status === 'available' ? 'operational' : 'configuration_required', checkedAt: now }, { key: 'social', label: 'Social Analytics', status: 'configuration_required', checkedAt: now }],
    Automation: [
      { key: 'local-agent', label: 'ANCV Local Agent', status: agentOnline ? 'operational' : 'error', checkedAt: agent?.lastSeen ?? now, detail: agentOnline ? `${agent?.machineName} — Online` : 'Offline hoặc heartbeat quá hạn' },
      { key: 'browser-bridge', label: 'Browser Bridge', status: agentOnline && agent?.bridgeStatus === 'connected' ? 'operational' : 'configuration_required', checkedAt: agent?.lastSeen ?? now, detail: agent?.bridgeStatus === 'connected' ? `Connected — ${agent.currentProfileId ?? 'profile'}` : 'Chưa có profile kết nối' },
      { key: 'flow', label: 'Flow Worker Playwright', status: 'manual', checkedAt: now, detail: 'Experimental fallback — không bị loại bỏ' },
    ],
  }), [agent?.bridgeStatus, agent?.currentProfileId, agent?.lastSeen, agent?.machineName, agentOnline, backend, connectors, now]);
  const healthVi: Record<HealthItem['status'], string> = { operational: 'Hoạt động', partial: 'Khả dụng một phần', configuration_required: 'Cần cấu hình', pending_review: 'Chờ phê duyệt', error: 'Lỗi', manual: 'Thủ công' };
  return <><div className="page-heading"><div><span className="eyebrow">SAFE FAILURE</span><h1>Tình trạng hệ thống</h1><p>Mỗi thành phần được giám sát độc lập; lỗi connector không làm Core dừng.</p></div><div className="health-summary"><span></span>Core đang hoạt động</div></div><div className="health-groups">{Object.entries(groups).map(([name, items]) => <section className="panel" key={name}><div className="panel-head"><h2>{name}</h2><small>Dữ liệu cập nhật lần cuối: {new Date().toLocaleTimeString('vi-VN')}</small></div>{items.map((item) => <div className="health-row" key={item.key}><div className={`health-indicator ${item.status}`}></div><div><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</div><Badge tone={item.status === 'operational' ? 'success' : item.status === 'error' ? 'danger' : 'warning'}>{healthVi[item.status]}</Badge></div>)}</section>)}</div></>;
}

function PlaceholderPage({ page, contents, connectors }: { page: PageKey; contents: ContentRecord[]; connectors: ConnectorRecord[] }) {
  const messages: Partial<Record<PageKey, string>> = { schedule: 'Lịch nội bộ đọc từ Firestore; connector lỗi không làm mất lịch.', social: 'Theo dõi kết quả đăng độc lập theo từng nền tảng.', website: 'Sẵn sàng cho API-first hoặc quy trình copy/upload thủ công.', seo: 'Search Console sẽ được bật sau feasibility test property access.', reports: 'Báo cáo chỉ dùng nguồn có dữ liệu và luôn ghi rõ nguồn thiếu.', settings: 'Cấu hình hệ thống, vai trò và chính sách connector.' };
  if (page === 'seo' && connectors.find((item) => item.platform === 'search_console')?.status !== 'available') {
    return <><div className="page-heading"><div><span className="eyebrow">GOOGLE SEARCH CONSOLE</span><h1>SEO</h1><p>Dữ liệu chỉ xuất hiện sau khi property access và Search Analytics request thực tế PASS.</p></div></div><section className="panel placeholder"><CircleAlert size={28}/><h2>Chưa kết nối</h2><p>Không có dữ liệu giả. Hãy cấp quyền property cho Service Account production rồi chạy Test lại ở trang Kết nối.</p></section></>;
  }
  return <><div className="page-heading"><div><span className="eyebrow">CORE MODULE</span><h1>{pageTitle(page)}</h1><p>{messages[page]}</p></div></div><section className="panel placeholder"><Sparkles size={28}/><h2>Module nền móng đã sẵn sàng</h2><p>Dữ liệu hiện có: {contents.length} Content. Chức năng nâng cao sẽ được mở theo roadmap mà không thay đổi kiến trúc Core.</p></section></>;
}
