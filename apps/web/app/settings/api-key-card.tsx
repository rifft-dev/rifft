"use client";

import { useState } from "react";
import { Copy, RefreshCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const maskApiKey = (value: string) => `${value.slice(0, 6)}...${value.slice(-6)}`;

export function ApiKeyCard({ apiKey }: { apiKey: string }) {
  const [revealed, setRevealed] = useState(false);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          type={revealed ? "text" : "password"}
          readOnly
          value={revealed ? apiKey : maskApiKey(apiKey)}
          className="font-mono"
        />
        <Button
          variant="outline"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(apiKey);
            toast.success("API key copied");
          }}
        >
          <Copy className="h-4 w-4" />
          Copy
        </Button>
        <Button variant="outline" type="button" onClick={() => toast.info("Regenerate is not wired yet")}>
          <RefreshCcw className="h-4 w-4" />
          Regenerate
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" type="button" onClick={() => setRevealed((current) => !current)}>
          {revealed ? "Hide key" : "Reveal key"}
        </Button>
        <span className="text-sm text-muted-foreground">
          Full key rotation is not wired yet, but copy/reveal is live in the new shell.
        </span>
      </div>
    </div>
  );
}
