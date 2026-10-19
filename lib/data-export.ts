import { getSupabaseBrowserClient, formatSupabaseError } from './supabase-browser';
import { open as openTauriDialog } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { EXPORT_TABLES, rowToInsert, type ExportTableName } from './sql-export';
export { EXPORT_TABLES, rowToInsert } from './sql-export';
export type { ExportTableName } from './sql-export';

/**
 * This is deliberately a client-side export. Every SELECT is sent through the
 * normal browser Supabase client, so the user's access token and RLS policies
 * remain in force. No service key, server route, or production write is used.
 */
export const EXPORT_PAGE_SIZE = 250;
export const EXPORT_MAX_ROWS_PER_TABLE = 10_000;
export const LOCAL_SAVING_SETTING_KEY = 'avenmedia-local-saving-enabled';

/** Tables used by the current workspace. Unknown/non-readable tables are
 * reported instead of being guessed or silently skipped. The allowlist keeps
 * the export bounded and avoids exposing auth/storage internals. */

export type ExportTableReport = {
  table: string;
  status: 'exported' | 'unreadable' | 'empty' | 'truncated';
  rows: number;
  error?: string;
};

export type SqlExportResult = {
  sql: string;
  reports: ExportTableReport[];
  generatedAt: string;
  truncated: boolean;
};

function tableComment(report: ExportTableReport) {
  const error = report.error ? `; ${report.error.replace(/[\r\n]+/g, ' ')}` : '';
  return `-- ${report.table}: ${report.status}, ${report.rows} row(s)${error}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read all rows visible to the current user, in bounded pages. A failed table
 * is included in the report and in the SQL comments, while other tables can
 * still be exported.
 */
export async function buildSqlExport(
  tables: readonly string[] = EXPORT_TABLES,
  options: { pageSize?: number; maxRowsPerTable?: number } = {},
): Promise<SqlExportResult> {
  const pageSize = Math.max(1, Math.min(options.pageSize ?? EXPORT_PAGE_SIZE, EXPORT_PAGE_SIZE));
  const maxRows = Math.max(1, Math.min(options.maxRowsPerTable ?? EXPORT_MAX_ROWS_PER_TABLE, EXPORT_MAX_ROWS_PER_TABLE));
  const generatedAt = new Date().toISOString();
  const reports: ExportTableReport[] = [];
  const statements: string[] = [];

  for (const table of tables.filter((candidate) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate))) {
    reports.push({ table, status: 'unreadable', rows: 0, error: 'اسم جدول غير مسموح به' });
  }
  const safeTables = tables.filter((candidate) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(candidate));

  let authenticated = true;
  try {
    const { data, error } = await getSupabaseBrowserClient().auth.getUser();
    if (error || !data.user) {
      authenticated = false;
      const message = formatSupabaseError(error) || 'لا توجد جلسة Supabase فعّالة';
      for (const table of safeTables) reports.push({ table, status: 'unreadable', rows: 0, error: message });
    }
  } catch (error) {
    authenticated = false;
    const message = formatSupabaseError(error) || 'تعذر التحقق من جلسة Supabase';
    for (const table of safeTables) reports.push({ table, status: 'unreadable', rows: 0, error: message });
  }

  if (authenticated) {
    const db = getSupabaseBrowserClient();
    for (const table of safeTables) {
      const rows: Record<string, unknown>[] = [];
      let offset = 0;
      let fetched = 0;
      let failure = '';
      let wasTruncated = false;

      // Read one extra row at the cap so an exactly-full table is not falsely
      // labelled as truncated.
      while (fetched <= maxRows) {
        const requested = Math.min(pageSize, maxRows + 1 - fetched);
        try {
          // .range() is server-side pagination. The browser client adds the
          // user's bearer token; Supabase/RLS decides which rows are visible.
          const result = await db.from(table).select('*').range(offset, offset + requested - 1);
          if (result.error) {
            failure = formatSupabaseError(result.error) || 'تعذر قراءة الجدول عبر RLS';
            break;
          }
          const page = Array.isArray(result.data) ? result.data.filter(isRecord) : [];
          rows.push(...page.slice(0, Math.max(0, maxRows - rows.length)));
          fetched += page.length;
          offset += page.length;
          if (page.length < requested) break;
          if (fetched > maxRows) {
            wasTruncated = true;
            break;
          }
        } catch (error) {
          failure = formatSupabaseError(error) || 'تعذر قراءة الجدول عبر RLS';
          break;
        }
      }

      if (failure) {
        reports.push({ table, status: 'unreadable', rows: 0, error: failure });
        continue;
      }
      const report: ExportTableReport = {
        table,
        status: wasTruncated ? 'truncated' : rows.length ? 'exported' : 'empty',
        rows: rows.length,
        ...(wasTruncated ? { error: `تم تطبيق الحد الآمن ${maxRows.toLocaleString('en-US')} صف` } : {}),
      };
      reports.push(report);
      statements.push(tableComment(report));
      for (const row of rows) {
        const statement = rowToInsert(table, row);
        if (statement) statements.push(statement);
      }
    }
  }

  const unreadable = reports.filter((report) => report.status === 'unreadable');
  const truncated = reports.some((report) => report.status === 'truncated');
  const header = [
    '-- Avenmedia client-visible data export',
    `-- Generated at: ${generatedAt}`,
    '-- Source: Supabase browser client; rows are limited by the current user session and RLS.',
    '-- This file is a download only. It does not execute SQL or change production data.',
    unreadable.length ? `-- WARNING: ${unreadable.length} table(s) could not be read; see the report below.` : '-- All requested tables were queried.',
    '',
    'BEGIN;',
    '',
  ];
  const footer = [
    '',
    '-- End of export. Review table permissions before importing this file.',
    'COMMIT;',
  ];

  return { sql: [...header, ...statements, ...footer].join('\n') + '\n', reports, generatedAt, truncated };
}

export function downloadSqlFile(sql: string, filename = `avenmedia-export-${new Date().toISOString().slice(0, 10)}.sql`) {
  if (typeof document === 'undefined') throw new Error('التنزيل متاح من الواجهة فقط');
  const blob = new Blob([sql], { type: 'application/sql;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

type DirectoryPermission = 'granted' | 'denied' | 'prompt';
type StorageDirectoryHandle = {
  kind: 'directory';
  name: string;
  queryPermission?: (options?: { mode?: 'readwrite' }) => Promise<DirectoryPermission>;
  requestPermission?: (options?: { mode?: 'readwrite' }) => Promise<DirectoryPermission>;
  getFileHandle: (name: string, options?: { create?: boolean }) => Promise<{ createWritable: () => Promise<{ write: (data: string) => Promise<void>; close: () => Promise<void> }> }>;
};
type TauriStorageDirectory = { kind: 'tauri-path'; name: string; path: string };
type StoredStorageDirectory = StorageDirectoryHandle | TauriStorageDirectory;

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: { mode?: 'readwrite' }) => Promise<StorageDirectoryHandle>;
  __TAURI__?: unknown;
  __TAURI_INTERNALS__?: unknown;
};

type StorageDirectorySupport = {
  available: boolean;
  runtime: 'tauri' | 'browser';
  message: string;
};

const SETTINGS_DB = 'avenmedia-storage-settings-v1';
const SETTINGS_STORE = 'settings';
const DIRECTORY_KEY = 'storage-directory';
let settingsDbPromise: Promise<IDBDatabase> | null = null;

function getSettingsDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB غير متاح'));
  if (settingsDbPromise) return settingsDbPromise;
  settingsDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(SETTINGS_DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(SETTINGS_STORE)) request.result.createObjectStore(SETTINGS_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('تعذر فتح إعدادات التخزين'));
  });
  return settingsDbPromise;
}

async function settingsValue<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await getSettingsDb();
  return new Promise<T>((resolve, reject) => {
    const request = action(db.transaction(SETTINGS_STORE, mode).objectStore(SETTINGS_STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('تعذر حفظ إعداد التخزين'));
  });
}

export function localSavingEnabled() {
  if (typeof window === 'undefined') return true;
  return window.localStorage.getItem(LOCAL_SAVING_SETTING_KEY) !== 'false';
}

export function setLocalSavingEnabled(enabled: boolean) {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(LOCAL_SAVING_SETTING_KEY, String(enabled));
    window.dispatchEvent(new CustomEvent('avenmedia-local-saving-changed', { detail: enabled }));
  }
}

export function storageDirectorySupport(): StorageDirectorySupport {
  if (typeof window === 'undefined') return { available: false, runtime: 'browser', message: 'لا تتاح واجهة اختيار المجلد أثناء العرض على الخادم.' };
  const current = window as DirectoryPickerWindow;
  const runtime = current.__TAURI_INTERNALS__ || current.__TAURI__ ? 'tauri' : 'browser';
  if (runtime === 'tauri') {
    return { available: true, runtime, message: 'يستخدم تطبيق Tauri محدد المجلدات الأصلي عبر tauri-plugin-dialog.' };
  }
  if (typeof current.showDirectoryPicker === 'function') {
    return { available: true, runtime, message: 'يستخدم المتصفح منتقي المجلدات File System Access القياسي.' };
  }
  return {
    available: false,
    runtime,
    message: 'هذا المتصفح لا يدعم File System Access. سيبقى IndexedDB تحت إدارة المتصفح، ويمكن تنزيل SQL إلى مجلد التنزيلات.',
  };
}

export async function chooseStorageDirectory() {
  const support = storageDirectorySupport();
  if (!support.available || typeof window === 'undefined') throw new Error(support.message);
  if (support.runtime === 'tauri') {
    const selected = await openTauriDialog({ directory: true, multiple: false, title: 'اختر مجلد التخزين والتصدير' });
    if (typeof selected !== 'string' || !selected) throw new DOMException('لم يتم اختيار مجلد', 'AbortError');
    const name = selected.split(/[\\/]/).filter(Boolean).at(-1) ?? selected;
    const stored: TauriStorageDirectory = { kind: 'tauri-path', name, path: selected };
    await settingsValue('readwrite', (store) => store.put(stored, DIRECTORY_KEY));
    return stored;
  }
  const handle = await (window as DirectoryPickerWindow).showDirectoryPicker!({ mode: 'readwrite' });
  await settingsValue('readwrite', (store) => store.put(handle, DIRECTORY_KEY));
  return handle;
}

export async function getStoredStorageDirectory(): Promise<StoredStorageDirectory | null> {
  try {
    return (await settingsValue<StoredStorageDirectory | undefined>('readonly', (store) => store.get(DIRECTORY_KEY))) ?? null;
  } catch {
    return null;
  }
}

export async function writeSqlToStorageDirectory(sql: string, filename = `avenmedia-export-${new Date().toISOString().slice(0, 10)}.sql`) {
  const handle = await getStoredStorageDirectory();
  if (!handle) return { written: false, reason: 'لم يتم اختيار مجلد تخزين' };
  if (handle.kind === 'tauri-path') {
    const path = await invoke<string>('write_export_to_directory', { directory: handle.path, fileName: filename, contents: sql });
    return { written: true, reason: `تم حفظ نسخة في المجلد المختار (${path})` };
  }
  let permission: DirectoryPermission = 'granted';
  if (handle.queryPermission) permission = await handle.queryPermission({ mode: 'readwrite' });
  if (permission !== 'granted' && handle.requestPermission) permission = await handle.requestPermission({ mode: 'readwrite' });
  if (permission !== 'granted') return { written: false, reason: 'لم تُمنح صلاحية الكتابة للمجلد المختار' };
  const file = await handle.getFileHandle(filename, { create: true });
  const writable = await file.createWritable();
  await writable.write(sql);
  await writable.close();
  return { written: true, reason: `تم حفظ نسخة في مجلد ${handle.name}` };
}
