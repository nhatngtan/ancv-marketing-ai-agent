import { Inbox } from 'lucide-react';
export function EmptyState({ text }: { text: string }) { return <div className="empty"><Inbox size={28}/><p>{text}</p></div>; }

