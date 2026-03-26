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
      toast.error("Could not delete project");
      return;
    }

    toast.success(
      projectId === "default"
        ? "Project cleared and reset to a fresh default workspace"
        : "Project deleted",
    );
    setOpen(false);
    setConfirmation("");
    startTransition(() => {
      router.refresh();
      router.push("/settings");
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive" type="button">
          Delete project
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {projectName}?</DialogTitle>
          <DialogDescription>
            This removes the project, its traces, and any saved fork drafts. Because this app uses a
            single active workspace today, deleting the default project will immediately create a new
            empty default project so the UI can stay usable.
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
            {isPending ? "Deleting..." : "Delete project"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
