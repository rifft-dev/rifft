"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { RifftLogo } from "@/components/rifft-logo";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/", label: "Home" },
  { href: "/blog", label: "Blog" },
  { href: "/docs", label: "Docs" },
];

export function PublicNav({
  className,
  items = navItems,
}: {
  badge?: string;
  className?: string;
  items?: Array<{ href: string; label: string }>;
}) {
  const pathname = usePathname();
  const isHomePage = pathname === "/";

  return (
    <div className={cn("flex w-full items-center justify-between gap-6", className)}>
      <Link href="/" className="text-foreground">
        <RifftLogo className="h-7 w-auto" />
      </Link>

      <nav className="flex flex-wrap items-center justify-end gap-4 text-sm sm:gap-6 md:gap-8">
        {items.map((item) => {
          const isActive =
            item.href === "/" ? pathname === "/" : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const opensInNewTab = item.href === "/docs";

          return (
            <Link
              key={item.href}
              href={item.href}
              target={opensInNewTab ? "_blank" : undefined}
              rel={opensInNewTab ? "noreferrer" : undefined}
              className={cn(
                "transition-colors hover:text-foreground",
                isActive
                  ? isHomePage
                    ? "text-white hover:text-white/90"
                    : "text-foreground"
                  : "text-muted-foreground",
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
