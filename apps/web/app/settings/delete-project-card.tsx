"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
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

type DeleteProjectCardProps = {
  projectId: string;
  projectName: string;
};

export function DeleteProjectCard({ projectId, projectName }: DeleteProjectCardProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [isPending, startTransition] = useTransition();
  const canDelete = confirmation === projectName;

  const handleDelete = async () => {
    const response = await fetch(`/api/projects/${projectId}`, {
      method: "DELETE",
      cache: "no-store",
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      toast.error(
        data.error === "primary_workspace_protected"
          ? "The main workspace can't be deleted."
          : "Could not delete workspace",
      );
      return;
    }

    toast.success(
      "Workspace deleted",
    );
    setOpen(false);
    setConfirmation("");

    const currentProjectResponse = await fetch("/api/cloud/current-project", {
      cache: "no-store",
    });
    const nextProjectId = currentProjectResponse.ok
      ? ((await currentProjectResponse.json()) as { projectId?: string | null }).projectId ?? null
      : null;

    if (nextProjectId) {
      await fetch("/api/cloud/active-project", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ projectId: nextProjectId }),
      }).catch(() => undefined);
    }

    startTransition(() => {
      router.refresh();
      router.push(nextProjectId ? "/workspace" : "/settings");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="destructive"
          size="sm"
          type="button"
          className="h-8 rounded-full px-3 text-xs"
        >
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {projectName}?</DialogTitle>
          <DialogDescription>
            This removes the workspace, its traces, and any saved fork drafts. The main workspace for
            the account is protected and can't be deleted.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2">
          <label className="text-sm font-medium" htmlFor="delete-project-confirmation">
            Type <span className="font-mono">{projectName}</span> to confirm
          </label>
          <Input
            id="delete-project-confirmation"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder={projectName}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            type="button"
            disabled={!canDelete || isPending}
            onClick={handleDelete}
          >
            {isPending ? "Deleting..." : "Delete workspace"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
