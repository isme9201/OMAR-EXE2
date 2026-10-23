import pdfMake from 'pdfmake-rtl';
import cairoFontContainer from 'pdfmake-rtl/build/fonts/Cairo.js';
import type { AvenmediaTask } from '@/lib/avenmedia';

type PdfFontContainer = {
  vfs: Record<string, string | { data: string; encoding?: string }>;
  fonts: Record<string, Record<string, string>>;
};
type PdfDocument = { getBuffer: () => Promise<ArrayBuffer | Uint8Array> };
type PdfMakeRuntime = {
  addFontContainer?: (container: PdfFontContainer) => void;
  addFonts?: (fonts: Record<string, Record<string, string>>) => void;
  virtualfs?: { writeFileSync: (filename: string, content: string, encoding?: string) => void };
  createPdf: (definition: Record<string, unknown>) => PdfDocument;
};
type PdfNode = string | number | Record<string, unknown>;
type PdfTable = { table: { headerRows?: number; widths: Array<string | number>; body: PdfNode[][]; dontBreakRows?: boolean }; layout?: string | Record<string, unknown>; margin?: number[] };

const ENGINE = pdfMake as unknown as PdfMakeRuntime;
const FONT_CONTAINER = cairoFontContainer as PdfFontContainer;
const NAVY = '#080d24';
const BLUE = '#142c9b';
const MUTED = '#58617e';
const BORDER = '#dfe5fb';
const PALE = '#f3f6ff';
const GREEN = '#176a4a';
const RED = '#9b3434';
let fontsReady = false;
let logoPromise: Promise<string | undefined> | undefined;

function registerFonts() {
  if (fontsReady) return;
  if (ENGINE.addFontContainer) {
    ENGINE.addFontContainer(FONT_CONTAINER);
  } else if (ENGINE.addFonts && ENGINE.virtualfs) {
    for (const [filename, entry] of Object.entries(FONT_CONTAINER.vfs)) {
      ENGINE.virtualfs.writeFileSync(filename, typeof entry === 'string' ? entry : entry.data, typeof entry === 'string' ? 'base64' : entry.encoding || 'base64');
    }
    ENGINE.addFonts(FONT_CONTAINER.fonts);
  } else {
    throw new Error('محرك PDF لا يدعم تسجيل خط Cairo المضمّن.');
  }
  fontsReady = true;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function getLogo() {
  if (typeof window === 'undefined') return Promise.resolve(undefined);
  logoPromise ??= fetch('/branding/aven-logo-192.png')
    .then(async (response) => response.ok ? `data:image/png;base64,${bytesToBase64(new Uint8Array(await response.arrayBuffer()))}` : undefined)
    .catch(() => undefined);
  return logoPromise;
}

function pdfDate(value?: string | null, includeTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('ar-IQ', includeTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' });
}

function pageDefinition(title: string, content: PdfNode[], accent: string, logo?: string): Record<string, unknown> {
  return {
    pageSize: 'A4',
    pageMargins: [38, 112, 38, 56],
    rtl: true,
    defaultStyle: { font: 'Cairo', fontSize: 9, color: NAVY, alignment: 'right', lineHeight: 1.2 },
    styles: {
      docTitle: { font: 'Cairo', bold: true, fontSize: 12, color: '#ffffff' },
      docSubtitle: { font: 'Cairo', fontSize: 8, color: '#d9e1ff', margin: [0, 3, 0, 0] },
      sectionTitle: { font: 'Cairo', bold: true, fontSize: 12, color: NAVY, margin: [0, 14, 0, 8] },
      tableHeader: { font: 'Cairo', bold: true, color: '#ffffff', fillColor: accent, alignment: 'right' },
      smallMuted: { font: 'Cairo', fontSize: 8, color: MUTED },
    },
    header: (_page: number, _pages: number) => {
      const brandStack: PdfNode[] = [
        { text: 'AVENMEDIA', font: 'Cairo', bold: true, fontSize: 18, color: '#ffffff', alignment: 'right' },
        { text: title, style: 'docSubtitle', alignment: 'right' },
      ];
      const row: PdfNode[] = [
        logo ? { image: logo, width: 42, height: 42, alignment: 'center', margin: [6, 0, 6, 0] } : { text: 'AV', font: 'Cairo', bold: true, fontSize: 15, color: '#ffffff', alignment: 'center', margin: [6, 8, 6, 0] },
        { stack: brandStack, margin: [4, 5, 8, 0] },
      ];
      return {
        margin: [38, 22, 38, 0],
        table: { widths: [58, '*'], body: [row], rtl: true },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 0,
          paddingRight: () => 0,
          paddingTop: () => 0,
          paddingBottom: () => 0,
          fillColor: () => NAVY,
        },
      };
    },
    footer: (page: number, pages: number) => ({
      margin: [38, 12, 38, 0],
      columns: [
        { text: `AVENMEDIA  ·  ${new Date().toLocaleDateString('ar-IQ')}`, style: 'smallMuted', alignment: 'left' },
        { text: `${page} / ${pages}`, style: 'smallMuted', alignment: 'right' },
      ],
      columnGap: 12,
    }),
    content,
  };
}

export async function createAvenmediaPdfBytes(title: string, content: PdfNode[], accent = BLUE) {
  registerFonts();
  const logo = await getLogo();
  const definition = pageDefinition(title, content, accent, logo);
  const buffer = await ENGINE.createPdf(definition).getBuffer();
  return new Uint8Array(buffer);
}

function table(body: PdfNode[][], widths: Array<string | number>, headerRows = 1): PdfTable {
  return {
    table: { headerRows, widths, body, dontBreakRows: true },
    layout: {
      hLineColor: () => BORDER,
      vLineColor: () => BORDER,
      hLineWidth: (index: number) => index === 1 ? 1.2 : 0.6,
      vLineWidth: () => 0.5,
      paddingLeft: () => 7,
      paddingRight: () => 7,
      paddingTop: () => 6,
      paddingBottom: () => 6,
      fillColor: (rowIndex: number) => rowIndex === 0 ? BLUE : rowIndex % 2 ? '#ffffff' : PALE,
    },
    margin: [0, 3, 0, 6],
  };
}

function heading(text: string, marginBottom = 8): PdfNode {
  return { text, style: 'sectionTitle', margin: [0, 12, 0, marginBottom] };
}

function money(value: number | string | null | undefined) {
  return Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type EmployeeScheduleRequest = {
  id?: string;
  title?: string | null;
  client_name?: string | null;
  status?: string | null;
  due_at?: string | null;
  description?: string | null;
};

export async function makeEmployeeSchedulePdf(employeeName: string, requests: EmployeeScheduleRequest[]) {
  const rows: PdfNode[][] = [[
    { text: 'الطلب والعميل', style: 'tableHeader' },
    { text: 'الحالة', style: 'tableHeader' },
    { text: 'موعد التسليم', style: 'tableHeader' },
    { text: 'التفاصيل', style: 'tableHeader' },
  ], ...requests.map((item) => [
    { stack: [{ text: item.title || 'طلب بدون عنوان', bold: true }, { text: item.client_name || 'بدون عميل', style: 'smallMuted', margin: [0, 2, 0, 0] }] },
    item.status || '—',
    pdfDate(item.due_at, true),
    item.description || '—',
  ])];
  const content: PdfNode[] = [
    { text: `جدول العمل — ${employeeName}`, font: 'Cairo', bold: true, fontSize: 15, color: NAVY, margin: [0, 0, 0, 4] },
    { text: `تاريخ الطباعة: ${pdfDate(new Date().toISOString())}  ·  عدد الطلبات: ${requests.length}`, style: 'smallMuted', margin: [0, 0, 0, 10] },
    requests.length ? table(rows, ['*', 72, 100, '*']) : { text: 'لا توجد طلبات لعرضها.', alignment: 'center', color: MUTED, margin: [0, 30, 0, 0] },
  ];
  return createAvenmediaPdfBytes('جدول عمل الموظف', content);
}

export type OverduePdfRow = {
  id: string;
  title: string;
  client_name: string | null;
  estimated_cost: number | null;
  due_at: string;
  status: string;
  overdue_days: number;
  assignees: string;
};

export async function overduePdf(rows: OverduePdfRow[]) {
  const total = rows.reduce((sum, row) => sum + Number(row.estimated_cost || 0), 0);
  const body: PdfNode[][] = [[
    { text: 'الطلب والعميل', style: 'tableHeader' },
    { text: 'موعد التسليم', style: 'tableHeader' },
    { text: 'التأخير', style: 'tableHeader' },
    { text: 'المنفذون', style: 'tableHeader' },
    { text: 'القيمة', style: 'tableHeader' },
  ], ...rows.map((row) => [
    { stack: [{ text: row.title || 'طلب بدون عنوان', bold: true }, { text: row.client_name || 'بدون اسم', style: 'smallMuted', margin: [0, 2, 0, 0] }] },
    pdfDate(row.due_at, true),
    `${row.overdue_days} يوماً`,
    row.assignees || '—',
    money(row.estimated_cost),
  ])];
  const content: PdfNode[] = [
    { text: `عدد الطلبات المتأخرة: ${rows.length}  ·  القيمة الإجمالية: ${money(total)}`, bold: true, color: RED, margin: [0, 0, 0, 10] },
    rows.length ? table(body, ['*', 110, 62, '*', 74]) : { text: 'لا توجد طلبات متأخرة.', alignment: 'center', color: MUTED, margin: [0, 30, 0, 0] },
  ];
  return createAvenmediaPdfBytes('سجل الطلبات المتأخرة', content, RED);
}

export type FinancePdfRow = { entry_type: 'income' | 'expense'; amount: number | string; description: string; entry_date: string };
export type FinancePdfTotals = { income: number; expense: number };

export async function makeFinanceLedgerPdf(month: string, totals: FinancePdfTotals, rows: FinancePdfRow[]) {
  const net = totals.income - totals.expense;
  const summary: PdfNode = {
    table: {
      widths: ['*', '*', '*'],
      body: [[
        { text: [{ text: 'الإيرادات\n', bold: true }, { text: money(totals.income), fontSize: 15, color: GREEN }], fillColor: '#effaf4', margin: [8, 8, 8, 8] },
        { text: [{ text: 'المصاريف\n', bold: true }, { text: money(totals.expense), fontSize: 15, color: RED }], fillColor: '#fff2f2', margin: [8, 8, 8, 8] },
        { text: [{ text: 'الصافي\n', bold: true }, { text: money(net), fontSize: 15, color: net >= 0 ? GREEN : RED }], fillColor: PALE, margin: [8, 8, 8, 8] },
      ]],
    },
    layout: 'noBorders',
    margin: [0, 2, 0, 14],
  };
  const body: PdfNode[][] = [[
    { text: 'النوع', style: 'tableHeader' },
    { text: 'الوصف', style: 'tableHeader' },
    { text: 'التاريخ', style: 'tableHeader' },
    { text: 'المبلغ', style: 'tableHeader' },
  ], ...rows.map((row) => [
    { text: row.entry_type === 'income' ? 'دخل / دفعة' : 'مصروف / خصم', color: row.entry_type === 'income' ? GREEN : RED, bold: true },
    row.description || '—',
    pdfDate(row.entry_date),
    money(row.amount),
  ])];
  const content: PdfNode[] = [
    { text: `الشهر: ${month}`, style: 'smallMuted', margin: [0, 0, 0, 6] },
    summary,
    heading('التفاصيل اليومية'),
    rows.length ? table(body, [84, '*', 95, 84]) : { text: 'لا توجد قيود مالية لهذا الشهر.', alignment: 'center', color: MUTED, margin: [0, 24, 0, 0] },
  ];
  return createAvenmediaPdfBytes('كشف الحساب المالي', content);
}

export type MonthlyReportSummary = { income: number; expenses: number; net: number; tasks: number; completed: number; open: number; attendance: number };

export async function makeMonthlyReportPdf(month: string, summary: MonthlyReportSummary) {
  const entries: Array<[string, string, string]> = [
    ['الإيرادات', money(summary.income), GREEN],
    ['المصاريف', money(summary.expenses), RED],
    ['الصافي بعد الخصم', money(summary.net), summary.net >= 0 ? GREEN : RED],
    ['المهام المنجزة', `${summary.completed} / ${summary.tasks}`, BLUE],
    ['المهام غير المنجزة', String(summary.open), '#8a531d'],
    ['سجلات الحضور', String(summary.attendance), '#41516f'],
  ];
  const cards: PdfNode[][] = [];
  for (let index = 0; index < entries.length; index += 2) {
    const pair = entries.slice(index, index + 2);
    cards.push(pair.map(([label, value, color]) => ({
      stack: [
        { text: label, fontSize: 9, color: MUTED },
        { text: value, fontSize: 16, bold: true, color, margin: [0, 7, 0, 0] },
      ],
      fillColor: '#ffffff',
      margin: [10, 10, 10, 10],
    })));
  }
  const content: PdfNode[] = [
    { text: `الفترة: ${month}`, style: 'smallMuted', margin: [0, 0, 0, 8] },
    { table: { widths: ['*', '*'], body: cards }, layout: { hLineColor: () => BORDER, vLineColor: () => BORDER, hLineWidth: () => 0.8, vLineWidth: () => 0.8, paddingLeft: () => 6, paddingRight: () => 6, paddingTop: () => 4, paddingBottom: () => 4 } },
    { text: 'تم إنشاء هذا التقرير من مكتب إنتاج AVENMEDIA.', style: 'smallMuted', margin: [0, 20, 0, 0] },
  ];
  return createAvenmediaPdfBytes('كشف الحساب الشهري', content);
}

export async function makeTaskPdf(tasks: AvenmediaTask[], employeeName = 'جميع المنفذين') {
  const body: PdfNode[][] = [[
    { text: 'المهمة', style: 'tableHeader' },
    { text: 'العميل', style: 'tableHeader' },
    { text: 'الهاتف', style: 'tableHeader' },
    { text: 'النوع والحالة', style: 'tableHeader' },
    { text: 'التسليم', style: 'tableHeader' },
    { text: 'تم', style: 'tableHeader', alignment: 'center' },
  ], ...tasks.map((task) => [
    { text: task.title || 'مهمة بلا عنوان', bold: true },
    task.client_name || '—',
    task.client_phone || '—',
    `${task.task_type} · ${task.status}`,
    pdfDate(task.due_at, true),
    { text: '☐', alignment: 'center', fontSize: 15 },
  ])];
  const content: PdfNode[] = [
    { text: `الموظف: ${employeeName}  ·  إجمالي المهام: ${tasks.length}`, style: 'smallMuted', margin: [0, 0, 0, 10] },
    tasks.length ? table(body, ['*', 88, 82, 95, 92, 36]) : { text: 'لا توجد مهام مطابقة للتصدير.', alignment: 'center', color: MUTED, margin: [0, 30, 0, 0] },
    { text: 'ملاحظات المهمة', style: 'sectionTitle', margin: [0, 16, 0, 6] },
    ...tasks.map((task, index) => ({ text: `${index + 1}. ${task.title} — ${task.description || 'لا توجد تفاصيل إضافية.'}`, fontSize: 8, color: MUTED, margin: [0, 2, 0, 2] })),
  ];
  return createAvenmediaPdfBytes('تصدير مهام الموظفين', content);
}
