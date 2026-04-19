"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function RefreshStatusButton() {
  const router = useRouter();

  return (
    <Button
      variant="outline"
      onClick={() => {
        router.refresh();
      }}
    >
      Refresh status
    </Button>
  );
}
