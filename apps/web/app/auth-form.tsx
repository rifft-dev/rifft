"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { clearCookieValue, planIntentCookieName, setCookieValue } from "@/lib/project-cookie";

export function AuthForm({
  nextPath,
  planIntent,
}: {
  nextPath: string;
  planIntent: string | null;
}) {
  const { isConfigured, signInWithGitHub, signInWithMagicLink, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (planIntent) {
      setCookieValue(planIntentCookieName, planIntent);
      return;
    }

    clearCookieValue(planIntentCookieName);
  }, [planIntent]);

  useEffect(() => {
    if (user) {
      router.replace(nextPath);
    }
  }, [user, nextPath, router]);

  const setupVars = useMemo(
    () => ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"],
    [],
  );

  return (
    <div className="w-full max-w-[48rem] space-y-8">
      <div className="space-y-5">

        <h1 className="max-w-[12ch] text-[3rem] font-semibold leading-[1.03] tracking-[-0.025em] text-balance sm:text-[3.15rem] lg:text-[3.35rem]">
          <span className="italic">Which agent</span> broke your pipeline?
          <br />
         Rifft tells you in seconds.
        </h1>
        <p className="max-w-[48ch] text-[17px] leading-7 text-muted-foreground">
          When a multi-agent pipeline breaks, finding which agent caused it means reading logs across every handoff — while your pipeline keeps running and your costs keep climbing. Rifft shows you the causal chain, classifies the failure, and lets you fix it without restarting.
        </p>
      </div>

      {!isConfigured ? (
        <div className="space-y-3 rounded-[18px] border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="text-sm font-medium text-amber-950 dark:text-amber-100">
            Supabase auth is not configured yet
          </div>
          <p className="text-sm text-muted-foreground">
            Add these env vars in `apps/web` and your deployment environment before testing cloud
            sign-in.
          </p>
          <ul className="space-y-2 text-xs font-mono text-muted-foreground">
            {setupVars.map((variable) => (
              <li key={variable}>{variable}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-[18px] border border-border/80 bg-card px-5 py-5 shadow-lg shadow-black/10">
        <div className="space-y-4">
          <Button
            className="h-12 w-full rounded-xl bg-white text-black hover:bg-white/90"
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
            <svg viewBox="0 0 16 16" className="h-4 w-4 fill-current" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8a8 8 0 0 0 5.47 7.59c.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
            </svg>
            Continue with GitHub
          </Button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs uppercase tracking-[0.18em] text-muted-foreground">
              <span className="bg-card px-3">or</span>
            </div>
          </div>

          <form
            className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
            onSubmit={async (event) => {
              event.preventDefault();
              if (!email) {
                toast.error("Enter an email address first");
                return;
              }

              try {
                setIsSubmitting(true);
                await signInWithMagicLink(email, nextPath, planIntent);
                toast.success("Magic link sent, check email");
                setEmail("");
              } catch (error) {
                toast.error(error instanceof Error ? error.message : "Magic link sign-in failed");
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <Input
              id="email"
              autoComplete="email"
              placeholder="you@company.com"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="h-12 rounded-xl border-border bg-background"
            />
            <Button
              className="h-12 rounded-xl px-5"
              type="submit"
              variant="outline"
              disabled={!isConfigured || isSubmitting}
            >
              Get magic link
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            By continuing, you acknowledge Rifft&apos;s{" "}
            <a href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Privacy Policy
            </a>{" "}
            and{" "}
            <a href="/terms" className="underline underline-offset-2 hover:text-foreground transition-colors">
              Terms. 
            </a>
            .
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-emerald-300">
        <CheckCircle2 className="h-4 w-4" />
        Free — no credit card, 50k spans/mo.
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-[18px] border border-border/70 bg-card/70 p-4">
          <div className="font-mono text-[2.35rem] leading-none tracking-[-0.04em] text-foreground">
            14.2k
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            traces debugged
          </div>
        </div>
        <div className="rounded-[18px] border border-border/70 bg-card/70 p-4">
          <div className="font-mono text-[2.35rem] leading-none tracking-[-0.04em] text-foreground">
            800+
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            teams
          </div>
        </div>
        <div className="rounded-[18px] border border-border/70 bg-card/70 p-4">
          <div className="font-mono text-[2.35rem] leading-none tracking-[-0.04em] text-foreground">
            2 min
          </div>
          <div className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            median time to root cause
          </div>
        </div>
      </div>
    </div>
  );
}
