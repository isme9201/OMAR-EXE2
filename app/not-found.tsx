import Link from "next/link";

export default function NotFound() {
  return (
    <main dir="rtl" className="min-h-screen bg-[#f7f9ff] px-6 py-20 text-[#080d24]">
      <section className="mx-auto max-w-xl rounded-[24px] border border-[#cbd4f5] bg-[#ffffff] p-10 text-center shadow-sm">
        <p className="font-mono text-[10px] tracking-[.16em] text-[#142c9b]">PHOTOMEDIA / 404</p>
        <h1 className="mt-3 text-3xl font-extrabold">هذه الصفحة غير موجودة</h1>
        <p className="mt-3 text-sm leading-7 text-[#58617e]">ارجع إلى مكتب الإنتاج أو افتح إحدى مساحات العمل المتاحة.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-[#142c9b] px-5 py-3 text-sm font-bold text-white">العودة إلى الاستوديو</Link>
      </section>
    </main>
  );
}

export const dynamic = "force-static";
