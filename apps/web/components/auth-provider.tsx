"use client";

import type { PropsWithChildren } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  activeProjectCookieName,
  clearCookieValue,
  planIntentCookieName,
  setCookieValue,
} from "@/lib/project-cookie";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase";

type AuthContextValue = {
  isConfigured: boolean;
  isLoading: boolean;
  session: Session | null;
  user: User | null;
  accessToken: string | null;
  signInWithGitHub: (nextPath?: string, plan?: string | null) => Promise<void>;
  signInWithMagicLink: (email: string, nextPath?: string, plan?: string | null) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const syncServerSessionCookie = async (accessToken: string | null) => {
  await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({ accessToken }),
  });
};

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsLoading(false);
      return;
    }

    const client = getSupabaseBrowserClient();

    void client.auth.getSession().then(({ data }) => {
      setSession(data.session ?? null);
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setIsLoading(false);
      void syncServerSessionCookie(nextSession?.access_token ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    void syncServerSessionCookie(session?.access_token ?? null);
  }, [session]);

  const value = useMemo<AuthContextValue>(
    () => ({
      isConfigured: isSupabaseConfigured,
      isLoading,
      session,
      user: session?.user ?? null,
      accessToken: session?.access_token ?? null,
      async signInWithGitHub(nextPath, plan) {
        const client = getSupabaseBrowserClient();
        const redirectUrl = new URL("/auth", window.location.origin);
        if (nextPath) {
          redirectUrl.searchParams.set("next", nextPath);
        }
        if (plan) {
          redirectUrl.searchParams.set("plan", plan);
          setCookieValue(planIntentCookieName, plan);
        }

        const { error } = await client.auth.signInWithOAuth({
          provider: "github",
          options: {
            redirectTo: redirectUrl.toString(),
          },
        });

        if (error) {
          throw error;
        }
      },
      async signInWithMagicLink(email, nextPath, plan) {
        const client = getSupabaseBrowserClient();
        const redirectUrl = new URL("/auth", window.location.origin);
        if (nextPath) {
          redirectUrl.searchParams.set("next", nextPath);
        }
        if (plan) {
          redirectUrl.searchParams.set("plan", plan);
          setCookieValue(planIntentCookieName, plan);
        }

        const { error } = await client.auth.signInWithOtp({
          email,
          options: {
            emailRedirectTo: redirectUrl.toString(),
          },
        });

        if (error) {
          throw error;
        }
      },
      async signOut() {
        if (!isSupabaseConfigured) {
          return;
        }

        const client = getSupabaseBrowserClient();
        const { error } = await client.auth.signOut();
        if (error) {
          throw error;
        }

        await syncServerSessionCookie(null);
        clearCookieValue(activeProjectCookieName);
        clearCookieValue(planIntentCookieName);
      },
    }),
    [isLoading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }

  return context;
}
