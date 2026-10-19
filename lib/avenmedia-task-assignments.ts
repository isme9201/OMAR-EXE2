import { DEFAULT_VISIBLE_TASK_FIELDS, normalizeVisibleTaskFields } from "./task-visibility";

type TaskAssignment = { employee_id: string; visible_fields?: unknown };

export function buildTaskAssignments(taskId: string, employeeIds: string[], requestedPermissions: Record<string, unknown> = {}, previous: TaskAssignment[] = []) {
  const previousFields = new Map(previous.map((row) => [row.employee_id, row.visible_fields]));
  return [...new Set(employeeIds)].map((employee_id) => ({
    task_id: taskId,
    employee_id,
    visible_fields: normalizeVisibleTaskFields(requestedPermissions[employee_id] ?? previousFields.get(employee_id) ?? DEFAULT_VISIBLE_TASK_FIELDS),
  }));
}
