"use client";

import { useState } from "react";
import { Check, FileUp, Loader2, ShieldCheck } from "lucide-react";
import { invokeAvenmediaFunction } from "@/lib/avenmedia";

type Signature = { cloudName: string; apiKey: string; timestamp: number; signature: string; folder: string; taskId: string | null; clientName: string | null };

export default function ClientUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") ?? "" : "";

  const upload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !file) { setMessage("الرابط غير مكتمل أو لم يتم اختيار ملف"); return; }
    setBusy(true); setMessage("");
    const signed = await invokeAvenmediaFunction<Signature>("cloudinary-upload", { action: "sign_upload", token });
    if (signed.error || !signed.data) { setMessage(signed.error ?? "تعذر التحقق من رابط الرفع"); setBusy(false); return; }
    const formData = new FormData(); formData.append("file", file); formData.append("api_key", signed.data.apiKey); formData.append("timestamp", String(signed.data.timestamp)); formData.append("signature", signed.data.signature); formData.append("folder", signed.data.folder);
    const cloudinary = await fetch(`https://api.cloudinary.com/v1_1/${signed.data.cloudName}/auto/upload`, { method: "POST", body: formData });
    const asset = await cloudinary.json() as Record<string, unknown>;
    if (!cloudinary.ok) { setMessage(String(asset.error ?? "تعذر رفع الملف إلى Cloudinary")); setBusy(false); return; }
    const completed = await invokeAvenmediaFunction("cloudinary-upload", { action: "complete_upload", token, asset });
    setMessage(completed.error ? completed.error : "تم رفع الملف بأعلى دقة وحفظه في مساحة Avenmedia"); setBusy(false);
  };

  return <main dir="rtl" className="min-h-screen bg-[#f5f0e7] p-5 text-[#17211f] md:p-8"><div className="mx-auto max-w-6xl"><header className="flex items-center justify-between border-b border-[#cfc5b8] pb-5"><div className="flex items-center gap-3"><span className="grid h-11 w-11 place-items-center rounded-xl bg-[#0b4d3e] text-white"><i className="mark-grid" aria-hidden="true"><i /><i /><i /><i /></i></span><div><strong className="brand-wordmark block" dir="ltr">Photo<span>Media</span></strong><span className="block font-mono text-[9px] tracking-[.16em] text-[#68776f]">PRODUCTION OFFICE / DELIVERY</span></div></div><span className="font-mono text-[10px] tracking-[.18em] text-[#b36a36]">DOSSIER 04 / SECURE</span></header><div className="grid min-h-[calc(100vh-145px)] items-center gap-8 py-10 lg:grid-cols-[.75fr_1.25fr]"><aside className="hidden self-stretch rounded-[26px] bg-[#0b4d3e] p-8 text-white lg:flex lg:flex-col lg:justify-between"><div><span className="font-mono text-[10px] tracking-[.18em] text-[#b9d7c8]">ARCHIVE NOTE / 04</span><h2 className="font-naskh mt-6 text-5xl font-bold leading-[1.12]">ملفاتك.<br />بجودة الأصل.</h2><p className="mt-6 max-w-sm text-sm leading-8 text-white/70">مساحة تسليم خاصة بمشروعك. يذهب الملف مباشرة إلى أرشيف Cloudinary، وتُحفظ بياناته التشغيلية في Supabase.</p></div><div className="grid grid-cols-2 gap-3"><div className="h-24 border border-white/20 p-3"><span className="font-mono text-[9px] text-white/55">FRAME 01</span><div className="mt-5 h-1 w-14 bg-[#c5783a]" /></div><div className="h-24 border border-white/20 p-3"><span className="font-mono text-[9px] text-white/55">FRAME 02</span><div className="mt-5 h-1 w-9 bg-white/45" /></div></div></aside><section className="relative overflow-hidden rounded-[28px] border border-[#d9d0c3] bg-[#fffdf8] shadow-[0_24px_80px_rgba(23,33,31,.1)]"><div className="absolute left-0 top-0 h-full w-1.5 bg-[#b36a36]" /><div className="p-7 md:p-11"><div className="flex items-start justify-between gap-5"><div><span className="font-mono text-[10px] tracking-[.17em] text-[#b36a36]">AVENMEDIA / SECURE DELIVERY</span><h1 className="font-naskh mt-3 text-4xl font-bold md:text-5xl">ارفع ملفاتك بأمان.</h1><p className="mt-3 max-w-xl text-sm leading-8 text-[#68776f]">يحفظ هذا المسار الحجم الأصلي والدقة الكاملة. لا يتم تخزين الملف على هذا الجهاز، ولا تُعرض بيانات مالية أو معلومات غير لازمة.</p></div><ShieldCheck className="h-8 w-8 shrink-0 text-[#0b4d3e]" /></div><div className="my-8 grid grid-cols-3 border-y border-[#e7ded2] py-4 text-[10px] font-bold text-[#68776f]"><span>01 / اختيار الأصل</span><span>02 / رفع مباشر</span><span className="text-[#0b4d3e]">03 / تسجيل التسليم</span></div><form onSubmit={upload} className="grid gap-4"><label className="group grid cursor-pointer gap-3 border border-dashed border-[#0b4d3e]/55 bg-[#f3f8f4] p-8 text-center transition hover:bg-[#e3eee9]"><span className="mx-auto grid h-14 w-14 place-items-center border border-[#0b4d3e]/25 bg-white text-[#0b4d3e]"><FileUp className="h-7 w-7" /></span><strong className="text-lg">{file ? file.name : "اختر صورة أو فيديو"}</strong><span className="text-xs text-[#68776f]">الحجم الأصلي محفوظ · رابط موقّع · أرشيف خاص</span><input type="file" accept="image/*,video/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="hidden" /></label><button disabled={busy || !token} className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-[#0b4d3e] text-sm font-extrabold text-white transition hover:bg-[#083c31] disabled:opacity-45">{busy ? <Loader2 className="h-4 animate-spin" /> : <Check className="h-4" />}إرسال الأصل إلى الأرشيف</button></form>{message && <p className="mt-5 border border-[#bfd4c7] bg-[#e3eee9] p-4 text-sm font-bold leading-7 text-[#0b4d3e]">{message}</p>}{!token && <p className="mt-5 border-t border-[#e7ded2] pt-4 text-center text-sm font-bold text-[#a25624]">رابط الرفع غير صالح. اطلب رابطاً جديداً من فريق Avenmedia.</p>}</div></section></div></div></main>;
}
