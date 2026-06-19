"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAuth } from "@/components/auth-provider";

/* ─── Tickbar ─── */
export function HomepageTickbar({ show }: { show: boolean }) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const d = new Date();
      const h = String(d.getUTCHours()).padStart(2, "0");
      const m = String(d.getUTCMinutes()).padStart(2, "0");
      const s = String(d.getUTCSeconds()).padStart(2, "0");
      setTime(`${h}${m}${s}Z`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <>
      <div className="hp-classbar">
        <span className="hp-stripe" />
        <span>RIFFT // OPERATOR CONSOLE // V0.42.1 // UNCLASSIFIED</span>
      </div>
      {show && (
        <div className="hp-tickbar">
          <div className="hp-ticks">
            <span><span className="hp-sys-dot" /><span className="hp-key">SYS</span> <span className="hp-val">NOMINAL</span></span>
            <span><span className="hp-key">SDK</span> <span className="hp-val">0.42.1</span></span>
            <span><span className="hp-key">REGION</span> <span className="hp-val">US-WEST-2</span></span>
          </div>
          <div className="hp-ticks">
            <span><span className="hp-key">UTC</span> <span className="hp-val">{time}</span></span>
            <span><span className="hp-key">GRID</span> <span className="hp-val">37.7749N 122.4194W</span></span>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Trace Panel ─── */
const TRACE_STEPS = [
  { id: "t1",     label: "TRACE",     state: "passed", title: "Planner → Retriever",           meta: "0.4s",  badge: null, desc: null, metric: null },
  { id: "t2",     label: "TRACE",     state: "passed", title: "Retriever → Researcher",        meta: "1.1s",  badge: null, desc: null, metric: null },
  { id: "fail",   label: "FAILURE",   state: "fail",   title: "Researcher → Publisher",        meta: null,    badge: { kind: "fail", text: "UNVERIFIED" }, desc: "Hallucinated citation in draft — caught before downstream call.", metric: null },
  { id: "diag",   label: "DIAGNOSED", state: "warn",   title: "Root cause traced to Researcher", meta: null,  badge: null, desc: null, metric: { num: "120ms", lbl: "to classify & pinpoint", tone: "amber" } },
  { id: "fork",   label: "FORKED",    state: "ok",     title: "Forked at Researcher",          meta: null,    badge: { kind: "ok", text: "+ VALIDATION" }, desc: "Resume from the exact broken handoff.", metric: null },
  { id: "replay", label: "REPLAYED",  state: "ok",     title: "Researcher → Publisher · ok",   meta: null,    badge: null, desc: null, metric: { num: "2.8s", lbl: "end-to-end replay", tone: "green" } },
];

export function HomepageTracePanel() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const stages = [400, 800, 1100, 1400, 1700, 2000];
    const timers = stages.map((t, i) => setTimeout(() => setProgress(i + 1), t));
    return () => { timers.forEach(clearTimeout); };
  }, []);

  const stateClass = (s: string, visible: boolean) => {
    if (!visible) return "hp-ts-passed";
    if (s === "fail") return "hp-ts-fail";
    if (s === "warn") return "hp-ts-warn";
    if (s === "ok") return "hp-ts-ok";
    return "hp-ts-passed";
  };
  const titleColor = (s: string) => {
    if (s === "fail") return "var(--fail)";
    if (s === "warn") return "var(--warn)";
    if (s === "ok") return "var(--accent)";
    return "var(--fg-1)";
  };

  return (
    <div className="hp-trace">
      <div className="hp-trace-head">
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ display: "flex", gap: 5 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--fail)", display: "inline-block" }} />
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--warn)", display: "inline-block" }} />
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--accent)", display: "inline-block" }} />
          </div>
          <span style={{ color: "var(--fg-3)", fontFamily: "var(--mono)", fontSize: 11, letterSpacing: "0.1em" }}>
            rifft.dev <span style={{ color: "var(--fg-4)" }}>·</span> <span style={{ color: "var(--fg-1)" }}>run_8a3f2c</span>
          </span>
        </div>
        <span className="hp-trace-status">
          <span className="hp-trace-status-dot" />
          LIVE
        </span>
      </div>

      <div>
        {TRACE_STEPS.map((step, i) => {
          const visible = i < progress;
          const sc = stateClass(step.state, visible);
          return (
            <div className="hp-trace-row" key={step.id} style={{ opacity: visible ? 1 : 0.35, transition: "opacity .4s" }}>
              <div className={`hp-trace-step ${sc}`}>{step.label}</div>
              <div className="hp-trace-content">
                {visible ? (
                  <>
                    <span style={{ color: titleColor(step.state) }}>{step.title}</span>
                    {step.meta && <span className="hp-trace-duration">· {step.meta}</span>}
                    {step.badge && (
                      <span className={`hp-trace-badge hp-tc-${step.badge.kind}`}>{step.badge.text}</span>
                    )}
                    {step.desc && <div className="hp-trace-desc">{step.desc}</div>}
                    {step.metric && (
                      <div className={`hp-trace-metric ${step.metric.tone === "amber" ? "hp-amber" : "hp-green"}`}>
                        <span className="hp-m-num">{step.metric.num}</span>
                        <span className="hp-m-lbl">{step.metric.lbl}</span>
                      </div>
                    )}
                  </>
                ) : (
                  <span style={{ color: "var(--fg-4)" }}>·</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="hp-trace-foot">
        <div className="hp-tf-left">
          <span><span style={{ color: "var(--fg-1)" }}>run_8a3f2c</span></span>
          <span>5 spans</span>
          <span>2 agents</span>
        </div>
        <a href="#" style={{ color: "var(--accent)" }}>Open full trace →</a>
      </div>
    </div>
  );
}

/* ─── Auth Block ─── */
export function HomepageAuthBlock({ nextPath, planIntent }: { nextPath: string; planIntent: string | null }) {
  const { isConfigured, signInWithGitHub, signInWithMagicLink, user } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  useEffect(() => {
    if (user) router.replace(nextPath);
  }, [user, nextPath, router]);

  return (
    <div className="hp-auth">
      <button
        className="hp-auth-github"
        disabled={!isConfigured || isSubmitting}
        onClick={async () => {
          try {
            setIsSubmitting(true);
            await signInWithGitHub(nextPath, planIntent);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "GitHub sign-in failed");
            setIsSubmitting(false);
          }
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2.2c-3.3.7-4-1.6-4-1.6-.5-1.4-1.3-1.7-1.3-1.7-1.1-.7.1-.7.1-.7 1.2 0 1.8 1.2 1.8 1.2 1.1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.8-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.6.1-3.2 0 0 1-.3 3.3 1.2a11 11 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.6.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.7-5.5 6 .4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
        </svg>
        {isSubmitting ? "Signing in…" : "Continue with GitHub"}
      </button>

      <div className="hp-auth-divider"><span>OR</span></div>

      {magicSent ? (
        <div style={{ padding: "14px 18px", border: "1px solid var(--accent-line)", background: "var(--accent-soft)", fontFamily: "var(--mono)", fontSize: 12, color: "var(--accent)", letterSpacing: "0.08em" }}>
          ✓ Magic link sent — check your email
        </div>
      ) : (
        <form
          className="hp-auth-email"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!email) { toast.error("Enter an email address first"); return; }
            try {
              setIsSubmitting(true);
              await signInWithMagicLink(email, nextPath, planIntent);
              setMagicSent(true);
              setEmail("");
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Magic link failed");
            } finally {
              setIsSubmitting(false);
            }
          }}
        >
          <div className="hp-auth-field">
            <span className="hp-auth-field-label">Email</span>
            <input
              type="email"
              placeholder="operator@yourcompany.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email address"
            />
          </div>
          <button type="submit" className="hp-auth-magic" disabled={!isConfigured || isSubmitting}>
            {isSubmitting ? "Sending…" : "Send magic link →"}
          </button>
        </form>
      )}

      <p className="hp-auth-legal">
        By continuing, you acknowledge Rifft&apos;s{" "}
        <a href="/privacy">Privacy Policy</a> and <a href="/terms">Terms</a>.
      </p>
    </div>
  );
}

/* ─── Quickstart ─── */
const FRAMEWORKS = [
  {
    id: "crewai", label: "CrewAI", file: "agent.py",
    code: [
      ["1", [["com", "# wrap your existing crew — no other changes"]]],
      ["2", [["kw", "from"], [" rifft "], ["kw", "import"], [" "], ["fn", "trace"]]],
      ["3", [["kw", "from"], [" crewai "], ["kw", "import"], [" Crew, Agent"]]],
      ["4", [[" "]]],
      ["5", [["punc", "@"], ["fn", "trace"], ["punc", "("], ["var", "name"], ["punc", "="], ["str", '"research"'], ["punc", ")"]]],
      ["6", [["kw", "def"], [" "], ["fn", "research"], ["punc", "("], ["var", "query"], ["punc", "):"]]],
      ["7", [["    crew "], ["punc", "="], [" Crew(agents=[planner, researcher, publisher])"]]],
      ["8", [["    "], ["kw", "return"], [" crew."], ["fn", "kickoff"], ["punc", "("], ["var", "query"], ["punc", ")"]]],
    ],
  },
  {
    id: "langgraph", label: "LangGraph", file: "graph.py",
    code: [
      ["1", [["kw", "from"], [" rifft "], ["kw", "import"], [" "], ["fn", "instrument"]]],
      ["2", [["kw", "from"], [" langgraph.graph "], ["kw", "import"], [" StateGraph"]]],
      ["3", [[" "]]],
      ["4", [["var", "graph"], [" "], ["punc", "="], [" StateGraph(AgentState)"]]],
      ["5", [["var", "graph"], ["punc", "."], ["fn", "add_node"], ["punc", '("plan", planner)']]],
      ["6", [["var", "graph"], ["punc", "."], ["fn", "add_edge"], ["punc", '("plan", "research")']]],
      ["7", [[" "]]],
      ["8", [["var", "app"], [" = "], ["fn", "instrument"], ["punc", "(graph.compile())"], [" "], ["com", "# done."]]],
    ],
  },
  {
    id: "autogen", label: "AutoGen", file: "team.py",
    code: [
      ["1", [["kw", "from"], [" rifft "], ["kw", "import"], [" "], ["fn", "RifftListener"]]],
      ["2", [["kw", "from"], [" autogen "], ["kw", "import"], [" GroupChat, Manager"]]],
      ["3", [[" "]]],
      ["4", [["var", "chat"], [" = GroupChat(agents=team)"]]],
      ["5", [["var", "manager"], [" = Manager("]]],
      ["6", [["    "], ["var", "groupchat"], ["punc", "="], ["var", "chat"], ["punc", ","]]],
      ["7", [["    "], ["var", "hooks"], ["punc", "=["], ["fn", "RifftListener"], ["punc", "()],"]]],
      ["8", [["punc", ")"]]],
    ],
  },
  {
    id: "ts", label: "TS / Vercel AI", file: "agent.ts",
    code: [
      ["1", [["kw", "import"], [" { rifft } "], ["kw", "from"], [" "], ["str", '"@rifft/sdk"']]],
      ["2", [["kw", "import"], [" { generateText } "], ["kw", "from"], [" "], ["str", '"ai"']]],
      ["3", [[" "]]],
      ["4", [["kw", "const"], [" trace = rifft."], ["fn", "run"], ["punc", '("draft-doc");']]],
      ["5", [["kw", "const"], [" { text } = "], ["kw", "await"], [" "], ["fn", "generateText"], ["punc", "({"]]],
      ["6", [["    model: anthropic("], ["str", '"claude-haiku-4-5"'], ["),"]]],
      ["7", [["    messages: trace."], ["fn", "wrap"], ["punc", "(messages),"]]],
      ["8", [["punc", "});"]]],
    ],
  },
] as const;

type TokenPair = [string] | [string, string];

function CodeBlock({ fw }: { fw: typeof FRAMEWORKS[number] }) {
  return (
    <div className="hp-code-window">
      <div className="hp-code-head">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ display: "inline-flex", gap: 4 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 9, height: 9, borderRadius: "50%", background: "var(--bg-3)", display: "inline-block" }} />)}
          </span>
          <span className="hp-filename">{fw.file}</span>
        </span>
        <span>● connected · {fw.label}</span>
      </div>
      <div className="hp-code-body">
        <div className="hp-code-lines">
          {fw.code.map((row, i) => <div key={i}>{row[0]}</div>)}
        </div>
        <div className="hp-code-src">
          {fw.code.map((row, i) => (
            <div key={i}>
              {(row[1] as unknown as TokenPair[]).map((tok, j) =>
                tok.length === 1
                  ? <span key={j}>{tok[0]}</span>
                  : <span key={j} className={tok[0]}>{tok[1]}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HomepageQuickstart() {
  const [active, setActive] = useState(0);
  const fw = FRAMEWORKS[active];
  return (
    <section className="hp-section">
      <div className="hp-section-head">
        <div className="hp-sh-lhs">
          <span className="hp-sh-num">01</span>
          <span className="hp-sh-sep">/</span>
          <span className="hp-sh-title">Quickstart</span>
        </div>
        <div className="hp-sh-rhs">drop-in for the harness you already use</div>
      </div>
      <div className="hp-qs">
        <div className="hp-qs-left">
          <h2>Five lines. No exporters, no collectors, no YAML.</h2>
          <p>Wrap your existing crew, graph, or chat manager. Rifft picks up handoffs, tool calls, and state mutations automatically.</p>
          <div className="hp-qs-tabs">
            {FRAMEWORKS.map((f, i) => (
              <button key={f.id} className={`hp-qs-tab${active === i ? " hp-tab-active" : ""}`} onClick={() => setActive(i)}>
                <span className="hp-tab-idx">0{i + 1}</span>
                <span>{f.label}</span>
                <span className="hp-tab-arr">{active === i ? "●" : "→"}</span>
              </button>
            ))}
          </div>
          <div style={{ marginTop: 8, fontFamily: "var(--mono)", fontSize: 12, color: "var(--fg-3)" }}>
            Also: <span style={{ color: "var(--fg-1)" }}>OpenAI Swarm</span>, <span style={{ color: "var(--fg-1)" }}>LlamaIndex</span>, <span style={{ color: "var(--fg-1)" }}>OTEL</span>, custom stacks.
          </div>
        </div>
        <div className="hp-qs-right">
          <CodeBlock fw={fw} />
        </div>
      </div>
    </section>
  );
}

/* ─── How It Works ─── */
const HOW_STEPS = [
  { n: "01", title: "Drop in the SDK", desc: "One import wraps your agent harness. We pick up handoffs, tool calls, and state mutations automatically — no decorators on every function." },
  { n: "02", title: "Trace the bad handoff", desc: "When a run fails, Rifft walks backwards through spans to find the first place the state went wrong. You see the cause, not the symptom." },
  { n: "03", title: "Fork. Replay. Ship.", desc: "Replay from any span with patched inputs, validators, or an entirely new agent. Diff the runs side-by-side. Promote the fix." },
];

function HowCanvas({ step }: { step: number }) {
  if (step === 0) return (
    <div className="hp-how-canvas">
      <div style={{ color: "var(--fg-3)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14, fontFamily: "var(--mono)" }}>STEP 01 · agent.py</div>
      <pre style={{ margin: 0, color: "var(--fg-2)", lineHeight: 1.7, fontFamily: "var(--mono)", fontSize: 12 }}>
        <span style={{ color: "#c08bd8" }}>from</span>{" rifft "}<span style={{ color: "#c08bd8" }}>import</span>{" "}<span style={{ color: "var(--accent)" }}>trace</span>{"\n\n"}
        <span style={{ color: "var(--accent)" }}>@trace</span>{"(name="}<span style={{ color: "var(--accent)" }}>"research"</span>{")\n"}
        <span style={{ color: "#c08bd8" }}>def</span>{" "}<span style={{ color: "#d8b970" }}>run</span>{"(query):\n"}
        {"    crew = Crew(agents=[\n"}
        {"        planner, researcher, publisher])\n"}
        {"    "}<span style={{ color: "#c08bd8" }}>return</span>{" crew."}<span style={{ color: "#d8b970" }}>kickoff</span>{"(query)"}
      </pre>
      <div style={{ marginTop: 22, padding: "10px 12px", borderTop: "1px solid var(--line)", display: "flex", justifyContent: "space-between", color: "var(--fg-3)", fontSize: 11, fontFamily: "var(--mono)" }}>
        <span>4 lines added</span><span style={{ color: "var(--accent)" }}>● auto-instrumented</span>
      </div>
    </div>
  );

  if (step === 1) return (
    <div className="hp-how-canvas">
      <div style={{ color: "var(--fg-3)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 18, fontFamily: "var(--mono)" }}>STEP 02 · root cause graph</div>
      <svg viewBox="0 0 460 260" style={{ width: "100%", height: "auto" }}>
        <defs>
          <marker id="hp-arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--fg-3)" />
          </marker>
          <marker id="hp-arrFail" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--fail)" />
          </marker>
        </defs>
        {[
          { x: 20,  y: 50,  label: "planner",    state: "ok" },
          { x: 170, y: 50,  label: "retriever",  state: "ok" },
          { x: 170, y: 150, label: "researcher", state: "fail" },
          { x: 320, y: 150, label: "publisher",  state: "skip" },
        ].map(({ x, y, label, state }) => {
          const fill = state === "fail" ? "var(--fail-soft)" : state === "ok" ? "var(--accent-soft)" : "var(--bg-2)";
          const stroke = state === "fail" ? "var(--fail)" : state === "ok" ? "var(--accent-line)" : "var(--line-strong)";
          const tc = state === "fail" ? "var(--fail)" : state === "ok" ? "var(--accent)" : "var(--fg-3)";
          return (
            <g key={label}>
              <rect x={x} y={y} width={80} height={32} rx={2} fill={fill} stroke={stroke} />
              <text x={x + 40} y={y + 20} textAnchor="middle" fill={tc} style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{label}</text>
            </g>
          );
        })}
        <line x1={100} y1={66} x2={170} y2={66} stroke="var(--fg-3)" strokeWidth="1.4" markerEnd="url(#hp-arr)" />
        <line x1={210} y1={82} x2={210} y2={150} stroke="var(--fail)" strokeWidth="1.6" markerEnd="url(#hp-arrFail)" strokeDasharray="3 3" />
        <line x1={250} y1={166} x2={320} y2={166} stroke="var(--fg-4)" strokeWidth="1.4" strokeDasharray="3 3" />
        <line x1={210} y1={195} x2={210} y2={225} stroke="var(--fail)" strokeWidth="1" />
        <text x={216} y={232} fill="var(--fail)" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>↑ root cause: unverified citation</text>
      </svg>
    </div>
  );

  return (
    <div className="hp-how-canvas">
      <div style={{ color: "var(--fg-3)", fontSize: 11, letterSpacing: ".08em", textTransform: "uppercase", marginBottom: 14, fontFamily: "var(--mono)" }}>STEP 03 · replay diff</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, fontSize: 12 }}>
        {[
          { title: "run_8a3f2c", ok: false, rows: [["planner","ok","0.4s"],["retriever","ok","1.1s"],["researcher","fail","—"],["publisher","skip","—"]] },
          { title: "replay_4d1e", ok: true,  rows: [["planner","cached","0.0s"],["retriever","cached","0.0s"],["researcher*","ok","0.9s"],["publisher","ok","0.7s"]] },
        ].map(({ title, ok, rows }) => (
          <div key={title} style={{ border: "1px solid var(--line)", overflow: "hidden" }}>
            <div style={{ padding: "8px 10px", background: "var(--bg-1)", borderBottom: "1px solid var(--line)", color: ok ? "var(--accent)" : "var(--fail)", display: "flex", justifyContent: "space-between", fontFamily: "var(--mono)", fontSize: 12 }}>
              <span>{title}</span><span>{ok ? "✓" : "✗"}</span>
            </div>
            {rows.map(([name, status, dur], i) => (
              <div key={i} style={{ padding: "6px 10px", display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, color: "var(--fg-2)", borderBottom: i < rows.length - 1 ? "1px solid var(--line)" : "none", fontFamily: "var(--mono)", fontSize: 12 }}>
                <span>{name}</span>
                <span style={{ color: status === "fail" ? "var(--fail)" : status === "ok" ? "var(--accent)" : "var(--fg-3)" }}>{status}</span>
                <span style={{ color: "var(--fg-3)", minWidth: 32, textAlign: "right" }}>{dur}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ marginTop: 18, padding: "10px 12px", background: "var(--accent-soft)", border: "1px solid var(--accent-line)", color: "var(--accent)", fontSize: 12, fontFamily: "var(--mono)" }}>
        ✓ Promote replay_4d1e → main · saved 1.5s and 2.4k tokens
      </div>
    </div>
  );
}

export function HomepageHowItWorks() {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setActive((s) => (s + 1) % 3), 4000);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="hp-section">
      <div className="hp-section-head">
        <div className="hp-sh-lhs">
          <span className="hp-sh-num">03</span>
          <span className="hp-sh-sep">/</span>
          <span className="hp-sh-title">How it works</span>
        </div>
        <div className="hp-sh-rhs">~5 minutes to first trace</div>
      </div>
      <div className="hp-how">
        <div className="hp-how-left">
          <h2>From <span className="hp-accent">"why is this broken"</span> to a passing replay, in three moves.</h2>
          <div className="hp-how-steps">
            {HOW_STEPS.map((s, i) => (
              <div key={s.n} className={`hp-how-step${active === i ? " hp-step-active" : " hp-inactive"}`} onMouseEnter={() => setActive(i)} onClick={() => setActive(i)}>
                <div className="hp-step-num">{s.n} —</div>
                <div><h3>{s.title}</h3><p>{s.desc}</p></div>
              </div>
            ))}
          </div>
        </div>
        <div className="hp-how-right">
          <HowCanvas step={active} />
        </div>
      </div>
    </section>
  );
}

/* ─── Compare / 2am test ─── */
export function HomepageCompare() {
  const [mode, setMode] = useState<"with" | "without">("with");
  return (
    <section className="hp-section">
      <div className="hp-section-head">
        <div className="hp-sh-lhs">
          <span className="hp-sh-num">04</span>
          <span className="hp-sh-sep">/</span>
          <span className="hp-sh-title">The 2am test</span>
        </div>
        <div className="hp-sh-rhs" style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <button className="hp-btn hp-btn-ghost" style={{ color: mode === "without" ? "var(--fail)" : "var(--fg-3)", padding: "4px 10px" }} onClick={() => setMode("without")}>without rifft</button>
          <span style={{ color: "var(--fg-4)" }}>/</span>
          <button className="hp-btn hp-btn-ghost" style={{ color: mode === "with" ? "var(--accent)" : "var(--fg-3)", padding: "4px 10px" }} onClick={() => setMode("with")}>with rifft</button>
        </div>
      </div>
      <div className="hp-section-intro">
        <h2 className="hp-section-h2" style={{ maxWidth: "26ch" }}>
          Your prod agent failed at 2:14am. <span style={{ color: "var(--fg-2)" }}>What you&apos;d actually do.</span>
        </h2>
      </div>
      <div className="hp-compare">
        <div className="hp-compare-side hp-compare-before">
          <div className={`hp-compare-label hp-compare-label-bad`}>— without rifft</div>
          <h3>Stare at 12k tokens of trace.</h3>
          <div className="hp-term">
            <div className="hp-t-dim">$ tail -f agent.log | grep ERROR</div>
            <div className="hp-t-dim">...</div>
            <div className="hp-t-red">[ERR 02:14:33] Publisher: KeyError &apos;citation_url&apos;</div>
            <div className="hp-t-dim">[INF 02:14:29] Researcher: returned 4 sources</div>
            <div className="hp-t-dim">[INF 02:14:18] Retriever: returned 12 docs</div>
            <div className="hp-t-dim">[INF 02:13:57] Run started</div>
            <br />
            <div><span className="hp-t-amber">you:</span> <span className="hp-t-fg">why is publisher failing</span></div>
            <div><span className="hp-t-amber">you:</span> <span className="hp-t-fg">whose citation_url is missing</span></div>
            <div className="hp-t-red">↳ 47 minutes later: rerun the whole crew with prints</div>
          </div>
        </div>
        <div className="hp-compare-side hp-compare-after">
          <div className="hp-compare-label hp-compare-label-good">— with rifft</div>
          <h3>Open the run. See the cause.</h3>
          <div className="hp-term">
            <div className="hp-t-dim">$ rifft inspect run_8a3f2c</div>
            <br />
            <div><span className="hp-t-green">✓</span> <span className="hp-t-fg">root cause</span> <span className="hp-t-dim">→ Researcher span</span></div>
            <div className="hp-t-dim">&nbsp;&nbsp;└─ unverified citation passed to Publisher</div>
            <br />
            <div><span className="hp-t-green">✓</span> <span className="hp-t-fg">classified as</span> <span className="hp-t-amber">MAST-01 unverified output</span></div>
            <div className="hp-t-dim">&nbsp;&nbsp;└─ similar to 3 prior runs</div>
            <br />
            <div><span className="hp-t-amber">›</span> <span className="hp-t-fg">rifft replay run_8a3f2c --from researcher</span></div>
            <div className="hp-t-green">↳ 2.8s later: green. ship it.</div>
          </div>
        </div>
      </div>
    </section>
  );
}
