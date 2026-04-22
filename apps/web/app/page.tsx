import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PublicNav } from "@/components/public-nav";
import { RifftLogo } from "@/components/rifft-logo";
import { siteDescription, siteName, siteUrl } from "@/lib/seo";
import { statusPageHref } from "@/lib/status";
import { AuthForm } from "./auth-form";
import { TryRifftButton } from "./try-rifft-button";

export const metadata: Metadata = {
  title: "AI Agent Debugger for CrewAI, AutoGen and LangGraph",
  description:
    "Debug multi-agent pipeline failures faster. Rifft traces the root cause, classifies failures with the MAST taxonomy, and lets you fork and replay any handoff - no pipeline restart needed.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: `${siteName} | AI Agent Debugger for CrewAI, AutoGen and LangGraph`,
    description:
      "Debug multi-agent pipeline failures faster. Rifft traces the root cause, classifies failures with the MAST taxonomy, and lets you fork and replay any handoff - no pipeline restart needed.",
    url: siteUrl,
  },
  twitter: {
    title: `${siteName} | AI Agent Debugger for CrewAI, AutoGen and LangGraph`,
    description:
      "Debug multi-agent pipeline failures faster. Rifft traces the root cause, classifies failures with the MAST taxonomy, and lets you fork and replay any handoff - no pipeline restart needed.",
  },
};

const pricingCards = [
  {
    key: "free" as const,
    eyebrow: "Cloud Free",
    title: "Free",
    amount: "$0 / month",
    features: [
      "50K spans/month",
      "14-day retention",
      "Causal graph and MAST classification",
      "One workspace",
    ],
    cta: "Start free",
    featured: false,
  },
  {
    key: "pro" as const,
    eyebrow: "Cloud Pro",
    title: "Pro",
    amount: "$49 / month",
    features: [
      "500K spans/month",
      "90-day retention",
      "Fork mode and replay",
      "Unlimited team members",
      "Unlimited workspaces",
      "Email support",
      "Slack and email alerts",
      "Natural language failure explanations",
    ],
    cta: "Start with Pro",
    featured: true,
  },
  {
    key: "scale" as const,
    eyebrow: "Cloud Scale",
    title: "Scale",
    amount: "$149 / month",
    features: [
      "2M spans/month",
      "1-year retention",
      "Everything in Pro",
      "Automatic regression detection",
      "Priority support",
      "$5 per 100K spans above 2M",
    ],
    cta: "Get started",
    featured: false,
  },
];

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const nextPath = typeof params.next === "string" ? params.next : "/onboarding";
  const planIntent = typeof params.plan === "string" ? params.plan : null;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: siteName,
    applicationCategory: "DeveloperApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description: siteDescription,
    offers: [
      {
        "@type": "Offer",
        name: "Cloud Free",
        price: "0",
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Cloud Pro",
        price: "49",
        priceCurrency: "USD",
      },
      {
        "@type": "Offer",
        name: "Cloud Scale",
        price: "149",
        priceCurrency: "USD",
      },
    ],
    featureList: [
      "Trace single-agent and multi-agent failures",
      "Find the root cause of agent regressions",
      "Inspect handoffs between agents",
      "Compare runs against healthy baselines",
      "Classify failures with MAST",
    ],
  };

  return (
    <div className="bg-background">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />
      <div className="px-6 py-8 lg:px-8 lg:py-10">
        <div className="mx-auto max-w-[1200px]">
          <PublicNav />

          <section className="grid gap-12 py-12 lg:grid-cols-[1.15fr_1fr] lg:gap-[72px] lg:py-20">
            <div className="space-y-8">
              <AuthForm nextPath={nextPath} planIntent={planIntent} />
            </div>

            <div className="space-y-4">
              <div className="overflow-hidden rounded-[18px] border border-border bg-[linear-gradient(180deg,#161616_0%,#111111_100%)]">
                <div className="flex items-center justify-between border-b border-border px-5 py-4">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#febc2e]" />
                    <span className="h-2.5 w-2.5 rounded-full bg-[#28c840]" />
                  </div>
                  <div className="font-mono text-[12px] text-muted-foreground">
                    rifft.dev · run_8a3f2c
                  </div>
                  <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-emerald-300">
                    live
                  </div>
                </div>

                <div className="space-y-0 px-5 py-5">
                  {[
                    {
                      stage: "TRACE",
                      color: "bg-zinc-500",
                      line: "bg-zinc-700",
                      content: (
                        <div className="space-y-2 opacity-55">
                          <div className="rounded-xl border border-border bg-card/60 px-4 py-3 font-mono text-[13px] text-muted-foreground">
                            Planner → Retriever · 0.4s
                          </div>
                          <div className="rounded-xl border border-border bg-card/60 px-4 py-3 font-mono text-[13px] text-muted-foreground">
                            Retriever → Researcher · 1.1s
                          </div>
                        </div>
                      ),
                    },
                    {
                      stage: "FAILURE",
                      color: "bg-[oklch(0.66_0.19_25)]",
                      line: "bg-[oklch(0.66_0.19_25)]",
                      accent: "text-[oklch(0.66_0.19_25)]",
                      content: (
                        <div className="rounded-xl border border-[oklch(0.66_0.19_25_/_0.3)] bg-[oklch(0.66_0.19_25_/_0.08)] px-4 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="font-medium text-[oklch(0.66_0.19_25)]">
                              Researcher → Publisher
                            </div>
                            <div className="rounded-full border border-[oklch(0.66_0.19_25_/_0.3)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-[oklch(0.66_0.19_25)]">
                              unverified
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            Hallucinated citation in draft — caught before downstream call.
                          </div>
                        </div>
                      ),
                    },
                    {
                      stage: "DIAGNOSED",
                      color: "bg-[oklch(0.82_0.14_85)]",
                      line: "bg-[linear-gradient(to_bottom,oklch(0.82_0.14_85),transparent)]",
                      dashed: true,
                      content: (
                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-amber-400/20 bg-amber-500/5 px-4 py-3">
                          <div className="font-medium text-foreground">
                            Root cause traced to Researcher
                          </div>
                          <div className="rounded-xl border border-amber-400/20 bg-black/20 px-3 py-2">
                            <div className="font-mono text-[1.75rem] leading-none tracking-[-0.04em] text-[oklch(0.82_0.14_85)]">
                              120ms
                            </div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                              to classify &amp; pinpoint
                            </div>
                          </div>
                        </div>
                      ),
                    },
                    {
                      stage: "FORKED",
                      color: "bg-[oklch(0.78_0.16_155)]",
                      line: "bg-[oklch(0.78_0.16_155)]",
                      ring: true,
                      content: (
                        <div className="rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="font-medium text-foreground">Forked at Researcher</div>
                            <div className="rounded-full border border-border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
                              + validation
                            </div>
                          </div>
                          <div className="mt-2 text-sm text-muted-foreground">
                            Resume from the exact broken handoff.
                          </div>
                        </div>
                      ),
                    },
                    {
                      stage: "REPLAYED",
                      color: "bg-[oklch(0.78_0.16_155)]",
                      content: (
                        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-400/20 bg-emerald-500/5 px-4 py-3">
                          <div className="font-medium text-foreground">
                            Researcher → Publisher · ok
                          </div>
                          <div className="rounded-xl border border-emerald-400/20 bg-black/20 px-3 py-2">
                            <div className="font-mono text-[1.75rem] leading-none tracking-[-0.04em] text-emerald-300">
                              2.8s
                            </div>
                            <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                              end-to-end replay
                            </div>
                          </div>
                        </div>
                      ),
                    },
                  ].map((row, index, rows) => (
                    <div
                      key={row.stage}
                      className="grid grid-cols-[84px_24px_minmax(0,1fr)] gap-4 py-2"
                    >
                      <div
                        className={`pt-1 text-[11px] font-medium uppercase tracking-[0.18em] ${
                          row.stage === "FAILURE"
                            ? "text-[oklch(0.66_0.19_25)]"
                            : row.stage === "DIAGNOSED"
                              ? "text-[oklch(0.82_0.14_85)]"
                              : row.stage === "REPLAYED" || row.stage === "FORKED"
                                ? "text-emerald-300"
                                : "text-muted-foreground"
                        }`}
                      >
                        {row.stage}
                      </div>
                      <div className="relative flex justify-center">
                        <div
                          className={`relative z-10 mt-1 h-3 w-3 rounded-full ${row.color} ${
                            row.ring ? "ring-2 ring-emerald-300/40 ring-offset-2 ring-offset-[#111111]" : ""
                          } ${row.stage === "FAILURE" ? "shadow-[0_0_18px_rgba(255,71,87,0.45)]" : ""}`}
                        />
                        {index < rows.length - 1 ? (
                          <div
                            className={`absolute top-5 h-[calc(100%-0.25rem)] w-px ${
                              row.dashed ? "border-l border-dashed border-amber-300/60" : row.line
                            }`}
                          />
                        ) : null}
                      </div>
                      <div>{row.content}</div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center justify-between border-t border-border px-5 py-4 text-sm">
                  <div className="font-mono text-muted-foreground">run_8a3f2c · 5 spans</div>
                  <div className="text-muted-foreground">Open full trace →</div>
                </div>
              </div>

              <div className="text-sm text-muted-foreground">
                Works with CrewAI, AutoGen, LangGraph, OpenAI Swarm, LlamaIndex, and any custom
                SDK.
              </div>
            </div>
          </section>

          <section id="product" className="border-t py-16">
            <div className="space-y-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Why Rifft
              </div>
              <h2 className="max-w-3xl text-3xl font-semibold tracking-[-0.025em] lg:text-4xl">
                Built for teams debugging multi-agent failures in production.
              </h2>
              <p className="max-w-3xl text-base text-muted-foreground lg:text-lg">
                Purpose-built for engineers who need to find the broken handoff quickly, name the
                failure mode clearly, and test a fix without re-running the whole system.
              </p>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-3">
              <Card className="rounded-[18px] border-border/80 bg-card">
                <CardContent className="space-y-3 p-6">
                  <div className="text-lg font-semibold">Causal chain attribution</div>
                  <p className="text-sm text-muted-foreground">
                    Root cause attribution past the errored span, so you can see which earlier
                    agent actually corrupted the run.
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border-border/80 bg-card">
                <CardContent className="space-y-3 p-6">
                  <div className="text-lg font-semibold">MAST failure classification</div>
                  <p className="text-sm text-muted-foreground">
                    Named failure modes like unverified output, tool loop, handoff mismatch, and
                    context overflow.
                  </p>
                </CardContent>
              </Card>
              <Card className="rounded-[18px] border-border/80 bg-card">
                <CardContent className="space-y-3 p-6">
                  <div className="text-lg font-semibold">Fork &amp; replay</div>
                  <p className="text-sm text-muted-foreground">
                    Resume from any handoff, keep prior steps, and test the smallest possible fix.
                  </p>
                </CardContent>
              </Card>
            </div>
          </section>

          <section id="pricing" className="border-t py-16">
            <div className="space-y-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Pricing
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.025em] lg:text-4xl">
                Start free, upgrade when your traces get serious.
              </h2>
            </div>

            <div className="mt-8 grid gap-6 md:grid-cols-3">
              {pricingCards.map((plan) => (
                <div
                  key={plan.title}
                  className={`relative rounded-[18px] border p-6 ${
                    plan.featured
                      ? "border-border bg-[#1c1c1c] shadow-lg shadow-black/20"
                      : "border-border bg-card"
                  }`}
                >
                  {plan.featured ? (
                    <div className="absolute left-6 top-0 -translate-y-1/2 rounded-full border border-border bg-background px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-foreground">
                      Most popular
                    </div>
                  ) : null}
                  <div className="space-y-2">
                    <div className="text-2xl font-semibold">{plan.title}</div>
                    <div className="text-3xl font-semibold tracking-[-0.03em]">{plan.amount}</div>
                  </div>
                  <ul className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-3 text-sm text-muted-foreground">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-foreground" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-6">
                    <TryRifftButton planKey={plan.key} label={plan.cta} />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="border-t py-16">
            <div className="space-y-4">
              <div className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Comparison
              </div>
              <h2 className="text-3xl font-semibold tracking-[-0.025em] lg:text-4xl">
                Looking for a LangSmith or Langfuse alternative?
              </h2>
            </div>

            <div className="mt-8 overflow-x-auto rounded-[18px] border border-border bg-card">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="px-5 py-4 font-medium text-muted-foreground">Feature</th>
                    <th className="bg-card-foreground/0 px-5 py-4 font-medium text-foreground">Rifft</th>
                    <th className="px-5 py-4 font-medium text-muted-foreground">LangSmith</th>
                    <th className="px-5 py-4 font-medium text-muted-foreground">Langfuse</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Causal chain attribution", "●", "—", "—"],
                    ["MAST failure classification", "●", "—", "—"],
                    ["Fork & replay from any handoff", "●", "—", "—"],
                    ["Multi-agent trace view", "●", "Partial", "Partial"],
                    ["General LLM tracing", "●", "●", "●"],
                    ["Self-hosted option", "●", "●", "●"],
                    ["Free tier", "50K spans/mo", "5K traces/mo", "50K events/mo"],
                  ].map((row) => (
                    <tr key={row[0]} className="border-b border-border last:border-b-0">
                      <td className="px-5 py-4 text-foreground">{row[0]}</td>
                      <td className="bg-card-2 px-5 py-4 font-medium text-foreground">{row[1]}</td>
                      <td className="px-5 py-4 text-muted-foreground">{row[2]}</td>
                      <td className="px-5 py-4 text-muted-foreground">{row[3]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="mt-4 text-sm text-muted-foreground">
              Comparison reflects public product information as of April 2026. Let us know if
              we&apos;re missing something — we keep this table honest.
            </p>
          </section>

          <section className="border-t py-16">
            <div className="rounded-[18px] border border-border bg-card px-6 py-8">
              <div className="grid gap-5 md:grid-cols-[auto_minmax(0,1fr)] md:items-start">
                <div className="flex h-12 w-12 items-center justify-center rounded-full border border-border bg-card-2 font-mono text-sm text-foreground">
                  HP
                </div>
                <div className="space-y-4">
                  <blockquote className="max-w-4xl text-xl font-medium leading-8 tracking-[-0.02em] text-foreground">
                    “We shipped an agent to prod, it broke on handoff 6 of 9, and Rifft told us
                    exactly why and let us re-run from step 6. Cut our debug loop from hours to
                    about two minutes.”
                  </blockquote>
                  <div className="text-sm text-muted-foreground">
                    Hana Park, Staff Engineer, ClusterLabs, CrewAI user since 2024.
                  </div>
                </div>
              </div>
            </div>
          </section>

          <footer id="footer" className="border-t py-16">
            <div className="grid gap-10 md:grid-cols-[1.3fr_repeat(4,minmax(0,1fr))]">
              <div className="space-y-4">
                <RifftLogo className="h-7 w-auto" />
                <p className="max-w-xs text-sm text-muted-foreground">
                  Failure debugging for multi-agent pipelines. Trace, classify, fork, replay.
                </p>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium text-foreground">Product</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>Overview</div>
                  <div>Pricing</div>
                  <div>Changelog</div>
                  <div>Integrations</div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium text-foreground">Resources</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>Docs</div>
                  <div>API reference</div>
                  <div>MAST taxonomy</div>
                  <div>Sample traces</div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium text-foreground">Company</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div>Customers</div>
                  <div>Blog</div>
                  <div>Careers</div>
                  <div>Contact</div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="text-sm font-medium text-foreground">Legal</div>
                <div className="space-y-2 text-sm text-muted-foreground">
                  <div><Link href="/privacy" className="hover:text-foreground transition-colors">Privacy</Link></div>
                  <div><Link href="/terms" className="hover:text-foreground transition-colors">Terms</Link></div>
                  <div>Security</div>
                  <div>DPA</div>
                </div>
              </div>
            </div>

            <div className="mt-12 flex flex-col gap-4 border-t border-border pt-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
              <div>© 2026 Rifft Inc.</div>
              <a
                className="flex items-center gap-2 hover:text-foreground transition-colors"
                href={statusPageHref}
                target={statusPageHref.startsWith("http") ? "_blank" : undefined}
                rel={statusPageHref.startsWith("http") ? "noopener noreferrer" : undefined}
              >
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-400" />
                All systems operational · {statusPageHref.startsWith("http") ? "status.rifft.dev" : "local status"}
              </a>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}
