import Link from "next/link";
import { notFound } from "next/navigation";
import { Database, Plus } from "lucide-react";
import { listEvalDatasets } from "../lib/api";
import { requireCloudProject } from "../lib/require-cloud-project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatasetsClient } from "./datasets-client";

export default async function DatasetsPage() {
  await requireCloudProject("/datasets");
  const datasets = await listEvalDatasets();

  return (
    <div className="space-y-6 px-6 py-8 lg:px-8">
      <section className="rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-1))/0.1,transparent_26%),hsl(var(--card))] p-8 shadow-sm">
        <Badge variant="outline" className="font-display text-[10px] uppercase tracking-[0.12em]">Eval datasets</Badge>
        <h1 className="font-display mt-4 text-4xl font-medium">Regression baselines</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Save traces to named datasets. After fixing a failure, re-run the same inputs and compare
          outcomes across the whole set to confirm the fix held.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Badge variant="outline">{datasets.length} dataset{datasets.length === 1 ? "" : "s"}</Badge>
          <Badge variant="outline">
            {datasets.reduce((sum, d) => sum + d.entry_count, 0)} traces saved
          </Badge>
        </div>
      </section>

      <DatasetsClient datasets={datasets} />
    </div>
  );
}
