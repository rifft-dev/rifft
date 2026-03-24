import Link from "next/link";
import { ArrowRight, Settings, Workflow } from "lucide-react";
import { RifftLogo } from "@/components/rifft-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

const focusAreas = [
  "Cross-agent trace ingestion",
  "Communication graph debugging",
  "Timeline + agent drilldowns",
  "MAST failure classification",
];

export default function HomePage() {
  return (
    <div className="space-y-8 px-6 py-8 lg:px-8">
      <section className="rounded-3xl border bg-card p-8 shadow-sm">
        <div className="max-w-4xl space-y-5">
          <h1 className="max-w-3xl text-4xl font-semibold tracking-tight lg:text-6xl">
            Debug where multi-agent systems actually break.
          </h1>
          <p className="max-w-2xl text-lg text-muted-foreground">
            Rifft is a self-hosted debugger for multi-agent AI systems. It focuses on
            failure origin, decision context, and cross-agent cascades across frameworks.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/traces">
                Open traces
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/settings">Open settings</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-4">
        {focusAreas.map((item) => (
          <Card key={item}>
            <CardHeader>
              <CardTitle className="text-base">{item}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Workflow className="h-4 w-4" />
              Trace explorer
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Browse live traces, failures, and agent communication flows from the running stack.</p>
            <Button asChild variant="outline">
              <Link href="/traces">Inspect traces</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Project settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Inspect thresholds, retention, and API key details for the current project.</p>
            <Button asChild variant="outline">
              <Link href="/settings">Project settings</Link>
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>API endpoint</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Web expects the API at</p>
            <code className="mt-3 block rounded-lg border bg-muted px-3 py-2 font-mono text-xs">
              {apiUrl}
            </code>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
