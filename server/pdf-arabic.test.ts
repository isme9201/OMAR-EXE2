import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { embedAvenmediaFonts, enableArabicPdfText, pdfVisualText } from '../lib/pdf-arabic';

afterEach(() => vi.unstubAllGlobals());

describe('Arabic and Arial-compatible PDF text', () => {
  it('shapes Arabic letters and orders mixed Arabic/Latin text for PDF drawing', () => {
    const visual = pdfVisualText('كشف حساب عميل Avenmedia');
    expect(visual).not.toBe('كشف حساب عميل Avenmedia');
    expect(visual.startsWith('Avenmedia ')).toBe(true);
    expect(visual).toMatch(/[\uFB50-\uFDFF\uFE70-\uFEFF]/);
  });

  it('embeds Arial-compatible Latin fonts and Arabic fallback fonts without encoding failures', async () => {
    const files = new Map([
      ['LiberationSans-Regular.ttf', readFileSync(new URL('../public/fonts/LiberationSans-Regular.ttf', import.meta.url))],
      ['LiberationSans-Bold.ttf', readFileSync(new URL('../public/fonts/LiberationSans-Bold.ttf', import.meta.url))],
      ['NotoSansArabic-Regular.ttf', readFileSync(new URL('../public/fonts/NotoSansArabic-Regular.ttf', import.meta.url))],
      ['NotoSansArabic-Bold.ttf', readFileSync(new URL('../public/fonts/NotoSansArabic-Bold.ttf', import.meta.url))],
    ]);
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL) => {
      const fileName = String(url).split('/').pop()!;
      return new Response(files.get(fileName), { status: 200 });
    }));
    const document = await PDFDocument.create();
    const fonts = await embedAvenmediaFonts(document);
    enableArabicPdfText(document, fonts);
    const page = document.addPage([595, 842]);
    page.drawText('AVENMEDIA Monthly Statement', { x: 30, y: 520, size: 18, font: fonts.bold });
    page.drawText('كشف حساب العميل — أحمد / Avenmedia', { x: 30, y: 500, size: 18, font: fonts.font });
    page.drawText('مهمات متأخرة', { x: 30, y: 460, size: 16, font: fonts.bold });
    const bytes = await document.save();
    expect(bytes.length).toBeGreaterThan(5_000);
  });
});
