import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "YT Downloader — Download YouTube Videos in Full Quality",
  description:
    "Download your YouTube channel videos in the highest quality available. Supports 4K, 1080p, 720p, and audio-only MP3 formats.",
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
