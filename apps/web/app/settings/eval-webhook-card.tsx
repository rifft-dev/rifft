"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Webhook } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { updateEvalWebhookUrl } from "../lib/client-api";

export function EvalWebhookCard({
  projectId,
  initialWebhookUrl,
  canManage,
}: {
  projectId: string;
  initialWebhookUrl: string | null;
  canManage: boolean;
}) {
  const [url, setUrl] = useState(initialWebhookUrl ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSave = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateEvalWebhookUrl(projectId, url.trim() || null);
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch {
        setError("Could not save webhook URL.");
      }
    });
  };

  const handleClear = () => {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateEvalWebhookUrl(projectId, null);
        setUrl("");
        setSaved(true);
        setTimeout(() => setSaved(false), 3000);
      } catch {
        setError("Could not clear webhook URL.");
      }
    });
  };

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <CardTitle className="font-display flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em] text-muted-foreground">
          <Webhook className="h-3.5 w-3.5 text-chart-1" />
          Eval CI webhook
          {initialWebhookUrl ? (
            <Badge variant="secondary" className="ml-1 text-[10px]">Active</Badge>
          ) : null}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          When a CI eval gate returns a <code className="rounded bg-muted px-1 py-0.5 text-xs font-mono">fail</code> verdict,
          Rifft posts the result as JSON to this URL — so your team is notified immediately
          without anyone needing to run a deploy first.
        </p>
        <div className="flex gap-2">
          <Input
            placeholder="https://hooks.slack.com/services/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={!canManage || pending}
            className="font-mono text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
          />
          <Button
            onClick={handleSave}
            disabled={!canManage || pending || url === (initialWebhookUrl ?? "")}
            size="sm"
          >
            {saved ? <CheckCircle2 className="h-4 w-4 text-chart-1" /> : "Save"}
          </Button>
          {url && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleClear}
              disabled={!canManage || pending}
            >
              Clear
            </Button>
          )}
        </div>
        {error ? (
          <p className="text-xs text-destructive">{error}</p>
        ) : null}
        {!canManage ? (
          <p className="text-xs text-muted-foreground">
            Only workspace owners can configure the eval webhook.
          </p>
        ) : null}
        <div className="rounded-2xl border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
          <div className="font-display font-medium uppercase tracking-[0.08em] text-foreground">Payload shape</div>
          <pre className="mt-2 overflow-x-auto leading-relaxed">{`{
  "event": "eval.fail",
  "dataset_id": "...",
  "dataset_name": "...",
  "verdict": "fail",
  "total": 10,
  "pass": 7,
  "fail": 3,
  "unlabelled": 0,
  "labelled_pass_rate": 0.7,
  "thresholds": { "min_pass_rate": 1.0, ... },
  "timestamp": "2026-06-19T..."
}`}</pre>
        </div>
      </CardContent>
    </Card>
  );
}
