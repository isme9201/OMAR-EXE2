'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clipboard, ExternalLink, Filter, Link2, Loader2, RefreshCw, Search, Share2, ShieldAlert, X } from 'lucide-react';
import { getUploadLinkStatus, type UploadLinkStatus } from '@/lib/avenmedia-policy';
import { createUploadLink, listUploadLinks, revokeUploadLink, uploadLinkUrl, type UploadLink } from '@/lib/avenmedia';
import { shareToChannel } from '@/lib/share-targets';

type TaskOption = { id: string; label: string; date?: string | null; details?: string | null };
type LinkStatus = UploadLinkStatus;

const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const statusFor = getUploadLinkStatus;
const statusLabel: Record<LinkStatus, string> = { active: 'فعال', expired: 'منتهي بعد 24 ساعة', revoked: 'ملغى' };
const statusTone: Record<LinkStatus, string> = { active: 'bg-[#e6ebff] text-[#142c9b]', expired: 'bg-[#fff1df] text-[#8a531d]', revoked: 'bg-[#f7e6e6] text-[#9b3434]' };

export function UploadLinkModal({ open, onClose, tasks = [] }: { open: boolean; onClose: () => void; tasks?: TaskOption[] }) {
  const [clientName, setClientName] = useState('');
  const [taskId, setTaskId] = useState('');
  const [history, setHistory] = useState<UploadLink[]>([]);
  const [created, setCreated] = useState<UploadLink | null>(null);
  const [loading, setLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [revokingId, setRevokingId] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | LinkStatus>('all');
  const [dateFilter, setDateFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const firstField = useRef<HTMLInputElement>(null);

  const loadHistory = async () => {
    setHistoryLoading(true);
    const result = await listUploadLinks();
    if (result.data) setHistory(result.data);
    if (result.error) setError(result.error);
    setHistoryLoading(false);
  };

  useEffect(() => {
    if (!open) return;
    setCreated(null); setError(''); setNotice(''); setQuery(''); setFilter('all'); setDateFilter('all');
    void loadHistory();
    const timer = window.setTimeout(() => firstField.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown); document.body.style.overflow = 'hidden';
    return () => { window.clearTimeout(timer); window.removeEventListener('keydown', onKeyDown); document.body.style.overflow = ''; };
  }, [open]);

  const activeCount = useMemo(() => history.filter((link) => statusFor(link) === 'active').length, [history]);
  const visibleHistory = useMemo(() => history.filter((link) => {
    const text = `${link.client_name || ''} ${link.task_id || ''} ${link.token}`.toLowerCase();
    const state = statusFor(link);
    const age = Date.now() - (Date.parse(link.created_at || link.expires_at) || Date.now());
    const dateMatch = dateFilter === 'all' || (dateFilter === 'today' ? age <= 24 * 60 * 60 * 1000 : dateFilter === '7d' ? age <= 7 * 24 * 60 * 60 * 1000 : age <= 30 * 24 * 60 * 60 * 1000);
    return (!query || text.includes(query.toLowerCase())) && (filter === 'all' || state === filter) && dateMatch;
  }), [history, query, filter, dateFilter]);
  if (!open) return null;

  const copy = async (url: string) => {
    try { await navigator.clipboard.writeText(url); setNotice('تم نسخ الرابط بنجاح.'); }
    catch { setError('تعذر نسخ الرابط تلقائياً؛ انسخه يدوياً من الحقل الظاهر.'); }
  };
  const share = async (url: string) => {
    try { setNotice(await shareToChannel('system', { title: 'رابط رفع Avenmedia', text: 'رابط رفع الملفات', url })); }
    catch (cause) { if (cause instanceof DOMException && cause.name === 'AbortError') return; setError(cause instanceof Error ? cause.message : 'تعذرت مشاركة الرابط'); }
  };
  const shareTo = async (url: string, network: 'whatsapp' | 'telegram' | 'instagram') => {
    try { setNotice(await shareToChannel(network, { title: 'رابط رفع Avenmedia', text: 'رابط رفع الملفات', url })); }
    catch (cause) { if (cause instanceof DOMException && cause.name === 'AbortError') return; setError(cause instanceof Error ? cause.message : 'تعذرت مشاركة الرابط'); }
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError(''); setNotice('');
    const result = await createUploadLink({ clientName: clientName.trim() || undefined, taskId: taskId || undefined, ttlHours: 24 });
    if (result.error || !result.data) { setError(result.error || 'تعذر إنشاء رابط الرفع.'); setLoading(false); return; }
    setCreated(result.data); setHistory((current) => [result.data!, ...current.filter((link) => link.id !== result.data!.id)]); setNotice('الرابط جاهز — انسخه أو أرسله للعميل.'); setLoading(false);
  };
  const revoke = async (link: UploadLink) => {
    if (statusFor(link) !== 'active' || !window.confirm(`إلغاء رابط ${link.client_name || 'العميل'}؟ لن يعود صالحاً للرفع.`)) return;
    setRevokingId(link.id); setError(''); const result = await revokeUploadLink(link.id);
    if (result.error) setError(result.error);
    else { const revokedAt = new Date().toISOString(); setHistory((current) => current.map((item) => item.id === link.id ? { ...item, revoked_at: revokedAt } : item)); setCreated((current) => current?.id === link.id ? { ...current, revoked_at: revokedAt } : current); setNotice('تم إلغاء الرابط بأمان.'); }
    setRevokingId('');
  };
  const renderActions = (link: UploadLink) => {
    const url = uploadLinkUrl(link.token); const valid = statusFor(link) === 'active';
    return <div className="mt-3 flex flex-wrap gap-2">
      <button type="button" disabled={!valid} onClick={() => void copy(url)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#142c9b] px-3 py-2 text-[11px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-40"><Clipboard className="h-3.5" />نسخ الرابط</button>
      <button type="button" disabled={!valid} onClick={() => void share(url)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbd4f5] bg-white px-3 py-2 text-[11px] font-extrabold text-[#142c9b] disabled:cursor-not-allowed disabled:opacity-40"><Share2 className="h-3.5" />مشاركة</button>
      <button type="button" disabled={!valid} onClick={() => void shareTo(url, 'whatsapp')} className="rounded-lg border border-[#cbd4f5] bg-white px-3 py-2 text-[11px] font-extrabold text-[#142c9b] disabled:opacity-40">WhatsApp Web</button>
      <button type="button" disabled={!valid} onClick={() => void shareTo(url, 'telegram')} className="rounded-lg border border-[#cbd4f5] bg-white px-3 py-2 text-[11px] font-extrabold text-[#142c9b] disabled:opacity-40">Telegram</button>
      <button type="button" disabled={!valid} onClick={() => void shareTo(url, 'instagram')} className="rounded-lg border border-[#cbd4f5] bg-white px-3 py-2 text-[11px] font-extrabold text-[#142c9b] disabled:opacity-40">Instagram</button>
      {valid && <button type="button" disabled={revokingId === link.id} onClick={() => void revoke(link)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#e4b9b9] bg-white px-3 py-2 text-[11px] font-extrabold text-[#9b3434] disabled:opacity-50">{revokingId === link.id ? <Loader2 className="h-3.5 animate-spin" /> : <ShieldAlert className="h-3.5" />}إلغاء الرابط</button>}
    </div>;
  };

  return <div className="fixed inset-0 z-[70] grid place-items-center bg-[#080d24]/65 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="upload-link-modal-title" dir="rtl" className="max-h-[94vh] w-full max-w-4xl overflow-y-auto rounded-[24px] bg-white p-5 text-[#080d24] shadow-2xl sm:p-6">
      <header className="flex items-start justify-between gap-4"><div><span className="font-mono text-[10px] tracking-[.16em] text-[#58617e]">UPLOAD LINK / LINK HISTORY</span><h2 id="upload-link-modal-title" className="mt-1 text-2xl font-black">رفع وإرسال طلب</h2><p className="mt-2 text-xs leading-6 text-[#58617e]">أنشئ رابطاً آمناً للعميل، ثم راجع سجل الروابط حتى الدقيقة. الروابط المنتهية بعد 24 ساعة تبقى للتدقيق وتظهر مشطوبة.</p></div><button type="button" onClick={onClose} aria-label="إغلاق نافذة رابط الرفع" className="rounded-full p-2 text-[#58617e] hover:bg-[#e6ebff]"><X className="h-5" /></button></header>
      <form onSubmit={submit} className="mt-5 grid gap-3 rounded-2xl border border-[#cbd4f5] bg-[#f7f9ff] p-4 md:grid-cols-[1.2fr_1fr_.8fr_auto] md:items-end"><label className="grid gap-1.5 text-xs font-bold text-[#58617e]"><span>اسم العميل</span><input ref={firstField} value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="مثال: شركة النور" className="h-11 rounded-xl border border-[#cbd4f5] bg-white px-3 text-sm outline-none focus:border-[#142c9b]" /></label><label className="grid gap-1.5 text-xs font-bold text-[#58617e]"><span>الطلب / المهمة</span>{tasks.length ? <select value={taskId} onChange={(event) => setTaskId(event.target.value)} className="h-11 rounded-xl border border-[#cbd4f5] bg-white px-3 text-sm outline-none focus:border-[#142c9b]"><option value="">بدون مهمة</option>{tasks.map((task) => <option key={task.id} value={task.id}>{task.label}</option>)}</select> : <input value={taskId} onChange={(event) => setTaskId(event.target.value)} placeholder="معرّف الطلب (اختياري)" className="h-11 rounded-xl border border-[#cbd4f5] bg-white px-3 text-sm outline-none focus:border-[#142c9b]" />}</label><div className="grid gap-1.5 text-xs font-bold text-[#58617e]"><span>مدة الصلاحية</span><span className="inline-flex h-11 items-center rounded-xl border border-[#cbd4f5] bg-white px-3 text-sm font-extrabold text-[#142c9b]">24 ساعة — ثابتة</span></div><button type="submit" disabled={loading} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#142c9b] px-4 text-xs font-extrabold text-white disabled:opacity-50">{loading ? <Loader2 className="h-4 animate-spin" /> : <Link2 className="h-4" />}إنشاء الرابط</button></form>
      {(error || notice) && <div role={error ? 'alert' : 'status'} className={`mt-3 rounded-xl p-3 text-xs font-bold ${error ? 'bg-[#f7e6e6] text-[#9b3434]' : 'bg-[#e6ebff] text-[#142c9b]'}`}>{error || notice}</div>}
      {created && <article className="mt-4 rounded-2xl border-2 border-[#3159d8] bg-[#f0f5ff] p-4"><div className="flex items-center gap-2 text-xs font-extrabold text-[#142c9b]"><Check className="h-4" />الرابط جاهز — انسخه أو أرسله للعميل</div><p dir="ltr" className="mt-3 break-all rounded-xl bg-white p-3 font-mono text-xs text-[#142c9b]">{uploadLinkUrl(created.token)}</p><p className="mt-2 text-[11px] text-[#58617e]">ينتهي: {dateTime(created.expires_at)}</p>{renderActions(created)}</article>}
      <div className="mt-6 flex flex-wrap items-end justify-between gap-3 border-b border-[#dfe5fb] pb-3"><div><span className="font-mono text-[10px] tracking-[.16em] text-[#58617e]">FULL LINK HISTORY</span><h3 className="mt-1 text-lg font-extrabold">سجل الروابط السابقة</h3></div><div className="flex flex-wrap gap-2"><span className="inline-flex items-center rounded-lg bg-[#e6ebff] px-3 py-2 text-[11px] font-bold text-[#142c9b]">{activeCount} فعال</span><button type="button" onClick={() => void loadHistory()} disabled={historyLoading} className="inline-flex items-center gap-1.5 rounded-lg border border-[#cbd4f5] px-3 py-2 text-[11px] font-bold text-[#142c9b] disabled:opacity-50">{historyLoading ? <Loader2 className="h-3.5 animate-spin" /> : <RefreshCw className="h-3.5" />}تحديث</button></div></div>
      <div className="mt-3 flex flex-wrap gap-2"><label className="relative min-w-[220px] flex-1"><Search className="absolute right-3 top-2.5 h-4 text-[#58617e]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم العميل أو الطلب أو الرابط" className="h-9 w-full rounded-lg border border-[#cbd4f5] bg-white pr-9 pl-3 text-xs outline-none focus:border-[#142c9b]" /></label><select value={filter} onChange={(event) => setFilter(event.target.value as typeof filter)} className="h-9 rounded-lg border border-[#cbd4f5] bg-white px-2 text-xs font-bold"><option value="all">كل الحالات</option><option value="active">فعال</option><option value="expired">منتهي بعد 24 ساعة</option><option value="revoked">ملغى</option></select><select value={dateFilter} onChange={(event) => setDateFilter(event.target.value as typeof dateFilter)} className="h-9 rounded-lg border border-[#cbd4f5] bg-white px-2 text-xs font-bold"><option value="all">كل التواريخ</option><option value="today">آخر 24 ساعة</option><option value="7d">آخر 7 أيام</option><option value="30d">آخر 30 يوماً</option></select><span className="inline-flex h-9 items-center gap-1 rounded-lg bg-[#f0f5ff] px-2 text-xs font-bold text-[#142c9b]"><Filter className="h-3.5" />{visibleHistory.length}</span></div>
      <div className="mt-3 space-y-2">{visibleHistory.length ? visibleHistory.map((link) => { const state = statusFor(link); return <article key={link.id} className={`rounded-xl border border-[#dfe5fb] bg-[#f7f9ff] p-3 ${state !== 'active' ? 'opacity-80' : ''}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-xs">{link.client_name || 'بدون اسم عميل'}</strong>{link.task_id && <span className="mr-2 text-[10px] text-[#58617e]">· الطلب {link.task_id}</span>}<p className="mt-1 text-[10px] leading-5 text-[#58617e]">أُنشئ: {dateTime(link.created_at)} · ينتهي: {dateTime(link.expires_at)}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${statusTone[state]}`}>{statusLabel[state]}</span></div><p dir="ltr" className={`mt-2 break-all font-mono text-[10px] ${state === 'active' ? 'text-[#3159d8]' : 'text-[#58617e] line-through opacity-70'}`}>{uploadLinkUrl(link.token)}</p>{renderActions(link)}</article>; }) : <p className="rounded-xl border border-dashed border-[#cbd4f5] p-6 text-center text-xs text-[#58617e]">لا توجد نتائج مطابقة لسجل الروابط.</p>}</div>
      <footer className="mt-4 flex items-center gap-2 text-[10px] text-[#58617e]"><ExternalLink className="h-3.5" />تظل السجلات السابقة مرئية للتدقيق، ولا يمكن نسخ أو مشاركة الرابط بعد انتهائه أو إلغائه.</footer>
    </section>
  </div>;
}
