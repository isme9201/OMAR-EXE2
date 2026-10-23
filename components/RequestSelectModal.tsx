'use client';

import { useMemo, useState } from 'react';
import { CalendarDays, FileText, Search, SlidersHorizontal, X } from 'lucide-react';
import type { RequestRow } from '@/lib/avenmedia-requests';

type SortMode = 'newest' | 'oldest' | 'title' | 'due';
const dateTime = (value?: string | null) => value ? new Date(value).toLocaleString('ar-IQ', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

type Props = {
  open: boolean;
  onClose: () => void;
  tasks: RequestRow[];
  loading?: boolean;
  selectedId?: string;
  onSelect: (task: RequestRow) => void;
};

export function RequestSelectModal({ open, onClose, tasks, loading = false, selectedId = '', onSelect }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const visible = useMemo(() => {
    const term = query.trim().toLowerCase();
    return tasks
      .filter((task) => !term || `${task.title} ${task.client_name || ''} ${task.client_phone || ''} ${task.description || ''} ${task.requirements || ''}`.toLowerCase().includes(term))
      .sort((a, b) => {
        if (sort === 'title') return (a.title || '').localeCompare(b.title || '', 'ar');
        if (sort === 'due') return (a.due_at || '9999').localeCompare(b.due_at || '9999');
        const first = Date.parse(a.created_at || '') || 0;
        const second = Date.parse(b.created_at || '') || 0;
        return sort === 'newest' ? second - first : first - second;
      });
  }, [tasks, query, sort]);
  if (!open) return null;

  return <div className="fixed inset-0 z-[82] grid place-items-center bg-[#080d24]/75 p-3 backdrop-blur-sm sm:p-5" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section role="dialog" aria-modal="true" aria-labelledby="request-select-title" dir="rtl" className="flex max-h-[94vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] bg-white text-[#080d24] shadow-2xl">
      <header className="flex items-start justify-between gap-3 border-b border-[#dfe5fb] px-5 py-4 sm:px-6">
        <div><span className="font-mono text-[10px] tracking-[.16em] text-[#58617e]">REQUEST / SEARCH & SORT</span><h2 id="request-select-title" className="mt-1 text-xl font-black">اختيار الطلب</h2><p className="mt-1 text-xs leading-5 text-[#58617e]">ابحث باسم الطلب أو العميل، ثم راجع التفاصيل والتواريخ قبل الاختيار.</p></div>
        <button type="button" onClick={onClose} aria-label="إغلاق اختيار الطلب" className="rounded-full p-2 text-[#58617e] hover:bg-[#f0f5ff]"><X className="h-5" /></button>
      </header>
      <div className="flex flex-wrap items-center gap-2 border-b border-[#e7ebf7] bg-[#f7f9ff] p-4">
        <label className="relative min-w-[220px] flex-1"><Search className="absolute right-3 top-3 h-4 text-[#58617e]" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="بحث بالطلب، العميل، الهاتف أو التفاصيل" className="h-10 w-full rounded-xl border border-[#cbd4f5] bg-white pr-9 pl-3 text-xs outline-none focus:border-[#142c9b]" /></label>
        <label className="relative flex items-center gap-2 text-xs font-bold text-[#58617e]"><SlidersHorizontal className="h-4 shrink-0" /><select value={sort} onChange={(event) => setSort(event.target.value as SortMode)} aria-label="فرز قائمة الطلبات" className="h-10 min-w-[150px] rounded-xl border border-[#cbd4f5] bg-white px-3 text-xs font-bold text-[#080d24]"><option value="newest">الأحدث أولاً</option><option value="oldest">الأقدم أولاً</option><option value="title">حسب اسم الطلب</option><option value="due">الأقرب موعداً</option></select></label>
        <span className="inline-flex h-9 items-center rounded-lg bg-[#e6ebff] px-3 text-[11px] font-bold text-[#142c9b]">{visible.length} طلب</span>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4 sm:p-5">
        {loading ? <p className="rounded-xl border border-dashed border-[#cbd4f5] p-10 text-center text-sm text-[#58617e]">جارٍ تحميل الطلبات…</p> : visible.length ? visible.map((task) => <button type="button" key={task.id} onClick={() => onSelect(task)} className={`block w-full rounded-2xl border p-4 text-right transition hover:-translate-y-px hover:border-[#3159d8] ${selectedId === task.id ? 'border-[#3159d8] bg-[#f0f5ff] ring-1 ring-[#3159d8]/20' : 'border-[#dfe5fb] bg-white hover:bg-[#f7f9ff]'}`}>
          <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 items-start gap-2"><FileText className="mt-0.5 h-4 shrink-0 text-[#3159d8]" /><div className="min-w-0"><strong className="block truncate text-sm">{task.title || 'طلب بدون عنوان'}</strong><span className="mt-1 block text-[11px] text-[#58617e]">{task.client_name || 'بدون اسم عميل'}{task.client_phone ? ` · ${task.client_phone}` : ''}</span></div></div><span className="rounded-full bg-[#e6ebff] px-2.5 py-1 text-[10px] font-bold text-[#142c9b]">{task.status || '—'}</span></div>
          <p className="mt-3 line-clamp-2 text-xs leading-5 text-[#37415f]">{task.description || task.requirements || 'لا توجد تفاصيل إضافية.'}</p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-[#58617e]"><span className="inline-flex items-center gap-1"><CalendarDays className="h-3" />تاريخ الإنشاء: {dateTime(task.created_at)}</span><span>موعد التسليم: {dateTime(task.due_at)}</span><span>النوع: {task.task_type || '—'}</span></div>
        </button>) : <p className="rounded-xl border border-dashed border-[#cbd4f5] p-10 text-center text-sm text-[#58617e]">{tasks.length ? 'لا توجد طلبات تطابق البحث.' : 'لا توجد طلبات متاحة للاختيار.'}</p>}
      </div>
      <footer className="flex items-center justify-between border-t border-[#dfe5fb] px-5 py-3 sm:px-6"><span className="text-[10px] text-[#58617e]">اختر الطلب لربط رابط الرفع به.</span><button type="button" onClick={onClose} className="h-9 rounded-lg border border-[#cbd4f5] px-4 text-xs font-bold text-[#58617e] hover:bg-[#f7f9ff]">إغلاق</button></footer>
    </section>
  </div>;
}
