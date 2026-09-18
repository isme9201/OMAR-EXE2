'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f7f9ff", color: "#080d24" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32 }}>
          <section style={{ maxWidth: 560, textAlign: "center" }}>
            <p style={{ letterSpacing: ".16em", fontSize: 11, color: "#142c9b" }}>AVEN MEDIA PRODUCTION / RECOVERY</p>
            <h1 style={{ fontSize: 34, margin: "12px 0" }}>تعذر فتح هذه الصفحة</h1>
            <p style={{ lineHeight: 1.9, color: "#58617e" }}>يمكنك إعادة المحاولة أو العودة إلى مساحة الاستوديو.</p>
            <button onClick={() => reset()} style={{ border: 0, borderRadius: 10, padding: "12px 18px", background: "#142c9b", color: "white", fontWeight: 700, cursor: "pointer" }}>إعادة المحاولة</button>
          </section>
        </main>
      </body>
    </html>
  );
}
