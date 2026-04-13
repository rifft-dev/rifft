import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getProjectSettings, getTraces } from "../lib/api";
import { redirectToBootstrap, requireCloudProject } from "../lib/require-cloud-project";
import { FirstTraceOnboarding } from "./first-trace-onboarding";
import { planIntentCookieName } from "@/lib/project-cookie";

export default async function OnboardingPage() {
  await requireCloudProject("/onboarding");
  const [project, traces] = await Promise.all([getProjectSettings(), getTraces()]).catch(() =>
    redirectToBootstrap("/onboarding"),
  );
  const ingestUrl = process.env.NEXT_PUBLIC_INGEST_URL ?? "https://ingest.rifft.dev";
  const planIntent = (await cookies()).get(planIntentCookieName)?.value ?? null;
  const onboardingStartedAt = new Date().toISOString();

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
