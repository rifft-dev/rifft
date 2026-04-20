"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bell, Mail, MessageSquareWarning } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { ProjectAlerts } from "../lib/api-types";

const formatTimestamp = (value: string | null) => {
  if (!value) {
    return "Never";
  }

  return new Date(value).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const getChannelBadge = ({
  configured,
  lastError,
  lastTestedAt,
  lastAlertAt,
}: {
  configured: boolean;
  lastError: string | null;
  lastTestedAt: string | null;
  lastAlertAt: string | null;
}) => {
  if (!configured) {
    return { label: "Not configured", variant: "outline" as const };
  }
  if (lastError) {
    return { label: "Failing", variant: "destructive" as const };
  }
  if (lastTestedAt || lastAlertAt) {
    return { label: "Active", variant: "default" as const };
  }
  return { label: "Configured", variant: "outline" as const };
};

const getSaveErrorMessage = (error?: string) => {
  switch (error) {
    case "forbidden":
      return "Only workspace owners can change alert settings.";
    case "alerting_requires_paid_plan":
      return "Slack and email alerts are available on Cloud Pro and Scale.";
    case "alert_destination_required":
      return "Add at least one Slack webhook or alert email before enabling fatal failure alerts.";
    default:
      return "Could not save alert settings.";
  }
};

const getTestErrorMessage = (error?: string) => {
  switch (error) {
    case "forbidden":
      return "Only workspace owners can send test alerts.";
    case "alerting_requires_paid_plan":
      return "Slack and email alerts are available on Cloud Pro and Scale.";
    case "alert_destination_required":
      return "Add a destination for this channel first.";
    case "email_provider_not_configured":
      return "Email alerts are not configured on the server yet.";
    case "alert_test_failed":
      return "Rifft could not deliver the test alert right now.";
    default:
      return "Could not send test alert.";
  }
};

export function AlertsCard({
  projectId,
  alerts,
  canManage,
}: {
  projectId: string;
  alerts: ProjectAlerts;
  canManage: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSaving, setIsSaving] = useState(false);
  const [testingChannel, setTestingChannel] = useState<"slack" | "email" | null>(null);
  const [fatalFailuresEnabled, setFatalFailuresEnabled] = useState(alerts.fatal_failures_enabled);
  const [slackWebhookUrl, setSlackWebhookUrl] = useState("");
  const [email, setEmail] = useState(alerts.email.target ?? "");
  const [clearSlack, setClearSlack] = useState(false);
  const [clearEmail, setClearEmail] = useState(false);

  const slackBadge = useMemo(
    () =>
      getChannelBadge({
        configured: alerts.slack.configured && !clearSlack,
        lastError: alerts.slack.last_error,
        lastTestedAt: alerts.slack.last_tested_at,
        lastAlertAt: alerts.slack.last_alert_at,
      }),
    [alerts.slack, clearSlack],
  );
  const emailBadge = useMemo(
    () =>
      getChannelBadge({
        configured: alerts.email.configured && !clearEmail && Boolean(email.trim()),
        lastError: alerts.email.last_error,
        lastTestedAt: alerts.email.last_tested_at,
        lastAlertAt: alerts.email.last_alert_at,
      }),
    [alerts.email, clearEmail, email],
  );

  const saveAlerts = async () => {
    try {
      setIsSaving(true);
      const response = await fetch(`/api/projects/${projectId}/alerts`, {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          fatal_failures_enabled: fatalFailuresEnabled,
          slack_webhook_url: clearSlack ? null : slackWebhookUrl.trim() || undefined,
          alert_email: clearEmail ? null : email.trim() || null,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        toast.error(getSaveErrorMessage(data.error));
        return;
      }

      toast.success("Alert settings updated.");
      setSlackWebhookUrl("");
      setClearSlack(false);
      setClearEmail(false);
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setIsSaving(false);
    }
  };

  const sendTest = async (channel: "slack" | "email") => {
    try {
      setTestingChannel(channel);
      const response = await fetch(`/api/projects/${projectId}/alerts/test`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          channel,
          slack_webhook_url: channel === "slack" ? slackWebhookUrl.trim() || undefined : undefined,
          alert_email: channel === "email" ? (clearEmail ? null : email.trim() || undefined) : undefined,
        }),
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        toast.error(getTestErrorMessage(data.error));
        return;
      }

      toast.success(channel === "slack" ? "Slack test alert sent." : "Test email sent.");
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setTestingChannel(null);
    }
  };

  return (
    <Card className="rounded-3xl">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle>Alerts</CardTitle>
            <CardDescription>
              Send fatal failure alerts to Slack or email the moment something breaks.
            </CardDescription>
          </div>
          <Badge variant={alerts.available ? "default" : "outline"}>
            {alerts.available ? "Pro and Scale" : "Upgrade required"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {!alerts.available ? (
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-muted-foreground">
            Slack and email alerts are available on Cloud Pro and Scale. Upgrade this account to
            turn production failures into proactive notifications.
          </div>
        ) : null}

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <MessageSquareWarning className="h-4 w-4" />
                <div className="font-medium">Slack webhook</div>
              </div>
              <p className="text-sm text-muted-foreground">
                Post fatal failure alerts into a Slack channel.
              </p>
            </div>
            <Badge variant={slackBadge.variant}>{slackBadge.label}</Badge>
          </div>
          {alerts.slack.configured && !clearSlack ? (
            <div className="rounded-xl bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              Current destination: {alerts.slack.target}
            </div>
          ) : null}
          <Input
            type="url"
            disabled={!alerts.available || !canManage}
            placeholder={
              alerts.slack.configured && !clearSlack
                ? "Paste a new Slack webhook URL to replace the current one"
                : "https://hooks.slack.com/services/..."
            }
            value={slackWebhookUrl}
            onChange={(event) => {
              setSlackWebhookUrl(event.target.value);
              if (clearSlack) {
                setClearSlack(false);
              }
            }}
          />
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Last test: {formatTimestamp(alerts.slack.last_tested_at)}</span>
            <span>Last alert: {formatTimestamp(alerts.slack.last_alert_at)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!alerts.available || !canManage || testingChannel !== null}
              onClick={() => void sendTest("slack")}
            >
              {testingChannel === "slack" ? "Sending test..." : "Test Slack alert"}
            </Button>
            {alerts.slack.configured ? (
              <Button
                type="button"
                variant="ghost"
                disabled={!alerts.available || !canManage || isSaving}
                onClick={() => {
                  setSlackWebhookUrl("");
                  setClearSlack(true);
                }}
              >
                Clear Slack
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-4 rounded-2xl border p-4">
          <div className="flex items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4" />
                <div className="font-medium">Alert email</div>
              </div>
              <p className="text-sm text-muted-foreground">
                Send a compact incident email with root cause and trace link.
              </p>
            </div>
            <Badge variant={emailBadge.variant}>{emailBadge.label}</Badge>
          </div>
          <Input
            type="email"
            disabled={!alerts.available || !canManage}
            placeholder="oncall@company.com"
            value={clearEmail ? "" : email}
            onChange={(event) => {
              setEmail(event.target.value);
              if (clearEmail) {
                setClearEmail(false);
              }
            }}
          />
          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>Last test: {formatTimestamp(alerts.email.last_tested_at)}</span>
            <span>Last alert: {formatTimestamp(alerts.email.last_alert_at)}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={!alerts.available || !canManage || testingChannel !== null}
              onClick={() => void sendTest("email")}
            >
              {testingChannel === "email" ? "Sending test..." : "Send test email"}
            </Button>
            {alerts.email.configured ? (
              <Button
                type="button"
                variant="ghost"
                disabled={!alerts.available || !canManage || isSaving}
                onClick={() => {
                  setEmail("");
                  setClearEmail(true);
                }}
              >
                Clear email
              </Button>
            ) : null}
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border p-4">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <div className="font-medium">When to notify</div>
          </div>
          <label className="flex items-start gap-3 rounded-xl border bg-muted/20 px-3 py-3">
            <input
              type="checkbox"
              className="mt-1 h-4 w-4"
              checked={fatalFailuresEnabled}
              disabled={!alerts.available || !canManage}
              onChange={(event) => setFatalFailuresEnabled(event.target.checked)}
            />
            <div className="space-y-1">
              <div className="text-sm font-medium">Fatal failures</div>
              <p className="text-sm text-muted-foreground">
                Send immediately when a trace includes a fatal failure, with the root cause summary
                and a direct trace link.
              </p>
            </div>
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            disabled={!canManage || !alerts.available || isSaving || isPending}
            onClick={() => void saveAlerts()}
          >
            {isSaving || isPending ? "Saving..." : "Save alerts"}
          </Button>
          {!canManage ? (
            <span className="text-sm text-muted-foreground">
              Only workspace owners can change alert destinations.
            </span>
          ) : null}
        </div>

        <Separator />

        <div className="space-y-3">
          <div className="font-medium">Recent delivery</div>
          {alerts.recent_deliveries.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No test alerts or fatal failure alerts have been sent yet.
            </p>
          ) : (
            <div className="space-y-2">
              {alerts.recent_deliveries.slice(0, 3).map((delivery) => (
                <div
                  key={delivery.id}
                  className="flex flex-col gap-2 rounded-2xl border px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={delivery.status === "failed" ? "destructive" : "outline"}>
                        {delivery.status === "failed" ? "Failed" : "Sent"}
                      </Badge>
                      <span className="font-medium">
                        {delivery.channel === "slack" ? "Slack" : "Email"} ·{" "}
                        {delivery.event_type === "test" ? "Test alert" : "Fatal failure"}
                      </span>
                    </div>
                    <div className="text-muted-foreground">
                      {delivery.target ? `${delivery.target} · ` : ""}
                      {formatTimestamp(delivery.created_at)}
                    </div>
                    {delivery.trace_id ? (
                      <a className="text-primary underline-offset-4 hover:underline" href={`/traces/${delivery.trace_id}`}>
                        Open trace
                      </a>
                    ) : null}
                    {delivery.error ? <div className="text-destructive">{delivery.error}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
