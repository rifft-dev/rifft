import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getEvalDataset } from "../../lib/api";
import { requireCloudProject } from "../../lib/require-cloud-project";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DatasetDetailClient } from "./dataset-detail-client";

export default async function DatasetDetailPage({
  params,
}: {
  params: Promise<{ datasetId: string }>;
}) {
  await requireCloudProject("/datasets");
  const { datasetId } = await params;
  const result = await getEvalDataset(datasetId);
  if (!result) notFound();

  const { dataset, entries } = result;
  const passCount = entries.filter((e) => e.label === "pass").length;
  const failCount = entries.filter((e) => e.label === "fail").length;
  const unlabelledCount = entries.filter((e) => !e.label).length;

  return (
    <div className="space-y-6 px-6 py-8 lg:px-8">
      <Button asChild variant="ghost" size="sm" className="-ml-3">
        <Link href="/datasets">
          <ArrowLeft className="h-4 w-4" />
          All datasets
        </Link>
      </Button>

      <section className="rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-1))/0.1,transparent_26%),hsl(var(--card))] p-8 shadow-sm">
        <Badge variant="outline" className="font-display text-[10px] uppercase tracking-[0.12em]">Eval dataset</Badge>
        <h1 className="font-display mt-4 text-4xl font-medium">{dataset.name}</h1>
        {dataset.description ? (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{dataset.description}</p>
        ) : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Badge variant="outline">{entries.length} trace{entries.length === 1 ? "" : "s"}</Badge>
          {passCount > 0 ? <Badge variant="secondary">{passCount} pass</Badge> : null}
          {failCount > 0 ? <Badge variant="destructive">{failCount} fail</Badge> : null}
          {unlabelledCount > 0 ? (
            <Badge variant="outline">{unlabelledCount} unlabelled</Badge>
          ) : null}
        </div>
      </section>

      <DatasetDetailClient
        dataset={dataset}
        initialEntries={entries}
      />
    </div>
  );
}
