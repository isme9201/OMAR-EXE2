declare module 'pdfmake-rtl' {
  type FontContainer = {
    vfs: Record<string, string | { data: string; encoding?: string }>;
    fonts: Record<string, Record<string, string>>;
  };
  type PdfDocument = { getBuffer: () => Promise<ArrayBuffer | Uint8Array> };
  type PdfMakeRuntime = {
    addFontContainer?: (container: FontContainer) => void;
    addFonts?: (fonts: Record<string, Record<string, string>>) => void;
    virtualfs?: { writeFileSync: (filename: string, content: string, encoding?: string) => void };
    createPdf: (definition: Record<string, unknown>) => PdfDocument;
  };
  const pdfMake: PdfMakeRuntime;
  export default pdfMake;
}

declare module 'pdfmake-rtl/build/fonts/Cairo.js' {
  const fontContainer: {
    vfs: Record<string, string | { data: string; encoding?: string }>;
    fonts: Record<string, Record<string, string>>;
  };
  export default fontContainer;
}
