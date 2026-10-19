/* AVEN Media shell cache + resumable customer uploads. Link tokens and API responses are never cached. */
const APP_CACHE = 'avenmedia-shell-v2';
const UPLOAD_DB = 'avenmedia-client-upload-v1';
const UPLOAD_DB_VERSION = 2;
const UPLOAD_STORE = 'jobs';
importScripts('/aven-upload-core.js');
const UPLOAD_CORE = self.AvenUploadCore;
const SYNC_PREFIX = 'aven-upload-';
const runningUploads = new Set();

self.addEventListener('install', (event) => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', (event) => event.waitUntil((async () => {
  const keys = await caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith('avenmedia-shell-') && key !== APP_CACHE).map((key) => caches.delete(key)));
  await self.clients.claim();
})()));

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (/\/(rest\/v1|auth\/v1|functions\/v1|storage\/v1|realtime\/v1|api)\//i.test(url.pathname)) return;
  const isUploadShell = /\/(?:aven-upload|client-upload)\.html$/i.test(url.pathname);
  if (!isUploadShell && ['token', 'code', 'access_token', 'refresh_token', 'signature'].some((key) => url.searchParams.has(key))) return;

  const isNavigation = request.mode === 'navigate';
  const isAsset = /\/_next\/static\/|\/branding\/|\/fonts\/|\.(?:css|js|mjs|woff2?|ttf|otf|png|jpe?g|svg|webp|ico)$/i.test(url.pathname);
  if (!isNavigation && !isAsset) return;
  const cacheUrl = new URL(url.pathname, url.origin);
  const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const response = await fetch(request);
        if (response.ok && response.type !== 'opaque') {
          const cache = await caches.open(APP_CACHE);
          await cache.put(cacheKey, response.clone());
        }
        return response;
      } catch {
        const cache = await caches.open(APP_CACHE);
        const cached = await cache.match(cacheKey) || await cache.match(new Request(new URL('/', url.origin).toString()));
        return cached || new Response('يلزم فتح التطبيق مرة واحدة مع الإنترنت حتى تُحفظ صفحاته للعمل دون اتصال.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
      }
    })());
  } else {
    event.respondWith((async () => {
      const cache = await caches.open(APP_CACHE);
      const cached = await cache.match(cacheKey);
      const refresh = fetch(request).then((response) => {
        if (response.ok && response.type !== 'opaque') void cache.put(cacheKey, response.clone());
        return response;
      }).catch(() => null);
      return cached || await refresh || new Response('', { status: 503 });
    })());
  }
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'aven-upload:run' && event.ports && event.ports[0]) {
    const port = event.ports[0];
    event.waitUntil(runOneChunk(data.id).then((job) => {
      port.postMessage({ type: 'aven-upload:state', job: publicJob(job) });
      port.close();
    }).catch(async (error) => {
      port.postMessage({ type: 'aven-upload:state', error: error instanceof Error ? error.message : 'تعذر تشغيل الرفع الخلفي' });
      port.close();
    }));
  }
});

self.addEventListener('sync', (event) => {
  if (!event.tag || !event.tag.startsWith(SYNC_PREFIX)) return;
  const id = event.tag.slice(SYNC_PREFIX.length);
  event.waitUntil(runOneChunk(id).then(() => undefined));
});

function openUploadDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(UPLOAD_DB, UPLOAD_DB_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(UPLOAD_STORE)) request.result.createObjectStore(UPLOAD_STORE, { keyPath: 'id' });
      const store = request.transaction.objectStore(UPLOAD_STORE);
      if (!store.indexNames.contains('token')) store.createIndex('token', 'token', { unique: false });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('تعذر فتح طابور الرفع'));
  });
}

async function getJob(id) {
  const db = await openUploadDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(UPLOAD_STORE, 'readonly').objectStore(UPLOAD_STORE).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error('تعذر قراءة عملية الرفع'));
  });
}

async function putJob(job) {
  const db = await openUploadDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(UPLOAD_STORE, 'readwrite');
    tx.objectStore(UPLOAD_STORE).put(job);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error || new Error('تعذر حفظ تقدم الرفع'));
    tx.onabort = () => reject(tx.error || new Error('أُلغي حفظ تقدم الرفع'));
  });
}

function publicJob(job) {
  if (!job) return null;
  return {
    id: job.id,
    fileName: job.fileName,
    fileType: job.fileType,
    size: job.size,
    nextOffset: job.nextOffset || 0,
    status: job.status,
    error: job.error || '',
    asset: job.asset || null,
    updatedAt: job.updatedAt,
  };
}

async function notifyClients(job) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of windows) client.postMessage({ type: 'aven-upload:progress', job: publicJob(job) });
}

async function scheduleNext(id) {
  try {
    if (self.registration.sync && typeof self.registration.sync.register === 'function') {
      await self.registration.sync.register(`${SYNC_PREFIX}${id}`);
    }
  } catch (error) {
    console.warn('[Avenmedia][upload][sync-register]', error);
  }
}

function makeError(message, status = 0) {
  const error = new Error(message);
  error.status = status;
  return error;
}

async function api(job, payload) {
  const response = await fetch(`${job.supabaseUrl}/functions/v1/cloudinary-upload`, {
    method: 'POST',
    headers: { apikey: job.supabaseAnonKey, Authorization: `Bearer ${job.supabaseAnonKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw makeError(data.error || `خطأ خدمة التخزين (${response.status})`, response.status);
  return data;
}

async function cloudinaryChunk(job, signed, start, end) {
  const form = new FormData();
  form.append('file', job.file.slice(start, end, job.fileType || 'application/octet-stream'), job.fileName);
  form.append('api_key', signed.apiKey);
  form.append('timestamp', String(signed.timestamp));
  form.append('signature', signed.signature);
  form.append('folder', signed.folder);
  const response = await fetch(`https://api.cloudinary.com/v1_1/${signed.cloudName}/auto/upload`, {
    method: 'POST',
    headers: {
      'X-Unique-Upload-Id': job.uploadId,
      'Content-Range': UPLOAD_CORE.nextRange(start, job.size).contentRange,
    },
    body: form,
  });
  const asset = await response.json().catch(() => ({}));
  if (!response.ok || asset.error) throw makeError(asset.error?.message || `رفض التخزين جزء الرفع (${response.status})`, response.status);
  return asset;
}

function isPermanent(error) {
  const status = Number(error && error.status || 0);
  return status >= 400 && status < 500 && !UPLOAD_CORE.isRetryableHttpStatus(status);
}

async function finalize(job) {
  job.status = 'registering';
  job.updatedAt = Date.now();
  await putJob(job);
  await notifyClients(job);
  const result = await api(job, { action: 'complete_upload', token: job.token, fileName: job.fileName, asset: job.asset });
  job.asset = result.upload || job.asset;
  job.uploadedUrl = job.asset && (job.asset.secure_url || job.asset.url) || '';
  job.status = 'done';
  job.error = '';
  job.currentChunkBytes = 0;
  job.completedAt = Date.now();
  job.file = null;
  job.updatedAt = Date.now();
  await putJob(job);
  await notifyClients(job);
  return job;
}

async function runOneChunk(id) {
  if (!id) return null;
  if (runningUploads.has(id)) return getJob(id);
  runningUploads.add(id);
  try {
    const job = await getJob(id);
    if (!job || job.status === 'done' || job.status === 'blocked') return job;

    if (job.asset) {
      try { return await finalize(job); }
      catch (error) {
        job.status = isPermanent(error) ? 'blocked' : 'queued';
        job.error = error instanceof Error ? error.message : 'تعذر تسجيل الملف بعد رفعه';
        job.updatedAt = Date.now();
        await putJob(job);
        if (job.status === 'queued') await scheduleNext(id);
        await notifyClients(job);
        return job;
      }
    }

    if (!job.file || !job.size || !job.token) {
      job.status = 'blocked';
      job.error = 'ملف الرفع المحلي غير متاح؛ اختره مرة أخرى ثم أعد المحاولة.';
      job.updatedAt = Date.now();
      await putJob(job);
      await notifyClients(job);
      return job;
    }

    const start = Number(job.nextOffset || 0);
    const end = UPLOAD_CORE.nextRange(start, Number(job.size)).endExclusive;
    job.status = 'uploading';
    job.currentChunkBytes = 0;
    job.error = '';
    job.updatedAt = Date.now();
    await putJob(job);
    await notifyClients(job);

    try {
      const signed = await api(job, { action: 'sign_upload', token: job.token });
      const asset = await cloudinaryChunk(job, signed, start, end);
      job.nextOffset = end;
      job.currentChunkBytes = 0;
      job.error = '';
      job.updatedAt = Date.now();
      if (end >= Number(job.size)) {
        if (!asset.public_id || !asset.secure_url) {
          job.nextOffset = start;
          throw makeError('لم يرجع التخزين بيانات اكتمال الملف بعد آخر جزء.', 502);
        }
        job.asset = asset;
        job.status = 'registering';
        await putJob(job);
        await notifyClients(job);
        return await finalize(job);
      }
      job.status = 'queued';
      await putJob(job);
      await notifyClients(job);
      await scheduleNext(id);
      return job;
    } catch (error) {
      job.status = isPermanent(error) ? 'blocked' : 'queued';
      job.error = error instanceof Error ? error.message : 'تعذر رفع الجزء الحالي';
      job.currentChunkBytes = 0;
      job.updatedAt = Date.now();
      await putJob(job);
      if (job.status === 'queued') await scheduleNext(id);
      await notifyClients(job);
      return job;
    }
  } finally {
    runningUploads.delete(id);
  }
}
