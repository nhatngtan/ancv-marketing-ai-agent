import { addDoc, collection, deleteDoc, doc, onSnapshot, orderBy, query, serverTimestamp, updateDoc } from 'firebase/firestore';
import { DEFAULT_CONNECTORS, type ConnectorRecord, type ContentRecord, type ContentType, type Platform } from '@ancv/shared';
import { firebaseConfigured, firestore } from './firebase';
import { auth } from './firebase';

const demoContents: ContentRecord[] = [
  {
    id: 'demo-video', contentId: 'ANCV-VID-2026-001', type: 'video', title: '5 lớp bảo vệ an ninh cho doanh nghiệp',
    topic: 'An ninh doanh nghiệp', body: '', masterScript: 'MASTER SCRIPT được nhập từ bên ngoài hệ thống.',
    shortDescription: '5 lớp bảo vệ doanh nghiệp cần có.', fullDescription: 'Khung bảo vệ chủ động dành cho doanh nghiệp hiện đại.',
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: 'nhat.ngtan@gmail.com', status: 'partially_published',
    platforms: [
      { platform: 'youtube', mode: 'manual', status: 'published', postUrl: 'https://youtube.com' },
      { platform: 'facebook', mode: 'manual', status: 'published', postUrl: 'https://facebook.com' },
      { platform: 'tiktok', mode: 'manual', status: 'needs_action' },
      { platform: 'zalo', mode: 'manual', status: 'manual_pending' },
      { platform: 'linkedin', mode: 'manual', status: 'published', postUrl: 'https://linkedin.com' },
    ],
  },
  {
    id: 'demo-article', contentId: 'ANCV-ART-2026-001', type: 'article', title: 'Checklist lựa chọn dịch vụ bảo vệ chuyên nghiệp',
    topic: 'Dịch vụ bảo vệ', body: 'Nội dung mẫu cho quy trình biên tập và duyệt.', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    createdBy: 'nhat.ngtan@gmail.com', status: 'review', platforms: [
      { platform: 'website', mode: 'manual', status: 'manual_pending' },
      { platform: 'facebook', mode: 'manual', status: 'pending' },
      { platform: 'zalo', mode: 'manual', status: 'pending' },
      { platform: 'linkedin', mode: 'manual', status: 'pending' },
    ],
  },
];

function readLocal(): ContentRecord[] {
  try { return JSON.parse(localStorage.getItem('ancv-demo-contents') ?? 'null') ?? demoContents; } catch { return demoContents; }
}
function writeLocal(records: ContentRecord[]) { localStorage.setItem('ancv-demo-contents', JSON.stringify(records)); window.dispatchEvent(new Event('ancv-data')); }

export function subscribeContents(callback: (records: ContentRecord[]) => void): () => void {
  if (!firebaseConfigured || !firestore) {
    const notify = () => callback(readLocal()); notify(); window.addEventListener('ancv-data', notify);
    return () => window.removeEventListener('ancv-data', notify);
  }
  return onSnapshot(query(collection(firestore, 'contents'), orderBy('updatedAt', 'desc')), (snapshot) => {
    callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ContentRecord)));
  });
}

export function subscribeConnectors(callback: (records: ConnectorRecord[]) => void): () => void {
  if (!firebaseConfigured || !firestore) { callback(DEFAULT_CONNECTORS); return () => undefined; }
  return onSnapshot(collection(firestore, 'connectors'), (snapshot) => {
    callback(snapshot.empty ? DEFAULT_CONNECTORS : snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as ConnectorRecord)));
  });
}

export async function createContent(input: { type: ContentType; title: string; topic: string; body: string; masterScript?: string; platforms: Platform[] }) {
  const now = new Date();
  let contentId = `ANCV-${input.type === 'video' ? 'VID' : 'ART'}-${now.getFullYear()}-LOCAL-${String(Date.now()).slice(-5)}`;
  const backendUrl = import.meta.env.VITE_BACKEND_URL;
  if (firebaseConfigured && backendUrl) {
    const token = await auth?.currentUser?.getIdToken();
    if (!token) throw new Error('Cần đăng nhập bằng tài khoản đã được cấp quyền.');
    const response = await fetch(`${backendUrl}/v1/content/allocate-id`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ type: input.type }) });
    if (!response.ok) throw new Error('Không thể cấp Content ID.');
    contentId = (await response.json()).contentId;
  }
  const record = {
    ...input, contentId, status: 'draft', createdAt: now.toISOString(), updatedAt: now.toISOString(), createdBy: 'current-user',
    platforms: input.platforms.map((platform) => ({ platform, status: 'manual_pending' as const, mode: 'manual' as const })),
  };
  if (!firebaseConfigured || !firestore) { writeLocal([{ id: crypto.randomUUID(), ...record }, ...readLocal()]); return; }
  await addDoc(collection(firestore, 'contents'), { ...record, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function updateContent(id: string, changes: Partial<ContentRecord>) {
  if (!firebaseConfigured || !firestore) { writeLocal(readLocal().map((item) => item.id === id ? { ...item, ...changes, updatedAt: new Date().toISOString() } : item)); return; }
  await updateDoc(doc(firestore, 'contents', id), { ...changes, updatedAt: serverTimestamp() });
}

export async function removeContent(id: string) {
  if (!firebaseConfigured || !firestore) { writeLocal(readLocal().filter((item) => item.id !== id)); return; }
  await deleteDoc(doc(firestore, 'contents', id));
}
