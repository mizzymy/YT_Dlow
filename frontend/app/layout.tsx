import type { Metadata, Viewport } from "next";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#07070d",
};

export const metadata: Metadata = {
  title: "YT Downloader — Download YouTube Videos in Full Quality",
  description:
    "Download your YouTube channel videos in the highest quality — 4K, 1080p, 720p, or MP3. Paste a link, pick quality, download instantly.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "YT Downloader",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
