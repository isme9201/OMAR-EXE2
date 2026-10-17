'use client';

import { useEffect, useMemo, useState } from 'react';
import { Check, CircleAlert, Copy, Download, Eye, FileImage, FileText, FileVideo, Filter, Instagram, Loader2, MessageCircle, MessageSquareText, RefreshCw, Search, Send, Tag, UploadCloud, X } from 'lucide-react';
import { getSupabaseBrowserClient } from '@/lib/supabase-browser';
import { createUploadLink, invokeAvenmediaFunction } from '@/lib/avenmedia';
import { listUploadRecords, updateUploadRecord, type UploadLinkMetadata, type UploadRecord, type UploadStatus } from '@/lib/avenmedia';
import { openDownloadUrl, shareToChannel } from '@/lib/share-targets';
import { cloudinaryAttachmentDownloadUrl } from '@/lib/cloudinary-download';

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

function InternalUploadModal({ open, onClose, onComplete }: { open: boolean; onClose: () => void; onComplete: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [details, setDetails] = useState('');
  const [tag, setTag] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => { if (open) { setError(''); setNotice(''); setProgress(0); } }, [open]);
  if (!open) return null;
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (!file) { setError('اختر ملفاً قبل الرفع.'); return; }
    setBusy(true); setError(''); setNotice(''); setProgress(8);
    try {
      const linkResult = await createUploadLink({ clientName: name.trim() || file.name, ttlHours: 168 });
      if (linkResult.error || !linkResult.data) throw new Error(linkResult.error || 'تعذر تجهيز رابط الرفع الداخلي');
      setProgress(22);
      const signed = await invokeAvenmediaFunction<{ cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string }>('cloudinary-upload', { action: 'sign_upload', token: linkResult.data.token });
      if (signed.error || !signed.data) throw new Error(signed.error || 'تعذر توقيع الرفع');
      const body = new FormData(); body.append('file', file); body.append('api_key', signed.data.apiKey); body.append('timestamp', String(signed.data.timestamp)); body.append('signature', signed.data.signature); body.append('folder', signed.data.folder);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${signed.data.cloudName}/auto/upload`, { method: 'POST', body });
      if (!response.ok) throw new Error(`رفض خادم الملفات الرفع (HTTP ${response.status})`);
      const asset = await response.json(); setProgress(82);
      const completed = await invokeAvenmediaFunction<{ upload?: { id?: string } }>('cloudinary-upload', { action: 'complete_upload', token: linkResult.data.token, asset });
      if (completed.error) throw new Error(completed.error);
      const uploadId = completed.data?.upload?.id;
      if (uploadId) {
        const visibleNote = [details.trim(), tag.trim() ? `الوسم: ${tag.trim()}` : ''].filter(Boolean).join(' · ');
        const { error: metadataError } = await getSupabaseBrowserClient().from('client_uploads').update({ file_name: name.trim() || file.name, note: visibleNote || null }).eq('id', uploadId);
        if (metadataError) throw new Error(metadataError.message);
      }
      setProgress(100); setNotice('تم رفع الملف إلى غرفة الرفع. الاسم والتفاصيل والوسم محفوظة ضمن الطلب.'); onComplete();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إتمام الرفع الداخلي.'); }
    finally { setBusy(false); }
  };
  return <div className="fixed inset-0 z-[75] grid place-items-center bg-[#080d24]/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="internal-upload-title" dir="rtl" className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl sm:p-6"><header className="flex items-start justify-between gap-3"><div><span className="font-mono text-[10px] tracking-[.16em] text-[#58617e]">INTERNAL UPLOAD / UPLOAD ROOM</span><h2 id="internal-upload-title" className="mt-1 text-2xl font-black">رفع داخلي إلى غرفة الرفع</h2><p className="mt-2 text-xs leading-6 text-[#58617e]">أضف اسماً وتفاصيل ووسماً ظاهراً للفريق. لا يتم تسجيل أي مفاتيح؛ التوقيع يتم عبر الجلسة المصرح بها.</p></div><button type="button" onClick={onClose} aria-label="إغلاق نافذة الرفع" className="rounded-full p-2 text-[#58617e] hover:bg-[#e6ebff]"><X className="h-5" /></button></header><form onSubmit={submit} className="mt-5 grid gap-3"><label className="grid gap-1.5 text-xs font-bold text-[#58617e]"><span>الملف</span><input type="file" onChange={(event) => setFile(event.target.files?.[0] || null)} className="rounded-xl border border-dashed border-[#3159d8] bg-[#f7f9ff] p-3 text-xs" required /></label><label className="grid gap-1.5 text-xs font-bold text-[#58617e]"><span>الاسم الظاهر</span><input value={name} onChange={(event) => setName(event.target.value)} placeholder="مثال: صور حملة الشتاء" className="h-11 rounded-xl border border-[#cbd4f5] px-3 text-sm outline-none focus:border-[#142c9b]" /></label><label className="grid gap-1.5 text-xs font-bold text-[#58617e]"><span>التفاصيل</span><textarea value={details} onChange={(event) => setDetails(event.target.value)} rows={3} placeholder="وصف مختصر للاستخدام أو التسليم" className="rounded-xl border border-[#cbd4f5] p-3 text-sm outline-none focus:border-[#142c9b]" /></label><label className="grid gap-1.5 text-xs font-bold text-[#58617e]"><span className="inline-flex items-center gap-1"><Tag className="h-3.5" />وسم ظاهر</span><input value={tag} onChange={(event) => setTag(event.target.value)} placeholder="مثال: عاجل · مراجعة العميل" className="h-11 rounded-xl border border-[#cbd4f5] px-3 text-sm outline-none focus:border-[#142c9b]" /></label>{(error || notice) && <div role={error ? 'alert' : 'status'} className={`rounded-xl p-3 text-xs font-bold ${error ? 'bg-[#f7e6e6] text-[#9b3434]' : 'bg-[#e6ebff] text-[#142c9b]'}`}>{error || notice}</div>}{busy && <div className="h-2 overflow-hidden rounded-full bg-[#e6ebff]"><div className="h-full rounded-full bg-[#142c9b] transition-all" style={{ width: `${progress}%` }} /></div>}<div className="flex gap-2"><button type="submit" disabled={busy} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#142c9b] text-xs font-extrabold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 animate-spin" /> : <UploadCloud className="h-4" />}رفع الملف</button><button type="button" onClick={onClose} className="h-11 rounded-xl border border-[#cbd4f5] px-4 text-xs font-bold text-[#58617e]">إلغاء</button></div></form></section></div>;
}

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
  const [downloadingId, setDownloadingId] = useState('');
  const [internalUploadOpen, setInternalUploadOpen] = useState(false);

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
    try { setNotice(await shareToChannel(channel, { title: fileName(item), text: `ملف من Avenmedia: ${fileName(item)}`, url })); }
    catch (cause) { setNotice(cause instanceof Error ? cause.message : 'تعذرت مشاركة الملف.'); }
  };
  const downloadFile = async (item: UploadRecord) => {
    const url = item.secure_url || item.public_url || item.file_url || '';
    if (!url) { setNotice('لا يوجد رابط تنزيل متاح لهذا الملف.'); return; }
    setDownloadingId(item.id); setError(''); setNotice('');
    try {
      await openDownloadUrl(cloudinaryAttachmentDownloadUrl(url, fileName(item)));
      setNotice(`بدأ تنزيل ${fileName(item)}؛ تحقق من مجلد التنزيلات.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'تعذر بدء تنزيل الملف.');
    } finally {
      setDownloadingId('');
    }
  };
  const shareButtons = (item: UploadRecord) => {
    const url = item.secure_url || item.public_url || item.file_url || '';
    return <div className="flex flex-wrap gap-1.5" aria-label={`إجراءات ${fileName(item)}`}>
      <button type="button" disabled={!url || downloadingId === item.id} onClick={() => void downloadFile(item)} className="inline-flex items-center gap-1 rounded-lg border border-[#cbd4f5] bg-white px-2 py-1.5 text-[10px] font-bold text-[#142c9b] disabled:opacity-40">{downloadingId === item.id ? <Loader2 className="h-3.5 animate-spin" /> : <Download className="h-3.5" />}{downloadingId === item.id ? 'جارٍ التنزيل...' : 'تنزيل'}</button>
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cbd4f5] p-5"><div><span className="font-mono text-[10px] tracking-[.16em] text-[#58617e]">UPLOAD ROOM / LINK GROUPS</span><h2 className="mt-1 text-xl font-extrabold">ملفات العملاء</h2><p className="mt-1 text-xs text-[#58617e]">تظهر كل الملفات داخل إطار رابط الرفع الذي أُرسلت من خلاله، وتُحدّث تلقائياً عند الاتصال.</p></div><div className="flex flex-wrap items-center gap-2"><span className="text-[11px] text-[#58617e]">{lastUpdated ? `آخر تحديث ${lastUpdated.toLocaleTimeString('ar-IQ', { hour: '2-digit', minute: '2-digit' })}` : 'جار التحديث'}</span><button type="button" onClick={() => setInternalUploadOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#142c9b] px-3 text-xs font-extrabold text-white"><UploadCloud className="h-4" />رفع داخلي</button><button onClick={() => void load()} aria-label="تحديث الملفات" className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cbd4f5] bg-white px-3 text-xs font-extrabold text-[#142c9b]">{busy ? <Loader2 className="h-4 animate-spin" /> : <RefreshCw className="h-4" />}تحديث</button></div></div>
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
    <InternalUploadModal open={internalUploadOpen} onClose={() => setInternalUploadOpen(false)} onComplete={() => { setNotice('تم الرفع بنجاح؛ جار تحديث غرفة الرفع.'); setInternalUploadOpen(false); void load(true); }} />
  </div>;
}
