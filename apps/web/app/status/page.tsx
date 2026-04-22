import type { Metadata } from "next";
import { PublicNav } from "@/components/public-nav";
import { siteName, siteUrl } from "@/lib/seo";
import { StatusClient } from "./status-client";

export const metadata: Metadata = {
  title: "Status",
  description: "Live health information for your current Rifft environment.",
  alternates: {
    canonical: "/status",
  },
  openGraph: {
    title: `${siteName} Status`,
    description: "Live health information for your current Rifft environment.",
    url: `${siteUrl}/status`,
  },
};

export default function StatusPage() {
  return (
    <div className="min-h-screen bg-background">
      <PublicNav badge="Status" />
      <StatusClient />
    </div>
  );
}
