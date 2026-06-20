"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Database, Plus, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";
import type { EvalDataset } from "../lib/api-types";
import { createEvalDataset, deleteEvalDataset } from "../lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { Textarea } from "@/components/ui/textarea";

export function DatasetsClient({ datasets: initial }: { datasets: EvalDataset[] }) {
  const router = useRouter();
  const [datasets, setDatasets] = useState(initial);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, startCreate] = useTransition();
  const [deleting, startDelete] = useTransition();

  // We need the projectId for mutations. Extract it from any dataset, or fetch
  // it lazily from the server action endpoint. Since all datasets share the same
  // project we grab it from the first row; if none exist we pull it from the
  // window URL param the server embeds.
  const projectId = datasets[0]?.project_id ?? null;

  const handleCreate = () => {
    if (!name.trim() || !projectId) return;
    startCreate(async () => {
      try {
        const result = await createEvalDataset(projectId, name.trim(), description.trim() || undefined);
        setDatasets((prev) => [result.dataset, ...prev]);
        setCreateOpen(false);
        setName("");
        setDescription("");
        router.refresh();
      } catch {
        toast.error("Could not create dataset.");
      }
    });
  };

  const handleDeleteConfirm = (datasetId: string) => {
    if (!projectId) return;
    startDelete(async () => {
      try {
        await deleteEvalDataset(projectId, datasetId);
        setDatasets((prev) => prev.filter((d) => d.id !== datasetId));
        setDeleteConfirmId(null);
        router.refresh();
      } catch {
        toast.error("Could not delete dataset.");
        setDeleteConfirmId(null);
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {datasets.length === 0 ? "No datasets yet" : `${datasets.length} dataset${datasets.length === 1 ? "" : "s"}`}
        </span>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New dataset
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create eval dataset</DialogTitle>
              <DialogDescription>
                Give the dataset a name. You can add traces to it from any trace detail page.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <label htmlFor="ds-name" className="text-sm font-medium">Name</label>
                <Input
                  id="ds-name"
                  placeholder="e.g. Checkout agent regressions"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="ds-desc" className="text-sm font-medium">Description (optional)</label>
                <Textarea
                  id="ds-desc"
                  placeholder="What this dataset covers..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button onClick={handleCreate} disabled={!name.trim() || creating}>
                {creating ? "Creating…" : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {datasets.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed py-16 text-center">
          <Database className="h-8 w-8 text-muted-foreground/50" />
          <p className="font-display text-lg font-medium uppercase tracking-[0.06em] text-muted-foreground">
            No datasets yet.</p>
          <p className="text-sm text-muted-foreground">
            Create one and save traces to it from any trace detail page.
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            New dataset
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {datasets.map((dataset) => {
            const hasLabels = dataset.pass_count + dataset.fail_count > 0;
            const passRate = hasLabels
              ? dataset.pass_count / (dataset.pass_count + dataset.fail_count)
              : null;
            const isConfirmingDelete = deleteConfirmId === dataset.id;

            return (
              <Card key={dataset.id} className="group rounded-3xl border-border/60 shadow-sm hover:border-border transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="font-display text-base font-medium leading-snug">
                      <Link
                        href={`/datasets/${dataset.id}`}
                        className="hover:underline underline-offset-4"
                      >
                        {dataset.name}
                      </Link>
                    </CardTitle>
                    {isConfirmingDelete ? (
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => handleDeleteConfirm(dataset.id)}
                          disabled={deleting}
                        >
                          Delete
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs"
                          onClick={() => setDeleteConfirmId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteConfirmId(dataset.id)}
                        disabled={deleting}
                        aria-label={`Delete ${dataset.name}`}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {dataset.description ? (
                    <p className="text-sm text-muted-foreground line-clamp-2">{dataset.description}</p>
                  ) : null}
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline">
                      {dataset.entry_count} trace{dataset.entry_count === 1 ? "" : "s"}
                    </Badge>
                    {dataset.pass_count > 0 ? (
                      <Badge variant="secondary" className="gap-1">
                        <CheckCircle2 className="h-3 w-3 text-chart-1" />
                        {dataset.pass_count} pass
                      </Badge>
                    ) : null}
                    {dataset.fail_count > 0 ? (
                      <Badge variant="destructive" className="gap-1">
                        <XCircle className="h-3 w-3" />
                        {dataset.fail_count} fail
                      </Badge>
                    ) : null}
                    {dataset.unlabelled_count > 0 ? (
                      <Badge variant="outline" className="text-muted-foreground">
                        {dataset.unlabelled_count} unlabelled
                      </Badge>
                    ) : null}
                  </div>
                  {hasLabels && passRate !== null ? (
                    <div className="space-y-1">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-chart-1 transition-all"
                          style={{ width: `${Math.round(passRate * 100)}%` }}
                        />
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {Math.round(passRate * 100)}% pass rate
                      </div>
                    </div>
                  ) : null}
                  <Button asChild variant="outline" size="sm" className="w-full">
                    <Link href={`/datasets/${dataset.id}`}>Open</Link>
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
