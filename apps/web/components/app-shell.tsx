"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { Menu } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { RifftLogo } from "@/components/rifft-logo";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/components/auth-provider";

const defaultAuthedRoute = "/onboarding";
const defaultWorkspaceRoute = "/workspace";

const getMobileRouteLabel = (pathname: string) => {
  if (pathname.startsWith("/traces/")) {
    return {
      title: "Trace detail",
      description: "Inspect the failing run without losing your workspace context.",
    };
  }

  if (pathname.startsWith("/traces")) {
    return {
      title: "Incident queue",
      description: "Open the next run Rifft thinks is worth your attention.",
    };
  }

  if (pathname.startsWith("/settings")) {
    return {
      title: "Settings",
      description: "Manage project setup, billing, and cloud limits.",
    };
  }

  if (pathname.startsWith("/onboarding")) {
    return {
      title: "Onboarding",
      description: "Connect your first trace and let Rifft confirm the flow is live.",
    };
  }

  return {
    title: "Overview",
    description: "Keep the current project in view and move quickly to the next incident.",
  };
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isLoading, user } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const isAuthRoute = pathname.startsWith("/auth");
  const isBootstrapRoute = pathname.startsWith("/bootstrap");
  const isPublicLandingRoute = pathname === "/";
  const nextPath = searchParams.get("next") ?? defaultAuthedRoute;
  const mobileRouteLabel = getMobileRouteLabel(pathname);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (user) {
      void (async () => {
        const response = await fetch("/api/cloud/current-project", { cache: "no-store" });
        if (!response.ok) {
          if (!isBootstrapRoute) {
            router.replace(`/bootstrap?next=${encodeURIComponent(nextPath)}`);
          }
          return;
        }

        const data = (await response.json()) as {
          projectId: string | null;
          hasCloudProjects: boolean;
        };

        if (!data.projectId && !isBootstrapRoute) {
          router.replace(`/bootstrap?next=${encodeURIComponent(nextPath)}`);
          return;
        }

        if (isAuthRoute) {
          router.replace(data.projectId ? nextPath : `/bootstrap?next=${encodeURIComponent(nextPath)}`);
          return;
        }

        if (isPublicLandingRoute) {
          router.replace(
            data.projectId
              ? defaultWorkspaceRoute
              : `/bootstrap?next=${encodeURIComponent(defaultWorkspaceRoute)}`,
          );
        }
      })();
      return;
    }

    if (!isAuthRoute && !isBootstrapRoute && !isPublicLandingRoute) {
      const target = pathname === "/" ? defaultAuthedRoute : pathname;
      router.replace(`/auth?next=${encodeURIComponent(target)}`);
    }
  }, [
    isAuthRoute,
    isBootstrapRoute,
    isLoading,
    isPublicLandingRoute,
    nextPath,
    pathname,
    router,
    user,
  ]);

  if (isAuthRoute || isBootstrapRoute || (isPublicLandingRoute && !user)) {
    return <div className="min-h-screen bg-background">{children}</div>;
  }

  if (isPublicLandingRoute && user) {
    return <div className="min-h-screen bg-background" />;
  }

  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="max-w-sm space-y-3 text-center">
          <div className="text-lg font-semibold">Checking your session…</div>
          <p className="text-sm text-muted-foreground">
            Rifft is getting your hosted workspace ready.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="flex min-h-screen flex-col lg:flex-row">
        <AppSidebar />
        <div className="sticky top-0 z-30 border-b border-border/80 bg-background/95 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <RifftLogo className="h-7 w-auto text-foreground" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{mobileRouteLabel.title}</div>
                  <div className="truncate text-xs text-muted-foreground">{mobileRouteLabel.description}</div>
                </div>
              </div>
            </div>
            <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
              <SheetTrigger asChild>
                <Button variant="outline" size="icon" className="shrink-0 rounded-2xl">
                  <Menu className="h-4 w-4" />
                  <span className="sr-only">Open navigation</span>
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[90vw] max-w-sm border-sidebar-border bg-sidebar-background p-0">
                <SheetHeader className="sr-only">
                  <SheetTitle>Workspace navigation</SheetTitle>
                  <SheetDescription>Switch projects and move between overview, traces, and settings.</SheetDescription>
                </SheetHeader>
                <AppSidebar mobile onNavigate={() => setMobileNavOpen(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </div>
        <main key={pathname} className="route-stage min-w-0 flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}
