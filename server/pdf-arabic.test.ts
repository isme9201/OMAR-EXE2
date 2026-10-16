import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { embedAvenmediaFonts, enableArabicPdfText, pdfVisualText } from '../lib/pdf-arabic';

afterEach(() => vi.unstubAllGlobals());

describe('Arabic PDF text', () => {
  it('shapes Arabic letters and orders mixed Arabic/Latin text for PDF drawing', () => {
    const visual = pdfVisualText('كشف حساب عميل Avenmedia');
    expect(visual).not.toBe('كشف حساب عميل Avenmedia');
    expect(visual.startsWith('Avenmedia ')).toBe(true);
    expect(visual).toMatch(/[\uFB50-\uFDFF\uFE70-\uFEFF]/);
  });

  it('embeds Amiri and saves Arabic text without standard-font encoding failures', async () => {
    const regular = readFileSync(new URL('../public/fonts/Amiri-Regular.ttf', import.meta.url));
    const bold = readFileSync(new URL('../public/fonts/Amiri-Bold.ttf', import.meta.url));
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const isBold = String(url).includes('Bold');
      return new Response(isBold ? bold : regular, { status: 200 });
    }));
    const document = await PDFDocument.create();
    enableArabicPdfText(document);
    const { font, bold: boldFont } = await embedAvenmediaFonts(document);
    const page = document.addPage([595, 842]);
    page.drawText('كشف حساب العميل — أحمد / Avenmedia', { x: 30, y: 500, size: 18, font });
    page.drawText('مهمات متأخرة', { x: 30, y: 460, size: 16, font: boldFont });
    const bytes = await document.save();
    expect(bytes.length).toBeGreaterThan(5_000);
  });
});
