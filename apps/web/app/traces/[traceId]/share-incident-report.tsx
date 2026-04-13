"use client";

import { useState } from "react";
import { Copy, Download, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  traceId: string;
  report: string;
};

export function ShareIncidentReport({ traceId, report }: Props) {
  const [open, setOpen] = useState(false);

  const downloadReport = () => {
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `rifft-incident-${traceId}.md`;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    toast.success("Incident report downloaded.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <FileText className="h-4 w-4" />
          Share incident report
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Shareable incident report</DialogTitle>
          <DialogDescription>
            Copy or download this report to share the failure summary, causal chain, and recommended
            fix outside Rifft.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Textarea
            readOnly
            value={report}
            className="min-h-[26rem] font-mono text-xs leading-6"
          />
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={async () => {
                await navigator.clipboard.writeText(report);
                toast.success("Incident report copied.");
              }}
            >
              <Copy className="h-4 w-4" />
              Copy Markdown
            </Button>
            <Button variant="outline" onClick={downloadReport}>
              <Download className="h-4 w-4" />
              Download .md
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
