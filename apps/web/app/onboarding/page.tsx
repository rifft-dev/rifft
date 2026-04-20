import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getProjectSettings, getTraces } from "../lib/api";
import { redirectToBootstrap, requireCloudProject } from "../lib/require-cloud-project";
import { FirstTraceOnboarding } from "./first-trace-onboarding";
import { planIntentCookieName } from "@/lib/project-cookie";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default async function OnboardingPage() {
  await requireCloudProject("/onboarding");
  const [project, traces] = await Promise.all([getProjectSettings(), getTraces()]);
  const ingestUrl = process.env.NEXT_PUBLIC_INGEST_URL ?? "https://ingest.rifft.dev";
  const planIntent = (await cookies()).get(planIntentCookieName)?.value ?? null;
  const onboardingStartedAt = new Date().toISOString();

  if (!project.permissions.can_rotate_api_keys) {
    return (
      <div className="space-y-8 px-6 py-8 lg:px-8">
        <section className="rounded-[2rem] border bg-card p-8 shadow-sm">
          <div className="max-w-3xl space-y-5">
            <Badge variant="outline">Onboarding</Badge>
            <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">
              This workspace is already being set up by an owner.
            </h1>
            <p className="text-lg text-muted-foreground">
              You have access to the traces and incident workflow here, but only workspace owners can
              copy API credentials or connect a new SDK.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button asChild>
                <Link href="/traces">Open traces</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/settings">View workspace settings</Link>
              </Button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (traces.traces[0]?.trace_id) {
    redirect(`/traces/${traces.traces[0].trace_id}`);
  }

  return (
    <FirstTraceOnboarding
      project={project}
      ingestUrl={ingestUrl}
      onboardingStartedAt={onboardingStartedAt}
      preferredPlan={planIntent === "pro" ? "pro" : null}
    />
  );
}
