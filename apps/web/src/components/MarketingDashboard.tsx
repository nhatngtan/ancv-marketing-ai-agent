import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Archive, BarChart3, CheckCircle2, Clock3, FileCheck2, FileText, FolderOpen,
  Plus, RefreshCw, Search, ShieldCheck, Video, Youtube,
} from 'lucide-react';
import type { ContentRecord, MarketingDashboardResponse, MarketingWorkFilter, MarketingWorkItem, Platform } from '@ancv/shared';
import { Badge } from './Badge';
import { StatCard } from './StatCard';
import { archiveContent, completeContent, fetchMarketingDashboard, openVideoFolder } from '../lib/repository';

const platformLabel: Partial<Record<Platform, string>> = {
  youtube: 'YouTube', facebook: 'Facebook', tiktok: 'TikTok', linkedin: 'LinkedIn', zalo: 'Zalo', website: 'Website',
};

const statusLabel: Record<string, string> = {
  idea: 'Ý tưởng', draft: 'Bản nháp', generating: 'Đang tạo Content', in_production: 'Đang sản xuất',
  post_production: 'Chờ hậu kỳ', awaiting_copy: 'Chờ tạo mô tả', review: 'Chờ duyệt', approved: 'Đã duyệt',
  ready_to_publish: 'Sẵn sàng đăng', scheduled: 'Đã lên lịch', partially_published: 'Đã đăng một phần',
  published: 'Đã đăng', archived: 'Lưu trữ', test: 'Test',
  completed: 'Hoàn tất',
};

function today() { return new Date().toISOString().slice(0, 10); }
function monthStart() { const date = new Date(); return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10); }
function formatNumber(value?: number) { return value === undefined ? 'Không khả dụng' : value.toLocaleString('vi-VN'); }
function formatMinutes(value?: number) { return value === undefined ? 'Không khả dụng' : `${Math.round(value).toLocaleString('vi-VN')} phút`; }

export function MarketingDashboard({ contents, onCreateWork = () => undefined, onOpenContent = () => undefined, onToast = () => undefined }: { contents: ContentRecord[]; onCreateWork?: () => void; onOpenContent?: (content: ContentRecord) => void; onToast?: (message: string) => void }) {
  const [data, setData] = useState<MarketingDashboardResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MarketingWorkFilter>('all');
  const [search, setSearch] = useState('');
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await fetchMarketingDashboard(monthStart(), today())); }
    catch { setError('Không thể cập nhật báo cáo lúc này. Core Content vẫn hoạt động bình thường.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => {
    let active = true;
    fetchMarketingDashboard(monthStart(), today())
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setError('Không thể cập nhật báo cáo lúc này. Core Content vẫn hoạt động bình thường.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  if (!data) return <DashboardFallback contents={contents} loading={loading} error={error} onRetry={load}/>;
  const operations = data.operations ?? { work: [], today: [] };
  const contentById = new Map(contents.map((content) => [content.id, content]));
  const normalizedSearch = search.trim().toLocaleLowerCase('vi');
  const work = operations.work.filter((item) => {
    const content = contentById.get(item.id);
    const matchesFilter = filter === 'all' || item.statusGroup === filter;
    const haystack = `${item.contentId} ${item.title} ${content?.topic ?? ''}`.toLocaleLowerCase('vi');
    return matchesFilter && (!normalizedSearch || haystack.includes(normalizedSearch));
  });
  const openItem = (contentId: string) => { const content = contentById.get(contentId); if (content) onOpenContent(content); };
  const runQuickAction = async (item: MarketingWorkItem) => {
    if (item.quickAction === 'open_video_folder') {
      try { await openVideoFolder(item.id); onToast('Đã mở thư mục Video.'); }
      catch { onToast('Không thể mở thư mục. Hãy kiểm tra Local Agent.'); }
      return;
    }
    openItem(item.id);
  };
  const markComplete = async (item: MarketingWorkItem) => {
    if (!window.confirm(`Xác nhận ${item.contentId} đã hoàn tất?`)) return;
    try { await completeContent(item.id); onToast(`Đã đánh dấu hoàn tất ${item.contentId}.`); await load(); }
    catch { onToast(`Không thể đánh dấu hoàn tất ${item.contentId}. Vui lòng thử lại.`); }
  };
  const archive = async (item: MarketingWorkItem) => {
    try { await archiveContent(item.id); onToast(`Đã lưu trữ ${item.contentId}.`); await load(); }
    catch { onToast(`Không thể lưu trữ ${item.contentId}. Vui lòng thử lại.`); }
  };
  return <>
    <div className="dashboard-heading">
      <div><span className="eyebrow">MARKETING OPERATIONS</span><h1>Công việc Marketing hôm nay</h1><p>Bắt đầu công việc, theo dõi tiến độ và xử lý những bước đang chờ trong một nơi.</p></div>
      <button className="secondary" disabled={loading} onClick={load}><RefreshCw size={16}/>{loading ? 'Đang cập nhật…' : 'Cập nhật'}</button>
    </div>
    {error && <div className="report-warning"><AlertTriangle size={16}/>{error}</div>}
    <section className="panel today-work"><div className="panel-head"><div><span className="eyebrow">ƯU TIÊN</span><h2>Việc cần làm hôm nay</h2></div><small>Tối đa {operations.today.length} việc cần hành động</small></div>
      {operations.today.length === 0 ? <p className="empty-line">Không có việc cần xử lý ngay.</p> : <div className="today-list">{operations.today.map((item) => <button key={item.id} onClick={() => openItem(item.contentDocId)}><i className={item.reason}/><span><strong>{item.label}</strong><small>{item.contentId}{item.dueDate ? ` · Hạn ${new Date(`${item.dueDate}T00:00:00`).toLocaleDateString('vi-VN')}` : ''}</small></span>{item.priority === 'high' && <Badge tone="warning">Ưu tiên cao</Badge>}</button>)}</div>}
    </section>
    <section className="quick-create-card"><div><span className="eyebrow">TẠO NHANH</span><h2>Bắt đầu công việc mới</h2><p>Hệ thống tự cấp Content ID và mở thẳng Studio phù hợp.</p></div><button className="primary" onClick={onCreateWork}><Plus size={17}/>Tạo công việc</button></section>
    <section className="dashboard-section"><div className="dashboard-section-title"><span>CÔNG VIỆC</span><small>Cập nhật {new Date(data.generatedAt).toLocaleString('vi-VN')}</small></div>
      <div className="stats-grid"><StatCard label="Đang làm" value={data.content.inProgress} note="Content đang trong pipeline" icon={Clock3} tone="blue"/><StatCard label="Cần duyệt" value={data.content.awaitingApproval} note="Cần Marketing Leader xem" icon={FileCheck2} tone="amber"/><StatCard label="Sẵn sàng đăng" value={data.content.readyToPublish} note="Đã duyệt hoặc đã lên lịch" icon={ShieldCheck} tone="violet"/><StatCard label="Hoàn tất" value={data.content.completed} note={`Tổng ${data.content.total} Content`} icon={CheckCircle2} tone="green"/></div>
    </section>
    <section className="panel operations-work"><div className="operations-toolbar"><div className="work-filters">{([['all','Tất cả'],['working','Đang làm'],['review','Cần duyệt'],['ready','Sẵn sàng đăng'],['completed','Hoàn tất']] as Array<[MarketingWorkFilter,string]>).map(([key,label]) => <button className={filter === key ? 'active' : ''} key={key} onClick={() => setFilter(key)}>{label}</button>)}</div><label className="work-search"><Search size={15}/><input aria-label="Tìm công việc" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm ID, tiêu đề, chủ đề"/></label></div>
      {work.length === 0 ? <p className="empty-line">Không tìm thấy công việc phù hợp.</p> : <div className="work-list">{work.map((item) => <article key={item.id} className={item.overdue ? 'overdue' : ''}><button className="work-main" onClick={() => openItem(item.id)}><span className={`work-type ${item.type}`}>{item.type === 'video' ? <Video size={16}/> : <FileText size={16}/>}</span><span className="work-name"><strong>{item.title}</strong><small>{item.contentId} · {item.type === 'video' ? 'Video' : 'Bài Website'}</small></span><Badge tone={item.statusGroup === 'completed' ? 'success' : item.overdue ? 'danger' : item.statusGroup === 'review' ? 'warning' : 'info'}>{item.statusLabel}</Badge><span className="work-progress"><i><b style={{ width: `${item.progress}%` }}/></i><small>{item.progress}% · {item.currentStep}</small></span><span className="work-due">{item.dueDate ? <><strong>{item.overdue ? 'Quá hạn' : 'Hạn hoàn thành'}</strong><small>{new Date(`${item.dueDate}T00:00:00`).toLocaleDateString('vi-VN')}</small></> : <small>Chưa đặt hạn</small>}</span><small className="work-updated">{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</small></button><div className="work-actions"><button className="secondary" onClick={() => runQuickAction(item)}>{item.quickAction === 'open_video_folder' && <FolderOpen size={14}/>} {item.quickActionLabel}</button>{item.statusGroup !== 'completed' && <button className="text-button" onClick={() => markComplete(item)}><CheckCircle2 size={14}/>Đánh dấu hoàn tất</button>}{item.status !== 'archived' && <button className="text-button" onClick={() => archive(item)}><Archive size={14}/>Lưu trữ</button>}</div></article>)}</div>}
    </section>
    <section className="dashboard-section"><div className="dashboard-section-title"><span>BÁO CÁO NHANH</span></div><div className="month-grid"><Metric label="Video tháng này" value={data.month.videos}/><Metric label="Bài Website" value={data.month.websiteArticles}/><Metric label="Đã đăng YouTube" value={data.month.youtubePublished}/><Metric label="Social đã ghi nhận" value={data.month.socialPublished}/></div></section>
    <div className="dashboard-columns"><YouTubeSummary data={data}/><section className="panel"><div className="panel-head"><div><span className="eyebrow">CẦN XỬ LÝ</span><h2>Tổng hợp</h2></div></div><div className="attention-list"><Attention label="Flow cần kiểm tra" value={data.pending.flowNeedsManual}/><Attention label="Lỗi đăng Content" value={data.pending.publishingErrors}/><Attention label="Local Agent" value={data.pending.localAgentOffline ? 'Offline' : 'Online'} danger={data.pending.localAgentOffline}/><Attention label="Content cần duyệt" value={data.pending.awaitingApproval}/></div></section></div>
    <section className="panel health-compact"><div className="panel-head"><div><span className="eyebrow">TÌNH TRẠNG</span><h2>Hệ thống Marketing</h2></div></div><div className="health-compact-grid">{data.health.map((item) => <div key={item.key}><i className={item.status}></i><span><strong>{item.label}</strong><small>{item.detail}</small></span></div>)}</div></section>
    <div className="analytics-safe-grid"><AnalyticsSafe title="GA4" label={data.analytics.ga4.label}/><AnalyticsSafe title="Search Console" label={data.analytics.searchConsole.label}/></div>
  </>;
}

export function MarketingReportPage() {
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [data, setData] = useState<MarketingDashboardResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try { setData(await fetchMarketingDashboard(from, to)); }
    catch { setError('Không thể tạo báo cáo cho khoảng thời gian này.'); }
    finally { setLoading(false); }
  }, [from, to]);
  useEffect(() => {
    let active = true;
    fetchMarketingDashboard(monthStart(), today())
      .then((result) => { if (active) setData(result); })
      .catch(() => { if (active) setError('Không thể tạo báo cáo cho khoảng thời gian này.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  return <>
    <div className="page-heading"><div><span className="eyebrow">BÁO CÁO MARKETING</span><h1>Báo cáo theo thời gian</h1><p>Chỉ dùng dữ liệu có thật từ Firestore và YouTube; nguồn thiếu luôn được ghi rõ.</p></div></div>
    <section className="panel report-filter"><label>Từ ngày<input type="date" value={from} max={to} onChange={(event) => setFrom(event.target.value)}/></label><label>Đến ngày<input type="date" value={to} min={from} max={today()} onChange={(event) => setTo(event.target.value)}/></label><button className="primary" disabled={loading || !from || !to} onClick={load}><BarChart3 size={16}/>{loading ? 'Đang tổng hợp…' : 'Xem báo cáo'}</button></section>
    {error && <div className="report-warning"><AlertTriangle size={16}/>{error}</div>}
    {data && <>
      <div className="stats-grid report-stats"><StatCard label="Video hoàn tất" value={data.report.completedVideos} note="Trong khoảng đã chọn" icon={Video} tone="blue"/><StatCard label="Bài viết hoàn tất" value={data.report.completedArticles} note="Trong khoảng đã chọn" icon={FileText} tone="violet"/><StatCard label="Lượt đăng đã ghi nhận" value={data.report.publishedPosts} note="Tổng các nền tảng" icon={CheckCircle2} tone="green"/><StatCard label="Content đang chờ" value={data.report.pendingContents} note="Chưa hoàn tất" icon={Clock3} tone="amber"/></div>
      <div className="dashboard-columns"><section className="panel"><div className="panel-head"><div><span className="eyebrow">YOUTUBE</span><h2>Hiệu quả trong kỳ</h2></div></div>{data.youtube.status === 'connected' ? <div className="report-youtube"><Metric label="Lượt xem" value={formatNumber(data.report.youtubeViews)}/><Metric label="Thời gian xem" value={formatMinutes(data.report.youtubeWatchMinutes)}/></div> : <SourceUnavailable label="Dữ liệu YouTube không khả dụng"/>}</section><section className="panel source-list"><div><strong>Nguồn có dữ liệu</strong><p>{data.report.availableSources.join(' · ') || 'Không có'}</p></div><div><strong>Nguồn còn thiếu</strong><p>{data.report.missingSources.join(' · ') || 'Không có'}</p></div></section></div>
      <PipelineTable data={data}/>
    </>}
  </>;
}

function DashboardFallback({ contents, loading, error, onRetry }: { contents: ContentRecord[]; loading: boolean; error: string; onRetry: () => void }) {
  return <><div className="dashboard-heading"><div><span className="eyebrow">MARKETING LEADER</span><h1>Tổng quan vận hành</h1><p>Core Content vẫn hoạt động độc lập khi nguồn báo cáo tạm thời không khả dụng.</p></div><button className="secondary" disabled={loading} onClick={onRetry}><RefreshCw size={16}/>{loading ? 'Đang tải…' : 'Thử lại'}</button></div>{error && <div className="report-warning"><AlertTriangle size={16}/>{error}</div>}<div className="stats-grid"><StatCard label="Tổng Content" value={contents.length} note="Dữ liệu Firestore đang hiển thị" icon={FileText} tone="green"/><StatCard label="Chờ duyệt" value={contents.filter((item) => item.status === 'review').length} note="Không phụ thuộc Analytics" icon={FileCheck2} tone="amber"/></div></>;
}

function Metric({ label, value }: { label: string; value: number | string }) { return <div className="metric-box"><strong>{value}</strong><span>{label}</span></div>; }
function Attention({ label, value, danger = Number(value) > 0 }: { label: string; value: number | string; danger?: boolean }) { return <div><span>{label}</span><Badge tone={danger ? 'warning' : 'success'}>{value}</Badge></div>; }
function AnalyticsSafe({ title, label }: { title: string; label: string }) { return <section className="panel analytics-safe"><div><strong>{title}</strong><span>{label}</span></div><Badge tone={label === 'Đã kết nối' ? 'success' : 'neutral'}>{label === 'Đã kết nối' ? 'Hoạt động' : 'Chưa kết nối'}</Badge></section>; }
function SourceUnavailable({ label }: { label: string }) { return <div className="source-unavailable"><AlertTriangle size={18}/><span>{label}</span></div>; }

function YouTubeSummary({ data }: { data: MarketingDashboardResponse }) {
  return <section className="panel youtube-summary"><div className="panel-head"><div><span className="eyebrow">YOUTUBE ANALYTICS</span><h2>{data.youtube.channelTitle || 'Kênh ANCV'}</h2></div><Youtube size={22}/></div>{data.youtube.status !== 'connected' ? <SourceUnavailable label="Dữ liệu YouTube không khả dụng"/> : <><div className="youtube-periods"><div><span>7 ngày</span><strong>{formatNumber(data.youtube.last7Days?.views)}</strong><small>lượt xem · {formatMinutes(data.youtube.last7Days?.watchMinutes)}</small></div><div><span>28 ngày</span><strong>{formatNumber(data.youtube.last28Days?.views)}</strong><small>lượt xem · {formatMinutes(data.youtube.last28Days?.watchMinutes)}</small></div><div><span>Video công khai</span><strong>{formatNumber(data.youtube.videoCount)}</strong><small>YouTube Data API</small></div></div><div className="youtube-engagement"><span>Người đăng ký tăng <b>{formatNumber(data.youtube.last28Days?.subscribersGained)}</b></span><span>Lượt thích <b>{formatNumber(data.youtube.last28Days?.likes)}</b></span><span>Bình luận <b>{formatNumber(data.youtube.last28Days?.comments)}</b></span></div>{data.youtube.topVideos.length > 0 && <div className="top-video-list"><strong>Video nổi bật</strong>{data.youtube.topVideos.slice(0, 3).map((video) => <div key={video.videoId}><span><b>{video.title}</b><small>{video.publishedAt ? new Date(video.publishedAt).toLocaleDateString('vi-VN') : 'Chưa có ngày đăng'}</small></span><em>{video.views.toLocaleString('vi-VN')} lượt xem<small>{Math.round(video.watchMinutes).toLocaleString('vi-VN')} phút · {video.likes.toLocaleString('vi-VN')} lượt thích</small></em></div>)}</div>}</>}</section>;
}

function PipelineTable({ data }: { data: MarketingDashboardResponse }) {
  return <section className="panel pipeline-report"><div className="panel-head"><div><span className="eyebrow">PIPELINE CONTENT</span><h2>Tiến độ gần đây</h2></div><small>{data.pipeline.length} Content</small></div>{data.pipeline.length === 0 ? <p className="empty-line">Chưa có Content.</p> : <div className="pipeline-table"><div className="pipeline-table-head"><span>Content</span><span>Bước hiện tại</span><span>Tiến độ</span><span>Nền tảng</span><span>Cập nhật</span></div>{data.pipeline.slice(0, 12).map((item) => <div className="pipeline-table-row" key={item.id}><span><strong>{item.title}</strong><small>{item.type === 'video' ? 'Video' : 'Bài viết'} · {statusLabel[item.status] ?? item.status}</small></span><span>{item.currentStep}</span><span><i><b style={{ width: `${item.progress}%` }}/></i><small>{item.progress}%</small></span><span className="pipeline-platforms">{item.platforms.filter((platform) => platform.status === 'published').map((platform) => <Badge key={platform.platform} tone="success">{platformLabel[platform.platform]}</Badge>)}{!item.platforms.some((platform) => platform.status === 'published') && <small>Chưa đăng</small>}</span><span>{new Date(item.updatedAt).toLocaleDateString('vi-VN')}</span></div>)}</div>}</section>;
}
