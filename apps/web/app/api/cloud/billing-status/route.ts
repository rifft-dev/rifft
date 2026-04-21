import { NextResponse } from "next/server";
import { getAccessTokenFromCookies, resolveActiveProject } from "@/lib/cloud-context";

const apiBaseUrl =
  process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

type UsageSummaryResponse = {
  plan: {
    subscription_status: string;
  };
};

export async function GET() {
  const [resolution, accessToken] = await Promise.all([
    resolveActiveProject(),
    getAccessTokenFromCookies(),
  ]);

  if (!accessToken || !resolution.projectId) {
    return NextResponse.json({ subscription_status: null });
  }

  try {
    const res = await fetch(`${apiBaseUrl}/projects/${resolution.projectId}/usage`, {
      cache: "no-store",
      headers: { authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      return NextResponse.json({ subscription_status: null });
    }

    const data = (await res.json()) as UsageSummaryResponse;
    return NextResponse.json({
      subscription_status: data.plan?.subscription_status ?? null,
    });
  } catch {
    return NextResponse.json({ subscription_status: null });
  }
}
