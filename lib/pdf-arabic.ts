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
const LTR_SEQUENCE = /[\p{Sc}]?[+-]?[A-Za-z\p{Nd}](?:[A-Za-z\p{Nd}.,%\/:;+\-@#&_]*[A-Za-z\p{Nd}%])?/gu;

export type AvenmediaPdfFonts = { font: PDFFont; bold: PDFFont; arabicFont: PDFFont; arabicBold: PDFFont };
export type PdfVisualTextRun = { text: string; script: 'arabic' | 'latin' };

/** Shape Arabic letters and reorder mixed Arabic/Latin text for PDF's left-to-right operators. */
export function pdfVisualText(value: string) {
  if (!ARABIC.test(value)) return value;
  const isolated = value.replace(LTR_SEQUENCE, '\u2066$&\u2069');
  const shaped = arabicShaper.convertArabic(isolated);
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
  return chars.join('').replace(/[\u2066\u2069]/g, '');
}

function groupVisualRuns(visualText: string): PdfVisualTextRun[] {
  const runs: PdfVisualTextRun[] = [];
  for (const character of Array.from(visualText)) {
    const script = ARABIC.test(character) ? 'arabic' : 'latin';
    const previous = runs[runs.length - 1];
    if (previous?.script === script) previous.text += character;
    else runs.push({ text: character, script });
  }
  return runs;
}

/** Return physical left-to-right PDF runs after shaping and Unicode bidi reordering. */
export function pdfVisualTextRuns(value: string): PdfVisualTextRun[] {
  return groupVisualRuns(pdfVisualText(value));
}

/** Choose Arabic or Latin fonts per visual text run before every PDF drawText call. */
export function enableArabicPdfText(document: PDFDocument, fonts: AvenmediaPdfFonts) {
  type AddPageArgument = Parameters<PDFDocument['addPage']>[0];
  const originalAddPage = document.addPage.bind(document);
  const writableDocument = document as unknown as { addPage: (page?: AddPageArgument) => PDFPage };
  writableDocument.addPage = ((pageArgument?: AddPageArgument) => {
    const page = originalAddPage(pageArgument);
    const originalDrawText = page.drawText.bind(page);
    const wrappedDrawText = ((text: string, options?: Parameters<PDFPage['drawText']>[1]) => {
      const isBold = options?.font === fonts.bold || options?.font === fonts.arabicBold;
      const latinFont = isBold ? fonts.bold : fonts.font;
      const arabicFont = isBold ? fonts.arabicBold : fonts.arabicFont;
      if (!ARABIC.test(text)) return originalDrawText(text, { ...options, font: latinFont });

      const visualText = pdfVisualText(text);
      // No current Avenmedia PDF template uses maxWidth; let pdf-lib retain its own wrapping
      // behavior if a future call adds it rather than silently changing that layout.
      if (options?.maxWidth !== undefined) return originalDrawText(visualText, { ...options, font: arabicFont });

      const lines = visualText.split(/\r\n|\r|\n/);
      const size = options?.size ?? 24;
      const lineHeight = options?.lineHeight ?? arabicFont.heightAtSize(size) * 1.2;
      const startX = options?.x ?? 0;
      const startY = options?.y ?? 0;
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const runs = groupVisualRuns(lines[lineIndex]);
        let x = startX;
        for (const run of runs) {
          const font = run.script === 'arabic' ? arabicFont : latinFont;
          originalDrawText(run.text, {
            ...options,
            x,
            y: startY - lineIndex * lineHeight,
            font,
          });
          x += font.widthOfTextAtSize(run.text, size);
        }
      }
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
