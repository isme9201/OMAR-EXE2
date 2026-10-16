/* AVEN Media background uploader. It never contains secrets; it receives only a signed Cloudinary request. */
self.addEventListener('message', event => {
  const data = event.data || {};
  if (data.type !== 'aven-upload' || !event.ports[0]) return;
  event.waitUntil(backgroundUpload(data, event.ports[0]));
});

async function backgroundUpload(data, port) {
  try {
    port.postMessage({ type: 'progress', value: 5 });
    const form = new FormData();
    form.append('file', data.file);
    form.append('api_key', data.signature.apiKey);
    form.append('timestamp', String(data.signature.timestamp));
    form.append('signature', data.signature.signature);
    form.append('folder', data.signature.folder);
    const response = await fetch(`https://api.cloudinary.com/v1_1/${data.signature.cloudName}/auto/upload`, { method: 'POST', body: form });
    const asset = await response.json();
    if (!response.ok) throw new Error(asset.error?.message || 'رفض Cloudinary رفع الملف');
    port.postMessage({ type: 'progress', value: 85 });
    const complete = await fetch(`${data.supabaseUrl}/functions/v1/cloudinary-upload`, {
      method: 'POST',
      headers: { apikey: data.supabaseAnonKey, Authorization: `Bearer ${data.supabaseAnonKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'complete_upload', token: data.token, asset })
    });
    const result = await complete.json();
    if (!complete.ok || result.error) throw new Error(result.error || 'تعذر تسجيل الملف بعد الرفع');
    port.postMessage({ type: 'done', result });
  } catch (error) {
    port.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'فشل الرفع بالخلفية' });
  }
}
