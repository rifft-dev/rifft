import { redirect } from "next/navigation";
import { AuthCallback } from "./auth-callback";

export default async function AuthPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const next = typeof params.next === "string" ? params.next : "/onboarding";
  const code = typeof params.code === "string" ? params.code : null;
  const redirectParams = new URLSearchParams();

  if (code) {
    return <AuthCallback code={code} nextPath={next} />;
  }

  for (const [key, value] of Object.entries(params)) {
    if (typeof value === "string") {
      redirectParams.set(key, value);
    }
  }

  if (!redirectParams.has("next")) {
    redirectParams.set("next", next);
  }

  redirect(`/?${redirectParams.toString()}`);
}
