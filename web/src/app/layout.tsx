import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegisterSW } from "@/components/RegisterSW";

export const metadata: Metadata = {
  title: "BRIIX OSP",
  description: "Aplikasi lapangan FTTH — BRIIX OSP",
  manifest: "/app/manifest.json",
  icons: {
    icon: [
      { url: "/app/icon.svg", type: "image/svg+xml" },
      { url: "/app/favicon.ico", sizes: "any" },
      { url: "/app/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/app/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#16181D",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="id">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@500;600&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
        />
      </head>
      <body className="font-sans antialiased">
        <RegisterSW />
        {children}
      </body>
    </html>
  );
}
