"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Clock, Loader2, RefreshCcw, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Member = {
  user_id: string | null;
  user_email: string | null;
  role: "owner" | "member";
  status: "active" | "pending";
};

export function InviteMemberCard({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [email, setEmail] = useState("");
  const [isInviting, setIsInviting] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadMembers = async () => {
    setIsLoading(true);
    setLoadError(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/members`, {
        cache: "no-store",
      });
      if (response.ok) {
        const data = (await response.json()) as { members: Member[] };
        setMembers(data.members ?? []);
      } else {
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadMembers();
  }, [projectId]);

  const invite = async () => {
    if (!email.trim()) {
      toast.error("Enter an email address first.");
      return;
    }

    try {
      setIsInviting(true);
      const response = await fetch(`/api/projects/${projectId}/members`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role: "member" }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(
          data.error === "forbidden"
            ? "Only project owners can invite members."
            : data.error === "already_member"
              ? "That person is already a member of this project."
              : data.error === "cannot_invite_self"
                ? "You can't invite yourself — you're already the owner."
                : data.error === "member_limit_reached"
                  ? "Free plan includes 1 additional member. Upgrade to Pro for unlimited members."
                  : "Could not send the invitation.",
        );
      }

      const data = (await response.json()) as { pending?: boolean };
      if (data.pending) {
        toast.success(`Invite saved for ${email.trim()}. They'll get access as soon as they sign up.`);
      } else {
        toast.success(`${email.trim()} has been added to the project.`);
      }

      setEmail("");
      await loadMembers();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not send the invitation.");
    } finally {
      setIsInviting(false);
    }
  };

  const remove = async (member: Member) => {
    const identifier = member.user_email ?? member.user_id ?? "member";

    try {
      setRemovingId(member.user_id ?? member.user_email ?? "");

      if (member.status === "pending") {
        const response = await fetch(`/api/projects/${projectId}/members`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ pending_email: member.user_email }),
        });
        if (!response.ok) {
          throw new Error("Could not cancel this invitation.");
        }
        toast.success(`Invitation to ${identifier} cancelled.`);
      } else {
        const response = await fetch(`/api/projects/${projectId}/members`, {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ user_id: member.user_id }),
        });
        if (!response.ok) {
          const data = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            data.error === "forbidden"
              ? "Only project owners can remove members."
              : data.error === "cannot_remove_owner"
                ? "The project owner cannot be removed."
                : "Could not remove this member.",
          );
        }
        toast.success(`Removed ${identifier} from the project.`);
      }

      await loadMembers();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not complete this action.");
    } finally {
      setRemovingId(null);
    }
  };

  return (
    <div className="space-y-4">
      {canManage ? (
        <div className="flex gap-2">
          <Input
            type="email"
            placeholder="colleague@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void invite();
              }
            }}
            disabled={isInviting}
          />
          <Button
            type="button"
            variant="outline"
            disabled={isInviting || !email.trim()}
            onClick={() => void invite()}
          >
            {isInviting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <UserPlus className="h-4 w-4" />
            )}
            {isInviting ? "Inviting…" : "Invite"}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          Only project owners can invite or remove members.
        </p>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Loading members…
        </div>
      ) : loadError ? (
        <div className="flex items-center justify-between rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 text-destructive" />
            Couldn't load the member list.
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void loadMembers()}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Retry
          </Button>
        </div>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No other members yet. Invite someone to give them access to this project's traces.
        </p>
      ) : (
        <div className="space-y-2">
          {members.map((member, index) => {
            const key = member.user_id ?? member.user_email ?? `member-${index}`;
            const displayName = member.user_email ?? member.user_id ?? "Unknown";
            const removeKey = member.user_id ?? member.user_email ?? "";
            return (
              <div
                key={key}
                className="flex items-center justify-between gap-3 rounded-xl border bg-muted/20 px-4 py-3"
              >
                <div className="min-w-0 flex items-center gap-2">
                  {member.status === "pending" ? (
                    <Clock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  ) : null}
                  <div className="truncate text-sm font-medium">{displayName}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {member.status === "pending" ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      pending
                    </Badge>
                  ) : (
                    <Badge variant={member.role === "owner" ? "default" : "outline"}>
                      {member.role}
                    </Badge>
                  )}
                  {canManage && member.role !== "owner" ? (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      disabled={removingId === removeKey}
                      onClick={() => void remove(member)}
                    >
                      {removingId === removeKey ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                      <span className="sr-only">
                        {member.status === "pending" ? "Cancel invitation" : "Remove member"}
                      </span>
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}