import { Badge } from "@/components/ui/badge";
import { getTraces } from "../lib/api";
import { TraceListClient } from "./trace-list-client";

export default async function TracesPage() {
  const data = await getTraces();

  return (
    <div className="space-y-6 px-6 py-8 lg:px-8">
      <section className="rounded-3xl border bg-card p-8 shadow-sm">
        <Badge variant="outline">Trace list</Badge>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight">Live trace explorer</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Browse traces from the running collector with status, cost, failure, and framework context.
        </p>
      </section>
      <TraceListClient traces={data.traces} />
    </div>
  );
}
