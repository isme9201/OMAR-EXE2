'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, Eye, FileImage, FileVideo, Filter, Loader2, MessageSquareText, RefreshCw, Search, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { listUploadRecords, updateUploadRecord, type UploadRecord, type UploadStatus } from '@/lib/avenmedia';

const statuses: Array<{ value: 'all' | UploadStatus; label: string }> = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'new', label: 'جديد' },
  { value: 'viewed', label: 'تمت المشاهدة' },
  { value: 'in_progress', label: 'قيد المعالجة' },
  { value: 'delivered', label: 'تم التسليم' },
  { value: 'needs_reupload', label: 'يحتاج إعادة رفع' },
];
const statusLabel = (value?: string | null) => statuses.find((item) => item.value === value)?.label ?? 'جديد';
const statusTone: Record<string, string> = { new: 'bg-[#e6ebff] text-[#142c9b]', viewed: 'bg-[#eef2ff] text-[#233f9f]', in_progress: 'bg-[#fff1df] text-[#8e4f27]', delivered: 'bg-[#e3eee9] text-[#0b4d3e]', needs_reupload: 'bg-[#f7e6e6] text-[#9b3434]' };
const formatBytes = (bytes?: number | null) => !bytes ? 'الحجم غير متاح' : bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const fileName = (item: UploadRecord) => item.file_name || item.client_name || item.secure_url?.split('/').pop()?.split('?')[0] || 'ملف بدون اسم';
const mediaKind = (item: UploadRecord) => item.resource_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes((item.format || '').toLowerCase()) ? 'video' : 'image';

export function UploadRoom() {
  const [items, setItems] = useState<UploadRecord[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | UploadStatus>('all');
  const [kind, setKind] = useState<'all' | 'image' | 'video'>('all');
  const [busy, setBusy] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<UploadRecord | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [savingId, setSavingId] = useState('');

  const load = async (silent = false) => {
    if (!silent) setBusy(true);
    const result = await listUploadRecords();
    setItems(result.data);
    setLastUpdated(new Date());
    setError(result.error);
    setBusy(false);
  };

  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), 20000);
    const db = getSupabaseBrowserClient();
    const channel = db.channel('upload-room-live').on('postgres_changes', { event: '*', schema: 'public', table: 'client_uploads' }, () => void load(true)).subscribe();
    return () => { window.clearInterval(timer); void db.removeChannel(channel); };
  }, []);

  const visible = useMemo(() => items.filter((item) => {
    const text = `${fileName(item)} ${item.client_name || ''} ${item.task_id || ''}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === 'all' || (item.status || 'new') === status) && (kind === 'all' || mediaKind(item) === kind);
  }), [items, query, status, kind]);
  const counts = useMemo(() => ({ new: items.filter((item) => (item.status || 'new') === 'new').length, total: items.length, today: items.filter((item) => item.uploaded_at && new Date(item.uploaded_at).toDateString() === new Date().toDateString()).length }), [items]);

  const openPreview = async (item: UploadRecord) => {
    setPreview(item); setNoteDraft(item.note || '');
    if ((item.status || 'new') === 'new') {
      const result = await updateUploadRecord(item.id, { status: 'viewed' });
      if (!result.error) setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: 'viewed', viewed_at: new Date().toISOString() } : entry));
    }
  };
  const changeStatus = async (item: UploadRecord, next: UploadStatus) => {
    setSavingId(item.id); setError('');
    const result = await updateUploadRecord(item.id, { status: next });
    if (result.error) setError(result.error); else { setItems((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: next } : entry)); setNotice(`تم تحديث حالة ${fileName(item)}`); }
    setSavingId('');
  };
  const saveNote = async () => {
    if (!preview) return;
    setSavingId(preview.id); const result = await updateUploadRecord(preview.id, { note: noteDraft });
    if (result.error) setError(result.error); else { setItems((current) => current.map((entry) => entry.id === preview.id ? { ...entry, note: noteDraft } : entry)); setNotice('تم حفظ الملاحظة داخل سجل الملف'); }
    setSavingId('');
  };

  return <div className="space-y-5" dir="rtl">
    <section className="grid gap-4 md:grid-cols-3">
      <div className="rounded-2xl bg-[#080d24] p-5 text-white"><span className="text-xs text-white/60">إجمالي الملفات</span><strong className="mt-1 block font-mono text-3xl">{counts.total}</strong></div>
      <div className="rounded-2xl bg-[#142c9b] p-5 text-white"><span className="text-xs text-white/70">ملفات جديدة</span><strong className="mt-1 block font-mono text-3xl">{counts.new}</strong></div>
      <div className="rounded-2xl bg-[#e6ebff] p-5 text-[#142c9b]"><span className="text-xs opacity-70">وصلت اليوم</span><strong className="mt-1 block font-mono text-3xl">{counts.today}</strong></div>
    </section>
    <section className="archive-sheet overflow-hidden rounded-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cbd4f5] p-5"><div><span className="font-mono text-[10px] tracking-[.16em] text-[#66736c]">UPLOAD ROOM / LIVE</span><h2 className="mt-1 text-xl font-extrabold">ملفات العملاء</h2><p className="mt-1 text-xs text-[#58617e]">يتحدث تلقائياً كل 20 ثانية وعند وصول ملف جديد.</p></div><div className="flex items-center gap-2"><span className="text-[11px] text-[#66736c]">{lastUpdated ? `آخر تحديث ${lastUpdated.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}` : 'جار التحديث'}</span><button onClick={() => void load()} aria-label="تحديث الملفات" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cbd4f5] bg-white px-3 text-xs font-extrabold text-[#142c9b]">{busy ? <Loader2 className="h-4 animate-spin" /> : <RefreshCw className="h-4" />}تحديث</button></div></div>
      <div className="flex flex-wrap gap-2 border-b border-[#e7ded2] p-4"><label className="relative min-w-[220px] flex-1"><Search className="absolute right-3 top-3 h-4 text-[#58617e]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم العميل أو الملف أو رقم الطلب" className="h-10 w-full rounded-xl border border-[#cbd4f5] bg-white pr-9 pl-3 text-xs outline-none focus:border-[#142c9b]" /></label><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 rounded-xl border border-[#cbd4f5] bg-white px-3 text-xs font-bold"><option value="all">كل الحالات</option>{statuses.slice(1).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="h-10 rounded-xl border border-[#cbd4f5] bg-white px-3 text-xs font-bold"><option value="all">كل الأنواع</option><option value="image">صور</option><option value="video">فيديو</option></select><span className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#f0f5ff] px-3 text-xs font-bold text-[#142c9b]"><Filter className="h-3.5" />{visible.length} نتيجة</span></div>
      {error && <div className="m-4 flex items-center gap-2 rounded-xl bg-[#f7e6e6] p-3 text-xs font-bold text-[#9b3434]"><CircleAlert className="h-4" />{error}</div>}
      {notice && <div className="m-4 flex items-center gap-2 rounded-xl bg-[#e3eee9] p-3 text-xs font-bold text-[#0b4d3e]"><Check className="h-4" />{notice}</div>}
      {!visible.length && !busy ? <div className="p-12 text-center text-sm text-[#58617e]">لا توجد ملفات مطابقة للفلاتر الحالية.</div> : <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map((item) => { const video = mediaKind(item) === 'video'; return <article key={item.id} className="overflow-hidden rounded-2xl border border-[#cbd4f5] bg-white shadow-sm"><button onClick={() => void openPreview(item)} className="group relative block aspect-[4/3] w-full overflow-hidden bg-[#eef2ff] text-right">{video ? <video src={item.secure_url || item.public_url || undefined} muted preload="metadata" className="h-full w-full object-cover" /> : item.secure_url || item.public_url ? <img src={item.secure_url || item.public_url || ''} alt={fileName(item)} className="h-full w-full object-cover transition group-hover:scale-105" /> : <FileImage className="m-auto h-10 w-10 text-[#142c9b]" />}<span className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-[#142c9b] shadow"><Eye className="h-4" /></span>{video && <span className="absolute bottom-3 right-3 rounded-full bg-[#080d24]/80 p-2 text-white"><FileVideo className="h-4" /></span>}</button><div className="space-y-3 p-4"><div className="min-w-0"><h3 className="truncate text-sm font-extrabold" title={fileName(item)}>{fileName(item)}</h3><p className="mt-1 truncate text-xs text-[#66736c]">{item.client_name || 'عميل غير محدد'} · {formatBytes(item.bytes)}</p></div><div className="flex items-center justify-between gap-2"><select disabled={savingId === item.id} value={item.status || 'new'} onChange={(event) => void changeStatus(item, event.target.value as UploadStatus)} className={`rounded-lg border-0 px-2 py-1.5 text-[11px] font-bold ${statusTone[item.status || 'new']}`}><option value="new">جديد</option><option value="viewed">تمت المشاهدة</option><option value="in_progress">قيد المعالجة</option><option value="delivered">تم التسليم</option><option value="needs_reupload">يحتاج إعادة رفع</option></select><time className="text-[10px] text-[#66736c]">{item.uploaded_at ? new Date(item.uploaded_at).toLocaleDateString('ar-IQ') : '—'}</time></div>{item.note && <p className="flex gap-1 text-[11px] leading-5 text-[#8e4f27]"><MessageSquareText className="mt-0.5 h-3.5 shrink-0" />{item.note}</p>}</div></article>; })}</div>}
    </section>
    {preview && <div className="fixed inset-0 z-50 grid place-items-center bg-[#080d24]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="max-h-[95vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl" dir="rtl"><div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-extrabold">{fileName(preview)}</h2><p className="text-xs text-[#66736c]">{statusLabel(preview.status)} · {formatBytes(preview.bytes)}</p></div><button onClick={() => setPreview(null)} aria-label="إغلاق المعاينة" className="rounded-full p-2 text-[#58617e] hover:bg-[#eef2ff]"><X className="h-5" /></button></div><div className="grid gap-4 lg:grid-cols-[1fr_280px]">{mediaKind(preview) === 'video' ? <video controls autoPlay src={preview.secure_url || preview.public_url || undefined} className="max-h-[62vh] w-full rounded-xl bg-black" /> : <img src={preview.secure_url || preview.public_url || ''} alt={fileName(preview)} className="max-h-[62vh] w-full rounded-xl bg-[#eef2ff] object-contain" />}<aside className="space-y-3 rounded-xl bg-[#f7f9ff] p-4"><label className="block text-xs font-bold text-[#58617e]">ملاحظة على الملف<textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-[#cbd4f5] bg-white p-3 text-xs outline-none focus:border-[#142c9b]" placeholder="مثال: يحتاج تعديل الإضاءة" /></label><button onClick={() => void saveNote()} disabled={savingId === preview.id} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#142c9b] py-2.5 text-xs font-extrabold text-white">{savingId === preview.id ? <Loader2 className="h-4 animate-spin" /> : <MessageSquareText className="h-4" />}حفظ الملاحظة</button><a href={preview.secure_url || preview.public_url || '#'} target="_blank" rel="noreferrer" download className="block rounded-xl border border-[#cbd4f5] bg-white py-2.5 text-center text-xs font-extrabold text-[#142c9b]">تنزيل الملف الأصلي</a></aside></div></div></div>}
  </div>;
}
