import type { Metadata } from "next";
import Link from "next/link";
import { siteDescription, siteName, siteUrl } from "@/lib/seo";
import { statusPageHref } from "@/lib/status";
import "./homepage.css";
import {
  HomepageTickbar,
  HomepageTracePanel,
  HomepageAuthBlock,
  HomepageQuickstart,
  HomepageHowItWorks,
  HomepageCompare,
} from "./homepage-client";

export const metadata: Metadata = {
  title: "AI Agent Debugger for CrewAI, AutoGen and LangGraph",
  description:
    "Debug multi-agent pipeline failures faster. Rifft traces the root cause, classifies failures with the MAST taxonomy, and lets you fork and replay any handoff — no pipeline restart needed.",
  alternates: { canonical: "/" },
  openGraph: {
    title: `${siteName} | AI Agent Debugger for CrewAI, AutoGen and LangGraph`,
    description:
      "Debug multi-agent pipeline failures faster. Rifft traces the root cause, classifies failures with the MAST taxonomy, and lets you fork and replay any handoff — no pipeline restart needed.",
    url: siteUrl,
  },
  twitter: {
    title: `${siteName} | AI Agent Debugger for CrewAI, AutoGen and LangGraph`,
    description:
      "Debug multi-agent pipeline failures faster. Rifft traces the root cause, classifies failures with the MAST taxonomy, and lets you fork and replay any handoff — no pipeline restart needed.",
  },
};

const structuredData = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: siteName,
  applicationCategory: "DeveloperApplication",
  operatingSystem: "Web",
  url: siteUrl,
  description: siteDescription,
  offers: [
    { "@type": "Offer", name: "Cloud Free",  price: "0",   priceCurrency: "USD" },
    { "@type": "Offer", name: "Cloud Pro",   price: "49",  priceCurrency: "USD" },
    { "@type": "Offer", name: "Cloud Scale", price: "149", priceCurrency: "USD" },
  ],
  featureList: [
    "Trace single-agent and multi-agent failures",
    "Find the root cause of agent regressions",
    "Inspect handoffs between agents",
    "Classify failures with MAST",
  ],
};

const FAILURES = [
  { id: "MAST-01", name: "Unverified Output", desc: "An agent passes ungrounded or hallucinated content to the next step without any validation gate.", ex: "> citation_url: None\n> publisher accepted it anyway" },
  { id: "MAST-02", name: "Tool Loop",        desc: "An agent calls the same tool repeatedly on the same input, running until the context window fills.", ex: "> search(\"climate change\") ×14\n> terminated by token limit" },
  { id: "MAST-03", name: "Handoff Mismatch", desc: "An agent sends a different schema than the next agent expects, causing a silent parse failure downstream.", ex: "> expected: {sources: string[]}\n> received: {refs: object[]}" },
  { id: "MAST-04", name: "Context Overflow", desc: "Accumulated context exceeds limits, causing truncation of instructions or prior reasoning mid-run.", ex: "> ctx: 128 041 / 128 000 tokens\n> truncated system prompt at step 8" },
];

const INTEGRATIONS = [
  { mark: "CA", label: "CrewAI" },
  { mark: "LG", label: "LangGraph" },
  { mark: "AG", label: "AutoGen" },
  { mark: "LI", label: "LlamaIndex" },
  { mark: "OT", label: "OTEL" },
  { mark: "AI", label: "Vercel AI" },
  { mark: "OS", label: "OpenAI Swarm" },
  { mark: "SK", label: "Semantic Kernel", coming: true },
  { mark: "DS", label: "DSPy",            coming: true },
  { mark: "HF", label: "HuggingFace",    coming: true },
  { mark: "BF", label: "BeeAgent",       coming: true },
  { mark: "++", label: "Custom OTEL",    coming: false },
];

const TIERS = [
  {
    name: "Free",       price: "$0",   cad: "/ month", highlight: false, badge: null,
    desc: "For individual developers exploring Rifft.",
    features: ["50K spans/month", "14-day retention", "Causal graph & MAST classification", "1 workspace"],
    cta: "Start free →",
  },
  {
    name: "Pro",        price: "$49",  cad: "/ month", highlight: true,  badge: "MOST POPULAR",
    desc: "For teams running agents in production.",
    features: ["500K spans/month", "90-day retention", "Fork mode & replay", "Unlimited team members", "Slack & email alerts", "NL failure explanations"],
    cta: "Start with Pro →",
  },
  {
    name: "Scale",      price: "$149", cad: "/ month", highlight: false, badge: null,
    desc: "For high-volume pipelines and larger orgs.",
    features: ["2M spans/month", "1-year retention", "Everything in Pro", "Automatic regression detection", "Priority support", "$5 per 100K spans above 2M"],
    cta: "Get started →",
  },
];

const WHY = [
  { n: "01", title: "Find the Real Starting Point", body: "When the visible failure is downstream from the actual cause, Rifft walks backwards through spans to the handoff that introduced bad state — not the error message you actually saw." },
  { n: "02", title: "Understand the Failure Type",  body: "MAST classification turns raw trace noise into recognizable patterns: unverified output, tool loop, handoff mismatch, context overflow. Pattern-match, not log-grep." },
  { n: "03", title: "Retry From the Break",         body: "Fork from any handoff, keep the successful steps, and test a fix without rerunning the whole workflow. Promote the replay to main." },
];

const CMP_ROWS = [
  ["Causal chain attribution",      "●",              "—",       "—"      ],
  ["MAST failure classification",   "●",              "—",       "—"      ],
  ["Fork & replay from any handoff","●",              "—",       "—"      ],
  ["Multi-agent trace view",        "●",              "Partial", "Partial"],
  ["General LLM tracing",           "●",              "●",       "●"      ],
  ["Self-hosted option",            "●",              "●",       "●"      ],
  ["Free tier",                     "50K spans/mo",   "5K traces/mo", "50K events/mo"],
];

export default async function HomePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = searchParams ? await searchParams : {};
  const nextPath   = typeof params.next === "string" ? params.next : "/onboarding";
  const planIntent = typeof params.plan === "string" ? params.plan : null;

  return (
    <div className="hp-root">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      {/* ── classified banner + tickbar ── */}
      <HomepageTickbar show />

      <div className="hp-frame">
        {/* ── Nav ── */}
        <nav className="hp-nav">
          <div className="hp-nav-left">
            <a href="/" className="hp-logo">
              RIFFT
              <span className="hp-reg">BETA</span>
            </a>
            <div className="hp-nav-links">
              <a href="#product">Product</a>
              <a href="#quickstart">Quickstart</a>
              <a href="#pricing">Pricing</a>
              <a href="https://docs.rifft.dev" target="_blank" rel="noopener noreferrer">Docs</a>
            </div>
          </div>
          <div className="hp-nav-right">
            <a href="/sign-in" className="hp-btn hp-btn-ghost">Sign in</a>
            <a href="#auth" className="hp-btn hp-btn-primary">Get started →</a>
          </div>
        </nav>

        {/* ── Hero ── */}
        <section className="hp-section" id="hero">
          <div className="hp-section-head">
            <div className="hp-sh-lhs">
              <span className="hp-sh-num">00</span>
              <span className="hp-sh-sep">/</span>
              <span className="hp-sh-title">Mission brief</span>
            </div>
            <div className="hp-sh-rhs">agent debugging platform · v0.42.1</div>
          </div>
          <div className="hp-hero">
            <div className="hp-hero-left">
              <div>
                <div className="hp-hero-tags">
                  <span className="hp-tag hp-tag-live">● Live</span>
                  <span className="hp-tag">AI Agent Debugger</span>
                  <span className="hp-tag">MAST v1.0</span>
                </div>
                <h1>
                  Find where your<br />
                  agent actually<br />
                  <span className="hp-accent">broke.</span>
                </h1>
                <p className="hp-hero-sub">
                  Not the error — the handoff that caused it. Rifft traces bad state back to its
                  origin, classifies the failure mode, and lets you replay from the exact broken handoff.
                </p>
              </div>

              <div id="auth">
                <HomepageAuthBlock nextPath={nextPath} planIntent={planIntent} />
              </div>

              <div className="hp-hero-stats">
                <div className="hp-hero-stat">
                  <span className="hp-stat-num">120ms</span>
                  <span className="hp-stat-lbl">avg. time to<br /><b>root cause</b></span>
                </div>
                <div className="hp-hero-stat" style={{ paddingLeft: 16 }}>
                  <span className="hp-stat-num">2.8s</span>
                  <span className="hp-stat-lbl">end-to-end<br /><b>replay time</b></span>
                </div>
                <div className="hp-hero-stat" style={{ paddingLeft: 16 }}>
                  <span className="hp-stat-num">7+</span>
                  <span className="hp-stat-lbl">frameworks<br /><b>supported</b></span>
                </div>
              </div>
            </div>

            <div className="hp-hero-right">
              <div
                className="hp-trace-caption"
                style={{ marginBottom: 4 }}
              >
                <span>▶</span>
                <span>
                  <b>Live demo</b> — same trace every broken run shows you
                </span>
              </div>
              <HomepageTracePanel />
              <div style={{ fontFamily: "var(--mono)", fontSize: 11, color: "var(--fg-3)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 2 }}>
                Works with CrewAI · AutoGen · LangGraph · LlamaIndex · OTEL · custom stacks
              </div>
            </div>
          </div>
        </section>

        {/* ── MAST Failures ── */}
        <section className="hp-section" id="product">
          <div className="hp-section-head">
            <div className="hp-sh-lhs">
              <span className="hp-sh-num">01</span>
              <span className="hp-sh-sep">/</span>
              <span className="hp-sh-title">Failure catalog</span>
            </div>
            <div className="hp-sh-rhs">MAST taxonomy · 4 failure classes</div>
          </div>
          <div className="hp-section-intro" style={{ borderBottom: "none" }}>
            <h2 className="hp-section-h2" style={{ fontFamily: "var(--display)", fontWeight: 500, fontSize: "clamp(28px,3vw,42px)", textTransform: "uppercase", letterSpacing: "0.005em" }}>
              The failures that<br />actually matter.
            </h2>
          </div>
          <div className="hp-failures">
            {FAILURES.map((f) => (
              <div className="hp-failure" key={f.id}>
                <div className="hp-failure-num">
                  <span className="hp-failure-id">{f.id}</span>
                  <span>·</span>
                  <span>Rifft detects</span>
                </div>
                <h3>{f.name}</h3>
                <p>{f.desc}</p>
                <pre className="hp-failure-example">{f.ex}</pre>
                <span className="hp-failure-arrow">↗</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Quickstart ── */}
        <div id="quickstart">
          <HomepageQuickstart />
        </div>

        {/* ── How it works ── */}
        <HomepageHowItWorks />

        {/* ── Compare ── */}
        <HomepageCompare />

        {/* ── Integrations ── */}
        <section className="hp-section" id="integrations">
          <div className="hp-section-head">
            <div className="hp-sh-lhs">
              <span className="hp-sh-num">05</span>
              <span className="hp-sh-sep">/</span>
              <span className="hp-sh-title">Integrations</span>
            </div>
            <div className="hp-sh-rhs">drop-in for your existing stack</div>
          </div>
          <div className="hp-integrations">
            {INTEGRATIONS.map((ig) => (
              <div key={ig.mark} className={`hp-intg${ig.coming ? " hp-intg-coming" : ""}`}>
                <div className="hp-intg-mark">{ig.mark}</div>
                <span>{ig.label}{ig.coming ? " →" : ""}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Pricing ── */}
        <section className="hp-section" id="pricing">
          <div className="hp-section-head">
            <div className="hp-sh-lhs">
              <span className="hp-sh-num">06</span>
              <span className="hp-sh-sep">/</span>
              <span className="hp-sh-title">Pricing</span>
            </div>
            <div className="hp-sh-rhs">start free · upgrade when you need to</div>
          </div>
          <div className="hp-pricing">
            {TIERS.map((t) => (
              <div key={t.name} className={`hp-tier${t.highlight ? " hp-tier-highlight" : ""}`}>
                {t.badge && <div className="hp-tier-badge">{t.badge}</div>}
                <div>
                  <div className="hp-tier-name">{t.name}</div>
                  <div className="hp-tier-price">
                    <span className="hp-price-num">{t.price}</span>
                    <span className="hp-price-cad">{t.cad}</span>
                  </div>
                  <p className="hp-tier-desc">{t.desc}</p>
                </div>
                <ul className="hp-tier-features">
                  {t.features.map((f) => (
                    <li key={f}>
                      <span style={{ color: "var(--accent)", flexShrink: 0, fontSize: 12 }}>✓</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <a href="#auth" className="hp-btn hp-btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: "auto" }}>
                  {t.cta}
                </a>
              </div>
            ))}
          </div>
        </section>

        {/* ── Why Rifft ── */}
        <section className="hp-section">
          <div className="hp-section-head">
            <div className="hp-sh-lhs">
              <span className="hp-sh-num">07</span>
              <span className="hp-sh-sep">/</span>
              <span className="hp-sh-title">Why Rifft</span>
            </div>
            <div className="hp-sh-rhs">built for the failures that are expensive to miss</div>
          </div>
          <div className="hp-why">
            {WHY.map((w) => (
              <div key={w.n} className="hp-why-tile">
                <div className="hp-why-num">PRINCIPLE {w.n}</div>
                <h3>{w.title}</h3>
                <p>{w.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Comparison table ── */}
        <section className="hp-section">
          <div className="hp-section-head">
            <div className="hp-sh-lhs">
              <span className="hp-sh-num">08</span>
              <span className="hp-sh-sep">/</span>
              <span className="hp-sh-title">vs LangSmith / Langfuse</span>
            </div>
            <div className="hp-sh-rhs">as of June 2026</div>
          </div>
          <div className="hp-cmp-row hp-cmp-head">
            <div>Feature</div>
            <div className="hp-us">Rifft</div>
            <div>LangSmith</div>
            <div>Langfuse</div>
          </div>
          {CMP_ROWS.map((row) => (
            <div key={row[0]} className="hp-cmp-row">
              <div>{row[0]}</div>
              <div className="hp-us">{row[1]}</div>
              <div style={{ color: "var(--fg-3)" }}>{row[2]}</div>
              <div style={{ color: "var(--fg-3)" }}>{row[3]}</div>
            </div>
          ))}
          <div style={{ padding: "12px 28px", fontFamily: "var(--mono)", fontSize: 10.5, color: "var(--fg-3)", letterSpacing: "0.06em", borderTop: "1px solid var(--line)" }}>
            Comparison reflects public product information as of June 2026. If we missed something, <a href="mailto:hey@rifft.dev" style={{ color: "var(--accent)" }}>tell us →</a>
          </div>
        </section>

        {/* ── CTA ── */}
        <section className="hp-section hp-cta">
          <div className="hp-cta-left">
            <h2>Start debugging.<br />First trace in five minutes.</h2>
            <p>Drop in four lines of Python or TypeScript. Rifft instruments your agent harness, streams spans to the collector, and shows you the first causal chain before you close the terminal.</p>
            <div className="hp-cta-buttons">
              <a href="#auth" className="hp-btn hp-btn-primary">Get started free →</a>
              <a href="https://docs.rifft.dev" target="_blank" rel="noopener noreferrer" className="hp-btn">Read the docs →</a>
            </div>
          </div>
          <div className="hp-cta-right">
            {[
              "No credit card required",
              "50K spans free every month",
              "Works with your existing stack",
              "Cancel anytime",
            ].map((item) => (
              <div key={item} className="hp-cta-row">
                <span className="hp-check">✓</span>
                <span>{item}</span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Footer ── */}
        <footer id="footer" className="hp-footer">
          <div>
            <div className="hp-logo" style={{ marginBottom: 12 }}>RIFFT</div>
            <p style={{ color: "var(--fg-2)", fontSize: 13.5, maxWidth: "34ch", fontWeight: 300, lineHeight: 1.55 }}>
              Incident debugging for multi-agent systems. Built for failures that are hard to explain and costly to rerun.
            </p>
            <div style={{ marginTop: 16 }}>
              <a href={statusPageHref} className="hp-status-pill" target={statusPageHref.startsWith("http") ? "_blank" : undefined} rel={statusPageHref.startsWith("http") ? "noopener noreferrer" : undefined}>
                <span className="hp-status-dot" />
                All systems nominal
              </a>
            </div>
          </div>
          <div className="hp-footer-col">
            <h4>Product</h4>
            <ul>
              <li><a href="#product">Overview</a></li>
              <li><a href="#pricing">Pricing</a></li>
              <li><a href="#integrations">Integrations</a></li>
              <li><a href="/changelog">Changelog</a></li>
            </ul>
          </div>
          <div className="hp-footer-col">
            <h4>Resources</h4>
            <ul>
              <li><a href="https://docs.rifft.dev" target="_blank" rel="noopener noreferrer">Docs</a></li>
              <li><a href="https://docs.rifft.dev/api" target="_blank" rel="noopener noreferrer">API reference</a></li>
              <li><a href="https://docs.rifft.dev/mast" target="_blank" rel="noopener noreferrer">MAST taxonomy</a></li>
              <li><a href="https://docs.rifft.dev/examples" target="_blank" rel="noopener noreferrer">Sample traces</a></li>
            </ul>
          </div>
          <div className="hp-footer-col">
            <h4>Legal</h4>
            <ul>
              <li><a href="/privacy">Privacy</a></li>
              <li><a href="/terms">Terms</a></li>
              <li><a href="/security">Security</a></li>
              <li><a href="/dpa">DPA</a></li>
            </ul>
          </div>
        </footer>

        <div className="hp-footer-bottom">
          <span>© 2026 Rifft Inc.</span>
          <span style={{ fontFamily: "var(--mono)", fontSize: 10, letterSpacing: "0.12em", color: "var(--fg-4)" }}>
            UNCLASSIFIED // FOR OPERATOR USE
          </span>
          <a href="https://x.com/rifftdev" target="_blank" rel="noopener noreferrer" style={{ color: "var(--fg-3)" }}>X/TWITTER</a>
        </div>
      </div>
    </div>
  );
}
