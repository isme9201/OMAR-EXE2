import { openUrl } from '@tauri-apps/plugin-opener';

export type ShareChannel = 'whatsapp' | 'telegram' | 'instagram' | 'system';
export type SharePayload = { title?: string; text?: string; url?: string };

function isTauriRuntime() {
  if (typeof window === 'undefined') return false;
  const target = window as Window & { __TAURI__?: unknown; __TAURI_INTERNALS__?: unknown };
  return Boolean(target.__TAURI__ || target.__TAURI_INTERNALS__);
}

export async function copyShareText(value: string) {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (typeof document === 'undefined') throw new Error('نسخ الرابط غير متاح في هذا السياق');
  const input = document.createElement('textarea');
  input.value = value;
  input.setAttribute('readonly', '');
  input.style.position = 'fixed';
  input.style.opacity = '0';
  document.body.appendChild(input);
  input.select();
  const copied = document.execCommand('copy');
  input.remove();
  if (!copied) throw new Error('تعذر نسخ الرابط تلقائياً');
}

export async function openExternalUrl(url: string) {
  if (isTauriRuntime()) {
    await openUrl(url);
    return;
  }
  const opened = window.open(url, '_blank', 'noopener,noreferrer');
  if (!opened) window.location.assign(url);
}

export async function shareToChannel(channel: ShareChannel, payload: SharePayload) {
  const url = payload.url?.trim() ?? '';
  const text = [payload.text?.trim(), url].filter(Boolean).join('\n');
  const title = payload.title?.trim() || 'Avenmedia';

  if (channel === 'instagram') {
    if (!text) throw new Error('لا يوجد محتوى لنسخه');
    await copyShareText(text);
    await openExternalUrl('https://www.instagram.com/');
    return 'تم نسخ الرابط وفتح Instagram؛ الصقه يدوياً لأن Instagram لا يقبل تعبئة الرابط من تطبيق خارجي.';
  }

  if (channel === 'system') {
    if (typeof navigator !== 'undefined' && navigator.share) {
      await navigator.share({ title, text: payload.text || title, ...(url ? { url } : {}) });
      return 'تم فتح نافذة المشاركة.';
    }
    if (!text) throw new Error('لا يوجد محتوى للمشاركة');
    await copyShareText(text);
    return 'تم نسخ المحتوى للمشاركة.';
  }

  if (!url && !payload.text) throw new Error('لا يوجد محتوى للمشاركة');
  if (channel === 'whatsapp') {
    const target = new URL('https://web.whatsapp.com/send');
    target.searchParams.set('text', text || title);
    await openExternalUrl(target.toString());
    return 'تم فتح WhatsApp Web في المتصفح الافتراضي.';
  }

  const target = new URL('https://t.me/share/url');
  if (url) target.searchParams.set('url', url);
  target.searchParams.set('text', payload.text?.trim() || title);
  await openExternalUrl(target.toString());
  return 'تم فتح مشاركة Telegram في المتصفح الافتراضي.';
}
