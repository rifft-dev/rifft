"use client";

import { useState } from "react";
import { CreditCard } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

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
            throw new Error(
              data.error === "forbidden"
                ? "Only the billing owner can manage this subscription."
                : (data.error ?? "Could not open billing portal"),
            );
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
