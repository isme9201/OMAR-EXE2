'use client';

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ar" dir="rtl">
      <body style={{ margin: 0, fontFamily: "Arial, sans-serif", background: "#f5f0e7", color: "#17211f" }}>
        <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 32 }}>
          <section style={{ maxWidth: 560, textAlign: "center" }}>
            <p style={{ letterSpacing: ".16em", fontSize: 11, color: "#0b4d3e" }}>PHOTOMEDIA / RECOVERY</p>
            <h1 style={{ fontSize: 34, margin: "12px 0" }}>تعذر فتح هذه الصفحة</h1>
            <p style={{ lineHeight: 1.9, color: "#68776f" }}>يمكنك إعادة المحاولة أو العودة إلى مساحة الاستوديو.</p>
            <button onClick={() => reset()} style={{ border: 0, borderRadius: 10, padding: "12px 18px", background: "#0b4d3e", color: "white", fontWeight: 700, cursor: "pointer" }}>إعادة المحاولة</button>
          </section>
        </main>
      </body>
    </html>
  );
}
