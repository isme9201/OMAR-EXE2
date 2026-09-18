/* Editorial Atelier design reminder: the root establishes Arabic RTL, Noto hierarchy, and Archive Green brand framing. */
import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  icons: { icon: "/branding/aven-logo-32.png", apple: "/branding/aven-logo-192.png" },
  title: "Avenmedia | مساحة تسليم الملفات",
  description: "Aven Media Production management workspace.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
