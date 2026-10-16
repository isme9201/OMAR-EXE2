import { invoke, isTauri } from '@tauri-apps/api/core';

export type PdfDownloadResult = { native: boolean; objectUrl: string | null };

/** Save a PDF to the native Downloads folder and reveal it, or trigger a browser download. */
export async function downloadPdf(bytes: Uint8Array, fileName: string): Promise<PdfDownloadResult> {
  if (isTauri()) {
    await invoke<string>('save_pdf_to_downloads', {
      fileName,
      bytes: Array.from(bytes),
    });
    return { native: true, objectUrl: null };
  }

  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' });
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 120_000);
  return { native: false, objectUrl };
}

/** Reveal the operating-system Downloads folder in Tauri; open the generated PDF in web. */
export async function openDownloadedPdf(objectUrl?: string | null): Promise<boolean> {
  if (isTauri()) {
    await invoke('open_downloads_folder');
    return true;
  }
  if (objectUrl) {
    window.open(objectUrl, '_blank', 'noopener,noreferrer');
    return true;
  }
  return false;
}
