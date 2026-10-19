import { describe, expect, it } from 'vitest';
import { EXPORT_TABLES, rowToInsert } from '../lib/sql-export';

describe('SQL data export', () => {
  it('preserves JSON, arrays, URLs and escaped apostrophes through jsonb record casting', () => {
    const statement = rowToInsert('tasks', {
      id: 'task-1',
      client_name: "O'Connor",
      attachments: ['https://cdn.example.test/portrait.jpg', 'https://cdn.example.test/clip.mp4'],
      metadata: { asset_url: 'https://cdn.example.test/?folder=a&v=1' },
    });
    expect(statement).toContain('INSERT INTO "public"."tasks" OVERRIDING SYSTEM VALUE');
    expect(statement).toContain('jsonb_populate_record(NULL::"public"."tasks"');
    expect(statement).toContain("O''Connor");
    expect(statement).toContain('https://cdn.example.test/portrait.jpg');
    expect(statement).toContain('"metadata":{"asset_url":"https://cdn.example.test/?folder=a&v=1"}');
  });

  it('rejects unsafe table names and exports upload-link metadata and conversations', () => {
    expect(rowToInsert('tasks; DROP TABLE profiles', { id: 'task-1' })).toBe('');
    expect(EXPORT_TABLES).toContain('task_upload_links');
    expect(EXPORT_TABLES).toContain('conversation_messages');
    expect(EXPORT_TABLES).toContain('client_uploads');
  });
});
