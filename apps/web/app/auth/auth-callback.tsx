"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

const syncServerSessionCookie = async (accessToken: string | null) => {
  await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ accessToken }),
  });
};

export function AuthCallback({
  code,
  nextPath,
}: {
  code: string | null;
  nextPath: string;
}) {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setError("Supabase auth is not configured.");
      return;
    }

    if (!code) {
      setError("Missing GitHub callback code.");
      return;
    }

    let cancelled = false;

    void (async () => {
      const client = getSupabaseBrowserClient();
      const { error: exchangeError } = await client.auth.exchangeCodeForSession(code);

      if (cancelled) {
        return;
      }

      if (exchangeError) {
        const { data } = await client.auth.getSession();
        if (!cancelled && data.session) {
          await syncServerSessionCookie(data.session.access_token);
          window.location.replace(nextPath);
          return;
        }

        setError(exchangeError.message);
        return;
      }

      const { data } = await client.auth.getSession();
      await syncServerSessionCookie(data.session?.access_token ?? null);
      window.location.replace(nextPath);
    })();

    return () => {
      cancelled = true;
    };
  }, [code, nextPath]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="space-y-2">
              <h1 className="text-base font-semibold">Couldn&apos;t finish sign-in</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Link className="text-sm font-medium text-foreground underline underline-offset-4" href={`/?next=${encodeURIComponent(nextPath)}`}>
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-3 text-center">
        <div className="text-lg font-semibold">Signing you in…</div>
        <p className="text-sm text-muted-foreground">
          Rifft is finishing your GitHub sign-in and getting your workspace ready.
        </p>
      </div>
    </div>
  );
}
