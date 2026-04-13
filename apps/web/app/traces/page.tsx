import { Badge } from "@/components/ui/badge";
import { getTraces } from "../lib/api";
import { redirectToBootstrap, requireCloudProject } from "../lib/require-cloud-project";
import { TraceListClient } from "./trace-list-client";

type TracesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TracesPage({ searchParams }: TracesPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const initialMode = typeof params?.mode === "string" ? params.mode : null;
  await requireCloudProject("/traces");
  const data = await getTraces().catch(() => redirectToBootstrap("/traces"));
  const failingCount = data.traces.filter((trace) => trace.status === "error" || trace.mast_failures.length > 0).length;

  return (
    <div className="space-y-6 px-6 py-8 lg:px-8">
      <section className="rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,hsl(var(--destructive))/0.1,transparent_26%),radial-gradient(circle_at_top_right,hsl(var(--chart-1))/0.12,transparent_30%),hsl(var(--card))] p-8 shadow-sm">
        <Badge variant="outline">Incident queue</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Open the run that matters first</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Rifft surfaces the traces most likely to explain the failure you care about now, then lets
          you drop straight into the graph, handoff, and replay path.
        </p>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Failure badges use the{" "}
          <span className="font-medium text-foreground">UC Berkeley MAST taxonomy</span>
          {" "}— hover any badge to see what the failure mode means and how to fix it.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant={failingCount > 0 ? "destructive" : "secondary"}>
            {failingCount} needing attention
          </Badge>
          <Badge variant="outline">{data.total} total traces</Badge>
          {initialMode ? (
            <Badge variant="outline">
              Filtered: {initialMode.replaceAll("_", " ")}
            </Badge>
          ) : null}
        </div>
      </section>
      <TraceListClient traces={data.traces} initialMode={initialMode} />
    </div>
  );
}