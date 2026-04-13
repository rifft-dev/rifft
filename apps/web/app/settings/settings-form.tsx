"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SettingsFormProps = {
  projectId: string;
  retentionDays: number;
  costThresholdUsd: number;
  timeoutThresholdMs: number;
  retentionManagedByPlan?: boolean;
  canUpdateSettings?: boolean;
};

export function SettingsForm({
  projectId,
  retentionDays,
  costThresholdUsd,
  timeoutThresholdMs,
  retentionManagedByPlan = false,
  canUpdateSettings = true,
}: SettingsFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);
  const [formState, setFormState] = useState({
    retention_days: retentionDays,
    cost_threshold_usd: costThresholdUsd,
    timeout_threshold_ms: timeoutThresholdMs,
  });

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus(null);

    const response = await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(formState),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      const message =
        data.error === "forbidden"
          ? "Only project owners can change settings."
          : "Could not save settings.";
      setStatus(message);
      toast.error(message);
      return;
    }

    setStatus("Settings updated.");
    toast.success("Settings updated");
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <form className="grid gap-5" onSubmit={handleSubmit}>
      <label className="grid gap-2">
        <span className="text-sm font-medium">Retention days</span>
        <Select
          disabled={retentionManagedByPlan || !canUpdateSettings}
          value={String(formState.retention_days)}
          onValueChange={(value) =>
            setFormState((current) => ({
              ...current,
              retention_days: Number(value),
            }))
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select retention" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 days</SelectItem>
            <SelectItem value="30">30 days</SelectItem>
            <SelectItem value="90">90 days</SelectItem>
            <SelectItem value="3650">Forever</SelectItem>
          </SelectContent>
        </Select>
        {retentionManagedByPlan ? (
          <span className="text-xs text-muted-foreground">
            Retention is managed by your cloud plan.
          </span>
        ) : null}
      </label>

      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="text-sm font-medium">Cost threshold (USD)</span>
          <Input
            type="number"
            min={0}
            step="0.0001"
            disabled={!canUpdateSettings}
            value={formState.cost_threshold_usd}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                cost_threshold_usd: Number(event.target.value),
              }))
            }
          />
        </label>

        <label className="grid gap-2">
          <span className="text-sm font-medium">Timeout threshold (ms)</span>
          <Input
            type="number"
            min={0}
            step="100"
            disabled={!canUpdateSettings}
            value={formState.timeout_threshold_ms}
            onChange={(event) =>
              setFormState((current) => ({
                ...current,
                timeout_threshold_ms: Number(event.target.value),
              }))
            }
          />
        </label>
      </div>

      <div className="flex items-center gap-3">
        <Button disabled={isPending || !canUpdateSettings} type="submit">
          {isPending ? "Saving..." : "Save thresholds"}
        </Button>
        {status ? <span className="text-sm text-muted-foreground">{status}</span> : null}
        {!canUpdateSettings ? (
          <span className="text-sm text-muted-foreground">
            Only project owners can change thresholds.
          </span>
        ) : null}
      </div>
    </form>
  );
}
