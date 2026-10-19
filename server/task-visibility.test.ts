import { describe, expect, it } from 'vitest';
import { buildTaskAssignments } from '../lib/avenmedia-task-assignments';
import { DEFAULT_VISIBLE_TASK_FIELDS, normalizeVisibleTaskFields } from '../lib/task-visibility';

describe('per-assignee task visibility', () => {
  it('hides phone and financial data by default while showing task essentials', () => {
    expect(DEFAULT_VISIBLE_TASK_FIELDS).toEqual(['client_name', 'description', 'requirements', 'due_at', 'attachments']);
    expect(DEFAULT_VISIBLE_TASK_FIELDS).not.toContain('client_phone');
    expect(DEFAULT_VISIBLE_TASK_FIELDS).not.toContain('finance');
  });

  it('normalizes fields to supported unique keys', () => {
    expect(normalizeVisibleTaskFields(['client_phone', 'client_phone', 'finance', 'unknown', null])).toEqual(['client_phone', 'finance']);
    expect(normalizeVisibleTaskFields(null)).toEqual(DEFAULT_VISIBLE_TASK_FIELDS);
  });

  it('preserves existing per-employee rules and defaults newly assigned employees', () => {
    const rows = buildTaskAssignments('task-1', ['employee-a', 'employee-b'], {}, [
      { employee_id: 'employee-a', visible_fields: ['client_phone', 'attachments'] },
    ]);
    expect(rows).toEqual([
      { task_id: 'task-1', employee_id: 'employee-a', visible_fields: ['client_phone', 'attachments'] },
      { task_id: 'task-1', employee_id: 'employee-b', visible_fields: DEFAULT_VISIBLE_TASK_FIELDS },
    ]);
  });

  it('honors an explicit empty field list to hide all optional task details', () => {
    expect(buildTaskAssignments('task-2', ['employee-a'], { 'employee-a': [] })).toEqual([
      { task_id: 'task-2', employee_id: 'employee-a', visible_fields: [] },
    ]);
  });
});
