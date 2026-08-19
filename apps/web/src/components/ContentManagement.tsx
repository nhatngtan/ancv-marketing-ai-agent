import { useEffect, useMemo, useState } from 'react';
import { FolderOpen, Plus, Search, Settings2, X } from 'lucide-react';
import {
  CONTENT_MANAGEMENT_CHANNEL_IDS,
  type ContentManagementChannelId,
  type ContentManagementSettings,
  type ContentRecord,
  type LocalAgentRecord,
} from '@ancv/shared';
import { Badge } from './Badge';
import { getContentManagementSettings, openContentFolder, saveContentManagementSettings } from '../lib/repository';
import { channelStatusForContent, managementContentStatusLabel, type SimpleChannelStatus } from '../lib/content-management';

const channelLabels: Record<ContentManagementChannelId, string> = {
  website: 'Website', youtube: 'YouTube', facebook: 'Facebook', tiktok: 'TikTok', zalo: 'Zalo', linkedin: 'LinkedIn',
};
const defaultSettings: ContentManagementSettings = { enabledChannels: [...CONTENT_MANAGEMENT_CHANNEL_IDS], customChannels: [] };

function ChannelStatus({ value }: { value: SimpleChannelStatus }) {
  const labels: Record<SimpleChannelStatus, string> = { none: '—', pending: 'Chưa đăng', scheduled: 'Đã lên lịch', published: 'Đã đăng' };
  return <span className={`channel-status-value ${value}`}>{labels[value]}</span>;
}

interface ContentManagementProps {
  contents: ContentRecord[];
  localAgents: LocalAgentRecord[];
  onOpenContent: (content: ContentRecord) => void;
  onToast: (message: string) => void;
  loadSettings?: typeof getContentManagementSettings;
  saveSettings?: typeof saveContentManagementSettings;
  openFolder?: typeof openContentFolder;
}

export function ContentManagementPage({
  contents, localAgents, onOpenContent, onToast,
  loadSettings = getContentManagementSettings,
  saveSettings = saveContentManagementSettings,
  openFolder = openContentFolder,
}: ContentManagementProps) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'video' | 'article'>('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [settings, setSettings] = useState<ContentManagementSettings>(defaultSettings);
  const [showSettings, setShowSettings] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [clockMs, setClockMs] = useState(() => Date.now());

  useEffect(() => {
    let active = true;
    loadSettings().then((value) => { if (active) setSettings(value); }).catch(() => undefined);
    return () => { active = false; };
  }, [loadSettings]);

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleChannels = useMemo(() => [
    ...settings.enabledChannels.map((id) => ({ id, name: channelLabels[id] })),
    ...settings.customChannels.filter((item) => item.enabled).map((item) => ({ id: item.id, name: item.name })),
  ], [settings]);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi');
    return contents.filter((content) => {
      if (typeFilter !== 'all' && content.type !== typeFilter) return false;
      if (statusFilter !== 'all' && content.status !== statusFilter) return false;
      return !normalized || `${content.contentId} ${content.title}`.toLocaleLowerCase('vi').includes(normalized);
    });
  }, [contents, query, statusFilter, typeFilter]);
  const statuses = useMemo(() => [...new Set(contents.map((item) => item.status))], [contents]);
  const summary = useMemo(() => ({
    total: contents.length,
    working: contents.filter((item) => ['idea', 'draft', 'generating', 'in_production', 'post_production', 'awaiting_copy', 'review'].includes(item.status)).length,
    ready: contents.filter((item) => ['approved', 'ready_to_publish', 'scheduled'].includes(item.status)).length,
    published: contents.filter((item) => ['partially_published', 'published', 'completed'].includes(item.status)).length,
  }), [contents]);
  const agent = localAgents.find((item) => item.id === 'ancv-windows-01') ?? localAgents[0];
  const agentOnline = Boolean(clockMs && agent?.status === 'online' && agent.workspaceAvailable && clockMs - Date.parse(agent.lastSeen) < 45_000);

  const openProjectFolder = async (content: ContentRecord) => {
    if (!agentOnline) { onToast('Không thể mở thư mục. Hãy kiểm tra ANCV Local Agent.'); return; }
    setOpeningId(content.id);
    try { await openFolder(content.id); onToast('Đã mở thư mục Content.'); }
    catch { onToast('Không thể mở thư mục. Hãy kiểm tra ANCV Local Agent.'); }
    finally { setOpeningId(null); }
  };

  return <>
    <div className="page-heading content-management-heading"><div><span className="eyebrow">CONTENT OPERATIONS</span><h1>Quản lý nội dung</h1><p>Mỗi hàng là một Content. Trạng thái được lấy tự động từ quy trình hiện có.</p></div><button className="secondary" onClick={() => setShowSettings(true)}><Settings2 size={16}/>Cấu hình kênh</button></div>
    <div className="management-summary" aria-label="Tổng hợp Content">
      <div><span>Tổng nội dung</span><strong>{summary.total}</strong></div>
      <div className="working"><span>Đang làm</span><strong>{summary.working}</strong></div>
      <div className="ready"><span>Sẵn sàng đăng</span><strong>{summary.ready}</strong></div>
      <div className="published"><span>Đã đăng</span><strong>{summary.published}</strong></div>
    </div>
    <section className="panel content-management-panel">
      <div className="content-management-toolbar">
        <label className="management-search"><Search size={16}/><span className="sr-only">Tìm Content</span><input aria-label="Tìm Content" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tên hoặc mã Content"/></label>
        <label><span>Loại</span><select aria-label="Lọc theo loại" value={typeFilter} onChange={(event) => setTypeFilter(event.target.value as typeof typeFilter)}><option value="all">Tất cả</option><option value="video">Video</option><option value="article">Bài viết</option></select></label>
        <label><span>Tình trạng</span><select aria-label="Lọc theo tình trạng" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Tất cả</option>{statuses.map((status) => <option key={status} value={status}>{managementContentStatusLabel(status)}</option>)}</select></label>
      </div>
      <div className="management-table-wrap">
        <table className="management-table">
          <thead><tr><th className="management-title-column">Nội dung</th><th className="management-type-column">Loại</th><th className="management-status-column">Tình trạng</th><th className="management-channel-column">Kênh</th><th className="management-folder-column">Thư mục</th><th className="management-updated-column">Cập nhật</th></tr></thead>
          <tbody>{filtered.map((content) => <tr key={content.id}>
            <td className="management-title-column"><button className="content-name-button" onClick={() => onOpenContent(content)}>{content.title}</button></td>
            <td className="management-type-column"><Badge tone={content.type === 'video' ? 'info' : 'neutral'}>{content.type === 'video' ? 'Video' : 'Bài viết'}</Badge></td>
            <td className="management-status-column"><Badge tone={['published','completed'].includes(content.status) ? 'success' : ['review','post_production','scheduled'].includes(content.status) ? 'warning' : 'info'}>{managementContentStatusLabel(content.status)}</Badge></td>
            <td className="management-channel-column"><div className="channel-status-list">{visibleChannels.map((channel) => <span className={`channel-status-chip ${channelStatusForContent(content, channel.id)}`} key={channel.id}><b>{channel.name}</b><ChannelStatus value={channelStatusForContent(content, channel.id)}/></span>)}</div></td>
            <td className="management-folder-column"><button className="folder-button" aria-label={openingId === content.id ? 'Đang mở thư mục' : 'Mở thư mục'} disabled={openingId === content.id} onClick={() => openProjectFolder(content)}><FolderOpen size={14}/><span>{openingId === content.id ? 'Đang mở…' : 'Mở thư mục'}</span></button></td>
            <td className="management-updated-column"><span className="updated-cell">{new Date(content.updatedAt).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })}</span></td>
          </tr>)}</tbody>
        </table>
        {filtered.length === 0 && <div className="management-empty">Không tìm thấy Content phù hợp.</div>}
      </div>
    </section>
    {showSettings && <ChannelConfigModal settings={settings} onClose={() => setShowSettings(false)} onSave={async (value) => {
      try { const saved = await saveSettings(value); setSettings(saved); setShowSettings(false); onToast('Đã lưu cấu hình kênh.'); }
      catch { onToast('Không thể lưu cấu hình kênh. Vui lòng thử lại.'); }
    }}/>} 
  </>;
}

export function ChannelConfigModal({ settings, onClose, onSave }: { settings: ContentManagementSettings; onClose: () => void; onSave: (value: ContentManagementSettings) => Promise<void> }) {
  const [draft, setDraft] = useState<ContentManagementSettings>({ enabledChannels: [...settings.enabledChannels], customChannels: settings.customChannels.map((item) => ({ ...item })) });
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const toggleDefault = (id: ContentManagementChannelId) => setDraft((current) => ({ ...current, enabledChannels: current.enabledChannels.includes(id) ? current.enabledChannels.filter((item) => item !== id) : [...current.enabledChannels, id] }));
  const addCustom = () => {
    const trimmed = name.trim(); if (!trimmed) return;
    setDraft((current) => ({ ...current, customChannels: [...current.customChannels, { id: `custom-${Date.now().toString(36)}`, name: trimmed, enabled: true }] }));
    setName('');
  };
  return <div className="modal-wrap"><button className="modal-scrim" onClick={onClose}/><section className="modal channel-config-modal" role="dialog" aria-modal="true" aria-label="Cấu hình kênh"><div className="modal-head"><div><span className="eyebrow">HIỂN THỊ BẢNG</span><h2>Cấu hình kênh</h2></div><button onClick={onClose} aria-label="Đóng"><X/></button></div>
    <div className="channel-config-body"><h3>Kênh mặc định</h3><div className="channel-toggle-grid">{CONTENT_MANAGEMENT_CHANNEL_IDS.map((id) => <label key={id}><input type="checkbox" checked={draft.enabledChannels.includes(id)} onChange={() => toggleDefault(id)}/><span>{channelLabels[id]}</span></label>)}</div>
      <h3>Kênh thêm</h3>{draft.customChannels.length > 0 && <div className="custom-channel-list">{draft.customChannels.map((channel) => <label key={channel.id}><input type="checkbox" checked={channel.enabled} onChange={() => setDraft((current) => ({ ...current, customChannels: current.customChannels.map((item) => item.id === channel.id ? { ...item, enabled: !item.enabled } : item) }))}/><span>{channel.name}</span></label>)}</div>}
      <div className="add-channel-row"><input aria-label="Tên kênh mới" value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="Tên kênh mới"/><button type="button" className="secondary" disabled={!name.trim()} onClick={addCustom}><Plus size={15}/>Thêm kênh</button></div>
    </div>
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Hủy</button><button className="primary" disabled={busy} onClick={async () => { setBusy(true); try { await onSave(draft); } finally { setBusy(false); } }}>{busy ? 'Đang lưu…' : 'Lưu cấu hình'}</button></div>
  </section></div>;
}
