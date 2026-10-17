'use client';

import { useEffect, useMemo, useState } from 'react';
import { Archive, Check, Download, FileImage, FileText, FileVideo, Filter, Loader2, Search, Send, Share2, UsersRound, X } from 'lucide-react';
import type { AvenmediaTask, Employee, UploadRecord } from '@/lib/avenmedia';
import { specialtyLabel } from '@/lib/specialties';
import { shareToChannel } from '@/lib/share-targets';
import { zipSync } from 'fflate';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { save as saveFileDialog } from '@tauri-apps/plugin-dialog';

type ModalProps = { open: boolean; onClose: () => void };
const formatDate = (value?: string | null) => value ? new Date(value).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
const fileName = (item: UploadRecord) => item.file_name || item.client_name || item.secure_url?.split('/').pop()?.split('?')[0] || 'ملف بدون اسم';
const urlOf = (item: UploadRecord) => item.secure_url || item.public_url || item.file_url || '';
const kindOf = (item: UploadRecord) => {
  const format = (item.format || '').toLowerCase();
  if (item.resource_type === 'video' || ['mp4', 'mov', 'webm', 'avi', 'mkv'].includes(format)) return 'video';
  if (item.resource_type === 'image' || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'heic', 'svg'].includes(format)) return 'image';
  return 'file';
};
const roleText = (person: Employee) => specialtyLabel(person.specialty) || person.role || 'عضو الفريق';
function downloadOne(item: UploadRecord) { const url = urlOf(item); if (!url) return false; const anchor = document.createElement('a'); anchor.href = url; anchor.download = fileName(item); anchor.target = '_blank'; anchor.rel = 'noreferrer'; document.body.appendChild(anchor); anchor.click(); anchor.remove(); return true; }
type SaveWritable = { write(data: Blob): Promise<void>; close(): Promise<void>; abort?: () => Promise<void> };
type SaveHandle = { createWritable(): Promise<SaveWritable> };
type SavePickerWindow = Window & { showSaveFilePicker?: (options: { suggestedName: string; types: Array<{ description: string; accept: Record<string, string[]> }> }) => Promise<SaveHandle> };
const REPOSITORY_ZIP_LIMIT = 300 * 1024 * 1024;
const REPOSITORY_DOWNLOAD_CONCURRENCY = 4;
const archiveEntryName = (name: string, index: number) => `${String(index + 1).padStart(4, '0')}_${name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim() || `media-${index + 1}`}`;


export function RequestPickerModal({ open, onClose, tasks, onSend }: ModalProps & { tasks: AvenmediaTask[]; onSend: (task: AvenmediaTask) => Promise<void> }) {
  const [query, setQuery] = useState(''); const [selectedId, setSelectedId] = useState(''); const [sending, setSending] = useState(false); const [notice, setNotice] = useState(''); const [error, setError] = useState('');
  useEffect(() => { if (open) { setQuery(''); setSelectedId(''); setNotice(''); setError(''); } }, [open]);
  const visible = useMemo(() => tasks.filter((task) => `${task.title} ${task.client_name || ''} ${task.description || ''} ${task.task_type}`.toLowerCase().includes(query.toLowerCase())), [tasks, query]);
  if (!open) return null;
  const selected = tasks.find((task) => task.id === selectedId);
  const submit = async () => { if (!selected) { setError('اختر طلباً أولاً.'); return; } setSending(true); setError(''); try { await onSend(selected); setNotice('تم إرسال الطلب إلى الموظفين المحددين.'); } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إرسال الطلب.'); } finally { setSending(false); } };
  return <div className="fixed inset-0 z-[76] grid place-items-center bg-[#080d24]/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="request-picker-title" dir="rtl" className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl sm:p-6"><header className="flex items-start justify-between gap-3"><div><span className="font-mono text-[10px] tracking-[.16em] text-[#58617e]">REQUEST PICKER / SEND</span><h2 id="request-picker-title" className="mt-1 text-2xl font-black">اختيار الطلب وإرساله</h2><p className="mt-2 text-xs leading-6 text-[#58617e]">اختر طلباً من القائمة لعرض الاسم والتاريخ والتفاصيل قبل الإرسال.</p></div><button type="button" onClick={onClose} aria-label="إغلاق نافذة اختيار الطلب" className="rounded-full p-2 text-[#58617e] hover:bg-[#e6ebff]"><X className="h-5" /></button></header><label className="relative mt-5 block"><Search className="absolute right-3 top-3 h-4 text-[#58617e]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم الطلب أو العميل أو التفاصيل" className="h-10 w-full rounded-xl border border-[#cbd4f5] pr-9 pl-3 text-xs outline-none focus:border-[#142c9b]" /></label><div className="mt-3 space-y-2">{visible.length ? visible.map((task) => <button type="button" key={task.id} onClick={() => setSelectedId(task.id)} className={`block w-full rounded-xl border p-3 text-right transition ${selectedId === task.id ? 'border-[#3159d8] bg-[#f0f5ff]' : 'border-[#dfe5fb] bg-[#f7f9ff]'}`}><div className="flex flex-wrap items-start justify-between gap-2"><div><strong className="text-sm">{task.title || 'طلب بلا اسم'}</strong><p className="mt-1 text-xs text-[#58617e]">{task.client_name || 'بدون عميل'} · {task.task_type}</p></div><span className="rounded-full bg-[#e6ebff] px-2 py-1 text-[10px] font-bold text-[#142c9b]">{task.status}</span></div><p className="mt-2 line-clamp-2 text-xs leading-5 text-[#58617e]">{task.description || 'لا توجد تفاصيل إضافية.'}</p><time className="mt-2 block text-[10px] text-[#58617e]">تاريخ الطلب: {formatDate(task.created_at)} · التسليم: {formatDate(task.due_at)}</time></button>) : <p className="rounded-xl border border-dashed border-[#cbd4f5] p-8 text-center text-xs text-[#58617e]">لا توجد طلبات مطابقة.</p>}</div>{selected && <aside className="mt-4 rounded-xl border-2 border-[#3159d8] bg-[#f0f5ff] p-4"><div className="flex items-start gap-3"><Check className="mt-0.5 h-4 text-[#142c9b]" /><div><strong className="text-sm">{selected.title}</strong><p className="mt-1 text-xs leading-6 text-[#58617e]">{selected.description || 'بدون تفاصيل'} · أنشئ في {formatDate(selected.created_at)}</p></div></div></aside>}{(error || notice) && <div role={error ? 'alert' : 'status'} className={`mt-3 rounded-xl p-3 text-xs font-bold ${error ? 'bg-[#f7e6e6] text-[#9b3434]' : 'bg-[#e6ebff] text-[#142c9b]'}`}>{error || notice}</div>}<footer className="mt-5 flex gap-2"><button type="button" onClick={() => void submit()} disabled={sending || !selected} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#142c9b] text-xs font-extrabold text-white disabled:opacity-50">{sending ? <Loader2 className="h-4 animate-spin" /> : <Send className="h-4" />}إرسال الطلب</button><button type="button" onClick={onClose} className="h-11 rounded-xl border border-[#cbd4f5] px-4 text-xs font-bold text-[#58617e]">إلغاء</button></footer></section></div>;
}

export function RepositoryModal({ open, onClose, uploads, employees, onSend }: ModalProps & { uploads: UploadRecord[]; employees: Employee[]; onSend: (recipientIds: string[], body: string, files: UploadRecord[]) => Promise<void> }) {
  const [query, setQuery] = useState(''); const [kind, setKind] = useState<'all' | 'image' | 'video' | 'file'>('all'); const [preview, setPreview] = useState<UploadRecord | null>(null); const [sendOpen, setSendOpen] = useState(false); const [shareOpen, setShareOpen] = useState(false); const [role, setRole] = useState('all'); const [selected, setSelected] = useState<string[]>([]); const [message, setMessage] = useState(''); const [notice, setNotice] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setQuery(''); setKind('all'); setPreview(null); setSendOpen(false); setShareOpen(false); setNotice(''); setError(''); setSelected([]); } }, [open]);
  const visible = useMemo(() => uploads.filter((item) => { const text = `${fileName(item)} ${item.client_name || ''} ${item.format || ''} ${item.upload_link_id || item.task_id || 'مجلد عام'}`.toLowerCase(); return (!query || text.includes(query.toLowerCase())) && (kind === 'all' || kindOf(item) === kind); }), [uploads, query, kind]);
  const roles = useMemo(() => Array.from(new Set(employees.map(roleText))).sort(), [employees]);
  const filteredPeople = useMemo(() => employees.filter((person) => role === 'all' || roleText(person) === role), [employees, role]);
  if (!open) return null;
  const downloadAll = async () => {
    const candidates = visible.filter((item) => urlOf(item));
    if (!candidates.length) { setNotice('لا توجد ملفات قابلة للتنزيل.'); return; }
    setBusy(true); setError(''); setNotice('اختر مكان حفظ ملف ZIP…');
    const suggestedName = `avenmedia-repository-${new Date().toISOString().slice(0, 10)}.zip`;
    const entries = candidates.map((item, index) => ({ name: archiveEntryName(fileName(item), index), url: urlOf(item) }));
    let selectedNativePath: string | null = null;
    let browserSaveHandle: SaveHandle | null = null;
    let fallbackDownload = false;
    try {
      if (isTauri()) {
        selectedNativePath = await saveFileDialog({ title: 'اختر مكان تنزيل المستودع', defaultPath: suggestedName, filters: [{ name: 'ZIP archive', extensions: ['zip'] }] });
        if (!selectedNativePath) { setNotice('تم إلغاء تنزيل المستودع.'); return; }
        setNotice('جارٍ تنزيل ملفات المستودع بالتوازي وتجهيز ZIP في المجلد المختار…');
        const savedPath = await invoke<string>('download_repository_zip', { filePath: selectedNativePath, entries });
        setNotice(`تم حفظ ZIP في: ${savedPath}`);
        return;
      }

      const pickerWindow = window as SavePickerWindow;
      if (pickerWindow.showSaveFilePicker) {
        browserSaveHandle = await pickerWindow.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }],
        });
      } else {
        fallbackDownload = true;
        setNotice('هذا المتصفح لا يتيح اختيار مكان الحفظ؛ سيُنزّل الملف إلى مجلد التنزيلات الافتراضي.');
      }

      const archiveFiles: Record<string, Uint8Array> = {};
      let totalBytes = 0;
      let activeBytes = 0;
      let skipped = 0;
      let cursor = 0;
      let completed = 0;
      let limitError: Error | null = null;
      const controller = new AbortController();
      const buffers: Array<Uint8Array | null> = candidates.map(() => null);

      const readLimited = async (response: Response) => {
        if (!response.body) {
          const buffer = await response.arrayBuffer();
          if (totalBytes + activeBytes + buffer.byteLength > REPOSITORY_ZIP_LIMIT) throw new Error('تجاوزت ملفات المستودع حد ZIP البالغ 300 ميغابايت؛ نزّل الملفات على دفعات.');
          totalBytes += buffer.byteLength;
          return new Uint8Array(buffer);
        }
        const reader = response.body.getReader();
        const parts: Uint8Array[] = [];
        let length = 0;
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            length += value.byteLength;
            activeBytes += value.byteLength;
            if (totalBytes + activeBytes > REPOSITORY_ZIP_LIMIT) {
              activeBytes -= value.byteLength;
              length -= value.byteLength;
              await reader.cancel();
              throw new Error('تجاوزت ملفات المستودع حد ZIP البالغ 300 ميغابايت؛ نزّل الملفات على دفعات.');
            }
            parts.push(value);
          }
        } catch (cause) {
          activeBytes -= length;
          throw cause;
        }
        activeBytes -= length;
        totalBytes += length;
        const joined = new Uint8Array(length);
        let offset = 0;
        for (const part of parts) { joined.set(part, offset); offset += part.byteLength; }
        return joined;
      };

      const worker = async () => {
        while (!controller.signal.aborted) {
          const index = cursor++;
          if (index >= candidates.length) return;
          try {
            const response = await fetch(entries[index].url, { signal: controller.signal });
            if (!response.ok) { skipped += 1; continue; }
            buffers[index] = await readLimited(response);
          } catch (cause) {
            if (cause instanceof Error && cause.message.includes('300 ميغابايت')) {
              limitError = cause;
              controller.abort();
              return;
            }
            if (controller.signal.aborted) return;
            skipped += 1;
          } finally {
            if (!controller.signal.aborted) {
              completed += 1;
              setNotice(`جارٍ تنزيل المستودع بالتوازي: ${completed}/${candidates.length} ملف…`);
            }
          }
        }
      };

      await Promise.all(Array.from({ length: Math.min(REPOSITORY_DOWNLOAD_CONCURRENCY, candidates.length) }, () => worker()));
      if (limitError) throw limitError;
      for (let index = 0; index < buffers.length; index += 1) {
        const bytes = buffers[index];
        if (bytes) archiveFiles[`Avenmedia/${entries[index].name}`] = bytes;
      }
      if (!Object.keys(archiveFiles).length) throw new Error('تعذر تنزيل الملفات من مستودع التخزين؛ تحقق من الاتصال وصلاحية الروابط.');
      const archive = zipSync(archiveFiles, { level: 0 });
      const blob = new Blob([archive.buffer.slice(archive.byteOffset, archive.byteOffset + archive.byteLength) as ArrayBuffer], { type: 'application/zip' });
      if (browserSaveHandle) {
        const writable = await browserSaveHandle.createWritable();
        try { await writable.write(blob); await writable.close(); }
        catch (cause) { await writable.abort?.(); throw cause; }
      } else {
        const objectUrl = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = objectUrl; anchor.download = suggestedName; anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      }
      setNotice(`${browserSaveHandle ? 'تم حفظ' : 'تم تنزيل'} ZIP يضم ${Object.keys(archiveFiles).length} ملفاً.${skipped ? ` تعذر تضمين ${skipped} ملف(ات).` : ''}${fallbackDownload ? ' افتح مجلد التنزيلات في المتصفح.' : ''}`);
    } catch (cause) {
      if (cause instanceof Error && cause.name === 'AbortError') setNotice('تم إلغاء تنزيل المستودع.');
      else setError(cause instanceof Error ? cause.message : 'تعذر تجهيز ZIP للمستودع.');
    } finally { setBusy(false); }
  };
  const shareAll = async (channel: 'whatsapp' | 'telegram' | 'instagram') => {
    const urls = visible.map(urlOf).filter(Boolean);
    if (!urls.length) { setError('لا توجد روابط قابلة للمشاركة.'); return; }
    const text = `مستودع Avenmedia (${urls.length} ملفات):\n${urls.join('\n')}`;
    try { setNotice(await shareToChannel(channel, { title: 'مكتبة مستودع Avenmedia', text })); setShareOpen(false); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذرت مشاركة المستودع.'); }
  };
  const toggle = (id: string) => setSelected((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  const sendSelected = async () => { if (!selected.length) { setError('اختر موظفاً واحداً على الأقل.'); return; } if (!visible.length) { setError('لا توجد ملفات مطابقة للمشاركة.'); return; } setBusy(true); setError(''); try { await onSend(selected, message.trim() || `تمت مشاركة ${visible.length} ملفات من مكتبة المستودع.`, visible); setNotice(`تم إرسال المستودع إلى ${selected.length} موظفاً.`); setSendOpen(false); } catch (cause) { setError(cause instanceof Error ? cause.message : 'تعذر إرسال المستودع.'); } finally { setBusy(false); } };
  return <div className="fixed inset-0 z-[74] grid place-items-center bg-[#080d24]/70 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section role="dialog" aria-modal="true" aria-labelledby="repository-modal-title" dir="rtl" className="max-h-[94vh] w-full max-w-5xl overflow-y-auto rounded-[24px] bg-white p-5 shadow-2xl sm:p-6"><header className="flex items-start justify-between gap-3"><div><span className="font-mono text-[10px] tracking-[.16em] text-[#58617e]">REPOSITORY LIBRARY / PREVIEW</span><h2 id="repository-modal-title" className="mt-1 text-2xl font-black">مكتبة المستودع</h2><p className="mt-2 text-xs leading-6 text-[#58617e]">ملفات ومجلدات المستودع الظاهرة في غرفة الرفع، مع معاينات وتاريخ حتى الدقيقة.</p></div><button type="button" onClick={onClose} aria-label="إغلاق مكتبة المستودع" className="rounded-full p-2 text-[#58617e] hover:bg-[#e6ebff]"><X className="h-5" /></button></header><div className="mt-5 flex flex-wrap gap-2"><label className="relative min-w-[230px] flex-1"><Search className="absolute right-3 top-3 h-4 text-[#58617e]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم الملف أو العميل أو النوع" className="h-10 w-full rounded-xl border border-[#cbd4f5] pr-9 pl-3 text-xs outline-none focus:border-[#142c9b]" /></label><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)} className="h-10 rounded-xl border border-[#cbd4f5] px-3 text-xs font-bold"><option value="all">كل الأنواع</option><option value="image">صور</option><option value="video">فيديو</option><option value="file">ملفات</option></select><span className="inline-flex h-10 items-center gap-1 rounded-xl bg-[#f0f5ff] px-3 text-xs font-bold text-[#142c9b]"><Filter className="h-3.5" />{visible.length} عنصر</span></div><div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void downloadAll()} disabled={busy} className="inline-flex h-10 items-center gap-2 rounded-xl bg-[#142c9b] px-3 text-xs font-extrabold text-white disabled:opacity-50"><Download className="h-4" />{busy ? 'جار تجهيز ZIP…' : 'تنزيل المستودع كاملاً'}</button><button type="button" onClick={() => setShareOpen((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cbd4f5] px-3 text-xs font-extrabold text-[#142c9b]"><Share2 className="h-4" />مشاركة المستودع</button>{shareOpen && <div className="flex flex-wrap gap-1 rounded-xl border border-[#cbd4f5] bg-[#f7f9ff] p-1"><button type="button" onClick={() => void shareAll('whatsapp')} className="rounded-lg bg-[#25d366] px-3 py-2 text-[10px] font-bold text-white">WhatsApp</button><button type="button" onClick={() => void shareAll('telegram')} className="rounded-lg bg-[#229ed9] px-3 py-2 text-[10px] font-bold text-white">Telegram</button><button type="button" onClick={() => void shareAll('instagram')} className="rounded-lg bg-[#833ab4] px-3 py-2 text-[10px] font-bold text-white">Instagram</button></div>}<button type="button" onClick={() => setSendOpen((value) => !value)} className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#cbd4f5] px-3 text-xs font-extrabold text-[#142c9b]"><UsersRound className="h-4" />إرسال لموظفين</button></div>{sendOpen && <aside className="mt-3 rounded-2xl border-2 border-[#cbd4f5] bg-[#f7f9ff] p-4"><div className="flex flex-wrap gap-2"><select value={role} onChange={(event) => setRole(event.target.value)} className="h-9 rounded-lg border border-[#cbd4f5] bg-white px-2 text-xs font-bold"><option value="all">كل التخصصات والأدوار</option>{roles.map((item) => <option key={item} value={item}>{item}</option>)}</select><span className="inline-flex h-9 items-center rounded-lg bg-white px-2 text-xs font-bold text-[#58617e]">المحدد: {selected.length}</span></div><div className="mt-3 grid gap-2 sm:grid-cols-2">{filteredPeople.map((person) => <label key={person.id} className="flex items-center gap-2 rounded-xl border border-[#dfe5fb] bg-white p-3 text-xs"><input type="checkbox" checked={selected.includes(person.id)} onChange={() => toggle(person.id)} /><span><strong className="block">{person.name}</strong><span className="text-[#58617e]">{roleText(person)} · {person.role}</span></span></label>)}</div><textarea value={message} onChange={(event) => setMessage(event.target.value)} rows={2} placeholder="رسالة اختيارية للموظفين" className="mt-3 w-full rounded-xl border border-[#cbd4f5] bg-white p-3 text-xs outline-none focus:border-[#142c9b]" /><button type="button" disabled={busy} onClick={() => void sendSelected()} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#142c9b] px-4 text-xs font-extrabold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 animate-spin" /> : <Send className="h-4" />}إرسال المحدد</button></aside>} {(error || notice) && <div role={error ? 'alert' : 'status'} className={`mt-3 rounded-xl p-3 text-xs font-bold ${error ? 'bg-[#f7e6e6] text-[#9b3434]' : 'bg-[#e6ebff] text-[#142c9b]'}`}>{error || notice}</div>}<div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{visible.length ? visible.map((item) => { const kindValue = kindOf(item); const url = urlOf(item); return <article key={item.id} className="overflow-hidden rounded-2xl border border-[#dfe5fb] bg-[#f7f9ff]"><button type="button" onClick={() => setPreview(item)} className="group relative grid aspect-[4/3] w-full place-items-center overflow-hidden bg-[#e6ebff]">{kindValue === 'image' && url ? <img src={url} alt={fileName(item)} className="h-full w-full object-cover transition group-hover:scale-105" /> : kindValue === 'video' && url ? <video src={url} muted preload="metadata" className="h-full w-full object-cover" /> : kindValue === 'image' ? <FileImage className="h-10 w-10 text-[#142c9b]" /> : kindValue === 'video' ? <FileVideo className="h-10 w-10 text-[#142c9b]" /> : <FileText className="h-10 w-10 text-[#142c9b]" />}<span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-1 text-[10px] font-bold text-[#142c9b]">معاينة</span></button><div className="p-3"><h3 className="truncate text-xs font-extrabold" title={fileName(item)}>{fileName(item)}</h3><p className="mt-1 truncate text-[10px] text-[#58617e]">{item.client_name || 'بدون عميل'} · {item.format || kindValue}</p><p className="mt-1 truncate text-[10px] text-[#58617e]">مجلد: {(item.upload_link_id || item.task_id || 'عام').slice(0, 18)}</p><time className="mt-1 block text-[10px] text-[#58617e]">{formatDate(item.uploaded_at || item.created_at)}</time></div></article>; }) : <p className="col-span-full rounded-xl border border-dashed border-[#cbd4f5] p-10 text-center text-xs text-[#58617e]">لا توجد ملفات مطابقة.</p>}</div>{preview && <div className="fixed inset-0 z-[80] grid place-items-center bg-[#080d24]/75 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreview(null); }}><div role="dialog" aria-modal="true" className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-2xl bg-white p-4" dir="rtl"><div className="flex items-center justify-between gap-3"><div><strong className="text-sm">{fileName(preview)}</strong><p className="text-[10px] text-[#58617e]">{formatDate(preview.uploaded_at || preview.created_at)}</p></div><button type="button" onClick={() => setPreview(null)} className="rounded-full p-2 text-[#58617e]"><X className="h-5" /></button></div><div className="mt-3 min-h-[220px] rounded-xl bg-[#f7f9ff] p-2">{kindOf(preview) === 'image' ? <img src={urlOf(preview)} alt={fileName(preview)} className="mx-auto max-h-[62vh] w-full object-contain" /> : kindOf(preview) === 'video' ? <video controls autoPlay src={urlOf(preview)} className="mx-auto max-h-[62vh] w-full rounded-lg bg-black" /> : <iframe title={fileName(preview)} src={urlOf(preview)} className="h-[62vh] w-full rounded-lg border bg-white" />}</div><button type="button" onClick={() => downloadOne(preview)} className="mt-3 inline-flex h-10 items-center gap-2 rounded-xl bg-[#142c9b] px-4 text-xs font-extrabold text-white"><Download className="h-4" />تنزيل الملف</button></div></div>}</section></div>;
}
