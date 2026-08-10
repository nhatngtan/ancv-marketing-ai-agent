import { useEffect, useMemo, useState } from 'react';
import {
  Activity, BarChart3, CalendarDays, Check, ChevronRight, CircleAlert, Clipboard, FileText,
  Globe2, HeartPulse, LayoutDashboard, Link2, LogIn, Menu, Plus, Search, Settings, Share2,
  ShieldCheck, Sparkles, Video, X,
} from 'lucide-react';
import {
  connectorModeVi, connectorStatusVi, type ConnectorRecord, type ContentRecord, type ContentType,
  type HealthItem, type Platform, type PublishingStatus,
} from '@ancv/shared';
import { Badge } from './components/Badge';
import { EmptyState } from './components/EmptyState';
import { StatCard } from './components/StatCard';
import { firebaseConfigured, loginWithGoogle } from './lib/firebase';
import { createContent, subscribeConnectors, subscribeContents, updateContent } from './lib/repository';

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
  const [connectors, setConnectors] = useState<ConnectorRecord[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showCreate, setShowCreate] = useState<ContentType | null>(null);
  const [toast, setToast] = useState('');

  useEffect(() => subscribeContents(setContents), []);
  useEffect(() => subscribeConnectors(setConnectors), []);
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
          <button onClick={async () => { try { await loginWithGoogle(); } catch { setToast('Firebase chưa được cấu hình cho đăng nhập Google.'); } }}><LogIn size={17}/><span>Đăng nhập Google</span></button>
        </div>
      </header>
      <section className="workspace">
        {!firebaseConfigured && <div className="config-banner"><CircleAlert size={18}/><div><strong>Firebase production chưa được kết nối</strong><span>Giao diện đang dùng dữ liệu demo cô lập. Không connector nào được tự động gọi.</span></div></div>}
        {page === 'overview' && <Overview contents={contents} connectors={connectors} onNavigate={openPage} />}
        {contentType && <ContentPage type={contentType} contents={contents.filter((item) => item.type === contentType)} onCreate={() => setShowCreate(contentType)} onToast={setToast} />}
        {page === 'connectors' && <ConnectorsPage connectors={connectors} onToast={setToast}/>} 
        {page === 'health' && <HealthPage connectors={connectors}/>} 
        {['schedule','social','website','seo','reports','settings'].includes(page) && <PlaceholderPage page={page} contents={contents}/>} 
      </section>
    </main>
    {showCreate && <CreateContentModal type={showCreate} onClose={() => setShowCreate(null)} onSaved={() => { setShowCreate(null); setToast('Đã tạo Content mới.'); }}/>} 
    {toast && <div className="toast"><Check size={17}/>{toast}</div>}
  </div>;
}

function Overview({ contents, connectors, onNavigate }: { contents: ContentRecord[]; connectors: ConnectorRecord[]; onNavigate: (page: PageKey) => void }) {
  const published = contents.filter((item) => item.status === 'published' || item.status === 'partially_published').length;
  const actionCount = contents.flatMap((item) => item.platforms).filter((item) => item.status === 'needs_action' || item.status === 'manual_pending').length;
  return <>
    <div className="hero-row"><div><Badge tone="success">Core Marketing OS</Badge><h1>Điều hành Content rõ ràng,<br/><em>không bị khóa bởi API.</em></h1><p>Quản lý sản xuất, duyệt, đăng đa nền tảng và dữ liệu Marketing trong một luồng an toàn.</p></div><div className="hero-orbit"><span>CORE</span><i className="orbit-one">Content</i><i className="orbit-two">KPI</i><i className="orbit-three">API</i></div></div>
    <div className="stats-grid">
      <StatCard label="Tổng Content" value={contents.length} note="Video & bài viết" icon={FileText} tone="green"/>
      <StatCard label="Đã xuất bản" value={published} note="Bao gồm đăng một phần" icon={Check} tone="blue"/>
      <StatCard label="Cần xử lý" value={actionCount} note="Có thể chuyển thủ công" icon={CircleAlert} tone="amber"/>
      <StatCard label="Connector tự động" value={connectors.filter((item) => item.mode === 'automatic').length} note="Chỉ sau feasibility PASS" icon={Link2} tone="violet"/>
    </div>
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
    await createContent({ type, title: String(data.get('title')), topic: String(data.get('topic')), body: String(data.get('body')), masterScript: type === 'video' ? String(data.get('masterScript')) : undefined, platforms: options.filter((platform) => data.get(platform) === 'on') });
    onSaved();
  };
  return <div className="modal-wrap"><button className="modal-scrim" onClick={onClose}/><form className="modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">TẠO MỚI</span><h2>{type === 'video' ? 'Content Video' : 'Content Bài viết'}</h2></div><button type="button" onClick={onClose}><X/></button></div>
    <label>Tiêu đề<input name="title" required placeholder="Nhập tiêu đề Content"/></label><label>Chủ đề<input name="topic" required placeholder="Chủ đề chiến dịch"/></label>
    {type === 'video' && <label>MASTER SCRIPT<textarea name="masterScript" required rows={6} placeholder="Dán MASTER SCRIPT đã chuẩn bị bên ngoài hệ thống"/><small>AI không tạo MASTER SCRIPT.</small></label>}
    {type === 'article' && <label>Nội dung/Brief<textarea name="body" rows={6} placeholder="Nhập brief hoặc nội dung bài viết"/></label>}
    <fieldset><legend>Nền tảng đích</legend><div className="checkboxes">{options.map((platform) => <label key={platform}><input type="checkbox" name={platform} defaultChecked/><span>{platformLabels[platform]}</span></label>)}</div></fieldset>
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Hủy</button><button className="primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Tạo Content'}</button></div>
  </form></div>;
}

function ConnectorsPage({ connectors, onToast }: { connectors: ConnectorRecord[]; onToast: (text: string) => void }) {
  return <><div className="page-heading"><div><span className="eyebrow">API FEASIBILITY</span><h1>Kết nối</h1><p>Chỉ bật tự động sau khi OAuth, quyền, request nghiệp vụ và refresh token đều PASS thực tế.</p></div></div><div className="connector-grid">{connectors.map((item) => <article className="connector-card" key={item.id}><div className="connector-title"><span className={`platform-dot large ${item.platform}`}>{platformLabels[item.platform][0]}</span><div><h3>{platformLabels[item.platform]}</h3><span>Kiểm tra gần nhất: {item.testedAt ? new Date(item.testedAt).toLocaleString('vi-VN') : 'Chưa có'}</span></div><Badge tone={item.authenticationStatus === 'available' ? 'success' : 'warning'}>{connectorStatusVi[item.authenticationStatus]}</Badge></div><dl><div><dt>OAuth</dt><dd>{connectorStatusVi[item.authenticationStatus]}</dd></div><div><dt>Publishing</dt><dd>{item.publishingCapability === 'unverified' ? 'Chưa xác minh' : item.publishingCapability}</dd></div><div><dt>Analytics</dt><dd>{item.analyticsCapability === 'unverified' ? 'Chưa xác minh' : item.analyticsCapability}</dd></div><div><dt>Mode</dt><dd><Badge tone="neutral">{connectorModeVi[item.mode]}</Badge></dd></div></dl><div className="limitation"><CircleAlert size={16}/><span>{item.limitations[0]}</span></div><button className="test-button" onClick={() => onToast(`Không chạy test giả cho ${platformLabels[item.platform]}; cần credential production.`)}><Activity size={16}/>Test lại</button></article>)}</div></>;
}

function HealthPage({ connectors }: { connectors: ConnectorRecord[] }) {
  const now = new Date().toISOString();
  const groups = useMemo(() => ({
    Core: [
      { key: 'web', label: 'Web App', status: 'operational', checkedAt: now }, { key: 'firebase', label: 'Firebase', status: firebaseConfigured ? 'operational' : 'configuration_required', checkedAt: now },
      { key: 'firestore', label: 'Firestore', status: firebaseConfigured ? 'operational' : 'configuration_required', checkedAt: now }, { key: 'storage', label: 'Storage', status: firebaseConfigured ? 'operational' : 'configuration_required', checkedAt: now },
    ],
    AI: [{ key: 'openai', label: 'OpenAI', status: 'configuration_required', checkedAt: now, detail: 'Chờ Secret Manager' }],
    Publishing: connectors.filter((item) => !['ga4','search_console'].includes(item.platform)).map((item) => ({ key: item.platform, label: platformLabels[item.platform], status: item.mode === 'manual' ? 'manual' : 'partial', checkedAt: now })),
    Analytics: [{ key: 'ga4', label: 'GA4', status: 'configuration_required', checkedAt: now }, { key: 'gsc', label: 'Search Console', status: 'configuration_required', checkedAt: now }, { key: 'social', label: 'Social Analytics', status: 'configuration_required', checkedAt: now }],
    Automation: [{ key: 'flow', label: 'Flow Worker', status: 'manual', checkedAt: now, detail: 'Experimental — manual fallback sẵn sàng' }],
  } satisfies Record<string, HealthItem[]>), [connectors, now]);
  const healthVi: Record<HealthItem['status'], string> = { operational: 'Hoạt động', partial: 'Khả dụng một phần', configuration_required: 'Cần cấu hình', pending_review: 'Chờ phê duyệt', error: 'Lỗi', manual: 'Thủ công' };
  return <><div className="page-heading"><div><span className="eyebrow">SAFE FAILURE</span><h1>Tình trạng hệ thống</h1><p>Mỗi thành phần được giám sát độc lập; lỗi connector không làm Core dừng.</p></div><div className="health-summary"><span></span>Core đang hoạt động</div></div><div className="health-groups">{Object.entries(groups).map(([name, items]) => <section className="panel" key={name}><div className="panel-head"><h2>{name}</h2><small>Dữ liệu cập nhật lần cuối: {new Date().toLocaleTimeString('vi-VN')}</small></div>{items.map((item) => <div className="health-row" key={item.key}><div className={`health-indicator ${item.status}`}></div><div><strong>{item.label}</strong>{item.detail && <small>{item.detail}</small>}</div><Badge tone={item.status === 'operational' ? 'success' : item.status === 'error' ? 'danger' : 'warning'}>{healthVi[item.status]}</Badge></div>)}</section>)}</div></>;
}

function PlaceholderPage({ page, contents }: { page: PageKey; contents: ContentRecord[] }) {
  const messages: Partial<Record<PageKey, string>> = { schedule: 'Lịch nội bộ đọc từ Firestore; connector lỗi không làm mất lịch.', social: 'Theo dõi kết quả đăng độc lập theo từng nền tảng.', website: 'Sẵn sàng cho API-first hoặc quy trình copy/upload thủ công.', seo: 'Search Console sẽ được bật sau feasibility test property access.', reports: 'Báo cáo chỉ dùng nguồn có dữ liệu và luôn ghi rõ nguồn thiếu.', settings: 'Cấu hình hệ thống, vai trò và chính sách connector.' };
  return <><div className="page-heading"><div><span className="eyebrow">CORE MODULE</span><h1>{pageTitle(page)}</h1><p>{messages[page]}</p></div></div><section className="panel placeholder"><Sparkles size={28}/><h2>Module nền móng đã sẵn sàng</h2><p>Dữ liệu hiện có: {contents.length} Content. Chức năng nâng cao sẽ được mở theo roadmap mà không thay đổi kiến trúc Core.</p></section></>;
}

