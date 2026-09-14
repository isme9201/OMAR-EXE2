import Link from "next/link";

export default function NotFound() {
  return (
    <main dir="rtl" className="min-h-screen bg-[#f5f0e7] px-6 py-20 text-[#17211f]">
      <section className="mx-auto max-w-xl rounded-[24px] border border-[#ded5c9] bg-[#fffdf8] p-10 text-center shadow-sm">
        <p className="font-mono text-[10px] tracking-[.16em] text-[#0b4d3e]">PHOTOMEDIA / 404</p>
        <h1 className="mt-3 text-3xl font-extrabold">هذه الصفحة غير موجودة</h1>
        <p className="mt-3 text-sm leading-7 text-[#68776f]">ارجع إلى مكتب الإنتاج أو افتح إحدى مساحات العمل المتاحة.</p>
        <Link href="/" className="mt-6 inline-flex rounded-xl bg-[#0b4d3e] px-5 py-3 text-sm font-bold text-white">العودة إلى الاستوديو</Link>
      </section>
    </main>
  );
}

export const dynamic = "force-static";
