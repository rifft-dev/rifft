"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, LoaderCircle, RotateCw } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { RifftLogo } from "@/components/rifft-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type BootstrapResponse = {
  project: {
    id: string;
    name: string;
  };
};

export default function BootstrapPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { accessToken, user } = useAuth();
  const [status, setStatus] = useState("Preparing your first cloud workspace…");
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasFailed, setHasFailed] = useState(false);
  const [retryNonce, setRetryNonce] = useState(0);
  const nextPath = searchParams.get("next") ?? "/onboarding";

  useEffect(() => {
    if (!user || !accessToken) {
      return;
    }

    let cancelled = false;

    const bootstrap = async () => {
      try {
        if (!cancelled) {
          setHasFailed(false);
          setIsRetrying(true);
          setStatus("Preparing your first cloud workspace…");
        }
        const response = await fetch("/api/cloud/bootstrap", {
          method: "POST",
          headers: {
            authorization: `Bearer ${accessToken}`,
            "content-type": "application/json",
          },
          body: JSON.stringify({}),
        });

        if (!response.ok) {
          throw new Error("Could not create a cloud workspace");
        }

        const data = (await response.json()) as BootstrapResponse;
        if (cancelled) {
          return;
        }

        setStatus(`Workspace ready: ${data.project.name}`);
        setIsRetrying(false);
        router.replace(nextPath);
      } catch (error) {
        if (cancelled) {
          return;
        }

        const message = error instanceof Error ? error.message : "Cloud bootstrap failed";
        setHasFailed(true);
        setIsRetrying(false);
        setStatus(message);
        toast.error(message);
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [accessToken, nextPath, retryNonce, router, user]);

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-16">
      <Card className="w-full max-w-xl shadow-lg">
        <CardHeader className="space-y-4">
          <RifftLogo className="text-foreground" />
          <CardTitle className="text-3xl">Bootstrapping Rifft Cloud</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            {!hasFailed ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
            {status}
          </div>
          <p className="text-sm text-muted-foreground">
            This creates or finds your first hosted project and makes it the active workspace for
            the app.
          </p>
          {hasFailed ? (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-muted-foreground">
              <div className="font-medium text-foreground">Try again first.</div>
              <p className="mt-2">
                This is usually a temporary API, database, or local-env issue. If it keeps failing,
                go back to sign in and restart the local cloud stack before retrying.
              </p>
            </div>
          ) : null}
          {hasFailed ? (
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => {
                  setRetryNonce((value) => value + 1);
                }}
                disabled={isRetrying}
              >
                <RotateCw className="h-4 w-4" />
                Try again
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  router.replace(`/auth?next=${encodeURIComponent(nextPath)}`);
                }}
              >
                <ArrowLeft className="h-4 w-4" />
                Back to sign in
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
