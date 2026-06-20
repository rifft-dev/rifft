import { Badge } from "@/components/ui/badge";
import { getTraces } from "../lib/api";
import { getMastMeta } from "@/lib/mast";
import { redirectToBootstrap, requireCloudProject } from "../lib/require-cloud-project";
import { TraceListClient } from "./trace-list-client";

type TracesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TracesPage({ searchParams }: TracesPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const initialMode = typeof params?.mode === "string" ? params.mode : null;
  await requireCloudProject("/traces");
  const data = await getTraces();
  const failingCount = data.traces.filter((trace) => trace.status === "error" || trace.mast_failures.length > 0).length;

  return (
    <div className="space-y-6 px-6 py-8 lg:px-8">
      <section className="space-y-4 border-b pb-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-xs uppercase tracking-[0.15em] text-muted-foreground">Traces</span>
            <span className="text-muted-foreground">/</span>
            <span className="font-display text-sm font-medium uppercase tracking-[0.08em]">Incident queue</span>
          </div>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground sm:block">
            Sorted by priority · Root-cause first
          </span>
        </div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl font-medium lg:text-4xl">Open the run that matters first</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Failure badges use the{" "}
              <span className="font-medium text-foreground">UC Berkeley MAST taxonomy</span>
              {" "}— hover any badge to see what the failure mode means and how to fix it.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={failingCount > 0 ? "destructive" : "secondary"}>
            {failingCount} needing attention
          </Badge>
          <Badge variant="outline">{data.total} total traces</Badge>
          {initialMode ? (
            <Badge variant="outline">
              Filtered: {getMastMeta(initialMode).label}
            </Badge>
          ) : null}
        </div>
      </section>
      <TraceListClient traces={data.traces} total={data.total} initialMode={initialMode} />
    </div>
  );
}
