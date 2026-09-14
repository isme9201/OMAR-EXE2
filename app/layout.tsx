/* Editorial Atelier design reminder: the root establishes Arabic RTL, Noto hierarchy, and Archive Green brand framing. */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PhotoMedia ERP | مكتب الإنتاج",
  description: "Arabic-first production command desk for photography and media studios.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
