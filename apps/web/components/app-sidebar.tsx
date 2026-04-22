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
        "shrink-0 overflow-hidden bg-sidebar-background/96 text-sidebar-foreground backdrop-blur supports-[backdrop-filter]:bg-sidebar-background/90",
        mobile
          ? "flex h-full w-full flex-col"
          : "hidden w-52 border-r border-sidebar-border/80 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col",
      )}
    >
      <div className="border-b border-sidebar-border/70 px-3 py-3">
        <div className="flex items-center gap-2 px-1">
          <div className="flex h-8 w-8 items-center justify-center rounded-2xl border border-sidebar-border/80 bg-background/80 shadow-sm">
            <RifftLogo wordmark={false} className="h-4 w-auto text-foreground" />
          </div>
          <div className="text-[13px] font-medium tracking-[-0.02em] text-foreground">Rifft</div>
        </div>

        <div className="mt-3">
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
                    router.push("/settings");
                    closeMobileNav();
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
              <SelectTrigger className="h-10 rounded-2xl border border-sidebar-border/70 bg-background/60 px-3 text-sidebar-foreground shadow-none ring-0 ring-offset-0 hover:bg-background/80 focus:ring-0 focus:ring-offset-0">
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
            <div className="rounded-2xl border border-sidebar-border/70 bg-background/60 px-3 py-2.5 text-sm font-medium">
              {projects[0]?.name ?? "Workspace"}
            </div>
          )}
        </div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <div className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/45">
          Navigate
        </div>
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors",
                  active
                    ? "bg-zinc-800 text-zinc-100"
                    : "text-sidebar-foreground/68 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                )}
                onClick={closeMobileNav}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0 transition-opacity",
                    active ? "opacity-100" : "opacity-70 group-hover:opacity-100",
                  )}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
        <div className="mt-5 border-t border-sidebar-border/70 pt-3">
          <div className="px-2 pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-sidebar-foreground/45">
            Resources
          </div>
          <Link
            href={docsHref}
            className={cn(
              "group flex items-center gap-3 rounded-xl px-3 py-2 text-[13px] transition-colors",
              !docsIsExternal && pathname === "/docs"
                ? "bg-zinc-800 text-zinc-100"
                : "text-sidebar-foreground/68 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
            )}
            target="_blank"
            rel="noreferrer"
            onClick={closeMobileNav}
          >
            <BookOpen
              className={cn(
                "h-4 w-4 shrink-0 transition-opacity",
                !docsIsExternal && pathname === "/docs" ? "opacity-100" : "opacity-70 group-hover:opacity-100",
              )}
            />
            <span>Docs</span>
          </Link>
        </div>
        {sessionExpired ? (
          <p className="px-3 pt-3 text-xs text-amber-700 dark:text-amber-300">
            Session expired. Refresh to resume project updates.
          </p>
        ) : null}
      </nav>
      <div className="mt-auto border-t border-sidebar-border/70 bg-sidebar-background/95 p-3 backdrop-blur supports-[backdrop-filter]:bg-sidebar-background/85">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left transition-colors hover:bg-sidebar-accent/80">
              <Avatar className="h-8 w-8">
                <AvatarImage src={user.user_metadata.avatar_url as string | undefined} />
                <AvatarFallback>{getInitials(user.email)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium">{getUserLabel(user.email)}</div>
                <div className="truncate text-[11px] text-muted-foreground">{user.email}</div>
              </div>
              <EllipsisVertical className="h-4 w-4 text-muted-foreground/80" />
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
                <div className="text-sm font-medium">$49/mo</div>
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
                <div className="text-sm font-medium">$149/mo</div>
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
