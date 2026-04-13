"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle2, Crown, Link as LinkIcon, LogIn } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { RifftLogo } from "@/components/rifft-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { clearCookieValue, planIntentCookieName, setCookieValue } from "@/lib/project-cookie";

export default function AuthPage() {
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/onboarding";
  const planIntent = searchParams.get("plan");
  const isProPath = planIntent === "pro";
  const { isConfigured, signInWithGitHub, signInWithMagicLink } = useAuth();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (planIntent) {
      setCookieValue(planIntentCookieName, planIntent);
      return;
    }

    clearCookieValue(planIntentCookieName);
  }, [planIntent]);

  const setupVars = useMemo(
    () => ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    [],
  );

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-16">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_35%),radial-gradient(circle_at_bottom,rgba(16,185,129,0.08),transparent_30%)]" />
      <div className="relative grid w-full max-w-5xl gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <section className="space-y-6 rounded-[2rem] border bg-card/85 p-8 shadow-sm backdrop-blur">
          <RifftLogo className="text-foreground" />
          <div className="space-y-4">
            <div className="inline-flex rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
              Rifft Cloud preview
            </div>
            {isProPath ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                <Crown className="h-3.5 w-3.5" />
                You&apos;re starting on the Pro path
              </div>
            ) : null}
            <h1 className="max-w-xl text-4xl font-semibold tracking-tight lg:text-5xl">
              Sign in to the hosted debugger.
            </h1>
            <p className="max-w-2xl text-base text-muted-foreground lg:text-lg">
              Choose GitHub or a magic link and get into your hosted project fast. The goal here is
              simple: sign in, send one trace, and see the failure story immediately.
            </p>
          </div>
          <div className="space-y-4 rounded-[1.75rem] border bg-muted/20 p-5">
            <div className="text-sm font-medium">What happens next</div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border bg-background/65 p-4">
                <div className="text-sm font-medium">1. Sign in</div>
                <div className="mt-1 text-sm text-muted-foreground">GitHub or a magic link</div>
              </div>
              <div className="rounded-2xl border bg-background/65 p-4">
                <div className="text-sm font-medium">2. Copy your key</div>
                <div className="mt-1 text-sm text-muted-foreground">Project credentials are ready immediately</div>
              </div>
              <div className="rounded-2xl border bg-background/65 p-4">
                <div className="text-sm font-medium">3. Watch a trace appear</div>
                <div className="mt-1 text-sm text-muted-foreground">Rifft listens for your first run live</div>
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-300" />
              Self-hosted stays free forever if you want full control later.
            </div>
          </div>
        </section>

        <Card className="border-border/70 shadow-lg">
          <CardHeader className="space-y-3">
            <CardTitle className="text-2xl">Sign in</CardTitle>
            <p className="text-sm text-muted-foreground">
              GitHub is the fastest path. Magic link keeps it passwordless if you just want to try
              the product.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            {!isConfigured ? (
              <div className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
                <div className="text-sm font-medium text-amber-950 dark:text-amber-100">
                  Supabase auth is not configured yet
                </div>
                <p className="text-sm text-muted-foreground">
                  Add these env vars in `apps/web` and your deployment environment before testing
                  cloud sign-in.
                </p>
                <ul className="space-y-2 text-xs font-mono text-muted-foreground">
                  {setupVars.map((variable) => (
                    <li key={variable}>{variable}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <Button
              className="w-full"
              size="lg"
              disabled={!isConfigured || isSubmitting}
              onClick={async () => {
                try {
                  setIsSubmitting(true);
                  await signInWithGitHub(nextPath, planIntent);
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "GitHub sign-in failed");
                  setIsSubmitting(false);
                }
              }}
            >
              <LogIn className="h-4 w-4" />
              Sign in with GitHub
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-card px-2 text-muted-foreground">or</span>
              </div>
            </div>

            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                if (!email) {
                  toast.error("Enter an email address first");
                  return;
                }

                try {
                  setIsSubmitting(true);
                  await signInWithMagicLink(email, nextPath, planIntent);
                  toast.success("Magic link sent");
                  setEmail("");
                } catch (error) {
                  toast.error(error instanceof Error ? error.message : "Magic link sign-in failed");
                } finally {
                  setIsSubmitting(false);
                }
              }}
            >
              <div className="space-y-2">
                <label className="text-sm font-medium" htmlFor="email">
                  Work email
                </label>
                <Input
                  id="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </div>
              <Button className="w-full" size="lg" type="submit" variant="outline" disabled={!isConfigured || isSubmitting}>
                <LinkIcon className="h-4 w-4" />
                Send magic link
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
