"use client";
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Bell, ExternalLink } from 'lucide-react';
import { getAuthClient } from '@/lib/avenmedia-auth';
import { listNotifications, markNotificationRead } from '@/lib/avenmedia-overdue';
export function NotificationBell() {
  const [open, setOpen] = useState(false); const [items, setItems] = useState<any[]>([]);
  const load = async () => { const result = await listNotifications(); setItems(result.data); };
  useEffect(() => { void load(); const db = getAuthClient() as any; const channel = db.channel('avenmedia-notifications').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'task_notifications' }, () => void load()).subscribe(); return () => { void db.removeChannel(channel); }; }, []);
  const unread = items.filter(item => !item.read_at).length;
  return <div className="relative"><button aria-label="الإشعارات" onClick={() => { setOpen(v => !v); void load(); }} className="relative grid h-10 w-10 place-items-center rounded-full border border-[#d9d0c3] bg-[#fffdf8] text-[#31453d]"><Bell className="h-[18px]" />{unread > 0 && <span className="absolute -left-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">{unread}</span>}</button>{open && <div className="absolute left-0 top-12 z-50 w-96 rounded-2xl border border-[#d9d0c3] bg-[#fffdf8] p-4 text-right text-[#17211f] shadow-2xl"><div className="mb-3 flex items-center justify-between"><strong>الإشعارات والمهام المطلوبة</strong><span className="rounded-full bg-indigo-50 px-2 py-1 text-xs text-indigo-700">{unread} جديدة</span></div><div className="max-h-80 space-y-2 overflow-auto">{items.length ? items.map(item => <div key={item.id} className={`rounded-xl border p-3 ${item.read_at ? 'border-slate-100 bg-slate-50' : 'border-indigo-100 bg-indigo-50'}`}><button className="w-full text-right" onClick={() => void markNotificationRead(item.id).then(load)}><strong className="block text-sm">{item.title}</strong><span className="mt-1 block text-xs text-slate-600">{item.body}</span></button><Link href="/production" onClick={() => void markNotificationRead(item.id)} className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-indigo-700">عرض المطلوب <ExternalLink className="h-3" /></Link></div>) : <p className="py-6 text-center text-sm text-slate-500">لا توجد إشعارات.</p>}</div></div>}</div>;
}
