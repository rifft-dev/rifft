import type { Metadata } from "next";
import { Suspense } from "react";
import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import { Oswald, JetBrains_Mono } from "next/font/google";

const oswald = Oswald({
  subsets: ["latin"],
  variable: "--font-oswald",
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains",
  weight: ["400", "500", "600"],
  display: "swap",
});
import "@xyflow/react/dist/style.css";
import { AppShell } from "@/components/app-shell";
import { AuthProvider } from "@/components/auth-provider";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { ogImageUrl, siteDescription, siteName, siteUrl } from "@/lib/seo";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  applicationName: siteName,
  title: {
    default: `${siteName} | Agent Debugging and Tracing`,
    template: `%s | ${siteName}`,
  },
  description: siteDescription,
  keywords: [
    "agent debugging",
    "multi-agent debugging",
    "single-agent debugging",
    "AI agent tracing",
    "LLM observability",
    "trace debugging",
    "agent failure analysis",
    "AI debugging tool",
    "LangSmith alternative",
    "Langfuse alternative",
  ],
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    url: siteUrl,
    title: `${siteName} | Agent Debugging and Tracing`,
    description: siteDescription,
    siteName,
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: "Rifft product preview",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${siteName} | Agent Debugging and Tracing`,
    description: siteDescription,
    images: [ogImageUrl],
  },
  robots: {
    index: true,
    follow: true,
  },
  category: "technology",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${oswald.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <ThemeProvider>
          <AuthProvider>
            <Suspense fallback={<div className="min-h-screen bg-background" />}>
              <AppShell>{children}</AppShell>
            </Suspense>
          </AuthProvider>
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
