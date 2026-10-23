import { describe, expect, it } from 'vitest';
import {
  createAvenmediaPdfBytes,
  makeEmployeeSchedulePdf,
  makeFinanceLedgerPdf,
  makeMonthlyReportPdf,
  makeTaskPdf,
  overduePdf,
} from '../lib/avenmedia-pdf';
import type { AvenmediaTask } from '../lib/avenmedia';

const isPdf = (bytes: Uint8Array) => new TextDecoder().decode(bytes.subarray(0, 8)).startsWith('%PDF-');

describe('Avenmedia centralized Arabic PDF generator', () => {
  it('creates a PDF with joined Arabic, mixed Latin text, dates and currency', async () => {
    const bytes = await createAvenmediaPdfBytes('كشف الحساب الشهري', [
      { text: 'كشف حساب العميل — أحمد / Avenmedia', bold: true },
      { text: 'تاريخ الطباعة: 24/10/2026 | المبلغ: $1,234.50' },
    ]);
    expect(isPdf(bytes)).toBe(true);
    expect(bytes.length).toBeGreaterThan(8_000);
  });

  it('creates all operational and financial templates through the shared engine', async () => {
    const task: AvenmediaTask = {
      id: 'task-1', title: 'تصميم الهوية البصرية', task_type: 'design', client_name: 'شركة النور',
      client_phone: '+964 770 123 4567', description: 'تصميم شعار وهوية عربية كاملة', status: 'in_progress', priority: 'normal',
      due_at: '2026-10-30T12:00:00.000Z', created_at: '2026-10-24T00:00:00.000Z',
    };
    const outputs: Uint8Array[] = [];
    outputs.push(await makeEmployeeSchedulePdf('علي أحمد', [{ ...task, id: task.id }]));
    outputs.push(await overduePdf([{ id: task.id, title: task.title, client_name: task.client_name!, estimated_cost: 1200, due_at: task.due_at!, status: task.status, overdue_days: 3, assignees: 'علي أحمد' }]));
    outputs.push(await makeFinanceLedgerPdf('2026-10', { income: 1234.5, expense: 200 }, [{ entry_type: 'income', amount: 1234.5, description: 'دفعة الزبون — متجر النور', entry_date: '2026-10-24' }]));
    outputs.push(await makeMonthlyReportPdf('2026-10', { income: 1234.5, expenses: 200, net: 1034.5, tasks: 12, completed: 8, open: 4, attendance: 22 }));
    outputs.push(await makeTaskPdf([task], 'علي أحمد'));

    expect(outputs).toHaveLength(5);
    for (const bytes of outputs) {
      expect(isPdf(bytes)).toBe(true);
      expect(bytes.length).toBeGreaterThan(8_000);
    }
  });
});
