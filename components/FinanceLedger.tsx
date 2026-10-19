"use client";

import { useEffect, useMemo, useState } from 'react';
import { Download, ExternalLink, Loader2, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { PDFDocument, rgb, type PDFImage } from 'pdf-lib';
import { getAuthClient } from '@/lib/avenmedia-auth';
import { embedAvenmediaFonts, enableArabicPdfText } from '@/lib/pdf-arabic';
import { downloadPdf, openDownloadedPdf } from '@/lib/pdf-export';

type Entry = { id: string; entry_type: 'income' | 'expense'; amount: number | string; description: string; entry_date: string };

export function FinanceLedger() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<Entry[]>([]);
  const [form, setForm] = useState({ entry_type: 'expense', amount: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [downloaded, setDownloaded] = useState('');
  const [downloadUrl, setDownloadUrl] = useState('');
  const db = () => getAuthClient() as any;

  const load = async () => {
    setBusy(true);
    const start = `${month}-01`;
    const end = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 1).toISOString().slice(0, 10);
    const result = await db().from('financial_entries').select('*').gte('entry_date', start).lt('entry_date', end).order('entry_date', { ascending: false });
    setRows(result.data || []); setError(result.error?.message || ''); setBusy(false);
  };
  useEffect(() => { void load(); }, [month]);
  const totals = useMemo(() => ({
    income: rows.filter(row => row.entry_type === 'income').reduce((sum, row) => sum + Number(row.amount), 0),
    expense: rows.filter(row => row.entry_type === 'expense').reduce((sum, row) => sum + Number(row.amount), 0),
  }), [rows]);

  const add = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.amount || !form.description.trim()) return;
    setBusy(true);
    const result = await db().from('financial_entries').insert({ entry_type: form.entry_type, amount: Number(form.amount), description: form.description.trim(), entry_date: new Date().toISOString().slice(0, 10), created_by: (await db().auth.getUser()).data.user?.id });
    if (result.error) setError(result.error.message);
    else { setForm({ entry_type: 'expense', amount: '', description: '' }); await load(); }
    setBusy(false);
  };
  const remove = async (id: string) => {
    if (!confirm('حذف القيد المالي؟')) return;
    const result = await db().from('financial_entries').delete().eq('id', id);
    if (result.error) setError(result.error.message); else await load();
  };

  const pdf = async () => {
    try {
      const document = await PDFDocument.create(); const pdfFonts = await embedAvenmediaFonts(document);
 enableArabicPdfText(document, pdfFonts);
 const { font, bold } = pdfFonts;
      let logo: PDFImage | null = null;
      try { const response = await fetch('/branding/aven-logo-192.png'); if (response.ok) logo = await document.embedPng(new Uint8Array(await response.arrayBuffer())); } catch { /* continue without decorative logo */ }
      let page = document.addPage([595, 842]); let y = 742;
      const navy = rgb(.05, .09, .28), green = rgb(.08, .55, .3), red = rgb(.75, .16, .16), pale = rgb(.95, .96, 1);
      const header = () => {
        page.drawRectangle({ x: 0, y: 770, width: 595, height: 72, color: navy });
        page.drawText('AVENMEDIA', { x: 40, y: 807, size: 25, font: bold, color: rgb(1, 1, 1) });
        page.drawText('كشف الحساب المالي', { x: 40, y: 786, size: 12, font, color: rgb(.82, .86, 1) });
        page.drawText(month, { x: 450, y: 800, size: 14, font: bold, color: rgb(1, 1, 1) });
        if (logo) page.drawImage(logo, { x: 510, y: 784, width: 42, height: 42 });
        y = 742;
      };
      header();
      page.drawRectangle({ x: 40, y: 680, width: 515, height: 45, color: rgb(.9, .96, .92), borderColor: green, borderWidth: 1 });
      page.drawText(`إجمالي الأرباح / الداخل: ${totals.income.toFixed(2)}`, { x: 58, y: 697, size: 13, font: bold, color: green });
      page.drawRectangle({ x: 40, y: 620, width: 515, height: 45, color: rgb(1, .93, .93), borderColor: red, borderWidth: 1 });
      page.drawText(`إجمالي المصاريف / الخسائر: ${totals.expense.toFixed(2)}`, { x: 58, y: 637, size: 13, font: bold, color: red });
      page.drawRectangle({ x: 40, y: 560, width: 515, height: 45, color: pale, borderColor: navy, borderWidth: 1 });
      page.drawText(`الربح الصافي: ${(totals.income - totals.expense).toFixed(2)}`, { x: 58, y: 577, size: 13, font: bold, color: navy });
      y = 525;
      const newPage = () => { page = document.addPage([595, 842]); header(); };
      page.drawText('التفاصيل اليومية', { x: 48, y, size: 13, font: bold, color: navy }); y -= 28;
      rows.forEach((row, index) => {
        if (y < 70) newPage();
        page.drawRectangle({ x: 40, y: y - 22, width: 515, height: 30, color: index % 2 ? pale : rgb(1, 1, 1), borderColor: rgb(.75, .77, .88), borderWidth: 1 });
        page.drawText(`${index + 1}. ${row.entry_type === 'income' ? 'دخل / دفعة' : 'مصروف / خصم'}`, { x: 50, y: y - 10, size: 10, font: bold, color: row.entry_type === 'income' ? green : red });
        page.drawText(Number(row.amount).toFixed(2), { x: 220, y: y - 10, size: 10, font: bold, color: navy });
        page.drawText(row.entry_date, { x: 300, y: y - 10, size: 9, font, color: navy });
        page.drawText(row.description.slice(0, 32), { x: 385, y: y - 10, size: 9, font, color: navy });
        y -= 38;
      });
      const bytes = await document.save();
      const result = await downloadPdf(bytes, `avenmedia-finance-${month}.pdf`);
      setDownloadUrl(result.objectUrl || '');
      setDownloaded(result.native ? 'تم حفظ كشف الحساب وفتح مجلد التنزيلات' : 'تم تنزيل كشف الحساب');
      window.setTimeout(() => { setDownloadUrl(''); setDownloaded(''); }, 120_000);
    } catch (cause) { console.error('[Avenmedia][finance][pdf]', cause); setError('تعذر إنشاء ملف PDF أو فتح مجلد التنزيلات'); }
  };

  return <main dir="rtl" className="space-y-6"><header className="flex flex-wrap items-end justify-between gap-3"><div><span className="font-mono text-xs tracking-widest text-indigo-600">AVENMEDIA / FINANCE</span><h2 className="mt-2 text-4xl font-black text-[#080d24]">المالية والفواتير</h2></div><div className="flex gap-2"><input type="month" value={month} onChange={event => setMonth(event.target.value)} className="h-11 rounded-xl border px-3" /><button onClick={() => void load()} className="grid h-11 w-11 place-items-center rounded-xl border" aria-label="تحديث"><RefreshCw className={busy ? 'h-4 animate-spin' : 'h-4'} /></button><button onClick={() => void pdf()} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-[#080d24] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Download className="h-4" />PDF</button></div></header>
    {(error || downloaded) && <div className={`flex flex-wrap items-center gap-3 rounded-xl p-4 text-sm font-bold ${error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>{error || downloaded}{!error && <button onClick={() => void openDownloadedPdf(downloadUrl)} className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-2 py-1 text-xs"><ExternalLink className="h-3.5" />فتح الملف</button>}</div>}
    <section className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl bg-emerald-700 p-5 text-white"><small>الداخل</small><strong className="mt-2 block text-3xl">{totals.income.toFixed(2)}</strong></div><div className="rounded-2xl bg-rose-700 p-5 text-white"><small>الخارج والمصروف</small><strong className="mt-2 block text-3xl">{totals.expense.toFixed(2)}</strong></div><div className="rounded-2xl bg-[#080d24] p-5 text-white"><small>الربح الصافي</small><strong className="mt-2 block text-3xl">{(totals.income - totals.expense).toFixed(2)}</strong></div></section>
    <form onSubmit={add} className="grid gap-3 rounded-3xl border bg-white p-5 md:grid-cols-[180px_180px_1fr_auto]"><select value={form.entry_type} onChange={event => setForm({ ...form, entry_type: event.target.value as 'income' | 'expense' })} className="h-11 rounded-xl border px-3"><option value="expense">مصروف / خصم</option><option value="income">دخل / دفعة</option></select><input type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm({ ...form, amount: event.target.value })} placeholder="المبلغ" className="h-11 rounded-xl border px-3" /><input value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} placeholder="مثال: إيجار المكتب أو دفعة زبون" className="h-11 rounded-xl border px-3" /><button disabled={busy} className="inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-[#080d24] px-4 text-sm font-bold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 animate-spin" /> : <Plus className="h-4" />}حفظ</button></form>
    <section className="grid gap-2 rounded-3xl border bg-white p-5">{rows.map(row => <div key={row.id} className="flex items-center justify-between rounded-xl bg-slate-50 p-3 text-sm"><span><b className={row.entry_type === 'income' ? 'text-emerald-700' : 'text-rose-700'}>{row.entry_type === 'income' ? 'دخل' : 'مصروف'}</b> · {row.description}</span><span className="flex items-center gap-3 font-mono">{Number(row.amount).toFixed(2)}<button onClick={() => void remove(row.id)} className="text-red-600" aria-label="حذف القيد"><Trash2 className="h-4" /></button></span></div>)}{!rows.length && <p className="py-8 text-center text-sm text-slate-500">لا توجد قيود لهذا الشهر.</p>}</section>
  </main>;
}
