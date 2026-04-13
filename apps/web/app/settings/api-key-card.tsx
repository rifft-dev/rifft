"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const maskApiKey = (value: string) => `${value.slice(0, 6)}...${value.slice(-6)}`;

export function ApiKeyCard({
  apiKey,
  projectId,
  canRotate,
}: {
  apiKey: string | null;
  projectId: string;
  canRotate: boolean;
}) {
  const [revealed, setRevealed] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const router = useRouter();
  const displayValue = apiKey ? (revealed ? apiKey : maskApiKey(apiKey)) : "Owner access required";

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          type={revealed ? "text" : "password"}
          readOnly
          value={displayValue}
          className="font-mono"
        />
        <Button
          variant="outline"
          type="button"
          disabled={!apiKey}
          onClick={async () => {
            if (!apiKey) {
              return;
            }
            await navigator.clipboard.writeText(apiKey);
            toast.success("API key copied");
          }}
        >
          <Copy className="h-4 w-4" />
          Copy
        </Button>
        <Button
          variant="outline"
          type="button"
          disabled={isRegenerating || !canRotate}
          onClick={async () => {
            try {
              setIsRegenerating(true);
              const response = await fetch(`/api/projects/${projectId}?action=regenerate-api-key`, {
                method: "POST",
              });
              if (!response.ok) {
                const data = (await response.json().catch(() => ({}))) as { error?: string };
                throw new Error(
                  data.error === "forbidden"
                    ? "Only project owners can rotate hosted ingest keys."
                    : "Could not regenerate API key",
                );
              }

              toast.success("API key regenerated");
              router.refresh();
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not regenerate API key");
            } finally {
              setIsRegenerating(false);
            }
          }}
        >
          <RefreshCcw className="h-4 w-4" />
          {isRegenerating ? "Regenerating..." : "Regenerate"}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          type="button"
          disabled={!apiKey}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed ? "Hide key" : "Reveal key"}
        </Button>
        <span className="text-sm text-muted-foreground">
          {apiKey
            ? "This key authenticates hosted ingest for the active project."
            : "Only project owners can reveal or rotate hosted ingest keys."}
        </span>
      </div>
    </div>
  );
}
