export const EXPORT_TABLES = [
  'profiles',
  'workspace_records',
  'avenmedia_accounts',
  'tasks',
  'conversations',
  'portfolio_pages',
  'task_upload_links',
  'task_assignments',
  'client_uploads',
  'upload_activity',
  'financial_entries',
  'avenmedia_transactions',
  'equipment_requests',
  'attendance_logs',
  'task_notifications',
  'studio_preferences',
  'studio_actions',
  'portfolio_members',
  'portfolio_elements',
  'portfolio_revisions',
  'conversation_members',
  'conversation_messages',
  'media_shares',
] as const;

export type ExportTableName = (typeof EXPORT_TABLES)[number];

function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

function quoteString(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

export function rowToInsert(table: string, row: Record<string, unknown>) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || !Object.keys(row).length) return '';
  // Let PostgreSQL cast each JSON field to the target column's actual type,
  // preserving JSON objects, arrays, URLs and non-ASCII strings.
  const relation = `"public".${quoteIdentifier(table)}`;
  const record = JSON.stringify(row);
  if (record === undefined) return '';
  return `INSERT INTO ${relation} OVERRIDING SYSTEM VALUE SELECT * FROM jsonb_populate_record(NULL::${relation}, ${quoteString(record)}::jsonb);`;
}
