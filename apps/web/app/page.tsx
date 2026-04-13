import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Rifft — Debug multi-agent AI in minutes",
  description:
    "Multi-agent AI debugger that shows which agent caused the failure and how to fix it. Causal graph, step-through replay, and failure classification grounded in UC Berkeley research. Free cloud tier and open-source self-hosted.",
};

const pricingCards = [
  {
    eyebrow: "Self-hosted",
    title: "OSS",
    amount: "Free forever",
    description: "Run Rifft inside your own infrastructure with the full open-source stack.",
    features: [
      "Unlimited spans, no limits",
      "MIT licensed, full source available",
      "Docker Compose, one command to start",
      "Community support",
    ],
    cta: { href: "https://github.com/rifft-dev/rifft", label: "View on GitHub", variant: "outline" as const },
  },
  {
    eyebrow: "Cloud Free",
    title: "Free",
    amount: "$0 / month",
    description: "Get to your first trace without touching infrastructure. Start debugging in minutes.",
    features: [
      "50K spans per month",
      "14-day trace retention",
      "MAST failure classification, causal graph, replay",
      "One project per account",
      "Community support",
    ],
    cta: { href: "/auth?next=%2Fonboarding", label: "Start for free", variant: "default" as const },
    featured: true,
  },
  {
    eyebrow: "Cloud Pro",
    title: "Pro",
    amount: "$29 / month",
    description: "For developers running agents in production who need history and full debugging power.",
    features: [
      "500K spans per month",
      "90-day trace retention",
      "Fork mode — edit agent state mid-replay",
      "Cross-trace pattern analysis",
      "Email support",
      "$5 per 100K spans above 500K",
    ],
    cta: { href: "/auth?plan=pro&next=%2Fonboarding", label: "Get started", variant: "outline" as const },
  },
];

const outcomes = [
  {
    number: "01",
    title: "See exactly which agent caused the cascade",
    body: "Rifft builds a causal graph of every inter-agent handoff and traces the failure back to its origin — so you can see which agent decision started the chain reaction, not just where the run finally crashed.",
  },
  {
    number: "02",
    title: "Understand why the agent made that decision",
    body: "Every agent decision is captured with the full prompt state, conversation history, and handoff context that led to it. Rifft then classifies the failure using the UC Berkeley MAST taxonomy — 14 failure modes covering everything from context window overflow to dropped handoffs — so you know what went wrong and how to fix it.",
  },
  {
    number: "03",
    title: "Replay the run and test the fix faster",
    body: "Step through the trace, fork any handoff point to edit the payload, and verify the fix without rerunning the whole pipeline from scratch.",
  },
];

const steps = [
  {
    number: "01",
    title: "Start free in the hosted app",
    body: "Go to app.rifft.dev, sign in with GitHub or an email magic link, and land in a ready-to-use project.",
  },
  {
    number: "02",
    title: "Install the SDK",
    body: "pip install rifft-sdk rifft-crewai. Copy your project ID, ingest URL, and API key from the onboarding screen.",
  },
  {
    number: "03",
    title: "Run your existing workflow",
    body: "Send one real trace from your CrewAI app and let the onboarding screen wait for it live.",
  },
  {
    number: "04",
    title: "Drop to self-hosted when you want full control",
    body: "Clone the repo, run docker compose up, and keep Rifft inside your own infra.",
  },
];

const codeLines = [
  'import rifft',
  'import rifft.adapters.crewai  # one line',
  "",
  "rifft.init(",
  '  project_id="proj_your_project_id",',
  '  endpoint="https://ingest.rifft.dev",',
  '  api_key="rft_live_xxxxxxxxxxxx"',
  ")",
  "",
  "# your existing crew, unchanged",
  "crew = Crew(agents=[...], tasks=[...])",
  "result = crew.kickoff()",
  "",
  "# Rifft Cloud opens the trace as soon as it lands",
];

const differentiators = [
  {
    label: "Failure classification with recommended fixes",
    detail: "Rifft doesn't just flag that something went wrong — it tells you which of 14 failure patterns it matched, why that pattern causes problems, and what change will stop it happening again.",
  },
  {
    label: "Causal graph across all your agents",
    detail: "See every message passed between agents as a visual graph. The agent that started the problem is highlighted, so you know where to look before you read a single log line.",
  },
  {
    label: "Fork and replay without restarting",
    detail: "Edit the message at any handoff point and test your fix right there. No need to rerun the whole pipeline from scratch every time you want to try something different.",
  },
  {
    label: "Before / after comparison",
    detail: "Mark a working run as your baseline. When the next failure lands, Rifft shows you exactly what changed — fewer guesses about whether your fix actually helped.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-[#fafafa]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#09090b]/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 lg:px-8">
          <Link href="/" className="text-sm font-semibold tracking-tight text-white">
            rifft
          </Link>
          <nav className="flex items-center gap-1">
            <a href="#how-it-works" className="rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white">
              How it works
            </a>
            <a href="#quickstart" className="rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white">
              Quickstart
            </a>
            <a href="#pricing" className="rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white">
              Pricing
            </a>
            <a href="https://github.com/rifft-dev/rifft" className="rounded-md px-3 py-2 text-sm text-zinc-400 transition hover:bg-white/5 hover:text-white">
              GitHub
            </a>
            <Button asChild size="sm" variant="outline" className="ml-2 border-white/15 bg-transparent text-white hover:bg-white/5">
              <Link href="/auth?next=%2Fonboarding">Start for free</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="section-fade mx-auto max-w-5xl px-6 py-24 text-center lg:px-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.08em] text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            Cloud free · Self-hosted forever
          </div>
          <h1 className="mt-8 text-5xl font-normal tracking-[-0.04em] text-white lg:text-7xl">
            Stop guessing
            <br />
            <em className="font-light text-zinc-400">why your agents failed</em>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg font-light leading-8 text-zinc-300">
            When a multi-agent run breaks, Rifft shows you which agent started the cascade, classifies what went wrong, and tells you what to fix — instead of leaving you to piece it together from logs.
          </p>
          <p className="mx-auto mt-3 max-w-xl text-sm font-light leading-7 text-zinc-500">
            Failure classification grounded in UC Berkeley research covering the 14 most common ways multi-agent systems break in production.
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-white text-black hover:bg-zinc-200">
              <Link href="/auth?next=%2Fonboarding">
                Start for free
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/5">
              <a href="https://github.com/rifft-dev/rifft">Self-host on GitHub</a>
            </Button>
          </div>
          <p className="mt-5 text-sm text-zinc-500">
            No credit card required · 50K spans free · LangSmith and Langfuse alternative
          </p>
        </section>

        <div className="border-t border-white/10" />

        {/* Problem */}
        <section className="mx-auto max-w-5xl px-6 py-20 lg:px-8">
          <div className="grid gap-10 rounded-3xl border border-white/10 bg-[#111113] p-8 lg:grid-cols-2 lg:p-12">
            <div>
              <p className="mb-4 text-[11px] uppercase tracking-[0.12em] text-zinc-500">The problem</p>
              <h2 className="text-3xl font-normal tracking-[-0.03em] text-white">
                Multi-agent failures spread faster than your logs can explain
              </h2>
              <p className="mt-4 text-[15px] font-light leading-7 text-zinc-300">
                Agent A passes bad data to Agent B. Agent B treats it as fact. By the time Agent C fails, you&apos;re three levels deep with no idea where it started. Every other tool gives you a wall of spans and leaves you to figure out the rest. Rifft traces it back to the root, tells you what kind of failure it is, and shows you what to change.
              </p>
            </div>
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#18181b] font-mono text-xs">
              <div className="flex items-center gap-2 border-b border-white/10 bg-[#111113] px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-red-400/40" />
                <span className="h-2 w-2 rounded-full bg-amber-400/40" />
                <span className="h-2 w-2 rounded-full bg-emerald-400/40" />
              </div>
              <div className="space-y-2 px-4 py-4 text-zinc-400">
                <div><span className="mr-2 text-zinc-500">→</span><span className="text-emerald-400">orchestrator</span> started</div>
                <div><span className="mr-2 text-zinc-500">→</span><span className="text-emerald-400">researcher</span> executing task...</div>
                <div><span className="mr-2 text-zinc-500">→</span><span className="text-amber-400">researcher</span> passed output to writer</div>
                <div><span className="mr-2 text-zinc-500">→</span><span className="text-red-400">writer</span> failed — but why?</div>
                <div className="pt-2"><span className="mr-2 text-zinc-500">⬡</span>rifft MAST classification:</div>
                <div><span className="mr-2 text-zinc-500"> </span><span className="text-amber-400">unverified_information_propagation</span></div>
                <div><span className="mr-2 text-zinc-500"> </span><span className="text-zinc-500">→ insert a validation step before writer</span></div>
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-white/10" />

        {/* How it works */}
        <section id="how-it-works" className="mx-auto max-w-5xl px-6 py-20 lg:px-8">
          <p className="text-center text-[11px] uppercase tracking-[0.12em] text-zinc-500">How it works</p>
          <h2 className="mt-4 text-center text-4xl font-normal tracking-[-0.03em] text-white">
            Three things Rifft gives you when a multi-agent run breaks
          </h2>
          <div className="mt-14 grid gap-6 lg:grid-cols-3">
            {outcomes.map((outcome) => (
              <Card key={outcome.number} className="border-white/10 bg-[#111113] text-white shadow-none">
                <CardContent className="p-7">
                  <p className="text-[11px] text-zinc-500">{outcome.number}</p>
                  <h3 className="mt-4 text-base font-medium">{outcome.title}</h3>
                  <p className="mt-3 text-sm font-light leading-6 text-zinc-300">{outcome.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <div className="border-t border-white/10" />

        {/* Differentiators */}
        <section className="mx-auto max-w-5xl px-6 py-20 lg:px-8">
          <p className="text-center text-[11px] uppercase tracking-[0.12em] text-zinc-500">Why Rifft</p>
          <h2 className="mt-4 text-center text-4xl font-normal tracking-[-0.03em] text-white">
            What no other observability tool offers
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-center text-base font-light leading-7 text-zinc-300">
            LangSmith, Langfuse, and Datadog show you what happened. Rifft tells you what kind of failure it was, which agent owns it, and exactly what to change — backed by peer-reviewed research on how multi-agent systems actually break.
          </p>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            {differentiators.map((item) => (
              <div key={item.label} className="rounded-2xl border border-white/10 bg-[#111113] p-6">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span className="text-sm font-medium text-white">{item.label}</span>
                </div>
                <p className="mt-3 text-sm font-light leading-6 text-zinc-400">{item.detail}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center text-sm text-zinc-500">
            Classification is grounded in{" "}
            <a
              href="https://arxiv.org/abs/2503.13657"
              target="_blank"
              rel="noopener noreferrer"
              className="text-zinc-400 underline underline-offset-4 transition hover:text-white"
            >
              peer-reviewed research from UC Berkeley
            </a>
            {" "}on how multi-agent systems fail in production — published at NeurIPS 2025.
          </p>
        </section>

        <div className="border-t border-white/10" />

        {/* Quickstart */}
        <section id="quickstart" className="mx-auto max-w-5xl px-6 py-20 lg:px-8">
          <p className="text-center text-[11px] uppercase tracking-[0.12em] text-zinc-500">Quickstart</p>
          <h2 className="mt-4 text-center text-4xl font-normal tracking-[-0.03em] text-white">
            Go from sign-in to first trace in under 10 minutes
          </h2>
          <div className="mt-12 grid gap-8 lg:grid-cols-2">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#111113]">
              <div className="flex items-center gap-2 border-b border-white/10 bg-[#18181b] px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-red-400/40" />
                <span className="h-2 w-2 rounded-full bg-amber-400/40" />
                <span className="h-2 w-2 rounded-full bg-emerald-400/40" />
                <span className="ml-2 font-mono text-[11px] text-zinc-500">crewai_example.py</span>
              </div>
              <div className="space-y-1 p-5">
                {codeLines.map((line, index) => (
                  <div key={`${index}-${line}`} className="flex gap-4">
                    <span className="w-4 shrink-0 font-mono text-xs text-zinc-600">{index + 1}</span>
                    <span className="font-mono text-xs leading-7 text-[#a1e3b0]">{line || " "}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="space-y-6">
              {steps.map((step) => (
                <div key={step.number} className="flex gap-4">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-[#18181b] font-mono text-[11px] text-zinc-500">
                    {step.number}
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white">{step.title}</h4>
                    <p className="mt-1 text-sm font-light leading-6 text-zinc-300">{step.body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="border-t border-white/10" />

        {/* Pricing */}
        <section id="pricing" className="mx-auto max-w-5xl px-6 py-20 lg:px-8">
          <p className="text-center text-[11px] uppercase tracking-[0.12em] text-zinc-500">Pricing</p>
          <h2 className="mt-4 text-center text-4xl font-normal tracking-[-0.03em] text-white">
            Simple pricing. Start free, scale when you need to.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-center text-base font-light leading-7 text-zinc-300">
            Start in Rifft Cloud for free, upgrade when you need more volume and retention, or self-host forever if you want full control.
          </p>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {pricingCards.map((card) => (
              <Card
                key={card.eyebrow}
                className={`flex h-full flex-col border-white/10 bg-[#111113] text-white shadow-none ${card.featured ? "ring-1 ring-white/10" : ""}`}
              >
                <CardContent className="flex h-full flex-col gap-5 p-7">
                  <div className="inline-flex w-fit rounded-full border border-white/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.08em] text-zinc-500">
                    {card.eyebrow}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium">{card.title}</h3>
                    <div className="mt-2 text-3xl tracking-[-0.04em] text-white">{card.amount}</div>
                  </div>
                  <p className="text-sm font-light leading-6 text-zinc-300">{card.description}</p>
                  <ul className="space-y-2 text-sm text-zinc-300">
                    {card.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-2">
                    <Button
                      asChild
                      variant={card.cta.variant}
                      className={card.cta.variant === "default" ? "w-full bg-white text-black hover:bg-zinc-200" : "w-full border-white/15 bg-transparent text-white hover:bg-white/5"}
                    >
                      {card.cta.href.startsWith("/") ? (
                        <Link href={card.cta.href}>{card.cta.label}</Link>
                      ) : (
                        <a href={card.cta.href}>{card.cta.label}</a>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>

        <div className="border-t border-white/10" />

        {/* CTA */}
        <section className="mx-auto max-w-5xl px-6 py-20 text-center lg:px-8">
          <h2 className="text-4xl font-normal tracking-[-0.03em] text-white">
            Start free, send one trace, and see where the failure began
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base font-light leading-7 text-zinc-300">
            Rifft Cloud gets you from sign-in to your first classified failure in under 10 minutes. Self-hosted stays available when you want to run everything yourself.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button asChild size="lg" className="bg-white text-black hover:bg-zinc-200">
              <Link href="/auth?next=%2Fonboarding">Start for free</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-white/15 bg-transparent text-white hover:bg-white/5">
              <a href="https://github.com/rifft-dev/rifft">View self-hosted setup</a>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/10">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-7 lg:px-8">
          <div className="font-mono text-xs text-zinc-500">rifft</div>
          <div className="flex gap-5 text-sm text-zinc-500">
            <a href="https://github.com/rifft-dev/rifft" className="transition hover:text-white">GitHub</a>
            <a href="https://github.com/rifft-dev/rifft/blob/main/LICENSE" className="transition hover:text-white">MIT licence</a>
            <a href="https://github.com/rifft-dev/rifft/blob/main/README.md" className="transition hover:text-white">Docs</a>
          </div>
          <div className="text-xs text-zinc-500">© 2026 Rifft</div>
        </div>
      </footer>
    </div>
  );
}