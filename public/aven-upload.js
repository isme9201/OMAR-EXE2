/* AVEN Media customer uploader. Jobs and file blobs are persisted locally before transfer. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://tgufcpgrbsaxccbkmvhx.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRndWZjcGdyYnNheGNjYmttdmh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODczODU4MDcsImV4cCI6MjEwMjk2MTgwN30.2WlPv_c3Y99n0rd5sFOn0B0xIVI2jxoRFA26gKunmMs';
  const DB_NAME = 'avenmedia-client-upload-v1';
  const DB_VERSION = 2;
  const STORE = 'jobs';
  const UPLOAD_CORE = window.AvenUploadCore;
  const token = new URLSearchParams(location.search).get('token') || '';
  const $ = (id) => document.getElementById(id);
  const fileInput = $('files');
  const queue = $('queue');
  const startButton = $('start');
  const clearButton = $('clear');
  const message = $('message');
  const historyBox = $('history');
  const page = $('page');
  const blocked = $('blocked');
  const jobs = [];
  const runners = new Set();
  let dbPromise;
  let serviceWorkerPromise;

  function openDb() {
    if (!('indexedDB' in window)) return Promise.reject(new Error('هذا المتصفح لا يتيح تخزين الرفع للاستئناف. استخدم Chrome أو Edge حديثاً.'));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
        const store = request.transaction.objectStore(STORE);
        if (!store.indexNames.contains('token')) store.createIndex('token', 'token', { unique: false });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('تعذر فتح مساحة حفظ الرفع'));
      request.onblocked = () => reject(new Error('تحديث مساحة حفظ الرفع متوقف؛ أغلق تبويبات الرفع الأخرى ثم أعد المحاولة.'));
    });
    return dbPromise;
  }

  async function putJob(job) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(job);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('تعذر حفظ حالة الرفع'));
      tx.onabort = () => reject(tx.error || new Error('أُلغي حفظ حالة الرفع'));
    });
  }

  async function readJobs(uploadToken) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const store = db.transaction(STORE, 'readonly').objectStore(STORE);
      const request = store.indexNames.contains('token') ? store.index('token').getAll(uploadToken) : store.getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error || new Error('تعذر قراءة الرفع المحفوظ'));
    });
  }

  async function readJob(id) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('تعذر قراءة تقدم الرفع'));
    });
  }

  async function deleteJob(id) {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('تعذر حذف الرفع المحفوظ'));
    });
  }

  function getServiceWorker() {
    if (serviceWorkerPromise) return serviceWorkerPromise;
    serviceWorkerPromise = ('serviceWorker' in navigator)
      ? navigator.serviceWorker.register('/aven-upload-sw.js').then(() => navigator.serviceWorker.ready).catch(() => null)
      : Promise.resolve(null);
    return serviceWorkerPromise;
  }

  async function scheduleInBackground(id) {
    const registration = await getServiceWorker();
    try {
      if (registration && registration.sync && typeof registration.sync.register === 'function') {
        await registration.sync.register(`aven-upload-${id}`);
        return true;
      }
    } catch (error) {
      console.warn('[Avenmedia][upload][background-sync]', error);
    }
    return false;
  }

  function show(text, type = 'info') {
    message.textContent = text;
    message.className = `message show ${type}`;
  }

  function safe(value) {
    return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function formatSize(bytes) {
    if (!Number.isFinite(Number(bytes)) || Number(bytes) < 0) return '—';
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let n = Number(bytes), i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i++; }
    return `${n.toFixed(i ? 1 : 0)} ${units[i]}`;
  }

  function progressOf(job) {
    if (job.status === 'done') return 100;
    if (!job.size) return 0;
    const current = Number(job.currentChunkBytes || 0);
    return Math.min(99, Math.max(0, ((Number(job.nextOffset || 0) + current) / Number(job.size)) * 100));
  }

  function statusLabel(job) {
    if (job.status === 'done') return 'اكتمل الرفع';
    if (job.status === 'blocked') return `يحتاج إجراء: ${job.error || 'تعذر الرفع'}`;
    if (job.status === 'registering') return 'جاري تسجيل الملف';
    if (job.status === 'uploading') return 'جاري الرفع المجزّأ';
    if (job.status === 'queued' && job.nextOffset > 0) return 'محفوظ — سيُستأنف من آخر جزء';
    if (job.status === 'queued') return 'جاهز للرفع';
    return job.status || 'جاهز للرفع';
  }

  function draw() {
    queue.replaceChildren();
    if (!jobs.length) queue.innerHTML = '<p class="muted">لم يتم اختيار ملفات بعد.</p>';
    for (const job of jobs) {
      const el = document.createElement('div');
      el.className = 'item';
      const progress = progressOf(job);
      const sent = Math.min(Number(job.nextOffset || 0), Number(job.size || 0));
      el.innerHTML = `<div class="row"><span class="name" title="${safe(job.fileName)}">${safe(job.fileName)}</span><span class="status">${safe(statusLabel(job))}</span></div><div class="meta">${formatSize(job.size)} · ${formatSize(sent)} من ${formatSize(job.size)}</div><div class="bar"><span style="width:${progress}%"></span></div><div class="meta">${Math.round(progress)}%</div>`;
      queue.appendChild(el);
    }
    startButton.disabled = !token || jobs.every((job) => job.status === 'done' || job.status === 'blocked') || runners.size > 0;
    clearButton.disabled = !jobs.length || runners.size > 0;
  }

  async function callApi(body) {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/cloudinary-upload`, {
      method: 'POST',
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.error) {
      const error = new Error(data.error || `خطأ اتصال (${response.status})`);
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function postToWorker(id) {
    return getServiceWorker().then((registration) => {
      if (!registration || !registration.active) throw new Error('عامل الرفع غير متاح في هذا المتصفح.');
      return new Promise((resolve, reject) => {
        const channel = new MessageChannel();
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          channel.port1.close();
          reject(new Error('تأخر عامل الرفع؛ حُفظ الملف وسيُستأنف تلقائياً عند عودة الاتصال.'));
        }, 240000);
        channel.port1.onmessage = (event) => {
          if (settled || event.data?.type !== 'aven-upload:state') return;
          settled = true;
          clearTimeout(timer);
          channel.port1.close();
          if (event.data.error) reject(new Error(event.data.error));
          else resolve(event.data.job || null);
        };
        registration.active.postMessage({ type: 'aven-upload:run', id }, [channel.port2]);
      });
    });
  }

  function uploadChunkFromPage(job, signed, start, end) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `https://api.cloudinary.com/v1_1/${signed.cloudName}/auto/upload`);
      xhr.setRequestHeader('X-Unique-Upload-Id', job.uploadId);
      xhr.setRequestHeader('Content-Range', UPLOAD_CORE.nextRange(start, job.size).contentRange);
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        job.currentChunkBytes = Math.min(end - start, event.loaded);
        draw();
      };
      xhr.onload = () => {
        let asset = {};
        try { asset = JSON.parse(xhr.responseText); } catch { /* report below */ }
        if (xhr.status >= 200 && xhr.status < 300 && !asset.error) resolve(asset);
        else {
          const error = new Error(asset.error?.message || `رفض التخزين جزء الرفع (${xhr.status})`);
          error.status = xhr.status;
          reject(error);
        }
      };
      xhr.onerror = () => reject(new Error('انقطع اتصال الرفع؛ سيُستأنف من آخر جزء مكتمل.'));
      xhr.onabort = () => reject(new Error('توقف الرفع؛ سيُستأنف من آخر جزء مكتمل.'));
      const form = new FormData();
      form.append('file', job.file.slice(start, end, job.fileType || 'application/octet-stream'), job.fileName);
      form.append('api_key', signed.apiKey);
      form.append('timestamp', String(signed.timestamp));
      form.append('signature', signed.signature);
      form.append('folder', signed.folder);
      xhr.send(form);
    });
  }

  async function runDirectPageChunk(job) {
    if (job.asset) {
      const saved = await callApi({ action: 'complete_upload', token: job.token, fileName: job.fileName, asset: job.asset });
      job.asset = saved.upload || job.asset;
      job.status = 'done'; job.file = null; job.error = ''; job.completedAt = Date.now();
      await putJob(job);
      return job;
    }
    if (!job.file) throw new Error('ملف الرفع غير موجود في التخزين المحلي. اختر الملف من جديد.');
    const start = Number(job.nextOffset || 0);
    const end = UPLOAD_CORE.nextRange(start, Number(job.size)).endExclusive;
    const signed = await callApi({ action: 'sign_upload', token: job.token });
    const asset = await uploadChunkFromPage(job, signed, start, end);
    job.nextOffset = end; job.currentChunkBytes = 0; job.error = '';
    if (end >= Number(job.size)) {
      if (!asset.public_id || !asset.secure_url) { job.nextOffset = start; throw new Error('لم يرجع التخزين بيانات اكتمال الملف بعد آخر جزء.'); }
      job.asset = asset; job.status = 'registering'; await putJob(job);
      const saved = await callApi({ action: 'complete_upload', token: job.token, fileName: job.fileName, asset });
      job.asset = saved.upload || asset; job.status = 'done'; job.file = null; job.completedAt = Date.now();
    } else job.status = 'queued';
    job.updatedAt = Date.now();
    await putJob(job);
    return job;
  }

  function history() {
    try { return JSON.parse(localStorage.getItem(`aven-history-${token}`) || '[]'); } catch { return []; }
  }

  function saveHistory(items) {
    localStorage.setItem(`aven-history-${token}`, JSON.stringify(items.slice(0, 100)));
  }

  function drawHistory() {
    const items = history();
    historyBox.innerHTML = items.length ? items.map((item) => `<div class="item"><div class="row"><span class="name">${safe(item.name)}</span><a class="link" href="${safe(item.url)}" target="_blank" rel="noreferrer" download>تنزيل</a></div><div class="meta">${formatSize(item.size)} · ${safe(new Date(item.date).toLocaleString('ar-IQ'))}</div></div>`).join('') : '<p class="muted">سيظهر هنا كل ملف تم رفعه بهذا الرابط.</p>';
  }

  async function addFiles(list) {
    let added = 0;
    for (const file of list) {
      if (!file || file.size <= 0) { show('الملف فارغ أو غير صالح.', 'err'); continue; }
      if (jobs.some((job) => job.fileName === file.name && job.size === file.size && job.status !== 'done')) { show(`الملف موجود في القائمة: ${file.name}`, 'info'); continue; }
      jobs.push({
        id: crypto.randomUUID(), uploadId: `aven-${crypto.randomUUID()}`,
        file, fileName: file.name, fileType: file.type || 'application/octet-stream', size: file.size,
        token, supabaseUrl: SUPABASE_URL, supabaseAnonKey: SUPABASE_ANON_KEY,
        nextOffset: 0, status: 'queued', error: '', asset: null, createdAt: Date.now(), updatedAt: Date.now(),
      });
      added++;
    }
    draw();
    if (added) show(`تمت إضافة ${added} ملف. سيُحفظ محلياً قبل بدء الرفع المجزّأ.`, 'ok');
  }

  async function persistAndQueue(job) {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      try { await navigator.storage.persist(); } catch { /* browser may decline persistent-storage permission */ }
    }
    const saved = await readJob(job.id);
    if (saved) Object.assign(job, saved);
    else await putJob(job);
    await scheduleInBackground(job.id);
  }

  async function finishJob(job, workerJob) {
    Object.assign(job, workerJob);
    job.currentChunkBytes = 0;
    if (job.status !== 'done') return;
    const asset = job.asset || {};
    const url = asset.secure_url || asset.url;
    if (url) {
      const items = history();
      if (!items.some((item) => item.url === url)) {
        items.unshift({ name: job.fileName, size: job.size, url, date: Date.now() });
        saveHistory(items);
      }
      drawHistory();
    }
    show(`اكتمل رفع ${job.fileName} وحُفظ الملف في Avenmedia.`, 'ok');
  }

  async function runJob(job) {
    if (runners.has(job.id) || job.status === 'done' || job.status === 'blocked') return;
    runners.add(job.id);
    draw();
    try {
      await persistAndQueue(job);
      let keepGoing = true;
      let stalledRetries = 0;
      while (keepGoing && job.status !== 'done' && job.status !== 'blocked') {
        const saved = await readJob(job.id);
        if (saved) Object.assign(job, saved);
        if (job.status === 'done' || job.status === 'blocked') break;
        if (!navigator.onLine) {
          job.status = 'queued'; job.error = 'بانتظار عودة الإنترنت'; await putJob(job); await scheduleInBackground(job.id);
          show(`انقطع الإنترنت. حُفظ ${job.fileName} وسيُستأنف من آخر جزء عند عودة الاتصال.`, 'info');
          break;
        }
        if (document.visibilityState === 'hidden') {
          job.status = 'queued'; await putJob(job); await scheduleInBackground(job.id);
          show(`حُفظ ${job.fileName} في قائمة الرفع الخلفية. يمكنك مغادرة الصفحة؛ قد تختلف استمرارية الخلفية حسب المتصفح.`, 'info');
          break;
        }
        const before = Number(job.nextOffset || 0);
        job.status = job.asset ? 'registering' : 'uploading';
        job.error = '';
        draw();
        let result;
        try {
          const registration = await getServiceWorker();
          result = registration?.active ? await postToWorker(job.id) : await runDirectPageChunk(job);
        }
        catch (error) {
          const status = Number(error?.status || 0);
          const permanent = status >= 400 && status < 500 && !UPLOAD_CORE.isRetryableHttpStatus(status);
          job.status = permanent ? 'blocked' : 'queued';
          job.error = error instanceof Error ? error.message : 'تعذر الاتصال بعامل الرفع';
          await putJob(job);
          if (!permanent) await scheduleInBackground(job.id);
          if (!permanent && !job.error.includes('تأخر عامل الرفع') && navigator.onLine && document.visibilityState === 'visible' && stalledRetries < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** stalledRetries++)));
            continue;
          }
          show(`${job.error}${permanent ? ' اطلب من الإدارة التحقق من الرابط أو حدود التخزين.' : ' تمت المحافظة على الملف في التخزين المحلي.'}`, permanent ? 'err' : 'info');
          break;
        }
        if (!result) { job.status = 'queued'; await putJob(job); await scheduleInBackground(job.id); break; }
        await finishJob(job, result);
        draw();
        if (job.status === 'blocked') { show(`${job.fileName}: ${job.error || 'يحتاج هذا الرفع إلى إجراء'}`, 'err'); break; }
        if (job.status === 'done') break;
        if (Number(job.nextOffset || 0) > before) stalledRetries = 0;
        if (Number(job.nextOffset || 0) <= before) {
          job.status = 'queued'; await putJob(job); await scheduleInBackground(job.id);
          if (navigator.onLine && document.visibilityState === 'visible' && stalledRetries < 3) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * (2 ** stalledRetries++)));
            continue;
          }
          show(job.error || 'توقف مؤقتاً دون فقدان الأجزاء السابقة؛ سيُعاد المحاولة.', 'info');
          break;
        }
      }
    } catch (error) {
      job.status = 'queued'; job.error = error instanceof Error ? error.message : 'تعذر حفظ الملف محلياً';
      try { await putJob(job); await scheduleInBackground(job.id); } catch { /* retain the in-memory file for foreground retry */ }
      show(`تعذر إعداد ${job.fileName}: ${job.error}. أبقِ الصفحة مفتوحة ثم أعد المحاولة.`, 'err');
    } finally {
      runners.delete(job.id);
      draw();
    }
  }

  async function runPending() {
    if (runners.size) return;
    const pending = jobs.filter((job) => job.status !== 'done' && job.status !== 'blocked');
    if (!pending.length) return;
    startButton.disabled = true;
    for (const job of pending) await runJob(job);
    draw();
    if (jobs.every((job) => job.status === 'done')) show('اكتمل رفع كل الملفات بنجاح.', 'ok');
  }

  async function loadSavedJobs() {
    const all = await readJobs(token);
    const saved = all.filter((job) => job.token === token && job.status !== 'done');
    for (const job of saved) {
      if (jobs.some((item) => item.id === job.id)) continue;
      if (job.status === 'uploading' || job.status === 'registering') job.status = 'queued';
      job.error = job.error || '';
      jobs.push(job);
      if (job.status !== 'blocked') await scheduleInBackground(job.id);
    }
    draw();
    return saved.length;
  }

  fileInput.addEventListener('change', (event) => {
    void addFiles([...(event.target.files || [])]);
    fileInput.value = '';
  });
  $('choose').addEventListener('click', () => fileInput.click());
  startButton.addEventListener('click', () => { void runPending(); });
  clearButton.addEventListener('click', async () => {
    const finished = jobs.filter((job) => job.status === 'done');
    if (jobs.some((job) => job.status !== 'done') && !window.confirm('مسح القائمة المحلية سيحذف الملفات التي لم يكتمل رفعها. هل تريد المتابعة؟')) return;
    for (const job of jobs) await deleteJob(job.id);
    jobs.length = 0;
    draw();
    show(`تم مسح ${finished.length} سجل من هذه الصفحة.`, 'info');
  });
  $('clearHistory').addEventListener('click', () => { localStorage.removeItem(`aven-history-${token}`); drawHistory(); });
  const drop = $('drop');
  drop.addEventListener('dragover', (event) => { event.preventDefault(); drop.classList.add('drag'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('drag'));
  drop.addEventListener('drop', (event) => { event.preventDefault(); drop.classList.remove('drag'); void addFiles([...(event.dataTransfer?.files || [])]); });
  window.addEventListener('online', () => { for (const job of jobs) if (job.status !== 'done' && job.status !== 'blocked') void scheduleInBackground(job.id); show('عاد الاتصال. تتم متابعة الملفات المحفوظة.', 'info'); void runPending(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      for (const job of jobs) if (job.status !== 'done' && job.status !== 'blocked') void scheduleInBackground(job.id);
    } else {
      void runPending();
    }
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type !== 'aven-upload:progress' || !event.data.job) return;
    const job = jobs.find((item) => item.id === event.data.job.id);
    if (!job) return;
    void finishJob(job, event.data.job).then(() => {
      if (job.status === 'blocked') show(`${job.fileName}: ${job.error || 'يحتاج هذا الرفع إلى إجراء'}`, 'err');
      draw();
    });
  });

  (async () => {
    try {
      if (!token) throw Object.assign(new Error('رابط الرفع لا يحتوي على رمز صالح.'), { status: 410 });
      const registration = await getServiceWorker();
      if (!registration || !registration.sync) show('سيعمل الرفع المجزّأ أثناء فتح الصفحة. الاستئناف بعد مغادرتها يتطلب متصفحاً يدعم Background Sync؛ وإلا أكمل عند إعادة فتح الرابط.', 'info');
      let data = { uploads: [] };
      try { data = await callApi({ action: 'list_uploads', token }); }
      catch (error) {
        if ([400, 401, 403, 404, 410].includes(Number(error?.status))) throw error;
        page.classList.remove('hidden');
        blocked.classList.add('hidden');
        drawHistory();
        try {
          const pending = await loadSavedJobs();
          show(pending ? `لا يوجد اتصال الآن. عُثر على ${pending} عملية محفوظة وستستأنف عند عودة الشبكة.` : 'تعذر التحقق من الرابط بسبب الشبكة. أبقِ الصفحة مفتوحة أو أعد فتحها عند عودة الاتصال.', 'info');
        } catch (storageError) {
          startButton.disabled = true;
          show(`لا يمكن حفظ ملفات للاستئناف في هذا المتصفح: ${storageError instanceof Error ? storageError.message : 'مساحة التخزين غير متاحة'}`, 'err');
        }
        return;
      }
      page.classList.remove('hidden');
      blocked.classList.add('hidden');
      const items = history();
      const known = new Set(items.map((item) => item.url));
      for (const item of data.uploads || []) {
        if (item.secure_url && !known.has(item.secure_url)) items.push({ name: item.file_name || 'ملف', size: Number(item.bytes || 0), url: item.secure_url, date: item.uploaded_at ? Date.parse(item.uploaded_at) : Date.now() });
      }
      saveHistory(items);
      drawHistory();
      let pending = 0;
      try { pending = await loadSavedJobs(); }
      catch (storageError) { show(`تعذر فتح مساحة الاستئناف المحلية: ${storageError instanceof Error ? storageError.message : 'مساحة التخزين غير متاحة'}`, 'err'); startButton.disabled = true; return; }
      if (pending) {
        show(`تم العثور على ${pending} عملية رفع محفوظة. ستُستأنف من آخر جزء مكتمل.`, 'info');
        if (navigator.onLine) void runPending();
      } else {
        show('اختر الملفات ثم ابدأ الرفع. الملفات الأكبر من 100MB تُرسل على أجزاء، ويُحفظ التقدم للاستئناف.', 'info');
      }
    } catch (error) {
      blocked.innerHTML = `🔒<br>رابط الرفع غير صالح أو منتهي.<br><small>اطلب رابطاً جديداً من فريق AVEN Media.</small>`;
      console.warn('[Avenmedia][upload][token]', error);
    }
  })();
})();
