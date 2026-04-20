"use client";

import { useEffect, useState } from "react";

type BillingStatusResponse = {
  subscription_status: string | null;
};

type PortalResponse = {
  url?: string;
  error?: string;
};

const FAILED_STATES = new Set(["past_due", "unpaid"]);

export function PaymentBanner() {
  const [status, setStatus] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/cloud/billing-status", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as BillingStatusResponse;
        setStatus(data.subscription_status ?? null);
      } catch {
        // Non-critical — don't surface fetch errors
      }
    };

    void check();
  }, []);

  const handleUpdatePayment = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (redirecting) return;
    setRedirecting(true);

    try {
      const res = await fetch("/api/cloud/customer-portal", { method: "POST" });
      const data = (await res.json()) as PortalResponse;
      if (data.url) {
        window.location.href = data.url;
      } else {
        setRedirecting(false);
      }
    } catch {
      setRedirecting(false);
    }
  };

  if (!status || !FAILED_STATES.has(status)) return null;

  return (
    <div
      role="alert"
      className="w-full bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-800 px-4 py-2 text-center text-xs text-red-800 dark:text-red-300"
    >
      Your last payment failed — some features may be restricted.{" "}
      <button
        onClick={handleUpdatePayment}
        disabled={redirecting}
        className="font-medium underline underline-offset-2 hover:opacity-80 transition-opacity disabled:opacity-50"
      >
        {redirecting ? "Redirecting…" : "Update payment method →"}
      </button>
    </div>
  );
}
