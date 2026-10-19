"use client";

import { useEffect, useState } from "react";
import { Bell, FileText, Pencil, RotateCcw, X } from "lucide-react";
import { getAuthClient } from "@/lib/avenmedia-auth";
import { listNotifications, markNotificationRead, updateTaskStatus } from "@/lib/avenmedia-overdue";
import { listRequests, saveRequest, type RequestRow } from "@/lib/avenmedia-requests";
import type { TaskVisibilityField } from "@/lib/task-visibility";

type EditForm = { title: string; client_name: string; client_phone: string; description: string; status: string; due_at: string };
const formFrom = (task: RequestRow): EditForm => ({
  title: task.title || "",
  client_name: task.client_name || "",
  client_phone: task.client_phone || "",
  description: task.description || "",
  status: task.status || "new",
  due_at: task.due_at ? task.due_at.slice(0, 16) : "",
});

export function EmployeeTasks() {
  const [tasks, setTasks] = useState<RequestRow[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<RequestRow | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [isManager, setIsManager] = useState(false);

  const refresh = async () => {
    const db = getAuthClient() as any;
    const user = (await db.auth.getUser()).data.user;
    if (!user) {
      setMessage("سجل الدخول لعرض مهامك وإشعاراتك.");
      return;
    }
    const profile = (await db.from("profiles").select("role").eq("id", user.id).maybeSingle()).data;
    const manager = ["admin", "manager"].includes(String(profile?.role ?? "").toLowerCase());
    setIsManager(manager);
    const result = await listRequests();
    setTasks(manager ? result.data : result.data.filter((task) => task.assignments?.some((assignment) => assignment.employee_id === user.id)));
    const notifications = await listNotifications();
    setNotes(notifications.data);
    if (result.error || notifications.error) setMessage(result.error || notifications.error);
  };

  useEffect(() => { void refresh(); }, []);

  const status = async (id: string, value: string) => {
    const result = await updateTaskStatus(id, value);
    if (result.error) setMessage(result.error);
    else {
      setMessage(value === "completed" ? "تم إنجاز المهمة وأرشفتها" : "تم تحديث حالة المهمة");
      await refresh();
    }
  };

  const canSee = (task: RequestRow, field: TaskVisibilityField) => isManager || task.visible_fields?.includes(field) === true;
  const openEdit = (task: RequestRow) => {
    if (!isManager) return;
    setEditing(task);
    setForm(formFrom(task));
  };
  const saveEdit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!isManager || !editing || !form?.client_name.trim()) return;
    setBusy(true);
    const result = await saveRequest({
      ...editing,
      ...form,
      due_at: form.due_at ? new Date(form.due_at).toISOString() : null,
      employeeIds: editing.assignments?.map((assignment) => assignment.employee_id) || [],
    }, editing.id);
    if (result.error) setMessage(result.error);
    else {
      setMessage("تم تعديل المهمة");
      setEditing(null);
      setForm(null);
      await refresh();
    }
    setBusy(false);
  };

  const active = tasks.filter((task) => !["completed", "done"].includes(task.status));
  const archived = tasks.filter((task) => ["completed", "done"].includes(task.status));

  return <main dir="rtl" className="space-y-6">
    <header>
      <span className="font-mono text-xs tracking-widest text-indigo-600">AVENMEDIA / MY WORK</span>
      <h2 className="mt-2 text-4xl font-black">مهامي وإشعاراتي</h2>
      <p className="mt-2 text-sm text-slate-500">الموظف يميناً، ثم المهمة ورقم الزبون وخانة الإنجاز في كل صف.</p>
    </header>
    {message && <p role="status" className="rounded-xl bg-indigo-50 p-4 text-sm font-bold text-indigo-700">{message}</p>}

    <section className="rounded-3xl border border-indigo-100 bg-white p-5">
      <h3 className="mb-4 flex items-center gap-2 text-xl font-black"><Bell className="h-5 text-indigo-600" />الإشعارات</h3>
      <div className="grid gap-2">
        {notes.filter((note) => !note.read_at).map((note) => <button key={note.id} onClick={() => void markNotificationRead(note.id).then(refresh)} className="rounded-xl bg-indigo-50 p-3 text-right text-sm font-bold text-indigo-900">
          {note.title}<small className="mt-1 block font-normal">{note.body}</small>
        </button>)}
        {!notes.some((note) => !note.read_at) && <p className="text-sm text-slate-500">لا توجد إشعارات جديدة.</p>}
      </div>
    </section>

    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white">
      <div className="task-table-head hidden grid-cols-[minmax(130px,.7fr)_minmax(180px,1.4fr)_minmax(120px,.8fr)_120px] gap-4 border-b border-slate-200 bg-slate-50 px-5 py-3 text-xs font-black text-slate-600 md:grid">
        <span>الموظف</span><span>المهمة</span><span>رقم الزبون</span><span>الإنجاز</span>
      </div>
      <div className="grid gap-2 p-3">
        {active.map((task) => <article key={task.id} className="task-row grid gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-4 md:grid-cols-[minmax(130px,.7fr)_minmax(180px,1.4fr)_minmax(120px,.8fr)_120px] md:items-center md:gap-4">
          <div className="flex items-center gap-2 font-bold">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-indigo-100 text-indigo-700">{(task.assignments?.[0]?.profile?.name || "م").slice(0, 1)}</span>
            <span>{task.assignments?.map((assignment) => assignment.profile?.name || "موظف").join("، ") || "غير مسند"}</span>
          </div>
          <div>
            <h3 className="font-black">{task.title || "مهمة"}</h3>
            <p className="mt-1 text-sm text-slate-600">{canSee(task, "description") ? task.description || "لا توجد تفاصيل" : "تفاصيل هذه المهمة مخفية من الإدارة"}</p>
            {canSee(task, "requirements") && task.requirements && <p className="mt-1 text-xs text-slate-500">المتطلبات: {task.requirements}</p>}
            {canSee(task, "attachments") && task.attachments?.length ? <div className="mt-2 flex flex-wrap gap-2">{task.attachments.map((attachment) => attachment.secure_url && <a key={attachment.id} href={attachment.secure_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-bold text-indigo-700"><FileText className="h-3" />{attachment.file_name || "عرض المرفق"}</a>)}</div> : null}
            {canSee(task, "due_at") && task.due_at && <p className="mt-1 text-xs text-slate-500">التسليم: {new Date(task.due_at).toLocaleString("ar-IQ")}</p>}
            {isManager && <button onClick={() => openEdit(task)} className="mt-2 inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 py-1 text-xs font-bold text-indigo-700"><Pencil className="h-3" />تعديل المهمة</button>}
          </div>
          <div className="text-sm font-bold text-indigo-700">
            <span className="md:hidden text-xs text-slate-500">رقم الزبون: </span>{canSee(task, "client_phone") ? task.client_phone || "غير مسجل" : "محجوب من الإدارة"}
            <small className="mt-1 block font-normal text-slate-500">{canSee(task, "client_name") ? task.client_name || "بدون زبون" : "اسم العميل محجوب"}</small>
          </div>
          <div className="flex flex-wrap gap-2 md:grid">
            <button onClick={() => void status(task.id, "in_progress")} className="rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white">قيد التنفيذ</button>
            <button onClick={() => void status(task.id, "design")} className="rounded-xl bg-violet-600 px-3 py-2 text-xs font-bold text-white">تصميم</button>
            <button type="button" aria-label={`إنجاز ${task.title}`} onClick={() => void status(task.id, "completed")} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-600 bg-white px-3 py-2 text-xs font-bold text-emerald-700"><span aria-hidden="true" className="h-5 w-5 rounded border-2 border-emerald-600 bg-white" />إنجاز</button>
          </div>
        </article>)}
        {!active.length && <p className="p-10 text-center text-sm text-slate-500">لا توجد مهام حالية.</p>}
      </div>
    </section>

    <section className="rounded-3xl border border-slate-200 bg-white p-5">
      <h3 className="mb-4 text-xl font-black">المهام المؤرشفة</h3>
      <div className="grid gap-2">
        {archived.map((task) => <div key={task.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
          <span className="text-sm font-bold">{task.title} — {canSee(task, "client_name") ? task.client_name || "بدون زبون" : "اسم العميل محجوب"}</span>
          <button onClick={() => void status(task.id, "in_progress")} className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-2 text-xs font-bold"><RotateCcw className="h-3" />إرجاع للحالية</button>
        </div>)}
        {!archived.length && <p className="py-3 text-center text-sm text-slate-500">لا توجد مهام مؤرشفة.</p>}
      </div>
    </section>

    {isManager && editing && form && <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="edit-task-title">
      <form onSubmit={saveEdit} className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between"><h3 id="edit-task-title" className="text-xl font-black">تعديل المهمة</h3><button type="button" onClick={() => { setEditing(null); setForm(null); }} aria-label="إغلاق"><X /></button></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-bold">عنوان المهمة<input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} className="h-11 rounded-xl border px-3" /></label>
          <label className="grid gap-2 text-sm font-bold">اسم الزبون<input required value={form.client_name} onChange={(event) => setForm({ ...form, client_name: event.target.value })} className="h-11 rounded-xl border px-3" /></label>
          <label className="grid gap-2 text-sm font-bold">رقم الزبون<input value={form.client_phone} onChange={(event) => setForm({ ...form, client_phone: event.target.value })} className="h-11 rounded-xl border px-3" /></label>
          <label className="grid gap-2 text-sm font-bold">الحالة<select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })} className="h-11 rounded-xl border px-3"><option value="new">جديدة</option><option value="in_progress">قيد التنفيذ</option><option value="design">تصميم</option><option value="completed">منجزة</option></select></label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-2">موعد التسليم<input type="datetime-local" value={form.due_at} onChange={(event) => setForm({ ...form, due_at: event.target.value })} className="h-11 rounded-xl border px-3" /></label>
          <label className="grid gap-2 text-sm font-bold sm:col-span-2">التفاصيل<textarea rows={4} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} className="rounded-xl border p-3" /></label>
        </div>
        <div className="mt-5 flex justify-end gap-2"><button type="button" onClick={() => { setEditing(null); setForm(null); }} className="rounded-xl border px-4 py-2 font-bold">إلغاء</button><button disabled={busy} className="rounded-xl bg-indigo-700 px-5 py-2 font-bold text-white">{busy ? "جار الحفظ…" : "حفظ التعديل"}</button></div>
      </form>
    </div>}
  </main>;
}
