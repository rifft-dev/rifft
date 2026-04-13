import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { accessTokenCookieName } from "@/lib/project-cookie";

const oneWeekInSeconds = 60 * 60 * 24 * 7;

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { accessToken?: string | null }
    | null;
  const accessToken = typeof body?.accessToken === "string" ? body.accessToken : null;
  const cookieStore = await cookies();

  if (!accessToken) {
    cookieStore.delete(accessTokenCookieName);
    return NextResponse.json({ ok: true, cleared: true });
  }

  cookieStore.set(accessTokenCookieName, accessToken, {
    httpOnly: true,
    maxAge: oneWeekInSeconds,
    path: "/",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true });
}

