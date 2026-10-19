'use client';

export const CLOUDINARY_CHUNK_SIZE = 6 * 1024 * 1024;

export type CloudinaryUploadProgress = {
  loaded: number;
  total: number;
  percent: number;
  chunk: number;
  chunks: number;
  retrying?: boolean;
};

export type CloudinarySignedUpload = {
  cloudName: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  folder?: string;
  publicId?: string;
  resourceType?: string;
};

export type CloudinaryAsset = {
  public_id?: string;
  secure_url?: string;
  resource_type?: string;
  bytes?: number;
  format?: string;
  duration?: number;
  original_filename?: string;
};

const retryable = (status: number) => status === 0 || status === 408 || status === 409 || status === 420 || status === 425 || status === 429 || status >= 500;
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export async function uploadCloudinaryChunks(
  file: File,
  signed: CloudinarySignedUpload,
  onProgress?: (progress: CloudinaryUploadProgress) => void,
  options: { maxRetries?: number; signal?: AbortSignal; uploadId?: string } = {},
): Promise<CloudinaryAsset> {
  if (file.size <= 0) throw new Error('لا يمكن رفع ملف فارغ');
  const total = file.size;
  const chunkSize = Math.max(5 * 1024 * 1024, CLOUDINARY_CHUNK_SIZE);
  const chunks = Math.ceil(file.size / chunkSize);
  const uploadId = options.uploadId || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`);
  const resourceType = signed.resourceType || 'auto';
  let asset: CloudinaryAsset | null = null;

  for (let index = 0, start = 0; start < file.size || (file.size === 0 && index === 0); index += 1, start += chunkSize) {
    const endExclusive = file.size === 0 ? 0 : Math.min(start + chunkSize, file.size);
    const end = Math.max(start, endExclusive - 1);
    const chunk = file.slice(start, endExclusive);
    const form = new FormData();
    form.append('file', chunk, file.name || 'attachment');
    form.append('api_key', signed.apiKey);
    form.append('timestamp', String(signed.timestamp));
    form.append('signature', signed.signature);
    if (signed.folder) form.append('folder', signed.folder);
    if (signed.publicId) form.append('public_id', signed.publicId);

    const attempts = Math.max(1, options.maxRetries ?? 3);
    let response: Response | null = null;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (options.signal?.aborted) throw new DOMException('تم إلغاء الرفع', 'AbortError');
      try {
        response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/${resourceType}/upload`, {
          method: 'POST',
          headers: { 'Content-Range': `bytes ${start}-${end}/${file.size}`, 'X-Unique-Upload-Id': uploadId },
          body: form,
          signal: options.signal,
        });
        if (response.ok) break;
        if (!retryable(response.status) || attempt === attempts - 1) throw new Error(`Cloudinary HTTP ${response.status}`);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') throw error;
        if (attempt === attempts - 1) throw error instanceof Error ? error : new Error('تعذر إكمال رفع الملف');
      }
      onProgress?.({ loaded: start, total: file.size, percent: Math.round((start / total) * 100), chunk: index + 1, chunks, retrying: true });
      await pause(400 * (attempt + 1));
    }
    if (!response) throw new Error('لم تصل استجابة من Cloudinary');
    asset = (await response.json()) as CloudinaryAsset;
    const loaded = Math.min(endExclusive, file.size);
    onProgress?.({ loaded, total: file.size, percent: file.size === 0 ? 100 : Math.round((loaded / total) * 100), chunk: index + 1, chunks });
    if (file.size === 0) break;
  }
  if (!asset?.secure_url) throw new Error('لم يُرجع Cloudinary رابطاً صالحاً للملف');
  return asset;
}
