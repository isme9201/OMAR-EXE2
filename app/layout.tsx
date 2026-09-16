/* Editorial Atelier design reminder: the root establishes Arabic RTL, Noto hierarchy, and Archive Green brand framing. */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avenmedia | مساحة تسليم الملفات",
  description: "Secure Arabic-first chat and original-quality file delivery for Avenmedia teams.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
