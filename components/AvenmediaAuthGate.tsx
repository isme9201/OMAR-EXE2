"use client";

import { useEffect, useState } from "react";
import { LogIn, LogOut, Loader2, ShieldCheck } from "lucide-react";
import { getSession, onAuthChange, profileFor, signIn, signOut, toggleAttendance } from "@/lib/avenmedia-auth";
import type { WorkspacePage } from "@/lib/workspaces";
import { DashboardApp } from "@/components/DashboardApp";

type Specialty = string;
type Profile = { id: string; name: string; email: string; role: string; specialty?: Specialty | null };

export function AvenmediaAuthGate({ page }: { page: WorkspacePage }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attendance, setAttendance] = useState("");

  const load = async () => {
    const result = await getSession();
    setSession(Boolean(result.session));
    if (result.user) { const p = await profileFor(result.user.id); setProfile(p.data as Profile | null); }
    if (result.error && !result.session) setError(result.error);
    setLoading(false);
  };
  useEffect(() => { void load(); const sub = onAuthChange(() => void load()); return () => sub?.unsubscribe(); }, []);

  const login = async (event: React.FormEvent) => { event.preventDefault(); setBusy(true); setError(""); const result = await signIn(email, password); if (result.error) setError(result.error); else await load(); setBusy(false); };
  const attendanceClick = async () => { if (!profile) return; setBusy(true); const result = await toggleAttendance(profile.id); setAttendance(result.error ? result.error : result.data?.check_out ? "تم تسجيل الخروج" : "تم تسجيل الحضور"); setBusy(false); };
  if (loading) return <div dir="rtl" className="aven-loading-toast"><Loader2 className="h-5 w-5 animate-spin" /><span>جارٍ تحميل مساحة Avenmedia…</span></div>;
  if (!session) return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#080d24] px-5 py-10 text-[#131a45]"><section className="relative w-full max-w-md overflow-hidden rounded-[30px] border border-white/30 bg-white p-8 shadow-2xl"><div className="absolute inset-x-0 top-0 h-2 bg-[#3159d8]" /><div className="mb-8 flex items-center gap-3"><img src="/branding/aven-logo-192.png" alt="AVEN Media Production" className="h-14 w-14 rounded-2xl object-cover shadow-lg" /><div><strong className="block text-2xl tracking-tight">Avenmedia</strong><span className="text-xs text-slate-500">إدارة شركة التصوير</span></div></div><div className="mb-6 rounded-2xl bg-[#e6ebff] p-4 text-sm leading-7 text-[#343e83]"><ShieldCheck className="mb-2 h-5" />تسجيل آمن عبر التخزين. تبقى الجلسة محفوظة لمدة شهر على هذا الجهاز.</div><form onSubmit={login} className="grid gap-4"><label className="grid gap-2 text-sm font-bold">البريد الإلكتروني<input required type="email" value={email} onChange={e => setEmail(e.target.value)} className="h-12 rounded-xl border border-slate-200 px-3 outline-none focus:border-[#3159d8]" /></label><label className="grid gap-2 text-sm font-bold">كلمة المرور<input required type="password" value={password} onChange={e => setPassword(e.target.value)} className="h-12 rounded-xl border border-slate-200 px-3 outline-none focus:border-[#3159d8]" /></label>{error && <p role="alert" className="m-0 rounded-xl bg-red-50 p-3 text-sm font-bold text-red-700">{error}</p>}<button disabled={busy} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#080d24] text-sm font-extrabold text-white disabled:opacity-50">{busy ? <Loader2 className="h-4 animate-spin" /> : <LogIn className="h-4" />}دخول إلى Avenmedia</button></form></section></main>;
  return <div className="relative"><div dir="rtl" className="fixed bottom-5 left-5 z-50 flex items-center gap-2 rounded-2xl border border-[#3159d8]/30 bg-[#080d24] px-3 py-2 text-white shadow-xl"><span className="text-xs font-bold">{profile?.name || "مستخدم"}<small className="mr-2 text-[#b9c3ff]">{profile?.specialty || profile?.role || "فريق"}</small></span><button onClick={() => void attendanceClick()} className="rounded-xl bg-[#3159d8] px-3 py-2 text-xs font-bold">{busy ? "..." : "دوام دخول/خروج"}</button><button onClick={() => void signOut()} aria-label="تسجيل الخروج" className="grid h-8 w-8 place-items-center rounded-xl border border-white/20"><LogOut className="h-4" /></button></div><DashboardApp page={page} /></div>;
}
