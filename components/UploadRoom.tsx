'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, Copy, Download, Eye, FileImage, FileText, FileVideo, Filter, Instagram, Loader2, MessageCircle, MessageSquareText, RefreshCw, Search, Send, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { listUploadRecords, updateUploadRecord, type UploadLinkMetadata, type UploadRecord, type UploadStatus } from '@/lib/avenmedia';

const statuses: Array<{ value: 'all' | UploadStatus; label: string }> = [
  { value: 'all', label: 'كل الحالات' }, { value: 'new', label: 'جديد' },
  { value: 'viewed', label: 'تمت المشاهدة' }, { value: 'in_progress', label: 'قيد المعالجة' },
  { value: 'delivered', label: 'تم التسليم' }, { value: 'needs_reupload', label: 'يحتاج إعادة رفع' },
];
const statusLabel = (value?: string | null) => statuses.find((item) => item.value === value)?.label ?? 'جديد';
const statusTone: Record<string, string> = { new: 'bg-[#e6ebff] text-[#142c9b]', viewed: 'bg-[#e6ebff] text-[#142c9b]', in_progress: 'bg-[#fff1df] text-[#142c9b]', delivered: 'bg-[#e6ebff] text-[#142c9b]', needs_reupload: 'bg-[#e6ebff] text-[#9b3434]' };
const formatBytes = (bytes?: number | null) => !bytes ? 'الحجم غير متاح' : bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
const formatDateTime = (value?: string | null) => value ? new Date(value).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fileName = (item: UploadRecord) => item.file_name || item.client_name || item.secure_url?.split('/').pop()?.split('?')[0] || 'ملف بدون اسم';
type MediaKind = 'image' | 'video' | 'file';
const mediaKind = (item: UploadRecord): MediaKind => {
  const format = (item.format || '').toLowerCase();
  if (item.resource_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(format)) return 'video';
  if (item.resource_type === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'svg'].includes(format)) return 'image';
  return 'file';
};
type UploadGroup = { key: string; linkId: string | null; link: UploadLinkMetadata | null; files: UploadRecord[] };

export function UploadRoom() {
  const [items, setItems] = useState<UploadRecord[]>([]);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<'all' | UploadStatus>('all');
  const [kind, setKind] = useState<'all' | MediaKind>('all');
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
    const text = `${fileName(item)} ${item.client_name || ''} ${item.task_id || ''} ${item.upload_link_id || ''} ${item.upload_link?.client_name || ''}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase())) && (status === 'all' || (item.status || 'new') === status) && (kind === 'all' || mediaKind(item) === kind);
  }), [items, query, status, kind]);
  const groups = useMemo(() => {
    const byLink = new Map<string, UploadGroup>();
    for (const item of visible) {
      const linkId = item.upload_link_id || item.upload_link?.id || null;
      const key = linkId ? `link:${linkId}` : `legacy:${item.id}`;
      const group = byLink.get(key) ?? { key, linkId, link: item.upload_link ?? null, files: [] };
      if (!group.link && item.upload_link) group.link = item.upload_link;
      group.files.push(item);
      byLink.set(key, group);
    }
    return [...byLink.values()];
  }, [visible]);
  const counts = useMemo(() => ({
    new: items.filter((item) => (item.status || 'new') === 'new').length,
    total: items.length,
    today: items.filter((item) => item.uploaded_at && new Date(item.uploaded_at).toDateString() === new Date().toDateString()).length,
    groups: new Set(items.map((item) => item.upload_link_id || item.upload_link?.id).filter(Boolean)).size,
  }), [items]);

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
  const copyUrl = async (url: string, message = 'تم نسخ رابط الملف') => {
    try { await navigator.clipboard.writeText(url); setNotice(message); }
    catch { setNotice('تعذر النسخ التلقائي؛ حدّد الرابط وانسخه يدوياً.'); }
  };
  const shareFile = async (item: UploadRecord, channel: 'whatsapp' | 'telegram' | 'instagram') => {
    const url = item.secure_url || item.public_url || item.file_url || '';
    if (!url) { setNotice('لا يوجد رابط متاح لهذا الملف.'); return; }
    const text = encodeURIComponent(`ملف من Avenmedia: ${fileName(item)}`);
    if (channel === 'instagram') {
      await copyUrl(url, 'تم نسخ رابط الملف. Instagram لا يدعم إرفاق الملف تلقائياً عبر رابط ويب؛ الصق الرابط داخل Instagram.');
      window.open('https://www.instagram.com/', '_blank', 'noopener,noreferrer');
      return;
    }
    const target = channel === 'whatsapp' ? `https://wa.me/?text=${text}%20${encodeURIComponent(url)}` : `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${text}`;
    window.open(target, '_blank', 'noopener,noreferrer');
    setNotice(channel === 'whatsapp' ? 'تم فتح WhatsApp للمشاركة.' : 'تم فتح Telegram للمشاركة.');
  };
  const shareButtons = (item: UploadRecord) => {
    const url = item.secure_url || item.public_url || item.file_url || '';
    return <div className="flex flex-wrap gap-1.5" aria-label={`إجراءات ${fileName(item)}`}>
      <a href={url || '#'} target="_blank" rel="noreferrer" download={fileName(item)} aria-disabled={!url} className={`inline-flex items-center gap-1 rounded-lg border border-[#cbd4f5] bg-white px-2 py-1.5 text-[10px] font-bold text-[#142c9b] ${!url ? 'pointer-events-none opacity-40' : ''}`}><Download className="h-3.5" />تنزيل</a>
      <button type="button" disabled={!url} onClick={() => void shareFile(item, 'whatsapp')} className="inline-flex items-center gap-1 rounded-lg border border-[#cbd4f5] bg-white px-2 py-1.5 text-[10px] font-bold text-[#142c9b] disabled:opacity-40"><MessageCircle className="h-3.5" />WhatsApp</button>
      <button type="button" disabled={!url} onClick={() => void shareFile(item, 'telegram')} className="inline-flex items-center gap-1 rounded-lg border border-[#cbd4f5] bg-white px-2 py-1.5 text-[10px] font-bold text-[#142c9b] disabled:opacity-40"><Send className="h-3.5" />Telegram</button>
      <button type="button" disabled={!url} onClick={() => void shareFile(item, 'instagram')} className="inline-flex items-center gap-1 rounded-lg border border-[#cbd4f5] bg-white px-2 py-1.5 text-[10px] font-bold text-[#142c9b] disabled:opacity-40"><Instagram className="h-3.5" />Instagram</button>
    </div>;
  };

  return <div className="space-y-5" dir="rtl">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <div className="rounded-2xl bg-[#080d24] p-5 text-white"><span className="text-xs text-white/60">إجمالي الملفات</span><strong className="mt-1 block font-mono text-3xl">{counts.total}</strong></div>
      <div className="rounded-2xl bg-[#142c9b] p-5 text-white"><span className="text-xs text-white/70">ملفات جديدة</span><strong className="mt-1 block font-mono text-3xl">{counts.new}</strong></div>
      <div className="rounded-2xl bg-[#e6ebff] p-5 text-[#142c9b]"><span className="text-xs opacity-70">وصلت اليوم</span><strong className="mt-1 block font-mono text-3xl">{counts.today}</strong></div>
      <div className="rounded-2xl border border-[#cbd4f5] bg-white p-5 text-[#080d24]"><span className="text-xs text-[#58617e]">روابط رفع بها ملفات</span><strong className="mt-1 block font-mono text-3xl">{counts.groups}</strong></div>
    </section>
    <section className="archive-sheet overflow-hidden rounded-[22px]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cbd4f5] p-5"><div><span className="font-mono text-[10px] tracking-[.16em] text-[#58617e]">UPLOAD ROOM / LINK GROUPS</span><h2 className="mt-1 text-xl font-extrabold">ملفات العملاء</h2><p className="mt-1 text-xs text-[#58617e]">تظهر كل الملفات داخل إطار رابط الرفع الذي أُرسلت من خلاله، وتُحدّث تلقائياً عند الاتصال.</p></div><div className="flex items-center gap-2"><span className="text-[11px] text-[#58617e]">{lastUpdated ? `آخر تحديث ${lastUpdated.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}` : 'جار التحديث'}</span><button onClick={() => void load()} aria-label="تحديث الملفات" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cbd4f5] bg-white px-3 text-xs font-extrabold text-[#142c9b]">{busy ? <Loader2 className="h-4 animate-spin" /> : <RefreshCw className="h-4" />}تحديث</button></div></div>
      <div className="flex flex-wrap gap-2 border-b border-[#dfe5fb] p-4"><label className="relative min-w-[220px] flex-1"><Search className="absolute right-3 top-3 h-4 text-[#58617e]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم العميل أو الملف أو معرّف الرابط" className="h-10 w-full rounded-xl border border-[#cbd4f5] bg-white pr-9 pl-3 text-xs outline-none focus:border-[#142c9b]" /></label><select value={status} onChange={(event) => setStatus(event.target.value as typeof status)} className="h-10 rounded-xl border border-[#cbd4f5] bg-white px-3 text-xs font-bold"><option value="all">كل الحالات</option>{statuses.slice(1).map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="h-10 rounded-xl border border-[#cbd4f5] bg-white px-3 text-xs font-bold"><option value="all">كل الأنواع</option><option value="image">صور</option><option value="video">فيديو</option><option value="file">ملفات أخرى</option></select><span className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#f0f5ff] px-3 text-xs font-bold text-[#142c9b]"><Filter className="h-3.5" />{visible.length} ملفاً</span></div>
      {error && <div className="m-4 flex items-center gap-2 rounded-xl bg-[#e6ebff] p-3 text-xs font-bold text-[#9b3434]"><CircleAlert className="h-4" />{error}</div>}
      {notice && <div className="m-4 flex items-center gap-2 rounded-xl bg-[#e6ebff] p-3 text-xs font-bold text-[#142c9b]"><Check className="h-4" />{notice}</div>}
      {!visible.length && !busy ? <div className="p-12 text-center text-sm text-[#58617e]">لا توجد ملفات مطابقة للفلاتر الحالية.</div> : <div className="space-y-5 p-4">{groups.map((group) => <section key={group.key} className="overflow-hidden rounded-[20px] border-2 border-[#cbd4f5] bg-[#f7f9ff] shadow-sm">
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#cbd4f5] bg-white p-4"><div className="min-w-0"><span className="inline-flex rounded-full bg-[#e6ebff] px-2.5 py-1 text-[10px] font-extrabold text-[#142c9b]">مجموعة رفع · {group.files.length} {group.files.length === 1 ? 'ملف' : 'ملفات'}</span>{group.linkId ? <><h3 className="mt-2 text-xs font-bold text-[#58617e]">معرّف رابط الرفع</h3><p dir="ltr" className="mt-1 break-all font-mono text-[11px] font-bold text-[#080d24]">{group.linkId}</p>{group.link && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#58617e]"><span>أُنشئ: {formatDateTime(group.link.created_at)}</span><span>ينتهي: {formatDateTime(group.link.expires_at)}</span><span className={group.link.revoked_at ? 'font-bold text-[#9b3434]' : 'font-bold text-[#142c9b]'}>{group.link.revoked_at ? 'ملغى' : new Date(group.link.expires_at).getTime() <= Date.now() ? 'منتهي' : 'فعال'}</span></div>}</> : <p className="mt-2 text-xs text-[#58617e]">ملف قديم أو رفع لم يرتبط برابط معروف؛ لا يوجد معرّف آمن مسجل له.</p>}</div>{group.linkId && <button type="button" onClick={() => void copyUrl(group.linkId!, 'تم نسخ معرّف رابط الرفع')} className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[#cbd4f5] bg-white px-3 text-[11px] font-bold text-[#142c9b]"><Copy className="h-3.5" />نسخ المعرّف</button>}</header>
        <div className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">{group.files.map((item) => {
          const type = mediaKind(item); const url = item.secure_url || item.public_url || item.file_url || '';
          return <article key={item.id} className="overflow-hidden rounded-2xl border border-[#dfe5fb] bg-white shadow-sm"><button onClick={() => void openPreview(item)} className="group relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-[#e6ebff] text-right">
            {type === 'video' && url ? <video src={url} muted preload="metadata" className="h-full w-full object-cover" /> : type === 'image' && url ? <img src={url} alt={fileName(item)} className="h-full w-full object-cover transition group-hover:scale-105" /> : type === 'video' ? <FileVideo className="h-10 w-10 text-[#142c9b]" /> : type === 'image' ? <FileImage className="h-10 w-10 text-[#142c9b]" /> : <FileText className="h-10 w-10 text-[#142c9b]" />}
            <span className="absolute right-3 top-3 rounded-full bg-white/90 p-2 text-[#142c9b] shadow"><Eye className="h-4" /></span><span className="absolute bottom-3 right-3 rounded-full bg-[#080d24]/75 px-2 py-1 text-[10px] font-bold text-white">{type === 'image' ? 'صورة' : type === 'video' ? 'فيديو' : 'ملف'}</span>
          </button><div className="space-y-3 p-4"><div className="min-w-0"><h4 className="truncate text-sm font-extrabold" title={fileName(item)}>{fileName(item)}</h4><p className="mt-1 truncate text-xs text-[#58617e]">{item.client_name || 'عميل غير محدد'} · {formatBytes(item.bytes)}</p></div><div className="flex items-center justify-between gap-2"><select disabled={savingId === item.id} value={item.status || 'new'} onChange={(event) => void changeStatus(item, event.target.value as UploadStatus)} className={`rounded-lg border-0 px-2 py-1.5 text-[11px] font-bold ${statusTone[item.status || 'new']}`}><option value="new">جديد</option><option value="viewed">تمت المشاهدة</option><option value="in_progress">قيد المعالجة</option><option value="delivered">تم التسليم</option><option value="needs_reupload">يحتاج إعادة رفع</option></select><time className="text-[10px] text-[#58617e]">{item.uploaded_at ? formatDateTime(item.uploaded_at) : '—'}</time></div>{shareButtons(item)}{item.note && <p className="flex gap-1 text-[11px] leading-5 text-[#142c9b]"><MessageSquareText className="mt-0.5 h-3.5 shrink-0" />{item.note}</p>}</div></article>;
        })}</div>
      </section>)}</div>}
    </section>
    {preview && <div className="fixed inset-0 z-50 grid place-items-center bg-[#080d24]/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true"><div className="max-h-[95vh] w-full max-w-4xl overflow-auto rounded-2xl bg-white p-4 shadow-2xl" dir="rtl"><div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="truncate text-lg font-extrabold">{fileName(preview)}</h2><p className="text-xs text-[#58617e]">{statusLabel(preview.status)} · {formatBytes(preview.bytes)}{preview.upload_link_id ? ` · ${preview.upload_link_id}` : ''}</p></div><button onClick={() => setPreview(null)} aria-label="إغلاق المعاينة" className="rounded-full p-2 text-[#58617e] hover:bg-[#e6ebff]"><X className="h-5" /></button></div><div className="grid gap-4 lg:grid-cols-[1fr_280px]">{mediaKind(preview) === 'video' ? <video controls autoPlay src={preview.secure_url || preview.public_url || undefined} className="max-h-[62vh] w-full rounded-xl bg-black" /> : mediaKind(preview) === 'image' ? <img src={preview.secure_url || preview.public_url || ''} alt={fileName(preview)} className="max-h-[62vh] w-full rounded-xl bg-[#e6ebff] object-contain" /> : <iframe title={fileName(preview)} src={preview.secure_url || preview.public_url || undefined} className="h-[62vh] w-full rounded-xl border bg-white" />}<aside className="space-y-3 rounded-xl bg-[#f7f9ff] p-4"><label className="block text-xs font-bold text-[#58617e]">ملاحظة على الملف<textarea value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} rows={5} className="mt-2 w-full rounded-xl border border-[#cbd4f5] bg-white p-3 text-xs outline-none focus:border-[#142c9b]" placeholder="مثال: يحتاج تعديل الإضاءة" /></label><button onClick={() => void saveNote()} disabled={savingId === preview.id} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#142c9b] py-2.5 text-xs font-extrabold text-white">{savingId === preview.id ? <Loader2 className="h-4 animate-spin" /> : <MessageSquareText className="h-4" />}حفظ الملاحظة</button>{shareButtons(preview)}</aside></div></div></div>}
  </div>;
}
