import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { getProjectSettings } from "../lib/api";
import { ApiKeyCard } from "./api-key-card";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const project = await getProjectSettings();

  return (
    <div className="space-y-6 px-6 py-8 lg:px-8">
      <section className="rounded-3xl border bg-card p-8 shadow-sm">
        <Badge variant="outline">Project settings</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">{project.name}</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Thresholds, retention, API key details, and adapter quickstart for the active project.
        </p>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Retention</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{project.retention_days} days</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Cost threshold</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">${project.cost_threshold_usd.toFixed(4)}</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Timeout threshold</CardTitle></CardHeader><CardContent className="text-2xl font-semibold">{project.timeout_threshold_ms}ms</CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm text-muted-foreground">Project ID</CardTitle></CardHeader><CardContent className="font-mono text-sm">{project.id}</CardContent></Card>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <Card>
          <CardHeader>
            <CardTitle>API key</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ApiKeyCard apiKey={project.api_key} />
            <Separator />
            <div className="space-y-3">
              <h3 className="font-medium">Update thresholds</h3>
              <SettingsForm
                projectId={project.id}
                retentionDays={project.retention_days}
                costThresholdUsd={project.cost_threshold_usd}
                timeoutThresholdMs={project.timeout_threshold_ms}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Adapter quickstart</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Start with the CrewAI adapter from the current self-hosted stack.
            </p>
            <pre className="rounded-xl border bg-muted/40 p-4 text-xs font-mono">
{`import rifft
import rifft.adapters.crewai

rifft.init(project_id="${project.id}", endpoint="http://localhost:4318")
`}
            </pre>
            <div className="grid gap-3">
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="text-sm font-medium">Recommended next install</div>
                <div className="mt-1 font-mono text-xs text-muted-foreground">
                  pip install rifft rifft-crewai
                </div>
              </div>
              <div className="rounded-xl border bg-muted/30 p-3">
                <div className="text-sm font-medium">Phase 1 focus</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  Finish CrewAI and AutoGen adapter validation before pushing further into cloud features.
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
