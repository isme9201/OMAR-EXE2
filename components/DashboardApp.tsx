/* Editorial Atelier design reminder: every route is a working production sheet with visible next actions, Arabic RTL hierarchy, and archive-inspired details. */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Archive, ArrowLeft, BadgeCheck, Bell, CalendarDays, Camera, Check, ChevronDown, CircleDollarSign, Palette,
  ClipboardList, Clock3, Command, Download, FileImage, FilePlus2, FolderOpen, Gauge, Grid2X2,
  ImagePlus, Inbox, Landmark, Link2, ListFilter, LockKeyhole, MessageCircleMore, MoreHorizontal,
  PackageCheck, Plus, ReceiptText, Search, Send, Settings2, ShieldCheck, SlidersHorizontal, Sparkles,
  SunMoon, UploadCloud, UsersRound, Video, WalletCards, Wrench, X, Zap, ChevronUp, Share2
} from "lucide-react";
import type { WorkspacePage } from "@/lib/workspaces";
import { createWorkspaceRecord, getStudioThemePreference, loadWorkspaceRecords, recordStudioAction, saveStudioThemePreference, updateWorkspaceRecord, type WorkspaceRecord } from "@/lib/supabase-browser";
import { invokeAvenmediaFunction } from "@/lib/avenmedia";
import { AvenmediaOperations } from "@/components/AvenmediaOperations";
import { AvenmediaReports } from "@/components/AvenmediaReports";
import { RequestManagement } from "@/components/RequestManagement";
import { RequestCreateModal } from "@/components/RequestCreateModal";
import { EmployeeTasks } from "@/components/EmployeeTasks";
import { RequestSearchCard } from "@/components/RequestSearchCard";
import { NotificationBell } from "@/components/NotificationBell";
import { FinanceLedger } from "@/components/FinanceLedger";
import { EquipmentNotes } from "@/components/EquipmentNotes";
import { AvenmediaCollaborationCenter } from "@/components/AvenmediaCollaborationCenter";
import { UploadRoom } from "@/components/UploadRoom";

type Task = { id: number; recordId?: string; client: string; title: string; stage: string; due: string; owner: string; progress: number; tone: string };
type ModalKind = "booking" | "magic" | "invoice" | "upload" | null;
type UploadLink = { id: string; token: string; task_id?: string | null; client_name?: string | null; expires_at: string; revoked_at?: string | null; created_at: string };

const navItems: { page: WorkspacePage; label: string; icon: LucideIcon; tag?: string }[] = [
  { page: "overview", label: "نظرة الاستوديو", icon: Grid2X2 },
  { page: "calendar", label: "إدارة الطلبات", icon: ClipboardList },
  { page: "production", label: "غرفة الإنتاج", icon: Video },
  { page: "finance", label: "المالية", icon: WalletCards },
  { page: "reports", label: "كشف الحساب", icon: ReceiptText },
  { page: "equipment", label: "المعدات", icon: Camera },
  { page: "team", label: "الفريق والمحادثات", icon: MessageCircleMore, tag: "CHAT" },
  { page: "uploads", label: "غرفة الرفع", icon: UploadCloud },
  { page: "operations", label: "عمليات Avenmedia", icon: ClipboardList, tag: "NEW" },
];

const portfolioNavItem = { label: "محرر المحفظة", icon: Palette };


const pageMeta: Record<WorkspacePage, { eyebrow: string; title: string; description: string }> = {
  overview: { eyebrow: "مكتب الإنتاج", title: "اليوم في الاستوديو", description: "لقطة واضحة للحجوزات، الملفات الجديدة، والقرارات التي تحتاجك الآن." },
  calendar: { eyebrow: "العمليات", title: "إدارة الطلبات", description: "إضافة، بحث، تعديل، حذف، توزيع المنفذين، وطباعة جدول العمل." },
  clients: { eyebrow: "العمليات", title: "إدارة الطلبات", description: "إدارة كاملة لطلبات الزبائن ومواعيد التسليم." },
  production: { eyebrow: "سير العمل", title: "غرفة الإنتاج", description: "كل مشروع في مرحلته الصحيحة، مع ملكية واضحة وموعد تسليم مرئي." },
  finance: { eyebrow: "الدفتر", title: "المالية والمطالبات", description: "صورة تشغيلية للمبالغ، الفواتير، والتحصيل قبل أن تصبح متأخرة." },
  reports: { eyebrow: "التقارير", title: "كشف الحساب الشهري", description: "المهام المنجزة وغير المنجزة، الحضور، الإيرادات، المصاريف، والصافي مع طباعة PDF." },
  equipment: { eyebrow: "الأصول", title: "المعدات والمخزون", description: "اعرف ما هو متاح، وما هو في الميدان، وما يحتاج عناية قبل الجلسة المقبلة." },
  team: { eyebrow: "الفريق", title: "الفريق والمحادثات", description: "رسائل، حضور، وإعلانات تحافظ على إيقاع الفريق داخل يوم الإنتاج." },
  uploads: { eyebrow: "التسليم", title: "غرفة رفع العميل", description: "روابط آمنة، وصول فوري، وسجل واضح لكل ملف دخل إلى المشروع." },
  operations: { eyebrow: "Avenmedia", title: "مركز إدارة الفريق والمهام", description: "موظفون، مهام، ملفات، وروابط رفع مرتبطة مباشرة بـ قاعدة البيانات والتخزين." },
  settings: { eyebrow: "الإدارة", title: "إعدادات الاستوديو", description: "الأذونات، الأمان، التكاملات، وشكل مساحة العمل." },
};

const initialTasks: Task[] = [];

function RuleLabel({ children }: { children: React.ReactNode }) {
  return <div className="inline-flex items-center gap-2 font-mono text-[10px] font-medium tracking-[.16em] text-[#66736c]"><span className="mark-grid text-[#142c9b]" aria-hidden="true"><i /><i /><i /><i /></span>{children}</div>;
}

function IconButton({ label, children, onClick }: { label: string; children: React.ReactNode; onClick?: () => void }) {
  return <button aria-label={label} onClick={onClick} className="grid h-10 w-10 place-items-center rounded-full border border-[#cbd4f5] bg-[#ffffff] text-[#17255f] transition hover:-translate-y-0.5 hover:border-[#142c9b] hover:text-[#142c9b] active:scale-[.97]">{children}</button>;
}

export function DashboardApp({ page }: { page: WorkspacePage }) {
  const [dark, setDark] = useState(() => typeof window !== "undefined" && window.localStorage.getItem("photomedia-theme") === "dark");
  const [showNotifications, setShowNotifications] = useState(false);
  const [modal, setModal] = useState<ModalKind>(null);
  const [notice, setNotice] = useState("مزامنة حيّة · آخر تحديث الآن");
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<string[]>([]);
  const [records, setRecords] = useState<WorkspaceRecord[]>([]);
  const [clientQuery, setClientQuery] = useState("");
  const [dataLoading, setDataLoading] = useState(true);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [linkDialog, setLinkDialog] = useState<{ url: string; expiresAt: string } | null>(null);
  const [linkHistory, setLinkHistory] = useState<UploadLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(false);

  useEffect(() => { let cancelled = false; void getStudioThemePreference().then((theme) => { if (!cancelled && theme) { setDark(theme === "dark"); window.localStorage.setItem("photomedia-theme", theme); } }); return () => { cancelled = true; }; }, []);
  useEffect(() => { let cancelled = false; void loadWorkspaceRecords().then(({ data, error }) => { if (cancelled) return; setRecords(data); setTasks(data.filter((record) => record.record_type === "task").map((record, index) => ({ recordId: record.id, id: index + 1, client: String((record.payload ?? {}).client ?? "بدون عميل"), title: String((record.payload ?? {}).title ?? "مهمة جديدة"), stage: String((record.payload ?? {}).stage ?? "جديدة"), due: String((record.payload ?? {}).due ?? "غير محدد"), owner: String((record.payload ?? {}).owner ?? "غير مسند"), progress: Number((record.payload ?? {}).progress ?? 0), tone: String((record.payload ?? {}).tone ?? "bg-[#e6ebff] text-[#142c9b]") }))); setMessages(data.filter((record) => record.record_type === "message").map((record) => String((record.payload ?? {}).message ?? "" )).filter(Boolean)); setDataLoading(false); if (error === "unauthenticated") setNotice("سجل دخولك لعرض بيانات الاستوديو من قاعدة البيانات"); else if (error && error !== "supabase-unavailable") setNotice(`تعذر تحميل بيانات قاعدة البيانات: ${error}`); else if (!data.length) setNotice("لا توجد سجلات بعد — ابدأ بإضافة أول حجز أو مهمة"); }); return () => { cancelled = true; }; }, []);
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 520);
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.querySelector<HTMLInputElement>("[data-global-search]")?.focus();
      }
      if (event.key === "Escape") document.querySelector<HTMLInputElement>("[data-global-search]")?.blur();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("scroll", onScroll); window.removeEventListener("keydown", onKeyDown); };
  }, []);
  const updateTheme = (value: boolean) => { setDark(value); window.localStorage.setItem("photomedia-theme", value ? "dark" : "light"); void saveStudioThemePreference(value ? "dark" : "light"); void recordStudioAction("studio.theme.update", "تحديث مظهر الاستوديو", { theme: value ? "dark" : "light" }); };

  const meta = pageMeta[page] ?? pageMeta.overview;
  const safePage = pageMeta[page] ? page : "overview";
  const appTheme = dark ? "bg-[#192320] text-[#f7f9ff]" : "bg-[#f7f9ff] text-[#080d24]";

  function advanceTask(id: number) {
    const currentTask = tasks.find((task) => task.id === id);
    if (!currentTask) return;
    const nextPayload = { client: currentTask.client, title: currentTask.title, stage: currentTask.progress >= 88 ? "جاهز للتسليم" : "مراجعة فنية", due: currentTask.due, owner: currentTask.owner, progress: Math.min(100, currentTask.progress + 12), tone: currentTask.tone };
    setTasks((current) => current.map((task) => task.id === id ? { ...task, ...nextPayload } : task));
    if (currentTask.recordId) void updateWorkspaceRecord(currentTask.recordId, nextPayload);
    void recordStudioAction("production.task.advance", "نقل المهمة للمرحلة التالية", { taskId: currentTask.recordId ?? id });
    setNotice("تم نقل المهمة للمرحلة التالية وحفظ التغيير في سجل الإنتاج.");
  }
  function submitMessage() {
    if (!message.trim()) return;
    const text = message.trim();
    setMessages((current) => [...current, text]);
    void createWorkspaceRecord("message", { message: text, channel: "production" }).then(({ data, error }) => { if (data) setRecords((current) => [data, ...current]); if (error) setNotice(`تعذر حفظ الرسالة في قاعدة البيانات: ${error}`); });
    void recordStudioAction("team.message.create", "إرسال رسالة للفريق", { message: text });
    setMessage("");
    setNotice("أُرسلت الرسالة إلى قناة الإنتاج.");
  }
  async function loadLinkHistory() {
    setLinksLoading(true);
    const result = await invokeAvenmediaFunction<{ links: UploadLink[] }>("cloudinary-upload", { action: "list_links" });
    if (result.data?.links) setLinkHistory(result.data.links);
    if (result.error) setNotice(`تعذر تحميل سجل الروابط: ${result.error}`);
    setLinksLoading(false);
  }
  async function createMagicLink() {
    setNotice("جارٍ إنشاء رابط رفع حقيقي من Supabase…");
    const result = await invokeAvenmediaFunction<{ link?: { token: string; expires_at?: string; id?: string } }>("cloudinary-upload", { action: "create_link", ttlHours: 24 });
    const token = result.data?.link?.token;
    if (result.error || !token) { setNotice(result.error || "تعذر إنشاء رابط الرفع"); return; }
    const link = `https://avenmedia.pages.dev/upload?token=${encodeURIComponent(token)}`;
    void recordStudioAction("uploads.magic_link.create", "إنشاء رابط رفع آمن", { expiresInHours: 24, linkId: result.data?.link?.id });
    setLinkDialog({ url: link, expiresAt: result.data?.link?.expires_at ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    await loadLinkHistory();
    setModal(null);
  }
  function createRecord(kind: ModalKind, payload: Record<string, unknown> = {}) {
    if (!kind) return;
    const recordType = kind === "booking" ? "schedule" : kind === "invoice" ? "invoice" : "upload";
    const actionKey = kind === "booking" ? "calendar.booking.create" : kind === "invoice" ? "finance.invoice.create" : "uploads.file.create";
    const label = kind === "booking" ? "إنشاء حجز" : kind === "invoice" ? "إنشاء فاتورة" : "إضافة ملف للرفع";
    void createWorkspaceRecord(recordType, { ...payload, status: "draft", source: "studio-dashboard", createdAt: new Date().toISOString() }).then(({ data, error }) => { if (data) setRecords((current) => [data, ...current]); if (error) setNotice(`تعذر الحفظ في قاعدة البيانات: ${error}`); });
    void recordStudioAction(actionKey, label);
    setNotice(`${label} — تم الحفظ كمسودة في قاعدة البيانات.`);
    setModal(null);
  }
  function handleActionCapture(event: React.MouseEvent<HTMLElement>) {
    const target = (event.target as HTMLElement).closest("button,a");
    if (!target) return;
    const label = target.getAttribute("aria-label") || target.textContent?.trim().replace(/\s+/g, " ").slice(0, 120) || "control";
    const actionKey = target.tagName === "A" ? `navigate:${target.getAttribute("href") || "unknown"}` : `button:${label}`;
    void recordStudioAction(actionKey, label);
  }

  return (
    <main onClickCapture={handleActionCapture} className={`app-shell ${appTheme} transition-colors duration-300`}>
      <div className="workspace-grid grid min-h-screen grid-cols-[250px_minmax(0,1fr)]">
        <aside className={`desktop-rail sticky top-0 h-screen border-l ${dark ? "border-white/10 bg-[#111a18]" : "border-[#cbd4f5] bg-[#efe8de]"} px-4 py-5`}>
          <div className="flex h-full flex-col">
            <Link href="/" className="flex items-center gap-3 px-2 pb-8" aria-label="العودة إلى لوحة الإنتاج">
              <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-xl bg-[#142c9b] shadow-lg shadow-[#142c9b]/20"><img src="/branding/aven-logo-192.png" alt="رمز Avenmedia" className="h-8 w-8 object-contain" /></span>
              <span>
                <strong className="brand-wordmark block" dir="ltr">Aven<span>media</span></strong>
                <span className="font-mono block pt-0.5 text-[9px] tracking-[.13em] text-[#60736a]">PRODUCTION OFFICE</span>
              </span>
            </Link>
            <div className="mb-3 px-3"><RuleLabel>مساحة العمل</RuleLabel></div>
            <nav className="space-y-1" aria-label="التنقل الرئيسي">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = safePage === item.page;
                return <Link key={item.page} aria-current={active ? "page" : undefined} title={item.label} href={item.page === "overview" ? "/" : `/${item.page}`} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${active ? "bg-[#142c9b] text-white shadow-md shadow-[#142c9b]/15" : dark ? "text-[#d5e0db] hover:bg-white/7" : "text-[#41534b] hover:bg-white/65"}`}>
                  <Icon className="h-[17px] w-[17px] stroke-[1.8]" /> <span className="flex-1">{item.label}</span>{item.tag && <span className={`font-mono rounded-md px-1.5 py-0.5 text-[10px] ${active ? "bg-white/15 text-white" : "bg-[#dfe8e2] text-[#142c9b]"}`}>{item.tag}</span>}
                </Link>;
              })}
            </nav>
            <Link href="/portfolio-editor" className="mt-2 flex items-center gap-3 rounded-xl border border-[#c8d9cf] bg-[#e6ebff] px-3 py-2.5 text-sm font-extrabold text-[#142c9b] transition hover:-translate-y-0.5"><Palette className="h-[17px] w-[17px]" />{portfolioNavItem.label}<span className="mr-auto font-mono text-[9px]">EDIT</span></Link>
            <div className="mt-7 px-3"><RuleLabel>الإدارة</RuleLabel></div>
            <Link href="/settings" className={`mt-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${safePage === "settings" ? "bg-[#142c9b] text-white" : dark ? "text-[#d5e0db] hover:bg-white/7" : "text-[#41534b] hover:bg-white/65"}`}><Settings2 className="h-[17px] w-[17px]" />الإعدادات</Link>
            <div className={`mt-auto rounded-2xl border p-3.5 ${dark ? "border-white/10 bg-white/5" : "border-[#d8cebf] bg-[#f8f3eb]"}`}>
              <div className="mb-2 flex items-center justify-between"><RuleLabel>حالة النظام</RuleLabel><span className="h-2 w-2 rounded-full bg-[#56a478]" /></div>
              <p className="m-0 text-xs leading-6 text-[#60736a]">كل الخدمات متصلة. النسخ الليلي القادم <span className="font-mono text-[#142c9b]">02:00</span></p>
            </div>
          </div>
        </aside>

        <section className="workspace-main min-w-0 p-8 md:p-10">
          <header className="mb-8 flex flex-wrap items-start justify-between gap-5">
            <div className="enter-sheet">
              <RuleLabel>{meta.eyebrow} / DATABASE</RuleLabel>
              <h1 className="font-naskh mt-1 text-4xl font-bold tracking-tight md:text-[43px]">{meta.title}</h1>
              <p className={`m-0 max-w-2xl text-sm leading-7 ${dark ? "text-[#b7c7c0]" : "text-[#66736c]"}`}>{meta.description}</p>
            </div>
            <div className="enter-sheet stagger-1 flex items-center gap-2">
              <button aria-label="رجوع" title="رجوع" onClick={() => window.history.length > 1 ? window.history.back() : window.location.assign("/")} className={`grid h-10 w-10 place-items-center rounded-full border ${dark ? "border-white/10 bg-white/5 text-white" : "border-[#cbd4f5] bg-[#ffffff] text-[#17255f]"}`}><ArrowLeft className="h-[18px]" /></button>
              <NotificationBell />
              <IconButton label="تبديل المظهر" onClick={() => updateTheme(!dark)}><SunMoon className="h-[18px]" /></IconButton>
              <button onClick={() => void recordStudioAction("profile.open", "فتح ملف المستخدم")} className={`flex items-center gap-2 rounded-full border px-2 py-1.5 ${dark ? "border-white/10 bg-white/5" : "border-[#cbd4f5] bg-[#ffffff]"}`}><span className="grid h-7 w-7 place-items-center rounded-full bg-[#c8d7ce] text-xs font-bold text-[#142c9b]">م</span><ChevronDown className="h-4 w-4 text-[#60736a]" /></button>
            </div>
          </header>

          <div className={`mb-6 flex items-center gap-3 rounded-xl border px-4 py-3 text-xs ${dark ? "border-[#3c5d53] bg-[#142c9b]/30 text-[#dcf1e4]" : "border-[#c9ded2] bg-[#e6ebff] text-[#142c9b]"}`}><Zap className="h-4 w-4 fill-current" /><span>{notice}</span></div>

          {safePage === "overview" && <SimpleOverview setModal={setModal} />}
          {(safePage === "calendar" || safePage === "clients") && <RequestManagement />}
          {safePage === "production" && <EmployeeTasks />}
          {safePage === "finance" && <FinanceLedger />}
          {safePage === "reports" && <AvenmediaReports />}
          {safePage === "equipment" && <EquipmentNotes />}
          {safePage === "team" && <AvenmediaCollaborationCenter />}
          {safePage === "uploads" && <UploadsPage setModal={setModal} />}
          {safePage === "operations" && <AvenmediaOperations />}
          {safePage === "settings" && <SettingsPage dark={dark} setDark={updateTheme} />}
        </section>
      </div>
      {modal === "booking" && <RequestCreateModal onClose={() => setModal(null)} onSaved={() => setNotice("تم حفظ الطلب الكامل في Supabase بنجاح.")} />}
      {modal && modal !== "booking" && <ActionModal kind={modal} close={() => setModal(null)} onCreate={modal === "magic" ? createMagicLink : (payload) => createRecord(modal, payload)} />}
      {linkDialog && <UploadLinkDialog link={linkDialog} history={linkHistory} loading={linksLoading} onClose={() => setLinkDialog(null)} onRefresh={() => void loadLinkHistory()} />}
      {showScrollTop && <button type="button" aria-label="العودة إلى أعلى الصفحة" title="العودة إلى أعلى الصفحة" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="fixed bottom-6 left-6 z-40 grid h-11 w-11 place-items-center rounded-full bg-[#142c9b] text-white shadow-xl transition hover:-translate-y-1"><ChevronUp className="h-5" /></button>}
    </main>
  );
}

function Overview({ tasks, records, dataLoading, setModal, advanceTask, dark }: { tasks: Task[]; records: WorkspaceRecord[]; dataLoading: boolean; setModal: (kind: ModalKind) => void; advanceTask: (id: number) => void; dark: boolean }) {
  return <div className="space-y-6">
    <section className="contact-marks relative min-h-[264px] overflow-hidden rounded-[25px] bg-[#080d24] text-white shadow-2xl shadow-[#080d24]/20 enter-sheet stagger-1">
      <img src="/manus-storage/photomedia-hero-studio_c297ce9d.jpg" alt="طاولة إنتاج استوديو تصوير" className="absolute inset-0 h-full w-full object-cover opacity-65" />
      <div className="absolute inset-0 bg-gradient-to-l from-[#0c241d]/95 via-[#0c241d]/70 to-[#0c241d]/20" />
      <div className="relative z-10 max-w-xl p-7 md:p-9">
        <RuleLabel>اليوم / التقط القرار التالي</RuleLabel>
        <h2 className="font-naskh my-2 text-3xl font-bold leading-tight md:text-[35px]">تحرّك إنتاجك اليوم<br />بإيقاع واضح.</h2>
        <p className="max-w-md text-sm leading-7 text-[#d7e5de]">قرارات التشغيل التي تحتاجك الآن، مرتبة من مصادر الاستوديو الحية.</p>
        <div className="mt-6 flex flex-wrap gap-2"><button onClick={() => setModal("booking")} className="inline-flex items-center gap-2 rounded-xl bg-[#f7f9ff] px-4 py-2.5 text-sm font-extrabold text-[#080d24] transition hover:bg-white active:scale-[.98]"><Plus className="h-4" />حجز جديد</button><button onClick={() => setModal("magic")} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white backdrop-blur transition hover:bg-white/18 active:scale-[.98]"><Link2 className="h-4" />رابط رفع آمن</button></div>
      </div>
      <div className="font-mono absolute bottom-5 left-6 text-[10px] tracking-[.16em] text-white/70">STUDIO / LIVE DATA</div>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="الحجوزات" value={String(records.filter((record) => record.record_type === "schedule").length)} detail={dataLoading ? "جار التحميل من قاعدة البيانات" : "سجلات المستخدم"} icon={CalendarDays} accent="bg-[#142c9b]" />
      <Metric label="الفواتير" value={String(records.filter((record) => record.record_type === "invoice").length)} detail={dataLoading ? "جار التحميل من قاعدة البيانات" : "سجلات المستخدم"} icon={CircleDollarSign} accent="bg-[#3159d8]" />
      <Metric label="ملفات الرفع" value={String(records.filter((record) => record.record_type === "upload").length)} detail={dataLoading ? "جار التحميل من قاعدة البيانات" : "سجلات المستخدم"} icon={Inbox} accent="bg-[#405f71]" />
      <Metric label="مهام الإنتاج" value={String(tasks.length)} detail={dataLoading ? "جار التحميل من قاعدة البيانات" : "سجلات المستخدم"} icon={Clock3} accent="bg-[#685986]" />
    </section>
    <section className="grid gap-6 xl:grid-cols-[1.1fr_.9fr]">
      <article className={`paper-panel card-lift enter-sheet stagger-2 rounded-[22px] border ${dark ? "border-white/10 bg-[#24302c]" : "border-[#cbd4f5]"} p-5 md:p-6`}>
        <div className="mb-5 flex items-start justify-between"><div><RuleLabel>موجز الجدول</RuleLabel><h3 className="mt-1 text-xl font-extrabold">هذا اليوم، لقطة بلقطة</h3></div><Link href="/calendar" className="text-sm font-bold text-[#142c9b]">فتح الروزنامة <ArrowLeft className="mr-1 inline h-4" /></Link></div>
        <div className="space-y-1 border-r border-[#cbd4f5] pr-5">{records.filter((record) => record.record_type === "schedule").slice(0, 5).map((record, index) => { const payload = record.payload ?? {}; return <Timeline key={record.id} time={String(payload.time ?? new Date(String(record.created_at)).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" }))} title={String(payload.title ?? payload.name ?? "حجز من قاعدة البيانات")} meta={String(payload.location ?? payload.owner ?? "سجل تشغيلي")} color={index % 2 ? "#3159d8" : "#142c9b"} />; })}{!records.some((record) => record.record_type === "schedule") && <div className="py-8 text-center text-sm text-[#58617e]">لا توجد أحداث مجدولة في بعد الاتصال بقاعدة البيانات.</div>}</div>
      </article>
      <article className={`paper-panel card-lift enter-sheet stagger-3 overflow-hidden rounded-[22px] border ${dark ? "border-white/10 bg-[#24302c]" : "border-[#cbd4f5]"}`}>
        <div className="relative h-36 overflow-hidden"><img src="/manus-storage/photomedia-editing-desk_0cbf470a.jpg" alt="مراجعة لوحة صور في مكتب التحرير" className="h-full w-full object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-[#080d24]/70 to-transparent" /><span className="font-mono absolute bottom-4 right-5 text-[10px] tracking-[.14em] text-white">IN FOCUS / 07</span></div>
        <div className="p-5"><RuleLabel>ملف تحت المراجعة</RuleLabel><h3 className="mt-1 text-lg font-extrabold">لا يوجد مشروع محدد</h3><p className={`my-2 text-sm leading-6 ${dark ? "text-[#bccbc4]" : "text-[#66736c]"}`}>ستظهر أحدث ملفات الإنتاج هنا بعد تحميل سجلات قاعدة البيانات.</p><Link href="/production" className="text-sm font-bold text-[#142c9b]">فتح غرفة الإنتاج <ArrowLeft className="mr-1 inline h-4" /></Link></div>
      </article>
    </section>
    <section className={`paper-panel enter-sheet rounded-[22px] border ${dark ? "border-white/10 bg-[#24302c]" : "border-[#cbd4f5]"} p-5 md:p-6`}>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><RuleLabel>تسليم قريب</RuleLabel><h3 className="mt-1 text-xl font-extrabold">صف الإنتاج</h3></div><Link href="/production" className="inline-flex items-center gap-2 text-sm font-bold text-[#142c9b]"><ListFilter className="h-4" />تصفية المهام</Link></div>
      <div className="grid gap-3 lg:grid-cols-3">{tasks.map((task) => <TaskCard key={task.id} task={task} advanceTask={advanceTask} />)}</div>
    </section>
  </div>;
}

function Metric({ label, value, suffix, detail, icon: Icon, accent }: { label: string; value: string; suffix?: string; detail: string; icon: LucideIcon; accent: string }) {
  return <article className="paper-panel card-lift enter-sheet rounded-2xl border border-[#cbd4f5] p-4"><div className="flex items-start justify-between"><div><RuleLabel>{label}</RuleLabel><div className="mt-2 flex items-baseline gap-1"><strong className="font-mono text-[29px] tracking-tight">{value}</strong>{suffix && <span className="text-xs font-bold text-[#617069]">{suffix}</span>}</div></div><span className={`grid h-9 w-9 place-items-center rounded-xl text-white ${accent}`}><Icon className="h-[17px]" /></span></div><p className="mt-3 mb-0 text-[11px] text-[#718078]">{detail}</p></article>;
}
function Timeline({ time, title, meta, color }: { time: string; title: string; meta: string; color: string }) {
  return <div className="relative grid grid-cols-[62px_1fr] gap-3 py-3.5"><span className="font-mono text-xs text-[#67756e]">{time}</span><div><span className="absolute -right-[25px] top-5 h-2.5 w-2.5 rounded-full border-2 border-[#ffffff]" style={{ background: color }} /><strong className="block text-sm">{title}</strong><span className="mt-1 block text-xs text-[#6d7b74]">{meta}</span></div></div>;
}

function SimpleOverview({ setModal }: { setModal: (kind: ModalKind) => void }) {
  const actions = [
    ["/calendar", "إدارة الطلبات", "إضافة طلب، البحث، التعديل والحذف", ClipboardList],
    ["/operations", "إدارة الفريق", "الموظفون والتخصصات والمهام", UsersRound],
    ["/production", "إدارة المهام", "متابعة مراحل التنفيذ والمنجزات", Video],
    ["/reports", "التقارير", "كشف الحساب وطباعة PDF", ReceiptText],
  ] as const;
  return <div dir="rtl" className="space-y-6"><section className="rounded-[28px] bg-[#111b4e] p-8 text-white shadow-xl"><span className="font-mono text-xs tracking-[.2em] text-[#b9c3ff]">AVENMEDIA / CONTROL DESK</span><h2 className="mt-3 text-4xl font-black">مكتب الإدارة</h2><p className="mt-3 max-w-2xl text-sm leading-7 text-indigo-100">واجهة مختصرة للوصول السريع إلى طلبات الزبائن، المهام، المنفذين، والتقارير.</p><div className="mt-6 flex flex-wrap gap-3"><button onClick={() => setModal("booking")} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-black text-[#111b4e]"><Plus className="h-4" />إضافة طلب</button><Link href="/upload" className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-4 py-3 text-sm font-bold"><Link2 className="h-4" />رابط رفع للزبون</Link></div></section><RequestSearchCard /><section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{actions.map(([href, title, description, Icon]) => <Link key={href} href={href} className="group rounded-2xl border border-[#dce1ff] bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:border-[#7388ff]"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#eef1ff] text-[#5366e8]"><Icon className="h-5" /></span><h3 className="mt-4 text-lg font-black text-[#111b4e]">{title}</h3><p className="mt-2 text-xs leading-6 text-slate-500">{description}</p><span className="mt-4 block text-xs font-bold text-[#5366e8]">عرض الكل ←</span></Link>)}</section></div>;
}
function TaskCard({ task, advanceTask }: { task: Task; advanceTask: (id: number) => void }) {
  return <article className="rounded-2xl border border-[#e1d8cb] bg-[#ffffff] p-4 transition hover:border-[#b8cfc2]"><div className="mb-3 flex items-start justify-between gap-2"><span className={`rounded-lg px-2 py-1 text-[10px] font-extrabold ${task.tone}`}>{task.stage}</span><button aria-label="خيارات المهمة" onClick={() => advanceTask(task.id)} className="text-[#64736b]"><MoreHorizontal className="h-4" /></button></div><h4 className="m-0 text-sm font-extrabold">{task.client}</h4><p className="mt-1 text-xs text-[#58617e]">{task.title}</p><div className="mt-4 flex items-center justify-between text-[11px]"><span className="font-mono text-[#233f9f]">{task.due}</span><span className="font-bold text-[#506159]">{task.owner}</span></div><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#cbd4f5]"><div className="h-full rounded-full bg-[#142c9b]" style={{ width: `${task.progress}%` }} /></div><button onClick={() => advanceTask(task.id)} className="mt-4 w-full rounded-lg border border-[#cfe0d6] bg-[#edf6f0] py-2 text-xs font-extrabold text-[#142c9b] transition hover:bg-[#dcefe4] active:scale-[.98]">نقل للمرحلة التالية</button></article>;
}

function CalendarPage({ setModal }: { setModal: (kind: ModalKind) => void }) {
  const [view, setView] = useState<"day" | "week" | "month">("day");
  const rows: string[][] = [];
  const views = [["day", "اليوم"], ["week", "الأسبوع"], ["month", "الشهر"]] as const;
  return <div className="space-y-6 enter-sheet"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex rounded-xl border border-[#cbd4f5] bg-[#ffffff] p-1 text-sm font-bold">{views.map(([key, label]) => <button key={key} onClick={() => setView(key)} className={`rounded-lg px-4 py-2 ${view === key ? "bg-[#142c9b] text-white" : "text-[#58617e]"}`}>{label}</button>)}</div><button onClick={() => setModal("booking")} className="inline-flex items-center gap-2 rounded-xl bg-[#142c9b] px-4 py-2.5 text-sm font-extrabold text-white shadow-lg shadow-[#142c9b]/20"><Plus className="h-4" />إضافة حجز</button></div><section className="paper-panel overflow-hidden rounded-[22px] border border-[#cbd4f5]"><div className="flex items-center justify-between border-b border-[#e7ded2] p-5"><div><RuleLabel>{view === "day" ? "اليوم / قاعدة البيانات" : view === "week" ? "الأسبوع / قاعدة البيانات" : "الشهر / قاعدة البيانات"}</RuleLabel><h2 className="mt-1 text-xl font-extrabold">{view === "day" ? "سجل اليوم" : view === "week" ? "سجل الأسبوع" : "سجل الشهر"}</h2></div><span className="rounded-full bg-[#e6ebff] px-3 py-1.5 text-xs font-bold text-[#142c9b]">{rows.length ? `${rows.length} أحداث مجدولة` : "لا أحداث مجدولة"}</span></div><div className="divide-y divide-[#e9e1d6]">{rows.length ? rows.map((row) => <div key={row[0]} className="grid gap-4 p-5 sm:grid-cols-[78px_1.6fr_1fr_1fr_auto]"><span className="font-mono text-sm text-[#142c9b]">{row[0]}</span><strong className="text-sm">{row[1]}</strong><span className="text-xs text-[#58617e]">{row[2]}</span><span className="text-xs text-[#58617e]">{row[3]}</span><span className="w-fit rounded-md bg-[#f0f4f1] px-2 py-1 text-[10px] font-bold text-[#142c9b]">{row[4]}</span></div>) : <div className="p-8 text-center text-sm text-[#58617e]">لا توجد حجوزات في بعد الاتصال بقاعدة البيانات.</div>}</div></section></div>;
}

function ClientsPage({ query, setQuery, setModal }: { query: string; setQuery: (query: string) => void; setModal: (kind: ModalKind) => void }) {
  const clients: string[][] = [];
  return <div className="space-y-6 enter-sheet"><section className="archive-sheet grid overflow-hidden rounded-[24px] lg:grid-cols-[1.2fr_.8fr]"><div className="p-6 md:p-7"><RuleLabel>القرار الرئيسي / علاقات العميل</RuleLabel><h2 className="font-naskh mt-2 text-3xl font-bold">لا توجد ملفات عملاء محددة<br />في بعد الاتصال بقاعدة البيانات.</h2><p className="mt-2 max-w-xl text-sm leading-7 text-[#607169]">ستظهر مواعيد العملاء ومتابعاتهم هنا فور توفر سجلات حية من قاعدة البيانات.</p><div className="mt-6 flex flex-wrap gap-2"><Link href="/clients" className="rounded-xl bg-[#142c9b] px-4 py-2.5 text-sm font-extrabold text-white">فتح سجل العملاء</Link><button onClick={() => setModal("booking")} className="rounded-xl border border-[#bfd4c7] bg-[#f0f7f2] px-4 py-2.5 text-sm font-extrabold text-[#142c9b]">حجز جديد</button></div></div><aside className="border-t border-[#cbd4f5] bg-[#eef2ff] p-6 lg:border-t-0 lg:border-r"><div className="flex items-center justify-between"><RuleLabel>CLIENT / LIVE</RuleLabel><span className="rounded-full bg-[#cbd4f5] px-2 py-1 font-mono text-[9px] text-[#58617e]">NO DATA</span></div><div className="mt-8 rounded-xl border border-[#cbd4f5] bg-[#ffffff] p-5 text-sm text-[#58617e]">لا توجد بيانات عميل مختارة.</div><div className="dossier-line mt-6" /><div className="mt-4 grid grid-cols-2 gap-3"><div><span className="sheet-index">LIFETIME VALUE</span><strong className="font-mono mt-1 block text-lg">—</strong></div><div><span className="sheet-index">PROJECTS</span><strong className="font-mono mt-1 block text-lg">—</strong></div></div></aside></section><section className="grid gap-6 xl:grid-cols-[1.3fr_.7fr]"><div className="archive-sheet overflow-hidden rounded-[22px]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cbd4f5] p-5"><div><RuleLabel>دليل العملاء</RuleLabel><h2 className="mt-1 text-xl font-extrabold">السجل النشط</h2></div><div className="relative min-w-[230px]"><Search className="absolute right-3 top-3 h-4 text-[#58617e]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث باسم العميل أو المشروع" className="w-full border-b border-[#cbd4f5] bg-transparent py-2.5 pr-10 pl-3 text-sm outline-none focus:border-[#142c9b]" /></div></div><div className="grid grid-cols-[auto_1.25fr_1.7fr_.7fr_auto] gap-3 px-5 py-3"><RuleLabel>#</RuleLabel><RuleLabel>العميل</RuleLabel><RuleLabel>المشروع الحالي</RuleLabel><RuleLabel>الحالة</RuleLabel><span /></div>{clients.length ? clients.map((client, index) => <div key={client[0]} className="ledger-row grid grid-cols-[auto_1.25fr_1.7fr_.7fr_auto] items-center gap-3 px-5 py-4"><span className="sheet-index">{String(index + 1).padStart(2, "0")}</span><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg border border-[#cae0d3] bg-[#e6ebff] text-sm font-extrabold text-[#142c9b]">{client[4]}</span><strong className="text-sm">{client[0]}</strong></div><span className="text-xs text-[#58617e]">{client[1]}</span><span className="text-xs font-bold text-[#142c9b]">{client[3]}</span><Link href="/clients" className="text-xs font-bold text-[#142c9b]">فتح <ArrowLeft className="inline h-3.5" /></Link></div>) : <div className="col-span-5 p-8 text-center text-sm text-[#58617e]">لا توجد ملفات عملاء في بعد الاتصال بقاعدة البيانات.</div>}</div><aside className="archive-sheet rounded-[22px] bg-[#080d24] p-5 text-white"><RuleLabel>مؤشر العلاقات</RuleLabel><h3 className="font-naskh mt-2 text-2xl font-bold">لا توجد فرص متابعة محسوبة.</h3><p className="mt-2 text-sm leading-7 text-white/65">ستظهر مؤشرات العلاقات بعد وصول سجلات العملاء من قاعدة البيانات.</p><div className="mt-6 space-y-3 border-t border-white/15 pt-4"><div className="flex justify-between text-xs"><span>سجلات العملاء</span><strong>—</strong></div><div className="h-1.5 overflow-hidden bg-white/15"><div className="h-full w-0 bg-[#3159d8]" /></div></div></aside></section></div>;
}

function ProductionPage({ tasks, advanceTask }: { tasks: Task[]; advanceTask: (id: number) => void }) {
  const [focusBoard, setFocusBoard] = useState(false);
  const columns = ["تصوير", "فرز", "تحرير", "مراجعة", "تسليم"];
  return <div className="space-y-5 enter-sheet"><section className="archive-sheet overflow-hidden rounded-[24px] bg-[#080d24] text-white"><div className="grid lg:grid-cols-[1.3fr_.7fr]"><div className="p-6 md:p-7"><RuleLabel>LIVE BOARD / DATABASE</RuleLabel><h2 className="font-naskh mt-2 text-3xl font-bold">لوحة الإنتاج الحية<br />من سجلات قاعدة البيانات.</h2><p className="mt-2 max-w-xl text-sm leading-7 text-white/65">ستظهر المهمة الحالية والموعد والمالك هنا عند توفر سجلات إنتاج حية.</p><div className="mt-6 flex gap-2"><span className="border-r-2 border-[#3159d8] bg-white/8 px-3 py-2 text-xs font-bold">المهام: {tasks.length}</span><span className="border-r-2 border-[#5ea47e] bg-white/8 px-3 py-2 text-xs font-bold">الحالة: {tasks.length ? "نشطة" : "بانتظار البيانات"}</span></div></div><aside className="border-t border-white/10 bg-white/5 p-6 lg:border-t-0 lg:border-r"><RuleLabel>إيقاع اليوم</RuleLabel><div className="mt-6 grid grid-cols-5 gap-1">{columns.map((column, index) => <div key={column}><span className="block h-16 bg-white/8" style={{ opacity: .45 + (index * .12) }} /><span className="mt-2 block text-[10px] text-white/60">0{index + 1}</span></div>)}</div><p className="mt-5 text-xs leading-6 text-white/65">{tasks.length ? "يعرض هذا اللوح المهام التي تم تحميلها من قاعدة البيانات." : "لا توجد مهام إنتاج محملة من بعد الاتصال بقاعدة البيانات."}</p></aside></div></section><section className="flex flex-wrap items-center justify-between gap-3"><div className="flex gap-2"><span className="border-r-2 border-[#142c9b] bg-[#e6ebff] px-3 py-1.5 text-xs font-bold text-[#142c9b]">{tasks.length} مهام نشطة</span><span className="border-r-2 border-[#3159d8] bg-[#eaf0ff] px-3 py-1.5 text-xs font-bold text-[#233f9f]">{tasks.filter((task) => task.progress < 50).length} تحت ضغط الموعد</span></div><button onClick={() => setFocusBoard((value) => !value)} className="inline-flex items-center gap-2 border-b border-[#142c9b] py-2 text-sm font-extrabold text-[#142c9b]"><SlidersHorizontal className="h-4" />{focusBoard ? "عرض كامل اللوحة" : "تركيز على لوحة الإنتاج"}</button></section><section className="archive-sheet overflow-x-auto rounded-[22px] p-5 pb-6"><div className="grid min-w-[950px] grid-cols-5 gap-4">{columns.map((column, index) => <div key={column}><div className="mb-3 flex items-center justify-between border-b border-[#cfc5b8] pb-3"><div><span className="sheet-index">STAGE / 0{index + 1}</span><strong className="mt-1 block text-sm">{column}</strong></div><span className={`h-2.5 w-2.5 ${index === 2 ? "bg-[#3159d8]" : "bg-[#142c9b]"}`} /></div><div className="space-y-3">{tasks.filter((_, taskIndex) => taskIndex % 3 === index % 3).map((task) => <TaskCard key={`${column}-${task.id}`} task={task} advanceTask={advanceTask} />)}{index === 4 && <div className="border border-dashed border-[#bdcfc5] bg-[#edf5f0] p-4 text-center text-xs font-bold text-[#142c9b]"><PackageCheck className="mx-auto mb-2 h-5" />جاهز للتسليم</div>}</div></div>)}</div></section></div>;
}

function FinancePage({ setModal }: { setModal: (kind: ModalKind) => void }) {
  return <div className="space-y-6 enter-sheet"><section className="archive-sheet overflow-hidden rounded-[24px] bg-[#142c9b] text-white"><div className="grid lg:grid-cols-[1.35fr_.65fr]"><div className="p-7"><RuleLabel>دفتر الاستوديو / قاعدة البيانات</RuleLabel><div className="mt-6 flex flex-wrap items-end gap-x-4 gap-y-2"><span className="font-mono text-5xl font-medium">—</span><span className="mb-2 text-base font-bold">صافي الشهر من قاعدة البيانات</span></div><div className="mt-7 grid grid-cols-3 border-y border-white/15 py-4 text-sm"><div><span className="block text-white/60">داخل</span><strong className="font-mono mt-1 block">—</strong></div><div><span className="block text-white/60">مصروف</span><strong className="font-mono mt-1 block">—</strong></div><div><span className="block text-white/60">هامش</span><strong className="font-mono mt-1 block">—</strong></div></div></div><aside className="border-t border-white/10 bg-[#08382e] p-7 lg:border-t-0 lg:border-r"><RuleLabel>استثناء يحتاج قراراً</RuleLabel><h2 className="font-naskh mt-3 text-3xl font-bold">لا توجد مطالبات<br />محمّلة بعد.</h2><p className="mt-3 text-sm leading-7 text-white/65">ستظهر المطالبات هنا بعد إنشائها من خلال قاعدة البيانات.</p><Link href="/finance?view=claims" className="mt-5 inline-block border-b border-[#dca171] pb-1 text-sm font-extrabold text-[#f3c29a]">فتح المطالبات <ArrowLeft className="inline h-4" /></Link></aside></div></section><section className="archive-sheet overflow-hidden rounded-[22px]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#cbd4f5] p-5"><div><RuleLabel>السجل المالي</RuleLabel><h2 className="mt-1 text-xl font-extrabold">التحصيل في لقطة واحدة</h2></div><button onClick={() => setModal("invoice")} className="inline-flex items-center gap-2 rounded-xl bg-[#142c9b] px-4 py-2.5 text-sm font-extrabold text-white"><FilePlus2 className="h-4" />فاتورة جديدة</button></div><div className="p-8 text-center text-sm text-[#58617e]">لا توجد فواتير في بعد الاتصال بقاعدة البيانات.</div></section></div>;
}

function EquipmentPage({ setNotice }: { setNotice: (value: string) => void }) {
  const [returned, setReturned] = useState(false);
  return <div className="space-y-6 enter-sheet"><section className="grid gap-5 lg:grid-cols-[.85fr_1.15fr]"><article className="overflow-hidden rounded-[22px] bg-[#080d24] text-white"><img src="/manus-storage/photomedia-copper-lens_1eeb76dc.jpg" alt="عدسة سينمائية ضمن مخزون الاستوديو" className="h-44 w-full object-cover opacity-80" /><div className="p-5"><RuleLabel>أصل تحت المتابعة</RuleLabel><h2 className="mt-1 text-xl font-extrabold">لا يوجد أصل محدد</h2><p className="mt-1 text-xs text-white/65">أضف المعدات من قاعدة البيانات لعرضها هنا.</p></div></article><article className="paper-panel rounded-[22px] border border-[#cbd4f5] p-5"><RuleLabel>نظرة الأصول</RuleLabel><div className="mt-4 grid grid-cols-3 gap-3"><MiniStat value="—" label="أصل مسجل" /><MiniStat value="—" label="في الميدان" /><MiniStat value="—" label="قيد الصيانة" /></div><div className="mt-5 rounded-xl bg-[#eaf0ff] p-3 text-xs leading-6 text-[#82501e]"><Wrench className="ml-1 inline h-4" />ستظهر تنبيهات الصيانة بعد إضافة سجلات المعدات إلى قاعدة البيانات.</div></article></section><section className="paper-panel overflow-hidden rounded-[22px] border border-[#cbd4f5]"><div className="flex items-center justify-between p-5"><div><RuleLabel>إعارات المعدات</RuleLabel><h2 className="mt-1 text-xl font-extrabold">حركة العتاد اليوم</h2></div><button onClick={() => { void recordStudioAction("equipment.qr.scan", "فتح ماسح QR للمعدات"); setNotice("تم فتح إجراء مسح QR — اربط قارئ الكاميرا من سطح المكتب لإكمال المسح."); }} className="inline-flex items-center gap-2 rounded-xl border border-[#cadbd1] bg-[#eff7f2] px-4 py-2.5 text-sm font-extrabold text-[#142c9b]"><Command className="h-4" />مسح QR</button></div><div className="border-t border-[#eee6dc] p-8 text-center text-sm text-[#58617e]">لا توجد إعارات معدات في بعد الاتصال بقاعدة البيانات.</div></section></div>;
}

function TeamPage({ messages, message, setMessage, submitMessage }: { messages: string[]; message: string; setMessage: (value: string) => void; submitMessage: () => void }) {
  const channels: { label: string; unread: string; active: boolean }[] = [];
  return <div className="grid gap-5 enter-sheet lg:grid-cols-[.72fr_1.28fr]"><aside className="paper-panel rounded-[22px] border border-[#cbd4f5] p-4"><div className="mb-4 flex items-center justify-between"><div><RuleLabel>قنوات الفريق</RuleLabel><h2 className="mt-1 text-lg font-extrabold">المحادثات</h2></div><button onClick={() => void recordStudioAction("team.channel.create", "إنشاء قناة فريق")} className="grid h-8 w-8 place-items-center rounded-lg bg-[#142c9b] text-white"><Plus className="h-4" /></button></div>{channels.map((channel) => <button key={channel.label} onClick={() => void recordStudioAction("team.channel.open", "فتح قناة الفريق", { channel: channel.label })} className={`mb-1 flex w-full items-center gap-3 rounded-xl px-3 py-3 text-right text-sm font-bold ${channel.active ? "bg-[#e6ebff] text-[#142c9b]" : "text-[#52635b] hover:bg-[#f7f9ff]"}`}><MessageCircleMore className="h-4" /><span className="flex-1">{channel.label}</span>{channel.unread && <span className="font-mono text-[10px]">{channel.unread}</span>}</button>)}</aside><section className="paper-panel flex min-h-[520px] flex-col rounded-[22px] border border-[#cbd4f5]"><div className="border-b border-[#e7ded2] p-5"><RuleLabel>قناة / الإنتاج</RuleLabel><h2 className="mt-1 text-xl font-extrabold">تحرير ومتابعة المشاريع</h2></div><div className="flex-1 space-y-4 p-5">{messages.length ? messages.map((entry, index) => <div key={`${entry}-${index}`} className={`max-w-[75%] rounded-2xl p-3 text-sm leading-7 ${index % 2 === 0 ? "bg-[#f7f9ff] text-[#17255f]" : "mr-auto bg-[#142c9b] text-white"}`}><span className="mb-1 block text-[10px] font-bold opacity-60">{index % 2 === 0 ? "سارة · 10:42" : "أنت · الآن"}</span>{entry}</div>) : <div className="rounded-xl border border-dashed border-[#cfc5b8] p-8 text-center text-sm text-[#58617e]">لا توجد رسائل في بعد الاتصال بقاعدة البيانات.</div>}</div><form onSubmit={(event) => { event.preventDefault(); submitMessage(); }} className="flex gap-2 border-t border-[#e7ded2] p-4"><input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="اكتب تحديثاً للفريق…" className="flex-1 rounded-xl border border-[#cbd4f5] bg-[#ffffff] px-3 text-sm outline-none focus:border-[#142c9b]" /><button className="grid h-11 w-11 place-items-center rounded-xl bg-[#142c9b] text-white"><Send className="h-4" /></button></form></section></div>;
}

function UploadsPage({ setModal }: { setModal: (kind: ModalKind) => void }) {
  return <div className="space-y-6 enter-sheet"><section className="contact-marks relative overflow-hidden rounded-[24px] bg-[#080d24] p-7 text-white"><div className="absolute left-0 top-0 h-full w-1/3 bg-[radial-gradient(circle_at_75%_25%,rgba(179,106,54,.33),transparent_55%)]" /><div className="relative flex flex-wrap items-end justify-between gap-5"><div><RuleLabel>رفع آمن / التخزين + قاعدة البيانات</RuleLabel><h2 className="font-naskh mt-2 text-3xl font-bold">غرفة رفع العميل الحيّة.</h2><p className="mt-2 max-w-xl text-sm leading-7 text-white/75">معاينة فورية، فلترة، حالات تشغيلية، ومزامنة تلقائية مع Supabase عند وصول الملفات.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setModal("magic")} className="inline-flex items-center gap-2 rounded-xl bg-[#f7f9ff] px-4 py-2.5 text-sm font-extrabold text-[#080d24]"><Link2 className="h-4" />إنشاء رابط عميل</button><button onClick={() => setModal("upload")} className="inline-flex items-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 py-2.5 text-sm font-bold text-white"><UploadCloud className="h-4" />رفع داخلي</button></div></div></section><UploadRoom /></div>;
}

function SettingsPage({ dark, setDark }: { dark: boolean; setDark: (value: boolean) => void }) {
  const [autosave, setAutosave] = useState(true);
  const settings: { label: string; description: string; value: boolean; setValue: (value: boolean) => void }[] = [
    { label: "وضع المظهر", description: "اختر مظهراً مريحاً لغرفة التحرير", value: dark, setValue: setDark },
    { label: "حفظ تلقائي محلي", description: "احتفظ بنسخة قراءة محلية عند انقطاع الشبكة", value: autosave, setValue: setAutosave },
  ];
  return <div className="space-y-5 enter-sheet"><section className="paper-panel rounded-[22px] border border-[#cbd4f5]"><div className="border-b border-[#e8e0d5] p-5"><RuleLabel>مساحة العمل</RuleLabel><h2 className="mt-1 text-xl font-extrabold">التفضيلات اليومية</h2></div>{settings.map((setting) => <div key={setting.label} className="flex items-center justify-between gap-5 border-b border-[#eee6dc] p-5 last:border-0"><div><strong className="text-sm">{setting.label}</strong><p className="mt-1 text-xs leading-6 text-[#58617e]">{setting.description}</p></div><button aria-label={setting.label} onClick={() => setting.setValue(!setting.value)} className={`relative h-7 w-12 rounded-full transition ${setting.value ? "bg-[#142c9b]" : "bg-[#d6d0c6]"}`}><span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${setting.value ? "right-6" : "right-1"}`} /></button></div>)}</section><section className="paper-panel rounded-[22px] border border-[#cbd4f5] p-5"><RuleLabel>الحماية</RuleLabel><h2 className="mt-1 text-xl font-extrabold">الأمان والوصول</h2><div className="mt-5 grid gap-3 md:grid-cols-3"><SecurityTile icon={LockKeyhole} label="قفل تلقائي" detail="بعد 15 دقيقة" /><SecurityTile icon={ShieldCheck} label="سجل تدقيق" detail="نشط ومشفّر" /><SecurityTile icon={Archive} label="نسخ احتياطي" detail="كل ليلة 02:00" /></div></section></div>;
}

function MiniStat({ value, label }: { value: string; label: string }) { return <div className="rounded-xl bg-[#f7f9ff] p-3"><strong className="font-mono text-2xl text-[#142c9b]">{value}</strong><span className="mt-1 block text-[10px] text-[#697870]">{label}</span></div>; }
function SecurityTile({ icon: Icon, label, detail }: { icon: LucideIcon; label: string; detail: string }) { return <div className="rounded-xl border border-[#e3dbd0] bg-[#ffffff] p-4"><Icon className="h-5 text-[#142c9b]" /><strong className="mt-3 block text-sm">{label}</strong><span className="mt-1 block text-xs text-[#58617e]">{detail}</span></div>; }

function ActionModal({ kind, close, onCreate }: { kind: Exclude<ModalKind, null>; close: () => void; onCreate: (payload?: Record<string, unknown>) => void }) {
  const content: Record<Exclude<ModalKind, null>, { title: string; text: string; action: string; icon: LucideIcon }> = { booking: { title: "تسجيل حجز جديد", text: "أضف اسم العميل والمشروع، وسيتم حفظ الطلب فوراً في Supabase.", action: "حفظ الطلب", icon: CalendarDays }, magic: { title: "رابط رفع آمن", text: "سيتم إنشاء رابط خاص بالعميل، صالح لمدة 24 ساعة، ومربوط بسجل قاعدة البيانات.", action: "إنشاء الرابط", icon: Link2 }, invoice: { title: "إنشاء فاتورة", text: "ابدأ بمسودة قابلة للمراجعة قبل إرسالها للعميل.", action: "إنشاء فاتورة", icon: ReceiptText }, upload: { title: "رفع داخلي", text: "أضف ملفاً إلى قائمة الرفع ليبدأ التحضير والتحقق من السلامة.", action: "إضافة للرفع", icon: ImagePlus } };
  const current = content[kind]; const Icon = current.icon;
  const [client, setClient] = useState(""); const [project, setProject] = useState("");
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[#080d24]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label={current.title}><div className="w-full max-w-md rounded-[24px] bg-[#ffffff] p-6 text-[#080d24] shadow-2xl"><div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#e6ebff] text-[#142c9b]"><Icon className="h-5" /></span><button onClick={close} aria-label="إغلاق" className="text-[#58617e]"><X className="h-5" /></button></div><RuleLabel>إجراء سريع</RuleLabel><h2 className="font-naskh mt-1 text-2xl font-bold">{current.title}</h2><p className="mt-2 text-sm leading-7 text-[#64736b]">{current.text}</p>{kind === "booking" && <div className="mt-5 space-y-3"><input value={client} onChange={(event) => setClient(event.target.value)} placeholder="اسم العميل" autoFocus className="w-full rounded-xl border border-[#cbd4f5] bg-white px-3 py-3 text-sm outline-none focus:border-[#142c9b]" /><input value={project} onChange={(event) => setProject(event.target.value)} placeholder="اسم المشروع أو تفاصيل الطلب" className="w-full rounded-xl border border-[#cbd4f5] bg-white px-3 py-3 text-sm outline-none focus:border-[#142c9b]" /></div>}{kind !== "booking" && kind !== "magic" && <input placeholder={kind === "invoice" ? "اسم العميل" : "اختر ملفاً"} className="mt-5 w-full rounded-xl border border-[#cbd4f5] bg-white px-3 py-3 text-sm outline-none focus:border-[#142c9b]" />}{kind === "magic" && <div className="font-mono mt-5 rounded-xl border border-dashed border-[#c2d9cc] bg-[#f0f7f2] p-3 text-xs text-[#142c9b]">سيتم إنشاء رابط حقيقي من Supabase ونسخه بعد نجاح العملية.</div>}<div className="mt-6 flex gap-2"><button disabled={kind === "booking" && (!client.trim() || !project.trim())} onClick={() => onCreate(kind === "booking" ? { clientName: client.trim(), title: project.trim() } : undefined)} className="flex-1 rounded-xl bg-[#142c9b] py-3 text-sm font-extrabold text-white active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40">{current.action}</button><button onClick={close} className="rounded-xl border border-[#cbd4f5] px-4 py-3 text-sm font-bold text-[#5e6d66]">إلغاء</button></div></div></div>;
}

function UploadLinkDialog({ link, history, loading, onClose, onRefresh }: { link: { url: string; expiresAt: string }; history: UploadLink[]; loading: boolean; onClose: () => void; onRefresh: () => void }) {
  const copy = async (url: string) => { await navigator.clipboard?.writeText(url); };
  const share = async (url: string) => { if (navigator.share) await navigator.share({ title: "رابط رفع Avenmedia", text: "رابط رفع الملفات", url }); else await copy(url); };
  const urlFor = (token: string) => `https://avenmedia.pages.dev/upload?token=${encodeURIComponent(token)}`;
  const expired = (item: UploadLink) => Boolean(item.revoked_at) || new Date(item.expires_at).getTime() <= Date.now();
  return <div className="fixed inset-0 z-[60] grid place-items-center bg-[#080d24]/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="سجل روابط الرفع"><div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-[24px] bg-white p-6 text-[#080d24] shadow-2xl" dir="rtl"><div className="flex items-start justify-between gap-3"><div><RuleLabel>UPLOAD LINKS / 24 HOURS</RuleLabel><h2 className="font-naskh mt-1 text-2xl font-bold">رابط الرفع الحقيقي</h2></div><button onClick={onClose} aria-label="إغلاق" className="rounded-full p-2 text-[#58617e] hover:bg-[#eef2ff]"><X className="h-5" /></button></div><div className="mt-5 rounded-2xl border border-[#bfd4c7] bg-[#f0f7f2] p-4"><p className="m-0 break-all font-mono text-xs leading-6 text-[#142c9b]">{link.url}</p><p className="mt-2 text-xs font-bold text-[#58617e]">ينتهي: {new Date(link.expiresAt).toLocaleString("ar-IQ")}</p><div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void copy(link.url)} className="inline-flex items-center gap-2 rounded-xl bg-[#142c9b] px-4 py-2.5 text-xs font-extrabold text-white"><ClipboardList className="h-4" />نسخ الرابط</button><button onClick={() => void share(link.url)} className="inline-flex items-center gap-2 rounded-xl border border-[#cbd4f5] px-4 py-2.5 text-xs font-extrabold text-[#142c9b]"><Share2 className="h-4" />مشاركة</button></div></div><div className="mt-6 flex items-center justify-between"><div><RuleLabel>LINK HISTORY</RuleLabel><h3 className="mt-1 text-lg font-extrabold">سجل الروابط السابقة</h3></div><button onClick={onRefresh} className="rounded-xl border border-[#cbd4f5] px-3 py-2 text-xs font-bold text-[#142c9b]">{loading ? "جارٍ التحميل…" : "تحديث السجل"}</button></div><div className="mt-3 space-y-2">{history.length ? history.map((item) => { const isExpired = expired(item); const itemUrl = urlFor(item.token); return <article key={item.id} className="rounded-xl border border-[#e2e7f8] bg-[#f7f9ff] p-3"><div className="flex flex-wrap items-center justify-between gap-2"><div><b className="text-xs">{item.client_name || "بدون اسم عميل"}</b><p className="mt-1 text-[10px] text-[#58617e]">أنشئ {new Date(item.created_at).toLocaleString("ar-IQ")} · ينتهي {new Date(item.expires_at).toLocaleString("ar-IQ")}</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${isExpired ? "bg-[#f7e6e6] text-[#9b3434]" : "bg-[#e3eee9] text-[#0b4d3e]"}`}>{isExpired ? "منتهي الصلاحية" : "فعال"}</span></div><p className="mt-2 truncate font-mono text-[10px] text-[#3159d8]">{itemUrl}</p><div className="mt-2 flex gap-2"><button disabled={isExpired} onClick={() => void copy(itemUrl)} className="rounded-lg border border-[#cbd4f5] px-3 py-1.5 text-[10px] font-bold text-[#142c9b] disabled:opacity-40">نسخ</button><button disabled={isExpired} onClick={() => void share(itemUrl)} className="rounded-lg border border-[#cbd4f5] px-3 py-1.5 text-[10px] font-bold text-[#142c9b] disabled:opacity-40">مشاركة</button></div></article>; }) : <p className="rounded-xl border border-dashed border-[#cbd4f5] p-5 text-center text-xs text-[#58617e]">لا يوجد سجل روابط بعد.</p>}</div></div></div>;
}
