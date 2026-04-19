"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { createCloudWorkspace } from "@/app/lib/client-api";
import type { CloudProjectSummary } from "@/app/lib/api-types";
import { Badge } from "@/components/ui/badge";
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
import { DeleteProjectCard } from "./delete-project-card";

type WorkspaceManagerCardProps = {
  workspaces: CloudProjectSummary[];
  currentProjectId: string;
  primaryWorkspaceId: string | null;
  canManage: boolean;
  canCreateWorkspace: boolean;
};

export function WorkspaceManagerCard({
  workspaces,
  currentProjectId,
  primaryWorkspaceId,
  canManage,
  canCreateWorkspace,
}: WorkspaceManagerCardProps) {
  const router = useRouter();
  const [newWorkspaceOpen, setNewWorkspaceOpen] = useState(false);
  const [workspaceName, setWorkspaceName] = useState("");
  const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false);

  const createWorkspace = async () => {
    if (!workspaceName.trim()) {
      return;
    }

    try {
      setIsCreatingWorkspace(true);
      const result = await createCloudWorkspace(workspaceName.trim());
      await fetch("/api/cloud/active-project", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ projectId: result.project.id }),
      });
      setWorkspaceName("");
      setNewWorkspaceOpen(false);
      router.push("/workspace");
      router.refresh();
      toast.success(`Workspace created: ${result.project.name}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create workspace");
    } finally {
      setIsCreatingWorkspace(false);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">
            Manage the workspaces in this account. The main workspace stays visible here, but can't
            be deleted.
          </p>
          <Button
            type="button"
            size="sm"
            className="rounded-full"
            onClick={() => setNewWorkspaceOpen(true)}
            disabled={!canManage || !canCreateWorkspace}
          >
            <Plus className="h-4 w-4" />
            New workspace
          </Button>
        </div>
        {!canManage ? (
          <p className="text-xs text-muted-foreground">
            Only the account owner can create or delete workspaces in this account. Create your own
            workspace to start a separate plan.
          </p>
        ) : !canCreateWorkspace ? (
          <p className="text-xs text-muted-foreground">
            Upgrade to Pro or Scale to create additional workspaces.
          </p>
        ) : null}
        <div className="overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[36rem] text-sm">
            <thead className="bg-muted/40 text-left text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Workspace</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((workspace) => {
                const isPrimaryWorkspace = workspace.id === primaryWorkspaceId;
                const isCurrentWorkspace = workspace.id === currentProjectId;

                return (
                  <tr key={workspace.id} className="border-t first:border-t-0">
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="font-medium">{workspace.name}</div>
                        <Badge variant="outline">
                          {workspace.account_role === "owner" ? "Personal" : "Shared"}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {isCurrentWorkspace ? <Badge variant="outline">Current</Badge> : null}
                        {isPrimaryWorkspace ? <Badge variant="secondary">Main</Badge> : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isPrimaryWorkspace || !canManage ? null : (
                        <DeleteProjectCard projectId={workspace.id} projectName={workspace.name} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={newWorkspaceOpen} onOpenChange={setNewWorkspaceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create new workspace</DialogTitle>
            <DialogDescription>
              Add another workspace to this account and switch into it right away.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              value={workspaceName}
              onChange={(event) => setWorkspaceName(event.target.value)}
              placeholder="Marketing agent workspace"
              disabled={isCreatingWorkspace}
              onKeyDown={(event) => {
                if (event.key === "Enter" && workspaceName.trim() && !isCreatingWorkspace) {
                  event.preventDefault();
                  void createWorkspace();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setNewWorkspaceOpen(false)}
              disabled={isCreatingWorkspace}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={!workspaceName.trim() || isCreatingWorkspace}
              onClick={() => void createWorkspace()}
            >
              {isCreatingWorkspace ? "Creating..." : "Create workspace"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
