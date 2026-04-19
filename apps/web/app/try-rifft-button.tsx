"use client";

import { Button } from "@/components/ui/button";

export function TryRifftButton({
  planKey,
  label = "Try Rifft",
}: {
  planKey: "free" | "pro" | "scale";
  label?: string;
}) {
  return (
    <Button
      type="button"
      className="w-full"
      onClick={() => {
        if (planKey === "free") {
          const emailInput = document.getElementById("email");
          emailInput?.scrollIntoView({ behavior: "smooth", block: "center" });
          window.setTimeout(() => {
            if (emailInput instanceof HTMLInputElement) {
              emailInput.focus();
            }
          }, 250);
          return;
        }

        window.location.href = `/?plan=${planKey}`;
      }}
    >
      {label}
    </Button>
  );
}
