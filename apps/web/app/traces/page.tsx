import { Badge } from "@/components/ui/badge";
import { getTraces } from "../lib/api";
import { getMastMeta } from "@/lib/mast";
import { requireCloudProject } from "../lib/require-cloud-project";
import { TraceListClient } from "./trace-list-client";
import { formatDuration } from "@/lib/utils";

type TracesPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function TracesPage({ searchParams }: TracesPageProps) {
  const params = searchParams ? await searchParams : undefined;
  const initialMode = typeof params?.mode === "string" ? params.mode : null;
  await requireCloudProject("/traces");
  const data = await getTraces();
  const failingCount = data.traces.filter((trace) => trace.status === "error" || trace.mast_failures.length > 0).length;
  const frameworks = [...new Set(data.traces.flatMap((trace) => trace.framework))];
  const slowestRunMs = data.traces.reduce((max, trace) => Math.max(max, trace.duration_ms), 0);

  return (
    <div className="traces-console">
      <div className="traces-console-frame">
        <div className="tc-classbar">
          <span>RIFFT // OPERATOR CONSOLE // INCIDENT QUEUE</span>
        </div>
        <div className="tc-tickbar">
          <div className="tc-ticks">
            <span><span className="tc-dot" /><span className="tc-key">PROJECT</span> <span className="tc-val">ACTIVE</span></span>
            <span><span className="tc-key">INGEST</span> <span className="tc-val">LIVE</span></span>
            <span><span className="tc-key">WINDOW</span> <span className="tc-val">24H</span></span>
          </div>
          <div className="tc-ticks">
            <span><span className="tc-key">QUEUE</span> <span className={failingCount > 0 ? "tc-val fail" : "tc-val"}>{failingCount} NEED ATTENTION</span></span>
            <span><span className="tc-key">TRACES</span> <span className="tc-val">{data.total}</span></span>
          </div>
        </div>
        <div className="tc-section-head">
          <div className="lhs">
            <span className="num">TRACES</span>
            <span className="sep">/</span>
            <span className="title">Incident queue</span>
          </div>
          <div className="rhs">SORTED BY PRIORITY · ROOT-CAUSE FIRST</div>
        </div>

        <section className="tc-hero">
          <div className="tc-hero-inner space-y-4">
            <Badge variant="outline">Incident queue</Badge>
            <div>
              <h1 className="text-4xl leading-none lg:text-5xl">Open the run that matters first</h1>
              <p className="tc-lead mt-3">
                Failure badges use the <b>UC Berkeley MAST taxonomy</b> — hover any badge to see what the failure mode means and how to fix it. Runs are ranked by fatal failures, error status, and agent count.
              </p>
            </div>
            <div className="tc-stat-row">
              <span className={`tc-chip ${failingCount > 0 ? "alert" : ""}`}>
                <strong>{failingCount}</strong> needing attention
              </span>
              <span className="tc-chip"><strong>{data.total}</strong> total traces</span>
              <span className="tc-chip"><strong>{frameworks.length}</strong> frameworks</span>
              <span className="tc-chip"><strong>{formatDuration(slowestRunMs)}</strong> slowest run</span>
              {initialMode ? (
                <span className="tc-chip">
                  Filtered: <strong>{getMastMeta(initialMode).label}</strong>
                </span>
              ) : null}
            </div>
          </div>
        </section>

        <div className="tc-body">
          <TraceListClient traces={data.traces} total={data.total} initialMode={initialMode} />
        </div>
      </div>
    </div>
  );
}
