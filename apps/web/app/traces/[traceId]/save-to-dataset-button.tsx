"use client";

import { useState, useTransition, useEffect } from "react";
import { BookmarkPlus, Check, ChevronDown, Plus } from "lucide-react";
import type { EvalDataset } from "../../lib/api-types";
import { addTraceToDataset, createEvalDataset } from "../../lib/client-api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";

type Props = {
  traceId: string;
  projectId: string;
};

export function SaveToDatasetButton({ traceId, projectId }: Props) {
  const [datasets, setDatasets] = useState<EvalDataset[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saved, setSaved] = useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [label, setLabel] = useState<"pass" | "fail" | undefined>(undefined);
  const [pending, start] = useTransition();

  // Lazy-load datasets when the button is first interacted with
  const loadDatasets = async () => {
    if (loaded) return;
    try {
      const res = await fetch(`/api/projects/${projectId}/eval-datasets`, {
        credentials: "include",
        cache: "no-store",
      });
      if (res.ok) {
        const data = (await res.json()) as { datasets: EvalDataset[] };
        setDatasets(data.datasets);
      }
    } finally {
      setLoaded(true);
    }
  };

  const handleSaveToExisting = (datasetId: string) => {
    start(async () => {
      try {
        await addTraceToDataset(projectId, datasetId, traceId, label);
        setSaved((prev) => new Set([...prev, datasetId]));
      } catch { /* ignore */ }
    });
  };

  const handleCreateAndSave = () => {
    if (!newName.trim()) return;
    start(async () => {
      try {
        const result = await createEvalDataset(projectId, newName.trim());
        const newDataset = result.dataset;
        await addTraceToDataset(projectId, newDataset.id, traceId, label);
        setDatasets((prev) => [newDataset, ...prev]);
        setSaved((prev) => new Set([...prev, newDataset.id]));
        setCreateOpen(false);
        setNewName("");
      } catch { /* ignore */ }
    });
  };

  const savedCount = saved.size;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" onClick={loadDatasets}>
            <BookmarkPlus className="h-4 w-4" />
            Save to dataset
            {savedCount > 0 ? (
              <Badge variant="secondary" className="ml-1 h-4 px-1 text-[10px]">
                {savedCount}
              </Badge>
            ) : null}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <div className="px-2 py-1.5">
            <p className="text-xs font-medium text-muted-foreground">Label for this trace</p>
            <div className="mt-1.5 flex gap-1.5">
              {(["pass", "fail"] as const).map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => setLabel((prev) => (prev === l ? undefined : l))}
                  className={`rounded-lg border px-2.5 py-1 text-xs transition-colors ${
                    label === l
                      ? l === "pass"
                        ? "border-green-500 bg-green-500/10 text-green-600"
                        : "border-destructive bg-destructive/10 text-destructive"
                      : "border-border text-muted-foreground hover:border-border/80"
                  }`}
                >
                  {l}
                </button>
              ))}
              {label ? (
                <button
                  type="button"
                  onClick={() => setLabel(undefined)}
                  className="rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:border-border/80"
                >
                  clear
                </button>
              ) : null}
            </div>
          </div>
          <DropdownMenuSeparator />
          {!loaded ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">Loading…</div>
          ) : datasets.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">No datasets yet</div>
          ) : (
            datasets.map((ds) => (
              <DropdownMenuItem
                key={ds.id}
                onClick={() => handleSaveToExisting(ds.id)}
                disabled={pending}
                className="justify-between gap-2"
              >
                <span className="truncate">{ds.name}</span>
                {saved.has(ds.id) ? (
                  <Check className="h-3.5 w-3.5 shrink-0 text-green-500" />
                ) : (
                  <span className="text-xs text-muted-foreground shrink-0">
                    {ds.entry_count} trace{ds.entry_count === 1 ? "" : "s"}
                  </span>
                )}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => { setCreateOpen(true); }} className="gap-2">
            <Plus className="h-3.5 w-3.5" />
            New dataset
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create dataset and save trace</DialogTitle>
            <DialogDescription>
              Give the dataset a name. This trace will be added immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <label htmlFor="new-ds-name" className="text-sm font-medium">Dataset name</label>
              <Input
                id="new-ds-name"
                placeholder="e.g. Checkout agent regressions"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleCreateAndSave(); }}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreateAndSave} disabled={!newName.trim() || pending}>
              {pending ? "Saving…" : "Create and save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
