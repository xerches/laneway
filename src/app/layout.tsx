import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { ThemeScript, ThemedToaster } from "@/components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Laneway", template: "%s · Laneway" },
  description: "A clear, colorful board for personal, work and business projects.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#101216" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
      // ThemeScript may set data-theme before React loads.
      suppressHydrationWarning
    >
      <head>
        <ThemeScript />
      </head>
      <body className="h-full">
        {children}
        <ThemedToaster />
      </body>
    </html>
  );
}
