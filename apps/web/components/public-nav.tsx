"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/docs", label: "Docs" },
];

export function PublicNav({
  badge,
  className,
}: {
  badge?: string;
  className?: string;
}) {
  const pathname = usePathname();

  return (
    <div
      className={cn(
        "mx-auto flex w-full max-w-7xl items-center justify-between gap-4 rounded-2xl border border-border/70 bg-background/95 px-4 py-3 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/85",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {badge ? <Badge variant="outline">{badge}</Badge> : null}
        <Link href="/" className="text-sm font-semibold tracking-tight text-foreground">
          Rifft
        </Link>
      </div>

      <nav className="flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 p-1">
        {navItems.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "rounded-full px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-background hover:text-foreground",
                isActive && "bg-background text-foreground shadow-sm",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
