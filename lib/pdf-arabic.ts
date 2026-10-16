import type { PDFDocument, PDFFont, PDFPage } from 'pdf-lib';

const fontkitModule = require('@pdf-lib/fontkit');
const fontkit = fontkitModule.default ?? fontkitModule;
const arabicShaper = require('arabic-persian-reshaper').ArabicShaper as { convertArabic: (value: string) => string };
const bidiModule = require('bidi-js');
const bidiFactory = (typeof bidiModule === 'function' ? bidiModule : bidiModule.default) as () => {
  getEmbeddingLevels: (value: string, direction: 'ltr' | 'rtl') => unknown;
  getReorderSegments: (value: string, levels: unknown) => [number, number][];
  getMirroredCharactersMap: (value: string, levels: unknown) => Map<number, string>;
};
const bidi = bidiFactory();
const ARABIC = /[\u0600-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb50-\ufdff\ufe70-\ufeff]/;

export type AvenmediaPdfFonts = { font: PDFFont; bold: PDFFont; arabicFont: PDFFont; arabicBold: PDFFont };

/** Shape Arabic letters and reorder mixed Arabic/Latin text for PDF's left-to-right operators. */
export function pdfVisualText(value: string) {
  if (!ARABIC.test(value)) return value;
  const shaped = arabicShaper.convertArabic(value);
  const levels = bidi.getEmbeddingLevels(shaped, 'rtl');
  const chars = Array.from(shaped);
  const offsets: number[] = [0];
  for (const char of chars) offsets.push(offsets[offsets.length - 1] + char.length);
  const charIndex = (utf16Offset: number) => {
    let low = 0, high = offsets.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (offsets[mid] <= utf16Offset) low = mid;
      else high = mid - 1;
    }
    return Math.min(low, chars.length - 1);
  };
  for (const [offset, mirrored] of bidi.getMirroredCharactersMap(shaped, levels)) chars[charIndex(offset)] = mirrored;
  for (const [start, end] of bidi.getReorderSegments(shaped, levels)) {
    const left = charIndex(start), right = charIndex(end);
    const reversed = chars.slice(left, right + 1).reverse();
    chars.splice(left, right - left + 1, ...reversed);
  }
  return chars.join('');
}

/** Choose Arial-compatible Latin glyphs or Arabic glyphs before every PDF drawText call. */
export function enableArabicPdfText(document: PDFDocument, fonts: AvenmediaPdfFonts) {
  type AddPageArgument = Parameters<PDFDocument['addPage']>[0];
  const originalAddPage = document.addPage.bind(document);
  const writableDocument = document as unknown as { addPage: (page?: AddPageArgument) => PDFPage };
  writableDocument.addPage = ((pageArgument?: AddPageArgument) => {
    const page = originalAddPage(pageArgument);
    const originalDrawText = page.drawText.bind(page);
    const wrappedDrawText = ((text: string, options?: Parameters<PDFPage['drawText']>[1]) => {
      const isBold = options?.font === fonts.bold || options?.font === fonts.arabicBold;
      const usesArabic = ARABIC.test(text);
      const font = usesArabic ? (isBold ? fonts.arabicBold : fonts.arabicFont) : (isBold ? fonts.bold : fonts.font);
      return originalDrawText(pdfVisualText(text), { ...options, font });
    }) as PDFPage['drawText'];
    (page as unknown as { drawText: PDFPage['drawText'] }).drawText = wrappedDrawText;
    return page;
  }) as PDFDocument['addPage'];
}

export async function embedAvenmediaFonts(document: PDFDocument): Promise<AvenmediaPdfFonts> {
  document.registerFontkit(fontkit);
  const names = ['LiberationSans-Regular.ttf', 'LiberationSans-Bold.ttf', 'NotoSansArabic-Regular.ttf', 'NotoSansArabic-Bold.ttf'];
  const responses = await Promise.all(names.map((name) => fetch(`/fonts/${name}`)));
  if (responses.some((response) => !response.ok)) throw new Error('تعذر تحميل الخطوط المضمنة لملفات PDF');
  const data = await Promise.all(responses.map((response) => response.arrayBuffer()));
  const [font, bold, arabicFont, arabicBold] = await Promise.all(data.map((bytes) => document.embedFont(new Uint8Array(bytes), { subset: true })));
  return { font, bold, arabicFont, arabicBold };
}
