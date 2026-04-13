import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(value);

type TraceToneInput = {
  status: "ok" | "error" | "unset";
  mast_failures: Array<{ severity: "benign" | "fatal"; mode: string }>;
};

export const getTraceToneLabels = (trace: TraceToneInput) => {
  const fatalFailures = trace.mast_failures.filter((f) => f.severity === "fatal").length;

  if (trace.status === "error" || fatalFailures > 0) {
    return {
      label: "Critical incident",
      labelClass: "border-destructive/30 bg-destructive/12 text-destructive",
    };
  }

  if (trace.mast_failures.length > 0) {
    return {
      label: "Watch closely",
      labelClass: "border-amber-500/30 bg-amber-500/12 text-amber-700 dark:text-amber-300",
    };
  }

  return {
    label: "Healthy baseline",
    labelClass: "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  };
};

export const getTraceToneCard = (trace: TraceToneInput) => {
  const fatalFailures = trace.mast_failures.filter((f) => f.severity === "fatal").length;

  if (trace.status === "error" || fatalFailures > 0) {
    return "border-destructive/25 bg-[radial-gradient(circle_at_top_left,hsl(var(--destructive))/0.1,transparent_30%),hsl(var(--card))]";
  }

  if (trace.mast_failures.length > 0) {
    return "border-amber-500/25 bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-4))/0.1,transparent_30%),hsl(var(--card))]";
  }

  return "border-emerald-500/20 bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-2))/0.1,transparent_30%),hsl(var(--card))]";
};