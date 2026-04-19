"use client";

import { useState } from "react";
import { Crown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const PLANS = {
  pro: {
    name: "Cloud Pro",
    price: "$29/month",
    planKey: "pro",
    features: [
      "500K spans/month",
      "90-day retention",
      "Fork mode",
      "Unlimited team members",
      "Email support",
    ],
  },
  scale: {
    name: "Cloud Scale",
    price: "$99/month",
    planKey: "scale",
    features: [
      "2M spans/month",
      "1-year retention",
      "Everything in Pro",
      "Priority support",
    ],
  },
} as const;

type PlanKey = keyof typeof PLANS;

export function UpgradeButton({
  accountId,
  userEmail,
  canManage,
}: {
  accountId: string;
  userEmail: string | null;
  canManage: boolean;
}) {
  const [selected, setSelected] = useState<PlanKey>("pro");
  const [isLoading, setIsLoading] = useState(false);

  if (!canManage) {
    return (
      <p className="text-sm text-muted-foreground">
        Only the billing owner can upgrade this account.
      </p>
    );
  }

  const plan = PLANS[selected];

  const handleUpgrade = async () => {
    if (!accountId) {
      toast.error("Billing is not configured for this account yet.");
      return;
    }

    try {
      setIsLoading(true);
      const response = await fetch("/api/cloud/pro-checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ planKey: plan.planKey }),
      });

      const data = (await response.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "Could not create Stripe checkout");
      }

      window.location.href = data.url;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open Stripe checkout");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {(Object.entries(PLANS) as [PlanKey, (typeof PLANS)[PlanKey]][]).map(([key, candidate]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSelected(key)}
            className={`rounded-2xl border p-4 text-left transition-colors ${
              selected === key
                ? "border-primary ring-1 ring-primary bg-primary/5"
                : "border-border bg-muted/20 hover:bg-muted/30"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                {key === "pro" ? (
                  <div className="mb-1 inline-block rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                    Most popular
                  </div>
                ) : null}
                <div className="text-xs text-muted-foreground">{candidate.name}</div>
                <div className="mt-0.5 text-xl font-semibold">
                  {candidate.price.split("/")[0]}
                  <span className="text-sm font-normal text-muted-foreground">/month</span>
                </div>
              </div>
              <div
                className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected === key ? "border-primary" : "border-border"
                }`}
              >
                {selected === key ? <div className="h-2 w-2 rounded-full bg-primary" /> : null}
              </div>
            </div>
            <ul className="mt-3 space-y-1">
              {candidate.features.map((feature) => (
                <li key={feature} className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <svg className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6l2.5 2.5L10 3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </button>
        ))}
      </div>
      <Button className="w-full gap-2" disabled={isLoading} onClick={handleUpgrade}>
        <Crown className="h-4 w-4" />
        {isLoading ? "Opening checkout..." : `Upgrade to ${plan.name} — ${plan.price}`}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Billed monthly · Cancel any time · Secured by Stripe
      </p>
    </div>
  );
}
