import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Boxes, Cloud, Database, LifeBuoy, Rocket, TerminalSquare, Waves } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicNav } from "@/components/public-nav";
import { siteName, siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "Documentation for Rifft, including quick start guides, SDK setup, self-hosting, cloud plans, and debugging workflows.",
  alternates: {
    canonical: "/docs",
  },
  openGraph: {
    title: `${siteName} Docs`,
    description:
      "Documentation for Rifft, including quick start guides, SDK setup, self-hosting, cloud plans, and debugging workflows.",
    url: `${siteUrl}/docs`,
  },
};

const quickLinks = [
  {
    href: "#quick-start",
    label: "Quick start",
  },
  {
    href: "#core-concepts",
    label: "Core concepts",
  },
  {
    href: "#sdk-adapters",
    label: "SDKs and adapters",
  },
  {
    href: "#cloud",
    label: "Cloud and billing",
  },
  {
    href: "#self-host",
    label: "Self-hosting",
  },
  {
    href: "#debugging",
    label: "Debugging workflow",
  },
];

const guideCards = [
  {
    title: "Quick start",
    description: "Get your first trace into Rifft Cloud in minutes with one project, one API key, and one real workflow run.",
    href: "#quick-start",
    icon: Rocket,
    tone: "border-amber-500/20 bg-amber-500/5",
  },
  {
    title: "SDKs and adapters",
    description: "Instrument Python and JavaScript apps, or plug into CrewAI, AutoGen, and MCP-style workflows.",
    href: "#sdk-adapters",
    icon: Boxes,
    tone: "border-sky-500/20 bg-sky-500/5",
  },
  {
    title: "Self-hosting",
    description: "Run the full stack locally with Docker Compose when you want full infrastructure control.",
    href: "#self-host",
    icon: Database,
    tone: "border-rose-500/20 bg-rose-500/5",
  },
  {
    title: "Cloud and billing",
    description: "Understand Free, Pro, and Scale plans, workspace behavior, retention windows, and upgrade paths.",
    href: "#cloud",
    icon: Cloud,
    tone: "border-emerald-500/20 bg-emerald-500/5",
  },
];

const stackCards = [
  "Python SDK",
  "JavaScript SDK",
  "CrewAI",
  "AutoGen / AG2",
  "MCP",
  "Fastify API",
  "ClickHouse",
  "Postgres",
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-border/80 bg-background/95 px-6 py-4 backdrop-blur lg:px-8">
        <PublicNav items={[{ href: "/", label: "Home" }]} />
      </div>

      <div className="mx-auto grid max-w-7xl gap-0 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-r border-border/80 px-6 py-8 lg:px-4">
          <nav className="lg:sticky lg:top-24">
            <div className="space-y-2">
              {quickLinks.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="block rounded-xl px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {link.label}
                </a>
              ))}
            </div>
            <div className="mt-8 rounded-2xl border bg-card/60 p-4">
              <div className="text-sm font-medium">Need help fast?</div>
              <p className="mt-2 text-sm text-muted-foreground">
                Start with Quick start, then jump into SDKs if you are instrumenting an existing app.
              </p>
            </div>
          </nav>
        </aside>

        <main className="px-6 py-10 lg:px-10">
          <section className="section-fade">
            <Badge variant="outline">Documentation</Badge>
            <h1 className="mt-6 max-w-4xl text-5xl font-semibold tracking-tight lg:text-6xl">
              Rifft docs for tracing, debugging, and improving multi-agent systems.
            </h1>
            <p className="mt-5 max-w-3xl text-lg text-muted-foreground">
              Rifft helps you see which agent caused a failure cascade, inspect the exact handoff
              that broke, and compare what changed between runs. These docs focus on getting you
              from first trace to useful debugging signal quickly.
            </p>
          </section>

          <section className="stagger-1 section-fade mt-10 grid gap-4 md:grid-cols-2">
            {guideCards.map((card) => {
              const Icon = card.icon;
              return (
                <Link key={card.title} href={card.href} className={`rounded-3xl border p-6 shadow-sm transition-transform hover:-translate-y-0.5 ${card.tone}`}>
                  <div className="flex items-center gap-3 text-lg font-medium">
                    <Icon className="h-5 w-5" />
                    {card.title}
                  </div>
                  <p className="mt-3 max-w-md text-sm leading-6 text-muted-foreground">
                    {card.description}
                  </p>
                </Link>
              );
            })}
          </section>

          <section id="quick-start" className="stagger-2 section-fade mt-16 scroll-mt-24">
            <div className="flex items-center gap-2">
              <Rocket className="h-5 w-5 text-chart-3" />
              <h2 className="text-3xl font-semibold tracking-tight">Quick start</h2>
            </div>
            <p className="mt-4 max-w-3xl text-muted-foreground">
              The fastest path is: create a project, copy the API key and ingest endpoint, send one
              trace from a real multi-agent run, then open the trace detail view.
            </p>
            <Card className="mt-6 rounded-3xl">
              <CardContent className="space-y-4 p-6">
                <div className="text-sm text-muted-foreground">Python</div>
                <pre className="overflow-x-auto rounded-2xl border bg-muted/30 p-4 text-sm">
{`pip install rifft-sdk rifft-crewai

import rifft
import rifft.adapters.crewai

rifft.init(
  project_id="proj_your_project_id",
  endpoint="https://ingest.rifft.dev",
  api_key="rft_live_xxxxx",
)`}
                </pre>
                <div className="text-sm text-muted-foreground">Then run one real workflow and open the first trace in Rifft.</div>
              </CardContent>
            </Card>
          </section>

          <section id="core-concepts" className="mt-16 scroll-mt-24">
            <div className="flex items-center gap-2">
              <Waves className="h-5 w-5 text-chart-1" />
              <h2 className="text-3xl font-semibold tracking-tight">Core concepts</h2>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Trace</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  A full run across one or more agents. This is the unit you inspect when something
                  broke or changed.
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Communication span</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  The handoff between agents. These are the most important edges in the graph when
                  you are tracing failure propagation.
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>MAST failure</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  A classified failure pattern attached to a trace or agent so you can move from raw
                  telemetry to likely cause faster.
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Baseline</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  A known-good trace used for comparison, so you can see whether a new run improved,
                  regressed, or changed in important ways.
                </CardContent>
              </Card>
            </div>
          </section>

          <section id="sdk-adapters" className="mt-16 scroll-mt-24">
            <div className="flex items-center gap-2">
              <Boxes className="h-5 w-5 text-chart-4" />
              <h2 className="text-3xl font-semibold tracking-tight">SDKs and adapters</h2>
            </div>
            <p className="mt-4 max-w-3xl text-muted-foreground">
              Rifft works best when it can capture agent identity, framework context, tool calls,
              and inter-agent messages consistently.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {stackCards.map((item) => (
                <Badge key={item} variant="outline">
                  {item}
                </Badge>
              ))}
            </div>
          </section>

          <section id="cloud" className="mt-16 scroll-mt-24">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-chart-2" />
              <h2 className="text-3xl font-semibold tracking-tight">Cloud and billing</h2>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-3">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Free</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div>50K spans per month</div>
                  <div>14-day retention</div>
                  <div>One workspace</div>
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Pro</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div>500K spans per month</div>
                  <div>90-day retention</div>
                  <div>Multiple workspaces</div>
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Scale</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <div>2M spans per month</div>
                  <div>1-year retention</div>
                  <div>Priority support</div>
                </CardContent>
              </Card>
            </div>
          </section>

          <section id="self-host" className="mt-16 scroll-mt-24">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-chart-5" />
              <h2 className="text-3xl font-semibold tracking-tight">Self-hosting</h2>
            </div>
            <Card className="mt-6 rounded-3xl">
              <CardContent className="space-y-4 p-6">
                <div className="text-sm text-muted-foreground">Run locally with Docker Compose</div>
                <pre className="overflow-x-auto rounded-2xl border bg-muted/30 p-4 text-sm">
{`git clone https://github.com/rifft-dev/rifft.git
cd rifft
docker compose up -d --build`}
                </pre>
                <p className="text-sm text-muted-foreground">
                  Local defaults: web UI on `localhost:3000`, API on `localhost:4000`, collector on
                  `localhost:4318`.
                </p>
              </CardContent>
            </Card>
          </section>

          <section id="debugging" className="mt-16 scroll-mt-24">
            <div className="flex items-center gap-2">
              <TerminalSquare className="h-5 w-5 text-chart-1" />
              <h2 className="text-3xl font-semibold tracking-tight">Debugging workflow</h2>
            </div>
            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Open the incident first</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  Start with the latest failing trace, then inspect the graph and the first MAST
                  failure with the strongest severity.
                </CardContent>
              </Card>
              <Card className="rounded-3xl">
                <CardHeader>
                  <CardTitle>Compare against baseline</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  If a trace used to work, set it as your baseline and use comparison to see where
                  the latest run changed.
                </CardContent>
              </Card>
            </div>
          </section>

          <section className="mt-16 rounded-[2rem] border bg-[radial-gradient(circle_at_top_left,hsl(var(--chart-1))/0.12,transparent_26%),hsl(var(--card))] p-8 shadow-sm">
            <div className="flex items-start gap-3">
              <LifeBuoy className="mt-1 h-5 w-5 text-chart-2" />
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">Need something deeper?</h2>
                <p className="mt-3 max-w-2xl text-muted-foreground">
                  The repo README and docs folder still hold the implementation detail. This in-app
                  docs view is meant to be the faster path for product users.
                </p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <Button asChild>
                    <a href="https://github.com/rifft-dev/rifft/blob/main/README.md" target="_blank" rel="noreferrer">
                      Open README
                      <ArrowRight className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button asChild variant="outline">
                    <a href="https://github.com/rifft-dev/rifft/tree/main/docs" target="_blank" rel="noreferrer">
                      View docs folder
                    </a>
                  </Button>
                </div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
