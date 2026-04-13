"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  LogIn,
  LogOut,
  Moon,
  RadioTower,
  Settings,
  Sparkles,
  Sun,
  Workflow,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useAuth } from "@/components/auth-provider";
import { RifftLogo } from "@/components/rifft-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/workspace", label: "Overview", icon: Activity },
  { href: "/traces", label: "Traces", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
];

type CloudProject = {
  id: string;
  name: string;
};

type SidebarSummary = {
  project: {
    id: string;
    name: string;
  } | null;
  usage: {
    plan: {
      name: string;
      key: "free" | "pro";
      retention_days: number;
    };
    usage: {
      used_spans: number;
      included_spans: number;
    };
  } | null;
  traces: {
    total: number;
    latest: {
      trace_id: string;
      started_at: string;
    } | null;
    latestIncident: {
      trace_id: string;
      status: "ok" | "error" | "unset";
    } | null;
  };
};

type TraceFocusSummary = {
  trace_id: string;
  started_at: string;
  duration_ms: number;
  status: "ok" | "error" | "unset";
  primary_failure: {
    mode: string;
    severity: "benign" | "fatal";
    agent_id: string | null;
    explanation: string;
  } | null;
  root_cause_agent_id: string | null;
  failing_agent_id: string | null;
};

const getUserLabel = (email?: string | null) => {
  if (!email) {
    return "Signed-in user";
  }

  return email.split("@")[0] ?? email;
};

const getInitials = (email?: string | null) => {
  const label = getUserLabel(email);
  return label.slice(0, 2).toUpperCase();
};

type AppSidebarProps = {
  mobile?: boolean;
  onNavigate?: () => void;
};

export function AppSidebar({ mobile = false, onNavigate }: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { setTheme, theme } = useTheme();
  const { accessToken, user, signOut } = useAuth();
  const [projects, setProjects] = useState<CloudProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>("");
  const [summary, setSummary] = useState<SidebarSummary | null>(null);
  const [traceFocusSummary, setTraceFocusSummary] = useState<TraceFocusSummary | null>(null);
  const [isSwitchingProject, setIsSwitchingProject] = useState(false);

  const formatSpanCount = (value: number) => new Intl.NumberFormat("en-US").format(value);
  const formatDuration = (value: number) => {
    if (value >= 1000) {
      return `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)}s`;
    }

    return `${Math.round(value)}ms`;
  };
  const formatRelativeTime = (iso: string) => {
    const diffMs = new Date(iso).getTime() - Date.now();
    const diffMinutes = Math.round(diffMs / 60_000);
    if (Math.abs(diffMinutes) < 60) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(diffMinutes, "minute");
    }
    const diffHours = Math.round(diffMs / 3_600_000);
    if (Math.abs(diffHours) < 24) {
      return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(diffHours, "hour");
    }
    const diffDays = Math.round(diffMs / 86_400_000);
    return new Intl.RelativeTimeFormat("en", { numeric: "auto" }).format(diffDays, "day");
  };
  const isTraceDetailRoute = pathname.startsWith("/traces/") && pathname !== "/traces";
  const currentTraceId = isTraceDetailRoute ? pathname.split("/")[2] ?? null : null;
  const closeMobileNav = () => {
    onNavigate?.();
  };

  if (!user) {
    return null;
  }

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    const loadProjects = async () => {
      const [projectsResponse, currentProjectResponse, summaryResponse] = await Promise.all([
        fetch("/api/cloud/projects", {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        }),
        fetch("/api/cloud/current-project", {
          cache: "no-store",
        }),
        fetch("/api/cloud/sidebar-summary", {
          cache: "no-store",
        }),
      ]);

      if (!projectsResponse.ok) {
        return;
      }

      const data = (await projectsResponse.json()) as { projects: CloudProject[] };
      if (cancelled) {
        return;
      }

      setProjects(data.projects);
      const currentProject =
        currentProjectResponse.ok
          ? ((await currentProjectResponse.json()) as { projectId?: string | null }).projectId ?? null
          : null;
      setActiveProjectId(currentProject ?? data.projects[0]?.id ?? "");
      if (summaryResponse.ok) {
        setSummary((await summaryResponse.json()) as SidebarSummary);
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  useEffect(() => {
    if (!currentTraceId) {
      setTraceFocusSummary(null);
      return;
    }

    let cancelled = false;

    const loadTraceFocus = async () => {
      const response = await fetch(`/api/cloud/trace-focus?traceId=${encodeURIComponent(currentTraceId)}`, {
        cache: "no-store",
      });

      if (!response.ok) {
        if (!cancelled) {
          setTraceFocusSummary(null);
        }
        return;
      }

      const data = (await response.json()) as TraceFocusSummary;
      if (!cancelled) {
        setTraceFocusSummary(data);
      }
    };

    void loadTraceFocus();

    return () => {
      cancelled = true;
    };
  }, [currentTraceId]);

  const latestIncidentId = summary?.traces.latestIncident?.trace_id ?? null;
  const latestTraceId = summary?.traces.latest?.trace_id ?? null;
  const hasTraces = (summary?.traces.total ?? 0) > 0;
  const isViewingLatestIncident = Boolean(currentTraceId && latestIncidentId && currentTraceId === latestIncidentId);
  const isViewingLatestTrace = Boolean(currentTraceId && latestTraceId && currentTraceId === latestTraceId);
  const traceSeverity = traceFocusSummary?.primary_failure?.severity ?? null;
  const traceTone =
    traceSeverity === "fatal" || traceFocusSummary?.status === "error"
      ? {
          card: "border-destructive/40 bg-destructive/10",
          badge: "border-destructive/40 bg-destructive/15 text-destructive",
          accent: "text-destructive",
        }
      : traceFocusSummary?.status === "ok"
        ? {
            card: "border-emerald-500/30 bg-emerald-500/8",
            badge: "border-emerald-500/30 bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
            accent: "text-emerald-700 dark:text-emerald-300",
          }
        : {
            card: "border-sidebar-border/70 bg-sidebar",
            badge: "border-sidebar-border/70 bg-sidebar-accent text-foreground",
            accent: "text-foreground",
          };
  const nextAction = !hasTraces
    ? {
        href: "/onboarding",
        label: "Resume onboarding",
        description: "Send your first trace and watch it appear live.",
        icon: RadioTower,
      }
    : latestIncidentId
      ? {
          href: `/traces/${latestIncidentId}`,
          label: "Open latest incident",
          description: "Jump straight into the failing run worth checking first.",
          icon: AlertTriangle,
        }
      : latestTraceId
        ? {
            href: `/traces/${latestTraceId}`,
            label: "Open latest trace",
            description: "Review the freshest run in the current project.",
            icon: CheckCircle2,
          }
        : {
            href: "/traces",
            label: "Open incident queue",
            description: "Review captured traces and pick the next run to inspect.",
            icon: Workflow,
          };
  const NextActionIcon = nextAction.icon;
  const traceFocus = currentTraceId
    ? {
        eyebrow: isViewingLatestIncident
          ? "Investigating active incident"
          : isViewingLatestTrace
            ? "Reviewing latest trace"
            : "Inspecting trace detail",
        title: currentTraceId,
        description: isViewingLatestIncident
          ? "You are already inside the run Rifft thinks is most urgent."
          : "Stay on this trace for context, or jump back to the queue when you are ready.",
        primaryHref: "/traces",
        primaryLabel: "Back to queue",
        secondaryHref:
          latestIncidentId && latestIncidentId !== currentTraceId
            ? `/traces/${latestIncidentId}`
            : latestTraceId && latestTraceId !== currentTraceId
              ? `/traces/${latestTraceId}`
              : null,
        secondaryLabel:
          latestIncidentId && latestIncidentId !== currentTraceId
            ? "Open latest incident"
            : latestTraceId && latestTraceId !== currentTraceId
              ? "Open latest trace"
              : null,
      }
    : null;

  return (
    <aside
      className={cn(
        "shrink-0 bg-[radial-gradient(circle_at_top,hsl(var(--chart-1))/0.08,transparent_28%),hsl(var(--sidebar-background))] text-sidebar-foreground",
        mobile
          ? "flex h-full w-full flex-col"
          : "hidden w-72 border-r border-sidebar-border lg:flex lg:flex-col",
      )}
    >
      <div className="border-b border-sidebar-border px-5 py-5">
        <div className="space-y-4">
          <RifftLogo className="text-foreground" />
          <div className="rounded-2xl border border-sidebar-border bg-sidebar-accent/70 p-4">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Rifft Cloud
            </div>
            <p className="mt-3 text-sm text-muted-foreground">
              Keep the active project in view and move quickly from first trace to root cause.
            </p>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-sidebar-border bg-sidebar-accent p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
                Active project
              </div>
              {summary?.usage ? (
                <span className="rounded-full border border-sidebar-border px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                  {summary.usage.plan.name}
                </span>
              ) : null}
            </div>
            <Select
              value={activeProjectId}
              onValueChange={async (projectId) => {
                setActiveProjectId(projectId);
                setIsSwitchingProject(true);
                await fetch("/api/cloud/active-project", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({ projectId }),
                });
                const summaryResponse = await fetch("/api/cloud/sidebar-summary", {
                  cache: "no-store",
                });
                if (summaryResponse.ok) {
                  setSummary((await summaryResponse.json()) as SidebarSummary);
                }
                router.refresh();
                if (pathname.startsWith("/traces/")) {
                  router.push("/traces");
                }
                setIsSwitchingProject(false);
                closeMobileNav();
              }}
            >
              <SelectTrigger className="border-sidebar-border bg-sidebar text-sidebar-foreground">
                <SelectValue placeholder="Choose project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="space-y-1 text-xs text-muted-foreground">
              <div>{isSwitchingProject ? "Switching project…" : summary?.project?.name ?? "Authenticated cloud workspace"}</div>
              {summary?.usage ? (
                <div>
                  {formatSpanCount(summary.usage.usage.used_spans)} /{" "}
                  {formatSpanCount(summary.usage.usage.included_spans)} spans this month
                </div>
              ) : (
                <div>Choose where Rifft should look next.</div>
              )}
            </div>
          </div>
        </div>
      </div>
      <nav className="flex-1 px-4 py-5">
        {traceFocus ? (
          <div
            className={cn(
              "mb-6 rounded-2xl border p-4 transition-colors",
              traceFocusSummary ? traceTone.card : "border-sidebar-border bg-sidebar-accent/70",
            )}
          >
            <div className="text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
              {traceFocus.eyebrow}
            </div>
            <div className="mt-2 text-sm font-medium leading-snug">{traceFocus.title}</div>
            <p className="mt-2 text-sm text-muted-foreground">{traceFocus.description}</p>
            {traceFocusSummary ? (
              <div className="mt-3 space-y-2 rounded-xl border border-sidebar-border/70 bg-sidebar/80 px-3 py-3 text-xs shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Status</span>
                  <span
                    className={cn(
                      "rounded-full border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.12em]",
                      traceTone.badge,
                    )}
                  >
                    {traceFocusSummary.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Started</span>
                  <span className="font-medium">{formatRelativeTime(traceFocusSummary.started_at)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground">Duration</span>
                  <span className="font-medium">{formatDuration(traceFocusSummary.duration_ms)}</span>
                </div>
                {traceFocusSummary.primary_failure ? (
                  <div className="border-t border-sidebar-border/70 pt-2">
                    <div className="text-muted-foreground">Primary failure</div>
                    <div className={cn("mt-1 font-medium leading-snug", traceTone.accent)}>
                      {traceFocusSummary.primary_failure.mode}
                    </div>
                    <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                      {traceFocusSummary.primary_failure.severity === "fatal" ? "Fatal failure" : "Benign failure"}
                    </div>
                  </div>
                ) : null}
                {traceFocusSummary.root_cause_agent_id ? (
                  <div className="border-t border-sidebar-border/70 pt-2">
                    <div className="text-muted-foreground">Root cause agent</div>
                    <div className="mt-1 truncate font-mono text-[11px]">
                      {traceFocusSummary.root_cause_agent_id}
                    </div>
                  </div>
                ) : null}
                {traceFocusSummary.failing_agent_id &&
                traceFocusSummary.failing_agent_id !== traceFocusSummary.root_cause_agent_id ? (
                  <div className="border-t border-sidebar-border/70 pt-2">
                    <div className="text-muted-foreground">Failing agent</div>
                    <div className="mt-1 truncate font-mono text-[11px]">
                      {traceFocusSummary.failing_agent_id}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
            <Button asChild className="mt-3 w-full justify-between rounded-xl">
              <Link href={traceFocus.primaryHref} onClick={closeMobileNav}>
                {traceFocus.primaryLabel}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {traceFocus.secondaryHref && traceFocus.secondaryLabel ? (
              <Button asChild variant="ghost" className="mt-2 w-full justify-between rounded-xl">
                <Link href={traceFocus.secondaryHref} onClick={closeMobileNav}>
                  {traceFocus.secondaryLabel}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="mb-6 rounded-2xl border border-sidebar-border bg-sidebar-accent/70 p-4">
            <div className="flex items-center gap-2 text-sm font-medium">
              <NextActionIcon className="h-4 w-4" />
              Next best action
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{nextAction.description}</p>
            <Button asChild className="mt-3 w-full justify-between rounded-xl">
              <Link href={nextAction.href} onClick={closeMobileNav}>
                {nextAction.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            {summary?.traces.total ? (
              <p className="mt-2 text-xs text-muted-foreground">
                {summary.traces.total} trace{summary.traces.total === 1 ? "" : "s"} captured in this project
              </p>
            ) : null}
          </div>
        )}

        <div className="mb-3 flex items-center gap-2 px-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
          <Activity className="h-3.5 w-3.5" />
          Workspace
        </div>
        <div className="space-y-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
                onClick={closeMobileNav}
              >
                <Icon className="h-4 w-4" />
                <div className="flex flex-1 items-center justify-between gap-3">
                  <span>{item.label}</span>
                  {active ? <span className="text-[10px] uppercase tracking-[0.14em] opacity-80">Open</span> : null}
                </div>
              </Link>
            );
          })}
        </div>
        <div className="mt-6 rounded-2xl border border-sidebar-border bg-sidebar-accent/60 p-4">
          <div className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
            Project status
          </div>
          <div className="mt-3 space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">State</span>
              <span className="font-medium">
                {!hasTraces ? "Waiting for first trace" : latestIncidentId ? "Incident detected" : "Healthy recent runs"}
              </span>
            </div>
            {summary?.usage ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Retention</span>
                <span className="font-medium">{summary.usage.plan.retention_days} days</span>
              </div>
            ) : null}
            {currentTraceId ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">In focus</span>
                <span className="max-w-[8rem] truncate font-medium">{currentTraceId}</span>
              </div>
            ) : null}
          </div>
          <Button asChild variant="ghost" className="mt-3 -ml-3">
            <Link href="/settings" onClick={closeMobileNav}>
              Open settings
            </Link>
          </Button>
        </div>
      </nav>
      <div className="mt-auto space-y-3 border-t border-sidebar-border p-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-2xl border border-sidebar-border bg-sidebar-accent p-3 text-left transition-colors hover:bg-sidebar-accent/80">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.user_metadata.avatar_url as string | undefined} />
                <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{getUserLabel(user.email)}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Signed in</DropdownMenuLabel>
            <DropdownMenuItem disabled>
              <LogIn className="h-4 w-4" />
              {user.app_metadata.provider === "github" ? "GitHub session" : "Magic link session"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(event) => {
                event.preventDefault();
                void signOut();
                closeMobileNav();
              }}
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          className="w-full justify-start rounded-2xl"
          variant="ghost"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          {theme === "dark" ? "Switch to light" : "Switch to dark"}
        </Button>
      </div>
    </aside>
  );
}
