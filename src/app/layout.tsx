import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./theme.css";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export const metadata: Metadata = {
  title: "SOUV — Souvenir Tim Funding",
  description:
    "Stok tertata. Pemberian tercatat. Ruang kerja souvenir tim funding.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
