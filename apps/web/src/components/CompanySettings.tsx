import { useEffect, useState } from 'react';
import { Save, ShieldCheck } from 'lucide-react';
import type { CompanyProfile } from '@ancv/shared';
import { getCompanyProfile, saveCompanyProfile } from '../lib/repository';

const empty: CompanyProfile = { companyName:'',brandName:'',website:'',introduction:'',services:'',serviceAreas:'',contact:'',toneOfVoice:'',defaultCta:'',approvedFacts:'' };
export function CompanySettings({onToast}:{onToast:(text:string)=>void}) {
  const [profile,setProfile]=useState<CompanyProfile>(empty); const [busy,setBusy]=useState(false);
  useEffect(()=>{getCompanyProfile().then(setProfile).catch(()=>undefined)},[]);
  const field=(key:keyof CompanyProfile,label:string,rows=1)=><label>{label}{rows>1?<textarea rows={rows} value={String(profile[key]??'')} onChange={(e)=>setProfile({...profile,[key]:e.target.value})}/>:<input value={String(profile[key]??'')} onChange={(e)=>setProfile({...profile,[key]:e.target.value})}/>}</label>;
  return <><div className="page-heading"><div><span className="eyebrow">AI FACTUAL SAFETY</span><h1>Thông tin Công ty</h1><p>AI chỉ được sử dụng các dữ kiện đã xác minh tại đây hoặc trong input của từng Content.</p></div></div><section className="panel company-settings"><div className="factual-note"><ShieldCheck/><div><strong>Không tự điền dữ liệu chưa xác minh</strong><p>Để trống trường chưa chắc chắn. Việc lưu profile không tự kích hoạt AI hay xuất bản.</p></div></div><div className="form-grid">{field('companyName','Tên Công ty')}{field('brandName','Tên thương hiệu')}{field('website','Website')}{field('contact','Thông tin liên hệ',3)}{field('introduction','Giới thiệu',5)}{field('services','Dịch vụ được phép nêu',5)}{field('serviceAreas','Khu vực hoạt động đã xác minh',3)}{field('toneOfVoice','Tone of voice',3)}{field('defaultCta','CTA mặc định',3)}{field('approvedFacts','Các thông tin được phép sử dụng',7)}</div><button className="primary" disabled={busy} onClick={async()=>{setBusy(true);try{setProfile(await saveCompanyProfile(profile));onToast('Đã lưu Thông tin Công ty.')}catch(error){onToast(error instanceof Error?error.message:'Không thể lưu.')}finally{setBusy(false)}}}><Save size={16}/>{busy?'Đang lưu…':'Lưu thông tin Công ty'}</button></section></>;
}
