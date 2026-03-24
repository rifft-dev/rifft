"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Moon, Settings, Sun, Workflow } from "lucide-react";
import { useTheme } from "next-themes";
import { RifftLogo } from "@/components/rifft-logo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/traces", label: "Traces", icon: Workflow },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { setTheme, theme } = useTheme();

  return (
    <aside className="hidden w-60 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground lg:flex lg:flex-col">
      <div className="border-b border-sidebar-border px-5 py-5">
        <RifftLogo className="text-foreground" />

        <div className="mt-3 rounded-xl border border-sidebar-border bg-sidebar-accent p-3">
          <div className="text-sm font-medium">Default Project</div>
          <div className="mt-1 text-xs text-muted-foreground">Self-hosted debugger stack</div>
        </div>
      </div>
      <nav className="flex-1 px-3 py-4">
        <div className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
      <div className="mt-auto border-t border-sidebar-border p-3">
        <Button
          className="w-full justify-start"
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
