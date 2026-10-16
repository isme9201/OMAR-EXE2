type CachedResponse = {
  key: string;
  owner: string;
  table: string;
  url: string;
  body: unknown;
  headers: [string, string][];
  updatedAt: number;
};

type QueuedWrite = {
  id: string;
  owner: string;
  table: string;
  method: string;
  url: string;
  body: unknown;
  headers: Record<string, string>;
  createdAt: number;
  baseRevision?: string | null;
  status: 'pending' | 'blocked';
  lastError?: string;
};

export type OfflineSyncStatus = {
  online: boolean;
  queued: number;
  blocked: number;
  lastSyncAt: number | null;
};

const DB_NAME = 'avenmedia-local-first-v1';
const DB_VERSION = 1;
const STATUS_EVENT = 'avenmedia-offline-status';
const MAX_CACHE_BYTES = 5 * 1024 * 1024;
const UUID_TABLES = new Set([
  'tasks', 'financial_entries', 'avenmedia_accounts', 'avenmedia_transactions',
  'workspace_records', 'studio_actions', 'equipment_requests', 'task_notifications',
  'attendance_logs', 'client_uploads', 'upload_activity', 'studio_actions', 'studio_action_events', 'portfolio_elements', 'portfolio_pages',
  'portfolio_revisions', 'portfolio_members', 'conversation_messages', 'conversations',
  'conversation_members', 'media_shares', 'avenmedia_overdue_tasks',
]);
const QUEUEABLE_TABLES = new Set([
  'tasks', 'task_assignments', 'financial_entries', 'avenmedia_accounts',
  'avenmedia_transactions', 'workspace_records', 'studio_actions', 'studio_preferences',
  'equipment_requests', 'task_notifications', 'attendance_logs', 'client_uploads',
  'upload_activity', 'portfolio_elements', 'portfolio_pages', 'portfolio_revisions',
  'portfolio_members', 'conversation_messages', 'conversations',
  'conversation_members', 'media_shares',
]);
const UNCACHED_TABLES = new Set(['client_orders']);
const UUID = () => crypto.randomUUID();
let dbPromise: Promise<IDBDatabase> | null = null;
let lastSyncAt: number | null = null;
const flushByOwner = new Map<string, Promise<void>>();

function openDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB is unavailable'));
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('responses')) db.createObjectStore('responses', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('outbox')) db.createObjectStore('outbox', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Unable to open local database'));
    request.onblocked = () => reject(new Error('Local database upgrade is blocked'));
  });
  return dbPromise;
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local database request failed'));
  });
}

async function readAll<T>(storeName: 'responses' | 'outbox'): Promise<T[]> {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readonly');
  return requestValue(tx.objectStore(storeName).getAll()) as Promise<T[]>;
}

async function putRecord(storeName: 'responses' | 'outbox', value: CachedResponse | QueuedWrite) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  await requestValue(tx.objectStore(storeName).put(value));
}

async function deleteRecord(storeName: 'responses' | 'outbox', key: string) {
  const db = await openDatabase();
  const tx = db.transaction(storeName, 'readwrite');
  await requestValue(tx.objectStore(storeName).delete(key));
}

function jwtPayload(token: string) {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(Array.from(atob(base64), (char) => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join(''))) as { sub?: string; exp?: number };
  } catch { return null; }
}

function authorizationOf(request: Request) {
  return request.headers.get('authorization') ?? '';
}

function ownerOf(request: Request) {
  const bearer = authorizationOf(request).replace(/^Bearer\s+/i, '');
  return jwtPayload(bearer)?.sub || 'anonymous';
}

function tableOf(url: URL) {
  const marker = '/rest/v1/';
  const index = url.pathname.indexOf(marker);
  if (index < 0) return '';
  const name = decodeURIComponent(url.pathname.slice(index + marker.length).split('/')[0] || '');
  return name && !name.startsWith('rpc/') ? name : '';
}

function responseKey(owner: string, url: string) { return `${owner}::${url}`; }

function requestHeadersForQueue(request: Request) {
  const result: Record<string, string> = {};
  for (const name of ['apikey', 'accept', 'content-type', 'prefer', 'accept-profile', 'content-profile', 'range']) {
    const value = request.headers.get(name);
    if (value) result[name] = value;
  }
  return result;
}

function parseBody(text: string): unknown {
  if (!text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function bodyRows(body: unknown) {
  const values = Array.isArray(body) ? body : body && typeof body === 'object' ? [body as Record<string, unknown>] : [];
  return values.map((value) => value && typeof value === 'object' ? { ...(value as Record<string, unknown>) } : null).filter((value): value is Record<string, unknown> => Boolean(value));
}

function withLocalDefaults(table: string, rows: Record<string, unknown>[]) {
  const now = new Date().toISOString();
  return rows.map((source) => {
    const row = { ...source };
    if (UUID_TABLES.has(table) && !row.id) row.id = UUID();
    if (['tasks', 'financial_entries', 'avenmedia_accounts', 'avenmedia_transactions', 'workspace_records', 'studio_actions', 'equipment_requests', 'task_notifications', 'attendance_logs', 'client_uploads'].includes(table)) {
      if (!row.created_at) row.created_at = now;
      if (table === 'tasks' && !row.updated_at) row.updated_at = now;
    }
    if (table === 'avenmedia_accounts' && row.is_active === undefined) row.is_active = true;
    if (table === 'workspace_records' && !row.updated_at) row.updated_at = now;
    return row;
  });
}

function queryFilters(url: URL) {
  return [...url.searchParams.entries()].filter(([key]) => !['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(key) && key !== 'or' && key !== 'and');
}

function valueMatches(actual: unknown, expression: string) {
  const dot = expression.indexOf('.');
  if (dot < 0) return true;
  const operator = expression.slice(0, dot).toLowerCase();
  const expected = expression.slice(dot + 1);
  const actualText = actual === null || actual === undefined ? 'null' : String(actual);
  const leftNumber = Number(actual);
  const rightNumber = Number(expected);
  const compare = Number.isFinite(leftNumber) && Number.isFinite(rightNumber) ? [leftNumber, rightNumber] as const : [actualText, expected] as const;
  if (operator === 'eq') return actualText === expected;
  if (operator === 'neq') return actualText !== expected;
  if (operator === 'is') return expected === 'null' ? actual === null || actual === undefined : String(actual) === expected;
  if (operator === 'in') return expected.replace(/^\(|\)$/g, '').split(',').map((item) => item.replace(/^"|"$/g, '')).includes(actualText);
  if (operator === 'gt') return compare[0] > compare[1];
  if (operator === 'gte') return compare[0] >= compare[1];
  if (operator === 'lt') return compare[0] < compare[1];
  if (operator === 'lte') return compare[0] <= compare[1];
  if (operator === 'ilike' || operator === 'like') {
    const escaped = expected.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.');
    return new RegExp(`^${escaped}$`, operator === 'ilike' ? 'i' : '').test(actualText);
  }
  return true;
}

function rowMatches(row: Record<string, unknown>, url: URL) {
  for (const [column, expression] of queryFilters(url)) {
    if (!valueMatches(row[column], expression)) return false;
  }
  const or = url.searchParams.get('or');
  if (or) {
    const clauses = or.replace(/^\(|\)$/g, '').split(',');
    const matched = clauses.some((clause) => {
      const firstDot = clause.indexOf('.');
      const secondDot = clause.indexOf('.', firstDot + 1);
      if (firstDot < 0 || secondDot < 0) return false;
      return valueMatches(row[clause.slice(0, firstDot)], `${clause.slice(firstDot + 1, secondDot)}.${clause.slice(secondDot + 1)}`);
    });
    if (!matched) return false;
  }
  return true;
}

export function matchesRestQuery(row: Record<string, unknown>, url: string) {
  return rowMatches(row, new URL(url));
}

function rowKey(row: Record<string, unknown>) {
  if (row.id !== undefined && row.id !== null) return `id:${String(row.id)}`;
  if (row.task_id !== undefined && row.employee_id !== undefined) return `assignment:${String(row.task_id)}:${String(row.employee_id)}`;
  if (row.actor_email !== undefined) return `actor:${String(row.actor_email)}`;
  return '';
}

function sortAndPage(rows: Record<string, unknown>[], url: URL, rangeHeader?: string | null) {
  const order = url.searchParams.get('order');
  if (order) {
    const [column, direction] = order.split('.');
    rows.sort((a, b) => {
      const av = a[column]; const bv = b[column];
      const compared = av === bv ? 0 : av === null || av === undefined ? -1 : bv === null || bv === undefined ? 1 : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return direction === 'desc' ? -compared : compared;
    });
  }
  const offset = Number(url.searchParams.get('offset') ?? '0') || 0;
  const limit = Number(url.searchParams.get('limit') ?? '0') || 0;
  let start = offset; let end = limit ? offset + limit : rows.length;
  if (rangeHeader) {
    const match = rangeHeader.match(/(\d+)-(\d+)/);
    if (match) { start = Math.max(start, Number(match[1])); end = Math.min(end, Number(match[2]) + 1); }
  }
  return rows.slice(start, end);
}

function shapeRows(rows: Record<string, unknown>[], select?: string | null) {
  if (!select || select === '*' || select.includes('(')) return rows;
  const columns = select.split(',').map((item) => item.trim()).filter((item) => /^[a-zA-Z_][\w]*$/.test(item));
  if (!columns.length) return rows;
  return rows.map((row) => Object.fromEntries(columns.filter((key) => key in row).map((key) => [key, row[key]])));
}

function applyWrite(rows: Record<string, unknown>[], write: QueuedWrite, queryUrl: URL) {
  const mutationUrl = new URL(write.url);
  let next = rows.map((row) => ({ ...row }));
  if (write.method === 'DELETE') return next.filter((row) => !rowMatches(row, mutationUrl));
  const incoming = bodyRows(write.body);
  if (write.method === 'PATCH') {
    return next.map((row) => rowMatches(row, mutationUrl) ? { ...row, ...(incoming[0] ?? {}) } : row);
  }
  if (!['POST', 'PUT'].includes(write.method)) return next;
  for (const candidate of incoming) {
    if (!rowMatches(candidate, mutationUrl) || !rowMatches(candidate, queryUrl)) continue;
    const key = rowKey(candidate);
    const index = key ? next.findIndex((row) => rowKey(row) === key) : -1;
    if (index >= 0) next[index] = { ...next[index], ...candidate };
    else next.push(candidate);
  }
  return next;
}

async function enrichTaskAssignments(rows: Record<string, unknown>[], owner: string, writes: QueuedWrite[]) {
  const assignmentWrites = writes.filter((write) => write.table === 'task_assignments');
  if (!assignmentWrites.length) return rows;
  const profileCaches = (await readAll<CachedResponse>('responses')).filter((item) => item.owner === owner && item.table === 'profiles').sort((a, b) => b.updatedAt - a.updatedAt);
  const profiles = profileCaches.flatMap((item) => bodyRows(item.body));
  return rows.map((task) => {
    if (!Array.isArray(task.task_assignments) || !task.id) return task;
    let assignments = (task.task_assignments as Record<string, unknown>[]).map((row) => ({ ...row }));
    for (const write of assignmentWrites) {
      const url = new URL(write.url);
      if (write.method === 'DELETE') assignments = assignments.filter((row) => !rowMatches({ ...row, task_id: task.id }, url));
      else if (write.method === 'POST') {
        for (const row of bodyRows(write.body)) {
          if (String(row.task_id) !== String(task.id)) continue;
          const profile = profiles.find((item) => String(item.id) === String(row.employee_id));
          const withProfile = { ...row, profiles: profile ? { id: profile.id, name: profile.name, specialty: profile.specialty } : null };
          const key = rowKey(withProfile);
          const index = key ? assignments.findIndex((item) => rowKey(item) === key) : -1;
          if (index >= 0) assignments[index] = { ...assignments[index], ...withProfile };
          else assignments.push(withProfile);
        }
      }
    }
    return { ...task, task_assignments: assignments };
  });
}

async function overlayPending(owner: string, table: string, url: URL, body: unknown) {
  const writes = (await readAll<QueuedWrite>('outbox')).filter((write) => write.owner === owner && (write.status === 'pending' || write.status === 'blocked')).sort((a, b) => a.createdAt - b.createdAt);
  let rows = bodyRows(body);
  for (const write of writes.filter((item) => item.table === table)) rows = applyWrite(rows, write, url);
  if (table === 'tasks' && url.searchParams.get('select')?.includes('task_assignments')) {
    rows = rows.map((row) => row.task_assignments === undefined ? { ...row, task_assignments: [] } : row);
    rows = await enrichTaskAssignments(rows, owner, writes);
  }
  return Array.isArray(body) ? rows : rows[0] ?? null;
}

async function cacheResponse(owner: string, table: string, url: string, response: Response) {
  if (UNCACHED_TABLES.has(table) || !response.headers.get('content-type')?.includes('json')) return;
  const body = await response.clone().json().catch(() => undefined);
  if (body === undefined) return;
  const serialized = JSON.stringify(body);
  if (serialized.length > MAX_CACHE_BYTES) return;
  const headers: [string, string][] = [];
  for (const name of ['content-type', 'content-range', 'accept-ranges', 'preference-applied']) {
    const value = response.headers.get(name);
    if (value) headers.push([name, value]);
  }
  await putRecord('responses', { key: responseKey(owner, url), owner, table, url, body, headers, updatedAt: Date.now() });
  const all = (await readAll<CachedResponse>('responses')).filter((item) => item.owner === owner && item.table === table).sort((a, b) => b.updatedAt - a.updatedAt);
  for (const stale of all.slice(40)) await deleteRecord('responses', stale.key);
}

async function findCachedRows(owner: string, table: string) {
  const caches = (await readAll<CachedResponse>('responses')).filter((item) => item.owner === owner && item.table === table).sort((a, b) => b.updatedAt - a.updatedAt);
  return caches.flatMap((item) => bodyRows(item.body));
}

async function patchCachedRows(owner: string, table: string, method: string, url: string, body: unknown, responseBody?: unknown) {
  if (!table || UNCACHED_TABLES.has(table)) return;
  const all = await readAll<CachedResponse>('responses');
  const mutation = { owner, table, method, url, body, createdAt: Date.now(), status: 'pending' } as QueuedWrite;
  const rowsForPost = responseBody !== undefined && bodyRows(responseBody).length ? bodyRows(responseBody) : bodyRows(body);
  mutation.body = method === 'POST' || method === 'PUT' ? rowsForPost : method === 'PATCH' ? (responseBody ?? body) : body;
  for (const cached of all.filter((item) => item.owner === owner && item.table === table)) {
    const cachedUrl = new URL(cached.url);
    let rows = bodyRows(cached.body);
    rows = applyWrite(rows, mutation, cachedUrl);
    if (cachedUrl.searchParams.get('select') !== '*' && !cachedUrl.searchParams.get('select')?.includes('(')) {
      const selection = cachedUrl.searchParams.get('select');
      if (selection) rows = shapeRows(rows, selection);
    }
    const nextBody = Array.isArray(cached.body) ? rows : rows[0] ?? null;
    await putRecord('responses', { ...cached, body: nextBody, updatedAt: Date.now() });
  }
}

async function cachedResponse(request: Request, owner: string, table: string) {
  const url = new URL(request.url);
  const all = (await readAll<CachedResponse>('responses')).filter((item) => item.owner === owner && item.table === table).sort((a, b) => b.updatedAt - a.updatedAt);
  const cached = all.find((item) => item.url === request.url) ?? all[0];
  if (!cached) return null;
  const overlaid = await overlayPending(owner, table, url, cached.body);
  let rows = bodyRows(overlaid).filter((row) => rowMatches(row, url));
  rows = sortAndPage(rows, url, request.headers.get('range'));
  rows = shapeRows(rows, url.searchParams.get('select'));
  let data: unknown = rows;
  const single = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
  if (single) {
    if (rows.length !== 1) return new Response(JSON.stringify({ message: 'Local record not found or result is not singular', code: 'PGRST116' }), { status: 406, headers: { 'content-type': 'application/json' } });
    data = rows[0];
  }
  const headers = new Headers(cached.headers);
  headers.set('content-type', 'application/json; charset=utf-8');
  headers.set('x-avenmedia-data-source', 'local-cache');
  return new Response(JSON.stringify(data), { status: 200, headers });
}

async function currentRevision(owner: string, table: string, url: string) {
  const mutationUrl = new URL(url);
  const rows = await findCachedRows(owner, table);
  return rows.find((row) => rowMatches(row, mutationUrl))?.updated_at;
}

function localRowDefaults(table: string, method: string, body: unknown) {
  return method === 'POST' || method === 'PUT' ? withLocalDefaults(table, bodyRows(body)) : bodyRows(body);
}

function shouldReturnRepresentation(request: Request) {
  return /return=representation/i.test(request.headers.get('prefer') ?? '');
}

function responseForQueuedWrite(request: Request, method: string, rows: Record<string, unknown>[]) {
  if (!shouldReturnRepresentation(request)) return new Response(null, { status: method === 'POST' ? 201 : 204 });
  const singular = request.headers.get('accept')?.includes('application/vnd.pgrst.object+json');
  if (singular && rows.length !== 1) return new Response(JSON.stringify({ message: 'Local write did not return one row', code: 'PGRST116' }), { status: 406, headers: { 'content-type': 'application/json' } });
  return new Response(JSON.stringify(singular ? rows[0] : rows), { status: method === 'POST' ? 201 : 200, headers: { 'content-type': 'application/json; charset=utf-8', 'x-avenmedia-write-queued': 'true' } });
}

function jsonError(message: string, status = 503) {
  return new Response(JSON.stringify({ message, error: message, code: 'AVENMEDIA_OFFLINE' }), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'x-avenmedia-offline': 'true' } });
}

async function queueMutation(request: Request, owner: string, table: string, body: unknown) {
  if (!QUEUEABLE_TABLES.has(table)) return jsonError('هذا الإجراء يحتاج اتصالاً بالإنترنت ولم يُحفظ في الطابور المحلي.');
  const method = request.method.toUpperCase();
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(method)) return jsonError('نوع التغيير غير مدعوم دون اتصال.');
  if (method !== 'DELETE' && !bodyRows(body).length) return jsonError('تعذر حفظ هذا التغيير محلياً لأن محتواه ليس JSON.');
  const previous = method === 'PATCH' ? await currentRevision(owner, table, request.url) : undefined;
  const preparedRows = localRowDefaults(table, method, body);
  const mutationUrl = new URL(request.url);
  let responseRows = preparedRows;
  if (method === 'PATCH' && preparedRows.length) {
    const cached = (await findCachedRows(owner, table)).find((row) => rowMatches(row, mutationUrl));
    const id = mutationUrl.searchParams.get('id')?.replace(/^eq\./, '');
    responseRows = [{ ...(cached ?? {}), ...preparedRows[0], ...(preparedRows[0].id || !id ? {} : { id }) }];
  }
  const preparedBody = method === 'PATCH' ? body : Array.isArray(body) ? preparedRows : preparedRows[0] ?? body;
  const write: QueuedWrite = {
    id: UUID(), owner, table, method, url: request.url, body: preparedBody,
    headers: requestHeadersForQueue(request), createdAt: Date.now(),
    baseRevision: table === 'tasks' && method === 'PATCH' && previous ? String(previous) : undefined,
    status: 'pending',
  };
  try {
    await putRecord('outbox', write);
    await patchCachedRows(owner, table, method, request.url, preparedBody, preparedBody);
    notifyStatus();
    return responseForQueuedWrite(request, method, responseRows);
  } catch {
    return jsonError('تعذر الوصول إلى قاعدة البيانات المحلية؛ لم يُحفظ التغيير.');
  }
}

async function verifyAlreadyApplied(write: QueuedWrite, authorization: string) {
  const rows = bodyRows(write.body);
  if (!rows.length) return false;
  for (const row of rows) {
    const target = new URL(write.url);
    target.search = '';
    if (row.id) target.searchParams.set('id', `eq.${encodeURIComponent(String(row.id))}`);
    else if (write.table === 'task_assignments' && row.task_id && row.employee_id) {
      target.searchParams.set('task_id', `eq.${encodeURIComponent(String(row.task_id))}`);
      target.searchParams.set('employee_id', `eq.${encodeURIComponent(String(row.employee_id))}`);
    } else if (row.actor_email && write.table === 'studio_preferences') target.searchParams.set('actor_email', `eq.${encodeURIComponent(String(row.actor_email))}`);
    else return false;
    target.searchParams.set('select', write.table === 'task_assignments' ? 'task_id' : 'id');
    target.searchParams.set('limit', '1');
    const response = await globalThis.fetch(target, { headers: { ...write.headers, authorization } }).catch(() => null);
    if (!response?.ok) return false;
    const data = await response.json().catch(() => []);
    if (!Array.isArray(data) || data.length === 0) return false;
  }
  return true;
}

async function markBlocked(write: QueuedWrite, reason: string) {
  await putRecord('outbox', { ...write, status: 'blocked', lastError: reason });
  notifyStatus();
}

async function markPending(write: QueuedWrite, reason: string) {
  await putRecord('outbox', { ...write, status: 'pending', lastError: reason });
  notifyStatus();
}

async function flushQueue(owner: string, authorization: string) {
  if (!authorization || owner === 'anonymous' || ownerOf(new Request('https://offline.invalid', { headers: { authorization } })) !== owner) return;
  const running = flushByOwner.get(owner);
  if (running) return running;
  const task = (async () => {
    const writes = (await readAll<QueuedWrite>('outbox')).filter((item) => item.owner === owner).sort((a, b) => a.createdAt - b.createdAt);
    for (const write of writes) {
      if (write.status === 'blocked') continue;
      if (write.table === 'tasks' && write.method === 'PATCH' && write.baseRevision) {
        const original = new URL(write.url);
        const id = original.searchParams.get('id')?.replace(/^eq\./, '');
        if (id) {
          const check = new URL(original.origin + original.pathname);
          check.searchParams.set('id', `eq.${id}`); check.searchParams.set('select', 'updated_at'); check.searchParams.set('limit', '1');
          const current = await globalThis.fetch(check, { headers: { ...write.headers, authorization } }).catch(() => null);
          if (!current?.ok) { await markPending(write, 'تعذر التحقق من نسخة الطلب الآن؛ ستتم إعادة المحاولة عند عودة الاتصال.'); break; }
          const rows = await current.json().catch(() => []);
          const remoteRevision = Array.isArray(rows) ? rows[0]?.updated_at : undefined;
          const localRevision = bodyRows(write.body)[0]?.updated_at;
          if (remoteRevision && String(remoteRevision) !== write.baseRevision) {
            if (localRevision && String(remoteRevision) === String(localRevision)) { await deleteRecord('outbox', write.id); continue; }
            await markBlocked(write, 'تعارض: عُدّل هذا الطلب على جهاز آخر. لم نكتب فوق النسخة الأحدث.');
            break;
          }
        }
      }
      const headers = new Headers(write.headers);
      headers.set('authorization', authorization);
      const target = new URL(write.url);
      if (write.table === 'task_assignments' && write.method === 'POST') {
        target.searchParams.set('on_conflict', 'task_id,employee_id');
        const prefer = headers.get('prefer') ?? '';
        headers.set('prefer', [prefer, 'resolution=ignore-duplicates'].filter(Boolean).join(','));
      }
      const init: RequestInit = { method: write.method, headers };
      if (write.method !== 'DELETE') { headers.set('content-type', 'application/json'); init.body = JSON.stringify(write.body); }
      const response = await globalThis.fetch(target, init).catch(() => null);
      if (!response) { await markPending(write, 'الاتصال انقطع أثناء المزامنة؛ ستتم إعادة المحاولة عند عودة الشبكة.'); break; }
      if (response.ok) {
        const serverBody = response.status === 204 ? undefined : await response.clone().json().catch(() => undefined);
      if (write.method !== 'DELETE') await patchCachedRows(owner, write.table, write.method, write.url, write.body, serverBody);
        await deleteRecord('outbox', write.id);
        lastSyncAt = Date.now();
        continue;
      }
      if ((response.status === 409 || response.status === 400) && await verifyAlreadyApplied(write, authorization)) {
        await deleteRecord('outbox', write.id);
        continue;
      }
      const detail = await response.text().catch(() => `HTTP ${response.status}`);
      await markBlocked(write, `HTTP ${response.status}: ${detail.slice(0, 300)}`);
      break;
    }
    notifyStatus();
  })().catch(() => undefined).finally(() => flushByOwner.delete(owner));
  flushByOwner.set(owner, task);
  return task;
}

function sessionFromLocalStorage(owner: string) {
  if (typeof localStorage === 'undefined') return '';
  try {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) ?? '';
      if (!key.startsWith('sb-') || !key.endsWith('-auth-token')) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const parsed = JSON.parse(raw) as { access_token?: string; currentSession?: { access_token?: string } };
      const token = parsed.access_token || parsed.currentSession?.access_token || '';
      const payload = token ? jwtPayload(token) : null;
      if (token && payload?.sub === owner && payload.exp && payload.exp * 1000 > Date.now() + 30_000) return `Bearer ${token}`;
    }
  } catch { return ''; }
  return '';
}

async function refreshStatus() {
  let queued = 0; let blocked = 0;
  try {
    const writes = await readAll<QueuedWrite>('outbox');
    queued = writes.length;
    blocked = writes.filter((item) => item.status === 'blocked').length;
  } catch { /* local storage is optional while online */ }
  return { online: typeof navigator === 'undefined' ? true : navigator.onLine, queued, blocked, lastSyncAt } satisfies OfflineSyncStatus;
}

function notifyStatus() {
  if (typeof window === 'undefined') return;
  void refreshStatus().then((status) => window.dispatchEvent(new CustomEvent<OfflineSyncStatus>(STATUS_EVENT, { detail: status })));
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    notifyStatus();
    void readAll<QueuedWrite>('outbox').then((writes) => {
      const owners = [...new Set(writes.map((item) => item.owner))];
      for (const owner of owners) { const authorization = sessionFromLocalStorage(owner); if (authorization) void flushQueue(owner, authorization); }
    });
  });
  window.addEventListener('offline', notifyStatus);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') notifyStatus(); });
}

export async function getOfflineSyncStatus() { return refreshStatus(); }
export async function retryOfflineSync() {
  const writes = await readAll<QueuedWrite>('outbox').catch(() => []);
  const owners = [...new Set(writes.map((item) => item.owner))];
  for (const owner of owners) {
    const authorization = sessionFromLocalStorage(owner);
    if (authorization) await flushQueue(owner, authorization);
  }
  notifyStatus();
}
export function subscribeOfflineSyncStatus(listener: (status: OfflineSyncStatus) => void) {
  if (typeof window === 'undefined') return () => undefined;
  const handler = (event: Event) => listener((event as CustomEvent<OfflineSyncStatus>).detail);
  window.addEventListener(STATUS_EVENT, handler);
  return () => window.removeEventListener(STATUS_EVENT, handler);
}

export async function offlineSupabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (typeof window === 'undefined') return globalThis.fetch(input, init);
  let request: Request;
  try { request = input instanceof Request && !init ? input.clone() : new Request(input, init); }
  catch { return globalThis.fetch(input, init); }
  const url = new URL(request.url);
  const table = tableOf(url);
  if (!table || UNCACHED_TABLES.has(table)) return globalThis.fetch(request);
  const owner = ownerOf(request);
  const method = request.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD') {
    try {
      const response = await globalThis.fetch(request.clone());
      if (response.ok && method === 'GET') {
        await cacheResponse(owner, table, request.url, response).catch(() => undefined);
        notifyStatus();
        const bearer = authorizationOf(request);
        if (bearer && owner !== 'anonymous') void flushQueue(owner, bearer);
      }
      return response;
    } catch {
      const local = await cachedResponse(request, owner, table).catch(() => null);
      if (local) { notifyStatus(); return local; }
      return jsonError('لا يوجد اتصال ولا توجد نسخة محلية سابقة لهذا الاستعلام؛ افتح الصفحة مرة واحدة مع الإنترنت أولاً.');
    }
  }
  const bodyText = await request.clone().text().catch(() => '');
  const parsed = parseBody(bodyText);
  try {
    const response = await globalThis.fetch(request.clone());
    if (response.ok) {
      const responseBody = response.status === 204 ? undefined : await response.clone().json().catch(() => undefined);
      if (method === 'DELETE') await patchCachedRows(owner, table, method, request.url, null).catch(() => undefined);
      else await patchCachedRows(owner, table, method, request.url, parsed, responseBody).catch(() => undefined);
      notifyStatus();
      const bearer = authorizationOf(request);
      if (bearer && owner !== 'anonymous') void flushQueue(owner, bearer);
    }
    return response;
  } catch {
    const result = await queueMutation(request, owner, table, parsed);
    notifyStatus();
    return result;
  }
}
