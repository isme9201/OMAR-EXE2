const CLOUDINARY_HOST = 'res.cloudinary.com';

/**
 * Cloudinary normally serves delivery URLs inline. Adding fl_attachment makes
 * the CDN return the asset as a downloadable attachment instead.
 */
export function cloudinaryAttachmentDownloadUrl(sourceUrl: string, fileName: string): string {
  let url: URL;
  try {
    url = new URL(sourceUrl);
  } catch {
    return sourceUrl;
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== CLOUDINARY_HOST) return sourceUrl;

  const segments = url.pathname.split('/');
  if (segments.some((segment) => /^s--[^/]+--$/.test(segment))) return sourceUrl;

  const uploadIndex = segments.findIndex((segment) => segment === 'upload');
  if (uploadIndex < 0) return sourceUrl;

  const hasAttachmentFlag = segments.slice(uploadIndex + 1).some((segment) =>
    segment.split(',').some((part) => part === 'fl_attachment' || part.startsWith('fl_attachment:')),
  );
  if (hasAttachmentFlag) return sourceUrl;

  const safeName = fileName
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')
    .trim()
    .slice(0, 160) || 'download';
  const attachmentName = safeName.replace(/\.[^.]+$/, '').replace(/\./g, '_') || 'download';
  segments.splice(uploadIndex + 1, 0, `fl_attachment:${encodeURIComponent(attachmentName)}`);
  url.pathname = segments.join('/');
  return url.toString();
}
