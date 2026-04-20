"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const getBillingPortalErrorMessage = (error?: string) => {
  switch (error) {
    case "forbidden":
      return "Only the billing owner can manage this subscription.";
    case "unauthorized":
      return "Your session expired. Sign in again to manage billing.";
    case "cloud_api_unreachable":
    case "cloud_context_unavailable":
      return "Rifft could not reach the cloud service right now. Please try again in a moment.";
    case "stripe_not_configured":
      return "Billing is not configured for this workspace yet.";
    case "no_stripe_customer":
      return "This workspace does not have a Stripe billing profile yet.";
    case "missing_account_id":
      return "Billing is not configured for this workspace yet.";
    case "portal_unavailable":
    case "missing_portal_url":
      return "Rifft could not open the billing portal right now. Please try again shortly.";
    default:
      return "Could not open billing portal";
  }
};

export function ManageBillingButton() {
  const [isLoading, setIsLoading] = useState(false);

  return (
    <Button
      variant="outline"
      disabled={isLoading}
      onClick={async () => {
        try {
          setIsLoading(true);
          const response = await fetch("/api/cloud/customer-portal", {
            method: "POST",
          });
          const data = (await response.json()) as { url?: string; error?: string };

          if (!response.ok || !data.url) {
            throw new Error(getBillingPortalErrorMessage(data.error));
          }

          window.location.href = data.url;
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Could not open billing portal",
          );
          setIsLoading(false);
        }
      }}
    >
      <CreditCard className="h-4 w-4" />
      {isLoading ? "Opening billing..." : "Manage billing"}
    </Button>
  );
}
