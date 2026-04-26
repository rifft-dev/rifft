"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

// Ensure redirects stay on this origin — prevents open-redirect attacks via ?next=.
const toSafePath = (path: string): string => {
  if (path.startsWith("/") && !path.startsWith("//")) return path;
  return "/onboarding";
};

const syncServerSessionCookie = async (accessToken: string | null): Promise<void> => {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ accessToken }),
  });
  if (!response.ok) {
    throw new Error(`Session sync failed (${response.status})`);
  }
};

export function AuthCallback({
  code,
  nextPath,
}: {
  code: string | null;
  nextPath: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [timedOut, setTimedOut] = useState(false);
  const safePath = toSafePath(nextPath);

  // If nothing has happened after 15 s, stop waiting and let the user retry.
  useEffect(() => {
    if (error) return;
    const timer = setTimeout(() => setTimedOut(true), 15_000);
    return () => clearTimeout(timer);
  }, [error]);

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

      if (cancelled) return;

      if (exchangeError) {
        // OAuth codes are single-use. If exchange fails, check whether the
        // browser already holds a valid session from a prior exchange of this
        // same code (e.g. a StrictMode double-invoke or a page refresh).
        // Only proceed if a session exists; otherwise surface the real error.
        const { data } = await client.auth.getSession();
        if (!cancelled && data.session) {
          try {
            await syncServerSessionCookie(data.session.access_token);
            window.location.replace(safePath);
          } catch {
            setError("Sign-in succeeded but we couldn't save your session. Please try again.");
          }
          return;
        }

        setError(exchangeError.message);
        return;
      }

      const { data } = await client.auth.getSession();
      try {
        await syncServerSessionCookie(data.session?.access_token ?? null);
        window.location.replace(safePath);
      } catch {
        setError("Sign-in succeeded but we couldn't save your session. Please try again.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code, safePath]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
            <div className="space-y-2">
              <h1 className="text-base font-semibold">Couldn&apos;t finish sign-in</h1>
              <p className="text-sm text-muted-foreground">{error}</p>
              <Link className="text-sm font-medium text-foreground underline underline-offset-4" href={`/?next=${encodeURIComponent(safePath)}`}>
                Back to sign in
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (timedOut) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-amber-500" />
            <div className="space-y-2">
              <h1 className="text-base font-semibold">This is taking longer than expected</h1>
              <p className="text-sm text-muted-foreground">
                Sign-in is still in progress but hasn&apos;t completed. This is usually a temporary
                network issue.
              </p>
              <Link
                className="text-sm font-medium text-foreground underline underline-offset-4"
                href={`/?next=${encodeURIComponent(safePath)}`}
              >
                Go back and try again
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
