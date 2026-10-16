"use client";

import { useEffect } from "react";

export default function ClientUploadRedirect() {
  useEffect(() => {
    const query = window.location.search;
    window.location.replace(`/aven-upload.html${query}`);
  }, []);

  return <main dir="rtl" className="grid min-h-screen place-items-center bg-[#10194a] p-6 text-white"><p className="rounded-2xl bg-white/10 px-6 py-4 text-sm font-bold">جارٍ فتح غرفة الرفع الآمنة…</p></main>;
}
