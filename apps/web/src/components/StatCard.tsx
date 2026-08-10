import type { LucideIcon } from 'lucide-react';
export function StatCard({ label, value, note, icon: Icon, tone }: { label: string; value: string | number; note: string; icon: LucideIcon; tone: string }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}><Icon size={20} /></div><div><p>{label}</p><strong>{value}</strong><small>{note}</small></div></article>;
}

