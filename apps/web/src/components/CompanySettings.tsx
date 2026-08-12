import { useEffect, useState } from 'react';
import { MonitorCog, RefreshCw, Save, ShieldCheck } from 'lucide-react';
import { BROWSER_PLATFORMS, type BrowserPlatform, type BrowserProfileSettings, type CompanyProfile } from '@ancv/shared';
import {
  getBrowserProfiles, getCompanyProfile, getCurrentUserRole, saveBrowserProfileMappings,
  saveCompanyProfile, scanBrowserProfiles, testBrowserProfile, waitBrowserCommand,
  type BrowserProfilesResponse,
} from '../lib/repository';

const empty: CompanyProfile = { companyName:'',brandName:'',website:'',introduction:'',services:'',serviceAreas:'',contact:'',toneOfVoice:'',defaultCta:'',approvedFacts:'' };
const platformLabels: Record<BrowserPlatform,string> = { google_flow:'Google Flow',facebook:'Facebook',tiktok:'TikTok',linkedin:'LinkedIn',zalo:'Zalo' };
const profileStatusLabels = { ready:'Ready',login_required:'Cần đăng nhập',bridge_required:'Browser Bridge chưa sẵn sàng',unavailable:'Không truy cập được',not_tested:'Chưa kiểm tra' } as const;
const platformStatusLabels = { not_configured:'Chưa cấu hình',ready_for_write_test:'Sẵn sàng test đăng',login_required:'Cần đăng nhập',verification_required:'Cần xác minh',unavailable:'Không khả dụng',not_tested:'Chưa kiểm tra' } as const;

function selectionsFrom(settings: BrowserProfileSettings | null): Partial<Record<BrowserPlatform,string>> {
  return Object.fromEntries(BROWSER_PLATFORMS.map((platform) => [platform, settings?.mappings?.[platform]?.chromeProfileId ?? '']).filter(([,value]) => value)) as Partial<Record<BrowserPlatform,string>>;
}

export function CompanySettings({onToast}:{onToast:(text:string)=>void}) {
  const [profile,setProfile]=useState<CompanyProfile>(empty);
  const [busy,setBusy]=useState(false);
  const [admin,setAdmin]=useState(false);
  const [browser,setBrowser]=useState<BrowserProfilesResponse|null>(null);
  const [selections,setSelections]=useState<Partial<Record<BrowserPlatform,string>>>({});
  const [browserBusy,setBrowserBusy]=useState('');

  const loadBrowser = async () => {
    const result = await getBrowserProfiles();
    setBrowser(result); setSelections(selectionsFrom(result.settings));
    return result;
  };
  useEffect(()=>{
    getCompanyProfile().then(setProfile).catch(()=>undefined);
    getCurrentUserRole().then((role)=>{
      const isAdmin=role==='admin'; setAdmin(isAdmin);
      if(isAdmin) loadBrowser().catch(()=>undefined);
    }).catch(()=>undefined);
  },[]);
  const field=(key:keyof CompanyProfile,label:string,rows=1)=><label>{label}{rows>1?<textarea rows={rows} value={String(profile[key]??'')} onChange={(e)=>setProfile({...profile,[key]:e.target.value})}/>:<input value={String(profile[key]??'')} onChange={(e)=>setProfile({...profile,[key]:e.target.value})}/>}</label>;

  const runScan=async()=>{ setBrowserBusy('scan'); try { const {command}=await scanBrowserProfiles(); await waitBrowserCommand(command.id); await loadBrowser(); onToast('Đã quét metadata Chrome Profiles an toàn.'); } catch(error){ onToast(error instanceof Error?error.message:'Không thể quét Chrome Profiles.'); } finally { setBrowserBusy(''); } };
  const saveMappings=async()=>{ setBrowserBusy('save'); try { const {settings}=await saveBrowserProfileMappings(selections); setBrowser((current)=>current?{...current,settings}:current); onToast('Đã lưu cấu hình Chrome Profile.'); } catch(error){ onToast(error instanceof Error?error.message:'Không thể lưu cấu hình.'); } finally { setBrowserBusy(''); } };
  const runTest=async(platform:BrowserPlatform)=>{ setBrowserBusy(platform); try { const {command}=await testBrowserProfile(platform); const completed=await waitBrowserCommand(command.id); await loadBrowser(); if(completed.status==='needs_manual') throw new Error(completed.error??'Cần kiểm tra thủ công.'); onToast(`Đã kiểm tra ${platformLabels[platform]} ở chế độ chỉ đọc.`); } catch(error){ await loadBrowser().catch(()=>undefined); onToast(error instanceof Error?error.message:'Không thể kiểm tra profile.'); } finally { setBrowserBusy(''); } };
  const agentOnline=Boolean(browser?.agent.online);

  return <>
    <div className="page-heading"><div><span className="eyebrow">AI FACTUAL SAFETY</span><h1>Thông tin Công ty</h1><p>AI chỉ được sử dụng các dữ kiện đã xác minh tại đây hoặc trong input của từng Content.</p></div></div>
    <section className="panel company-settings"><div className="factual-note"><ShieldCheck/><div><strong>Không tự điền dữ liệu chưa xác minh</strong><p>Để trống trường chưa chắc chắn. Việc lưu profile không tự kích hoạt AI hay xuất bản.</p></div></div><div className="form-grid">{field('companyName','Tên Công ty')}{field('brandName','Tên thương hiệu')}{field('website','Website')}{field('contact','Thông tin liên hệ',3)}{field('introduction','Giới thiệu',5)}{field('services','Dịch vụ được phép nêu',5)}{field('serviceAreas','Khu vực hoạt động đã xác minh',3)}{field('toneOfVoice','Tone of voice',3)}{field('defaultCta','CTA mặc định',3)}{field('approvedFacts','Các thông tin được phép sử dụng',7)}</div><button className="primary" disabled={busy} onClick={async()=>{setBusy(true);try{setProfile(await saveCompanyProfile(profile));onToast('Đã lưu Thông tin Công ty.')}catch(error){onToast(error instanceof Error?error.message:'Không thể lưu.')}finally{setBusy(false)}}}><Save size={16}/>{busy?'Đang lưu…':'Lưu thông tin Công ty'}</button></section>
    {admin&&<section className="panel company-settings browser-profile-settings">
      <div className="section-title"><div><span className="eyebrow">LOCAL BROWSER</span><h2>Chrome Profiles & Kênh</h2><small>Chỉ lưu profile ID và nhãn; không đọc hoặc lưu cookie, mật khẩu, token hay lịch sử.</small></div><span className={`agent-indicator ${agentOnline?'online':'offline'}`}><i/>{agentOnline?'ANCV Local Agent · Online':'ANCV Local Agent · Offline'}</span></div>
      <button className="secondary" disabled={!agentOnline||Boolean(browserBusy)} onClick={runScan}><RefreshCw size={15}/>{browserBusy==='scan'?'Đang quét…':browser?.settings?.profiles?.length?'Quét lại':'Quét Chrome Profiles'}</button>
      {!agentOnline&&<p className="field-help">Local Agent đang offline. Chức năng quét và kiểm tra tạm khóa.</p>}
      <div className="profile-list"><strong>Chrome Profiles đã tìm thấy: {browser?.settings?.profiles?.length??0}</strong>{browser?.settings?.profiles?.map((item)=><div key={item.chromeProfileId}><span>{item.chromeProfileId}</span><b>{item.profileLabel}</b><small>{item.email??'Không có email trong metadata Chrome'}</small></div>)}</div>
      <div className="channel-profile-grid"><strong>Kênh & Profile</strong>{BROWSER_PLATFORMS.map((platform)=>{const mapping=browser?.settings?.mappings?.[platform];const validation=browser?.settings?.validations?.[platform];return <div className="channel-profile-row" key={platform}><label>{platformLabels[platform]}<select value={selections[platform]??''} onChange={(event)=>setSelections({...selections,[platform]:event.target.value||undefined})}><option value="">Chọn Chrome Profile</option>{browser?.settings?.profiles?.map((item)=><option value={item.chromeProfileId} key={item.chromeProfileId}>{item.chromeProfileId} — {item.profileLabel}{item.email?` — ${item.email}`:''}</option>)}</select></label><div className="profile-validation"><span>{validation?.profileStatus?profileStatusLabels[validation.profileStatus]:'Chưa kiểm tra'}</span><small>{validation?.platformStatus?platformStatusLabels[validation.platformStatus]:'Chưa cấu hình'}{validation?.detail?` · ${validation.detail}`:''}</small></div><button className="secondary" disabled={!agentOnline||Boolean(browserBusy)||!mapping||selections[platform]!==mapping.chromeProfileId} onClick={()=>runTest(platform)}><MonitorCog size={14}/>{browserBusy===platform?'Đang kiểm tra…':'Kiểm tra'}</button></div>})}</div>
      <button className="primary" disabled={Boolean(browserBusy)||!browser?.settings?.profiles?.length} onClick={saveMappings}><Save size={16}/>{browserBusy==='save'?'Đang lưu…':'Lưu cấu hình'}</button>
    </section>}
  </>;
}
