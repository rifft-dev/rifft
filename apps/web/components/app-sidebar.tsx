"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BookOpen,
  EllipsisVertical,
  LogIn,
  LogOut,
  Moon,
  Plus,
  Settings,
  Sun,
  Workflow,
} from "lucide-react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { createCloudWorkspace, createPlanCheckout } from "@/app/lib/client-api";
import { RifftLogo } from "@/components/rifft-logo";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectItemText,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/workspace", label: "Overview", icon: Activity },
  { href: "/traces", label: "Traces", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
];

const docsHref = process.env.NEXT_PUBLIC_DOCS_URL ?? "/docs";
const docsIsExternal = docsHref.startsWith("http://") || docsHref.startsWith("https://");

type CloudProject = {
  id: string;
  name: string;
  account_role?: "owner" | "member" | null;
};

type SidebarSummary = {
  project: {
    id: string;
    name: string;
    permissions?: {
      can_manage_billing?: boolean;
    };
  } | null;
  usage: {
    plan: {
      name: string;
      key: "free" | "pro" | "scale";
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
  const [isSwitchingProject, setIsSwitchingProject] = useState(false);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<"pro" | "scale" | null>(null);

  const reloadSidebarData = async (token: string) => {
    const [projectsResponse, currentProjectResponse, summaryResponse] = await Promise.all([
      fetch("/api/cloud/projects", {
        headers: {
          authorization: `Bearer ${token}`,
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
      if (projectsResponse.status === 401) {
        setSessionExpired(true);
      }
      throw new Error("Could not load workspaces");
    }

    setSessionExpired(false);

    const data = (await projectsResponse.json()) as { projects: CloudProject[] };
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

  const closeMobileNav = () => {
    onNavigate?.();
  };

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    let cancelled = false;

    const loadProjects = async () => {
      try {
        await reloadSidebarData(accessToken);
      } catch {
        return;
      }
      if (cancelled) {
        return;
      }
    };

    void loadProjects();

    return () => {
      cancelled = true;
    };
  }, [accessToken, pathname]);

  if (!user) {
    return null;
  }

  const planKey = summary?.usage?.plan.key ?? "free";
  const canManageBilling = summary?.project?.permissions?.can_manage_billing ?? false;
  const canCreateWorkspace = canManageBilling && planKey !== "free";

  return (
    <aside
      className={cn(
        "shrink-0 overflow-hidden bg-[radial-gradient(circle_at_top,hsl(var(--chart-1))/0.08,transparent_28%),hsl(var(--sidebar-background))] text-sidebar-foreground",
        mobile
          ? "flex h-full w-full flex-col"
          : "hidden w-56 border-r border-sidebar-border lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col",
      )}
    >
      <div className="border-b border-sidebar-border px-4 py-4">
        <RifftLogo wordmark={false} className="h-6 w-auto text-foreground" />

        <div className="mt-4">
          {projects.length > 1 ? (
            <Select
              value={activeProjectId}
              onValueChange={async (projectId) => {
                if (projectId === "__new_workspace__") {
                  if (!canManageBilling) {
                    toast.error(
                      "Only the account owner can create workspaces in this account. Create your own workspace to start a separate plan.",
                    );
                    router.push("/settings#workspaces");
                  } else if (canCreateWorkspace) {
                    setNewWorkspaceOpen(true);
                  } else {
                    setUpgradeOpen(true);
                  }
                  return;
                }

                if (projectId === "__manage_workspaces__") {
                  router.push("/settings#workspaces");
                  closeMobileNav();
                  return;
                }

                setActiveProjectId(projectId);
                setIsSwitchingProject(true);
                await fetch("/api/cloud/active-project", {
                  method: "POST",
                  headers: {
                    "content-type": "application/json",
                  },
                  body: JSON.stringify({ projectId }),
                });
                if (accessToken) {
                  await reloadSidebarData(accessToken);
                }
                router.refresh();
                if (pathname.startsWith("/traces/")) {
                  router.push("/traces");
                }
                setIsSwitchingProject(false);
                closeMobileNav();
              }}
            >
              <SelectTrigger className="h-11 !border-0 bg-transparent px-0 text-sidebar-foreground shadow-none ring-0 ring-offset-0 hover:bg-transparent focus:ring-0 focus:ring-offset-0">
                <SelectValue placeholder="Choose project" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate">{project.name}</span>
                      <span className="rounded-full border px-1.5 py-0 text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
                        {project.account_role === "owner" ? "Personal" : "Shared"}
                      </span>
                    </div>
                  </SelectItem>
                ))}
                <SelectSeparator />
                <SelectItem value="__new_workspace__">
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center text-emerald-500">
                    <Plus className="h-4 w-4" />
                  </span>
                  <SelectItemText>New workspace</SelectItemText>
                  <SelectItemIndicator />
                </SelectItem>
                <SelectItem value="__manage_workspaces__">
                  <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center text-muted-foreground">
                    <Settings className="h-4 w-4" />
                  </span>
                  <SelectItemText>Manage account workspaces</SelectItemText>
                  <SelectItemIndicator />
                </SelectItem>
              </SelectContent>
            </Select>
          ) : (
            <div className="px-2 py-2 text-sm font-medium">
              {projects[0]?.name ?? "Workspace"}
            </div>
          )}
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-4">
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
                    ? "bg-white/8 text-white shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground",
                )}
                onClick={closeMobileNav}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="mt-6 border-t border-sidebar-border pt-4">
          <Link
            href={docsHref}
            className={cn(
              "flex items-center gap-3 rounded-2xl px-4 py-3 text-sm transition-colors",
              !docsIsExternal && pathname === "/docs"
                ? "bg-white/8 text-white shadow-sm"
                : "text-sidebar-foreground/70 hover:bg-white/5 hover:text-sidebar-foreground",
            )}
            target="_blank"
            rel="noreferrer"
            onClick={closeMobileNav}
          >
            <BookOpen className="h-4 w-4" />
            <span>Docs</span>
          </Link>
        </div>
        {sessionExpired ? (
          <p className="px-4 pt-3 text-xs text-amber-700 dark:text-amber-300">
            Session expired. Refresh to resume project updates.
          </p>
        ) : null}
      </nav>
      <div className="mt-auto border-t border-sidebar-border bg-sidebar-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-sidebar-background/85">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left transition-colors hover:bg-sidebar-accent/80">
              <Avatar className="h-9 w-9">
                <AvatarImage src={user.user_metadata.avatar_url as string | undefined} />
                <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{getUserLabel(user.email)}</div>
                <div className="truncate text-xs text-muted-foreground">{user.email}</div>
              </div>
              <EllipsisVertical className="h-4 w-4 text-muted-foreground" />
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
                setTheme(theme === "dark" ? "light" : "dark");
              }}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              {theme === "dark" ? "Switch to light" : "Switch to dark"}
            </DropdownMenuItem>
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
      </div>
      <Dialog open={newWorkspaceOpen} onOpenChange={setNewWorkspaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new workspace</DialogTitle>
            <DialogDescription>
              Add another workspace to this account and switch into it right away.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Marketing agent workspace"
              disabled={isCreatingWorkspace}
              onKeyDown={(event) => {
                if (event.key === "Enter" && workspaceName.trim() && !isCreatingWorkspace) {
                  event.preventDefault();
                  void (async () => {
                    try {
                      setIsCreatingWorkspace(true);
                      const result = await createCloudWorkspace(workspaceName.trim());
                      await fetch("/api/cloud/active-project", {
                        method: "POST",
                        headers: {
                          "content-type": "application/json",
                        },
                        body: JSON.stringify({ projectId: result.project.id }),
                      });
                      if (accessToken) {
                        await reloadSidebarData(accessToken);
                      }
                      setWorkspaceName("");
                      setNewWorkspaceOpen(false);
                      router.push("/workspace");
                      router.refresh();
                      closeMobileNav();
                      toast.success(`Workspace created: ${result.project.name}`);
                    } catch (error) {
                      toast.error(error instanceof Error ? error.message : "Could not create workspace");
                    } finally {
                      setIsCreatingWorkspace(false);
                    }
                  })();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewWorkspaceOpen(false)}
              disabled={isCreatingWorkspace}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!workspaceName.trim() || isCreatingWorkspace}
              onClick={async () => {
                try {
                  setIsCreatingWorkspace(true);
                  const result = await createCloudWorkspace(workspaceName.trim());
                  await fetch("/api/cloud/active-project", {
                    method: "POST",
                    headers: {
                      "content-type": "application/json",
                    },
                    body: JSON.stringify({ projectId: result.project.id }),
                  });
                  if (accessToken) {
                    await reloadSidebarData(accessToken);
                  }
                  setWorkspaceName("");
                  setNewWorkspaceOpen(false);
                  router.push("/workspace");
                  router.refresh();
                  closeMobileNav();
                  toast.success(`Workspace created: ${result.project.name}`);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Could not create workspace");
                } finally {
                  setIsCreatingWorkspace(false);
                }
              }}
            >
              {isCreatingWorkspace ? "Creating..." : "Create workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={upgradeOpen} onOpenChange={setUpgradeOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upgrade to create more workspaces</DialogTitle>
            <DialogDescription>
              Free includes one workspace. Upgrade to Pro or Scale to add more and keep billing in this account.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Pro</div>
                  <div className="text-sm text-muted-foreground">Multiple workspaces, longer retention, email support.</div>
                </div>
                <div className="text-sm font-medium">$29/mo</div>
              </div>
              <Button
                type="button"
                className="mt-4 w-full"
                disabled={checkoutPlan !== null}
                onClick={async () => {
                  try {
                    setCheckoutPlan("pro");
                    const result = await createPlanCheckout("pro");
                    window.location.href = result.url;
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not open Pro checkout");
                    setCheckoutPlan(null);
                  }
                }}
              >
                {checkoutPlan === "pro" ? "Opening checkout..." : "Choose Pro"}
              </Button>
            </div>
            <div className="rounded-2xl border p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="font-medium">Scale</div>
                  <div className="text-sm text-muted-foreground">Higher volume, 1-year retention, priority support.</div>
                </div>
                <div className="text-sm font-medium">$99/mo</div>
              </div>
              <Button
                type="button"
                variant="outline"
                className="mt-4 w-full"
                disabled={checkoutPlan !== null}
                onClick={async () => {
                  try {
                    setCheckoutPlan("scale");
                    const result = await createPlanCheckout("scale");
                    window.location.href = result.url;
                  } catch (error) {
                    toast.error(error instanceof Error ? error.message : "Could not open Scale checkout");
                    setCheckoutPlan(null);
                  }
                }}
              >
                {checkoutPlan === "scale" ? "Opening checkout..." : "Choose Scale"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </aside>
  );
}
