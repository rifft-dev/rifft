"use client";

import { useState } from "react";
import { Copy, Download, FileText, Link as LinkIcon } from "lucide-react";
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
  projectId: string;
  report: string;
};

export function ShareIncidentReport({ traceId, projectId, report }: Props) {
  const [open, setOpen] = useState(false);
  const [isCopyingLink, setIsCopyingLink] = useState(false);

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

  const copyPublicLink = async () => {
    setIsCopyingLink(true);
    try {
      const response = await fetch(
        `/api/projects/${projectId}/traces/${traceId}/share`,
        { method: "POST" },
      );
      if (!response.ok) {
        toast.error("Could not create a public link. Try again.");
        return;
      }
      const { url } = (await response.json()) as { token: string; url: string };
      await navigator.clipboard.writeText(url);
      toast.success("Public link copied to clipboard.");
    } catch {
      toast.error("Could not create a public link. Try again.");
    } finally {
      setIsCopyingLink(false);
    }
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
            fix outside Rifft. Use the public link to share a read-only view anyone can open without
            logging in.
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
            <Button variant="outline" onClick={copyPublicLink} disabled={isCopyingLink}>
              <LinkIcon className="h-4 w-4" />
              {isCopyingLink ? "Generating…" : "Copy public link"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
