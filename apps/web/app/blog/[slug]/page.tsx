import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ArrowRight, BookOpen, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PublicNav } from "@/components/public-nav";
import { getBlogPost, blogPosts } from "@/lib/blog";
import { siteName, siteUrl } from "@/lib/seo";

type BlogPageProps = {
  params: Promise<{ slug: string }>;
};

const prose =
  "prose prose-neutral max-w-none text-[19px] dark:prose-invert prose-headings:scroll-mt-24 prose-headings:font-semibold prose-headings:tracking-tight prose-h2:mt-16 prose-h2:mb-5 prose-h2:text-[1.9rem] prose-h3:mt-10 prose-h3:mb-4 prose-h3:text-[1.3rem] prose-p:my-8 [&_p]:mb-10 prose-p:text-foreground/92 prose-p:leading-[1.9] prose-li:my-2 prose-li:leading-[1.85] prose-ul:my-6 prose-ol:my-6 prose-strong:text-foreground prose-a:text-foreground prose-a:decoration-border prose-a:underline-offset-4 hover:prose-a:text-foreground prose-code:rounded prose-code:bg-muted/70 prose-code:px-1 prose-code:py-0.5 prose-code:font-medium prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none prose-pre:my-8 prose-pre:overflow-x-auto prose-pre:rounded-[1.25rem] prose-pre:border prose-pre:border-border/70 prose-pre:bg-[#111111] prose-pre:p-5 prose-pre:text-[14px] prose-blockquote:border-l-border prose-blockquote:text-foreground/80";

function formatPublishedDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

function ArticleH2({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id}>{children}</h2>;
}

function ArticleH3({ id, children }: { id: string; children: React.ReactNode }) {
  return <h3 id={id}>{children}</h3>;
}

export async function generateStaticParams() {
  return blogPosts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPageProps): Promise<Metadata> {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) {
    return {};
  }

  return {
    title: post.title,
    description: post.description,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: `${post.title} | ${siteName}`,
      description: post.description,
      url: `${siteUrl}/blog/${post.slug}`,
    },
  };
}

function CrewAIDebugPost() {
  return (
    <>
      <p>
        The most common CrewAI debugging failure is not a Python exception. It is a run that
        technically completes — no stack trace, no crash — but produces the wrong downstream
        behavior because one agent handed off the wrong payload, omitted required context, or
        propagated an unverified answer as if it were settled fact. The deception is in the
        silence. The system looks healthy until the output lands in front of a human and it
        obviously is not.
      </p>
      <p>
        A useful debugging flow for these failures has to answer four questions in sequence:
        which agent first introduced the bad state; which handoff carried that state forward;
        what changed between this run and a healthy one; and where is the smallest point in the
        pipeline where a fix can be tested. Get those four answers and you have the defect.
        Miss any one of them and you are guessing.
      </p>

      <ArticleH2 id="example-failure">Example failure</ArticleH2>
      <p>
        Imagine a three-agent CrewAI pipeline: a <strong>Planner</strong> that decomposes the
        task, a <strong>Researcher</strong> that gathers evidence, and a <strong>Writer</strong>{" "}
        that drafts the final answer. The final output is wrong. At first glance the Writer looks
        like the bad actor, because that is where the visible error surfaces. In practice, the root
        cause is almost always earlier. The Researcher may have returned a summary that sounds
        plausible but is missing citations, structured fields, or the exact framing the Writer needs
        to reason correctly. The Writer then produced a polished but incorrect answer — faithfully,
        from bad inputs.
      </p>
      <p>
        This is the characteristic shape of a CrewAI failure: the agent that looks guilty is often
        the victim, and the agent that caused the problem has already moved on.
      </p>

      <ArticleH2 id="confirm-the-visible-failure">Step 1: confirm the visible failure</ArticleH2>
      <p>
        Start with the failing trace and verify what actually went wrong before you move a single
        line of prompt. Did the run end in an explicit error, or did it complete with a bad answer?
        Did the output omit required context that was supposed to flow through the whole pipeline?
        The distinction matters because explicit errors and silent degradations have different root
        causes. In Rifft, the trace detail page surfaces the failing agent, the inferred root cause
        agent, and the handoff path through the run — which means you can usually see in seconds
        whether the failure originated where it appeared, or somewhere upstream.
      </p>

      <ArticleH2 id="inspect-the-handoff">Step 2: inspect the handoff, not just the final agent</ArticleH2>
      <p>
        Bad state in multi-agent systems spreads through messages. The fastest useful question is
        not "what did this agent do wrong?" but <em>what did the upstream agent actually send?</em>{" "}
        Open the selected handoff in the trace and look at the payload directly: are there dropped
        fields, malformed structure, or evidence that was hedged out? Compare what arrived against
        what the downstream agent needed to act correctly.
      </p>
      <p>
        The specific CrewAI pattern to watch for is a research agent that returns a summary with
        confident language but no citations and no structured fields. The writer receives it, trusts
        it, and produces a polished answer built on a hollow foundation. The failure looks like a
        writing problem. It is a research problem.
      </p>

      <ArticleH2 id="classify-the-failure-mode">Step 3: classify the failure mode</ArticleH2>
      <p>
        Once the bad handoff is visible, name it before you change anything. Useful categories are
        unverified output propagation, dropped handoff, context overflow, and schema mismatch
        between agents. The naming is not pedantic — it changes the fix. A dropped handoff needs a
        tighter output schema; unverified propagation needs an explicit uncertainty signal; context
        overflow needs payload reduction, not a better prompt. Rifft maps failures into MAST-style
        categories across traces so you can tell whether this is a one-off incident or a recurring
        structural problem in a specific part of the pipeline.
      </p>

      <ArticleH2 id="compare-against-a-baseline">Step 4: compare against a healthy baseline</ArticleH2>
      <p>
        If you have a healthy trace from the same workflow, mark it as your baseline and compare.
        Did the root cause agent change? Did a new failure mode appear? Did the handoff content grow
        significantly longer, or structurally different in a way that would overload the receiving
        agent? This step catches the category of CrewAI failures that are most frustrating to
        diagnose: breakages introduced by a prompt tweak, a tool change, or a role definition edit
        that looked harmless in code review. The diff between a healthy run and a failing one is
        often more diagnostic than reading either run in isolation.
      </p>

      <ArticleH2 id="test-the-smallest-fix">Step 5: test the smallest possible fix</ArticleH2>
      <p>
        Do not restart the whole mental model from scratch. Save a draft from the failing handoff
        and change only the message payload you suspect is wrong. That gives you a precise
        hypothesis you can either confirm or rule out:
      </p>
      <pre>{`Original handoff:
{
  "facts": [],
  "answer": "Likely correct"
}

Edited draft:
{
  "facts": ["Source A", "Source B", "Source C"],
  "answer": "Supported answer with evidence"
}`}</pre>
      <p>
        Replay the pipeline with that adjusted handoff and open the new trace. If the failure
        disappears, you have isolated the real defect rather than patching symptoms. If it persists,
        the problem is elsewhere, and you have ruled out one hypothesis cleanly instead of
        entangling it with three other changes.
      </p>

      <ArticleH2 id="putting-it-together">Putting it together</ArticleH2>
      <p>
        The discipline here is sequence: start with the trace, not the prompt file; move to the
        handoff before you move to the agent; classify before you change; compare before you
        conclude. The impulse to immediately edit the last agent's prompt is almost always wrong,
        and following it costs hours. The whole workflow — find the origin, isolate the state,
        confirm the fix — is executable in any observability tool that lets you inspect handoffs as
        first-class objects. Rifft mainly makes the attribution and comparison steps faster on
        production runs. The discipline is yours.
      </p>
    </>
  );
}

function CrewAIVsAutoGenPost() {
  return (
    <>
      <p>
        CrewAI and AutoGen both simplify the construction of multi-agent systems. They do not
        simplify failure in the same way. Each framework has a characteristic failure shape — the
        kind of bug it tends to produce, the place where things go wrong, the question you find
        yourself asking when a run misbehaves. Understanding that shape before you start debugging
        cuts the time it takes to find the real problem in half.
      </p>

      <ArticleH2 id="debugging-difference">The core distinction</ArticleH2>
      <p>
        <strong>CrewAI</strong> failures are predominantly role-and-handoff problems.{" "}
        <strong>AutoGen</strong> failures are predominantly conversation-loop, tool-execution, and
        termination-condition problems. That is the whole sentence. Everything else follows from it.
      </p>

      <ArticleH2 id="what-breaks-in-crewai">What breaks in CrewAI</ArticleH2>
      <p>
        CrewAI organizes work as a sequence of roles passing structured outputs to each other. When
        it breaks, the failure is almost always in that transfer. One agent hands off incomplete
        context to the next; role prompts drift over iterations so an agent returns the wrong shape
        of answer; a downstream agent trusts upstream output too eagerly and amplifies a mistake
        that should have been caught. The final visible failure appears late, sometimes in the last
        agent in the chain, even though the root cause was introduced two or three agents earlier.
      </p>
      <p>
        That displacement is what makes CrewAI debugging feel disorienting. You are not looking for
        the agent that failed — you are looking for the agent that poisoned the well.
      </p>

      <ArticleH2 id="what-breaks-in-autogen">What breaks in AutoGen</ArticleH2>
      <p>
        AutoGen organizes work as a conversation between agents. The failure modes that emerge from
        that architecture are different in character: agents loop longer than they should before
        terminating; tool calls succeed syntactically but produce outputs that nobody downstream can
        use; conversation state becomes noisy or contradictory as agents over-correct for each
        other; stop conditions are misconfigured, so the run finishes in the wrong place and
        declares success.
      </p>
      <p>
        AutoGen debugging therefore starts not with a bad handoff but with the conversation
        timeline itself — the sequence of turns, the tool invocations, where the loop began to
        deviate. The relevant question is not "which agent sent the wrong thing?" but "why did this
        exchange go on, or stop, the wrong way?"
      </p>

      <ArticleH2 id="what-to-inspect-first">Where to look first</ArticleH2>
      <ArticleH3 id="what-to-inspect-first-crewai">For CrewAI</ArticleH3>
      <ol>
        <li>Open the failing trace and note where the visible error appears.</li>
        <li>Inspect the handoff into that agent — not the agent itself.</li>
        <li>Check whether the payload structure changed from what you would expect.</li>
        <li>Compare against a healthy baseline run to see what drifted.</li>
      </ol>
      <ArticleH3 id="what-to-inspect-first-autogen">For AutoGen</ArticleH3>
      <ol>
        <li>Open the full conversation timeline and identify where the exchange went wrong.</li>
        <li>Check tool-call results and the follow-up turns that relied on them.</li>
        <li>Inspect stop conditions and retry behavior — did the loop terminate correctly?</li>
        <li>Look for message explosion or circular reasoning between agents.</li>
      </ol>

      <ArticleH2 id="why-this-matters-for-tooling">Why this shapes the tools you need</ArticleH2>
      <p>
        If your framework fails primarily through message propagation, what you need is strong
        handoff inspection and root-cause attribution — the ability to trace bad state backwards
        through agents and identify where it originated. If your framework fails primarily through
        conversational state and tool loops, what you need is timeline visibility and tool output
        tracing.
      </p>
      <p>
        Rifft is built around the first problem. It is strongest when the debugging question is
        "which agent caused the cascade and which handoff carried the bad state forward" — the
        characteristic question of CrewAI and handoff-heavy AutoGen systems. For long conversational
        AutoGen loops, you will want timeline visibility that lets you step through turns
        individually and inspect what each agent knew at each moment.
      </p>

      <ArticleH2 id="practical-recommendation">The practical upshot</ArticleH2>
      <p>
        If your agents pass structured work between defined roles, build your debugging instinct
        around handoff inspection. If your agents negotiate toward a result in long conversations,
        build it around timeline and tool-call inspection. In both cases, keep one healthy baseline
        trace available — the comparison between a good run and a bad one is often more diagnostic
        than reading either in isolation. The goal is not to pick a favourite framework. It is to
        match your debugging reflex to the failure shape the framework you chose actually produces.
      </p>
    </>
  );
}

function HandoffFailuresPost() {
  return (
    <>
      <p>
        Agent handoff failures are among the hardest class of multi-agent bugs to diagnose because
        they present as downstream failures. The visible error appears in the receiving agent. The
        actual defect began one or several steps earlier, when another agent sent the wrong state
        forward — and by the time you open the trace, that originating agent has long since
        completed its work and moved on.
      </p>

      <ArticleH2 id="what-is-a-handoff-failure">What a handoff failure actually is</ArticleH2>
      <p>
        A handoff failure happens when one agent passes a message, payload, or decision artifact to
        another agent and that transfer is incomplete, malformed, misleading, or silently wrong.
        A summarizer drops the evidence the next agent needs. A planner emits a schema the executor
        cannot parse. A researcher forwards an unverified answer as if it were established fact.
        A tool result is passed downstream without the error context that would allow the receiving
        agent to handle it correctly. In each case, the receiving agent behaves consistently with
        what it was given. The problem is not that it failed to handle the situation — the problem
        is that no one in the pipeline noticed the situation was already broken.
      </p>

      <ArticleH2 id="why-handoff-failures-are-dangerous">Why they are particularly dangerous</ArticleH2>
      <p>
        A single bad handoff creates cascades. Each downstream agent behaves correctly given the
        state it received, so the apparent damage spreads across multiple spans simultaneously,
        making every agent past the original failure point look broken. When engineers diagnose the
        run, they see four agents with suspicious outputs and no obvious single cause — which is
        exactly what a cascade from one bad handoff looks like from the outside.
      </p>
      <p>
        This is why fixing the final error is almost always wrong. If you only inspect the last
        agent in the chain, you patch a symptom while the actual defect continues producing new
        failures in every subsequent run.
      </p>

      <ArticleH2 id="classification-model">A classification model that actually helps</ArticleH2>
      <p>
        You do not need an elaborate taxonomy to start debugging more systematically. You need just
        enough structure to distinguish between failure types that require different fixes. A
        MAST-style classification covers the most common cases:
      </p>
      <ul>
        <li><strong>Dropped handoff</strong> — key fields or instructions never arrive at the receiving agent.</li>
        <li><strong>Malformed handoff</strong> — the structure is wrong for what the receiving agent expects.</li>
        <li><strong>Unverified output propagation</strong> — uncertain or provisional output is forwarded as if it were trusted.</li>
        <li><strong>Context overflow</strong> — the handoff is large enough that key details are buried or lost in the receiver's context window.</li>
        <li><strong>Termination mismatch</strong> — the upstream agent signals completion before the work is genuinely done.</li>
      </ul>
      <p>
        The classification matters not because naming things is satisfying but because each type
        points to a different intervention. A dropped handoff needs a tighter output schema. A
        context overflow needs payload reduction, not a better prompt. Unverified propagation needs
        an explicit uncertainty signal. Knowing which type you are looking at stops you from
        applying the wrong fix to the right problem.
      </p>

      <ArticleH2 id="debug-handoff-failures">How to work through a handoff failure</ArticleH2>
      <p>
        The sequence that tends to work: find the first downstream agent that visibly misbehaves,
        then immediately move backward — inspect the exact payload that agent received rather than
        its own outputs. Check whether that payload matches the contract the agent was built to
        expect. Trace further back to find the agent that originated the bad state. Then compare
        that handoff against the same handoff in a healthy run. The diff is usually what you needed
        all along.
      </p>
      <p>
        This is where seeing handoffs as first-class objects in a trace view, with explicit
        communication edges between agents, changes how fast you can work. A handoff buried in a
        log line requires you to reconstruct what was sent; a handoff rendered as a named span with
        an inspectable payload is something you can examine directly.
      </p>

      <ArticleH2 id="healthy-handoff">What a healthy handoff looks like</ArticleH2>
      <p>
        A healthy handoff has clear ownership — it is obvious which agent produced it. It has a
        predictable schema that the receiving agent was designed around. Where the output is based
        on gathered evidence, that provenance is present or at least referenced. The payload is
        large enough for the next agent to act correctly, but not so large that key details are
        overwhelmed by noise. And when the output is provisional — when the upstream agent is not
        certain — that uncertainty is stated explicitly rather than smoothed over with confident
        language.
      </p>

      <ArticleH2 id="what-to-do-once-you-find-one">What to do once you find the failure</ArticleH2>
      <p>
        Resist the impulse to rewrite the pipeline. The smallest intervention that changes the
        failure mode is always preferable, because it isolates causation. Tighten the schema if
        fields are being dropped. Add the missing fields if they are simply absent. Mark uncertain
        outputs explicitly as provisional if they are being forwarded as settled. Reduce payload
        size if context pressure is the issue. Then run the pipeline again, compare the new trace
        against the old one, and verify that the root cause and the failure mode both changed the
        way you expected. If they did, you found the real defect. If they did not, you have at
        least ruled one hypothesis out cleanly.
      </p>

      <ArticleH2 id="why-systematic-classification-helps">Why classification across traces matters</ArticleH2>
      <p>
        Teams that debug handoff failures as isolated incidents gradually accumulate a hidden
        pattern they cannot see. The same dropped handoff recurs in a different part of the system.
        Tool outputs are propagated without verification across multiple agents. A prompt change
        from two weeks ago increased context pressure in ways that are only now causing failures.
        Each incident looks unique because it is treated in isolation.
      </p>
      <p>
        Classifying failures the same way across every trace turns isolated incidents into a
        searchable record. Dropped handoffs that cluster in one part of the pipeline point to a
        structural problem with how that agent's output is specified. Spikes in unverified
        propagation after a deployment point to a prompt change that removed some previously
        implicit verification step. That is the real value of a taxonomy: not labelling, but
        making patterns visible that would otherwise stay hidden in individual runs.
      </p>
    </>
  );
}

function RifftVsLangSmithPost() {
  return (
    <>
      <p>
        LangSmith and Rifft both let you observe LLM calls and trace agent runs. If you are
        debugging a multi-agent pipeline — one where multiple agents hand work to each other,
        make tool calls, and accumulate state — they approach the problem quite differently. This
        post is a direct comparison of where each tool is strongest, what each one misses, and how
        to decide which fits your debugging workflow.
      </p>
      <p>
        The short version: LangSmith is the best choice if you are deep in the LangChain ecosystem
        and care primarily about prompt evaluation and dataset management. Rifft is the better choice
        if your pipeline spans multiple frameworks or custom agents, and your main problem is
        diagnosing which agent in a cascade caused a failure and why.
      </p>

      <ArticleH2 id="what-each-tool-is-built-around">What each tool is built around</ArticleH2>
      <p>
        LangSmith was built alongside LangChain and its mental model reflects that origin. The core
        primitives are runs, datasets, and evaluations. You trace a run, annotate it, add it to a
        dataset, and eventually run evals over that dataset to measure prompt quality. It is
        primarily an <em>evaluation and experiment management</em> tool that also has tracing.
      </p>
      <p>
        Rifft was built for multi-agent pipelines first. Its core primitives are spans, traces,
        agent handoffs, and failure modes. The primary question it is designed to answer is: <em>which
        agent broke this run, which handoff carried the bad state forward, and has this failure
        pattern appeared before?</em> It is primarily a <em>root-cause and regression</em> tool
        that also has observability.
      </p>

      <ArticleH2 id="how-the-debugging-models-differ">How the debugging models differ</ArticleH2>
      <p>
        The practical consequence of those different origins shows up the moment you open a failing
        trace.
      </p>
      <p>
        In LangSmith, a run is a flat or lightly nested sequence of LLM calls. You can see inputs,
        outputs, token counts, and latency for each call. Debugging means reading down the sequence
        and spotting where the output went wrong. For simple chains this works well. For pipelines
        where six agents interact, it forces you to manually reconstruct who sent what to whom.
      </p>
      <p>
        In Rifft, a trace is a graph of spans with explicit agent identity, handoff edges, and MAST
        failure classifications. The trace detail page shows you the root cause agent — the one Rifft
        infers first introduced bad state — separately from the agent where the visible error
        appeared. For multi-agent systems that distinction matters because the final error is almost
        never where the defect started.
      </p>

      <ArticleH2 id="langsmith-genuine-strengths">Where LangSmith is genuinely stronger</ArticleH2>
      <p>
        LangSmith's most significant advantage is its integration with LangChain and LangGraph. If
        your agents are built on those frameworks, tracing is near-zero configuration and the run
        structure maps naturally to what LangSmith expects. You are not adapting your pipeline to
        fit the tool — the tool was built for your pipeline.
      </p>
      <p>
        Beyond tracing, LangSmith has a mature prompt playground that lets you edit a prompt,
        re-run it over a dataset, and compare outputs side by side. This is genuinely useful when
        the debugging question is "which version of this prompt works better?" rather than "why did
        this specific production run fail?" Dataset management and annotation are also well-developed:
        labelling runs, building golden test sets, and running automated evaluators are first-class
        workflows. If your team treats AI development more like ML engineering — building eval
        pipelines, tracking prompt benchmarks across versions — LangSmith is the stronger fit for
        that work today.
      </p>

      <ArticleH2 id="rifft-genuine-strengths">Where Rifft is genuinely stronger</ArticleH2>
      <p>
        Rifft's first advantage is that it does not care what framework you used. It ingests
        standard OpenTelemetry spans, which means a pipeline that mixes CrewAI, AutoGen, custom
        Python agents, and an in-house tool executor produces one unified trace without requiring
        you to bend your code to match a vendor's SDK. For teams that are not deep in the LangChain
        ecosystem, that matters immediately.
      </p>
      <p>
        The more distinctive capabilities are MAST failure classification, regression detection,
        and fork-and-replay. Classification means failures are grouped by type — dropped handoff,
        unverified output propagation, context overflow, termination mismatch — so you can ask
        whether your pipeline has seen a failure mode before rather than reading every trace
        individually. Regression detection means Rifft compares failure rates by category this
        week against the prior three weeks and surfaces significant increases in the weekly digest,
        before they become user-facing incidents. And fork-and-replay means that when a run fails,
        you can modify the exact span output you suspect caused the cascade — the researcher's
        handoff, the planner's tool result — save it as a draft, and replay the pipeline from that
        point. You get a new trace to compare against the original. That is direct hypothesis
        testing in production data, not reconstruction from memory in a prompt playground.
      </p>

      <ArticleH2 id="debugging-a-real-cascade">Debugging a real cascade — how each tool handles it</ArticleH2>
      <p>
        Consider a five-agent pipeline: orchestrator, planner, researcher, writer, validator. The
        validator rejects the final output. The reason is not obvious.
      </p>
      <p>
        In LangSmith, you open the run and scroll through the LLM call sequence. You can see the
        validator's input and the rejection reason. To find where the bad state originated, you
        read backwards through the writer, researcher, and planner calls until you spot the
        anomaly. If the calls are long or the nesting is deep, this takes a while and requires you
        to hold a great deal of context in your head — because the tool is showing you a sequence
        of calls, not a map of who sent what to whom.
      </p>
      <p>
        In Rifft, you open the trace and the incident summary names the root cause agent — in this
        case, likely the researcher — based on handoff analysis. You go directly to that span,
        inspect what it sent downstream, compare the payload to a healthy baseline, and fork the
        span with a corrected payload to test the fix. The full diagnostic cycle is contained in
        one trace view. You are not reconstructing the failure; you are examining it.
      </p>

      <ArticleH2 id="what-neither-tool-does-yet">What neither tool does yet</ArticleH2>
      <p>
        Both tools tell you what happened in a run. Neither yet tells you why a specific input
        reliably causes a specific failure. The capability that is missing from both products is
        automatic correlation between span attributes and failure outcomes — the kind of finding
        that would surface "traces with input tokens above 6,000 fail fatally at four times the
        rate of shorter traces" without requiring manual analysis. That is still work an engineer
        has to do themselves, in both tools.
      </p>

      <ArticleH2 id="how-to-choose">How to decide</ArticleH2>
      <p>
        LangSmith is the better choice if your stack is primarily LangChain or LangGraph, if you
        spend more engineering time on prompt iteration and evaluation than on diagnosing live
        failures, and if you want a mature dataset and annotation workflow that integrates with a
        CI pipeline. It was designed for that work and it shows.
      </p>
      <p>
        Rifft is the better choice if your pipeline spans multiple frameworks or a custom agent
        runtime, if cascading failures — where the visible error is not where the defect started
        — are your primary debugging problem, and if you want to test fixes by replaying production
        runs with modified span outputs rather than approximating the failure in a playground.
        Fork-and-replay and MAST classification have no direct equivalent in LangSmith today.
      </p>
      <p>
        The tools are not mutually exclusive. Some teams use LangSmith during development for
        prompt evaluation and Rifft in production for root-cause analysis and regression detection.
        The debugging models are different enough that they do not substantially overlap — which
        means they can coexist without redundancy.
      </p>

      <ArticleH2 id="summary">The essential difference</ArticleH2>
      <p>
        LangSmith was built to help you improve an AI system through evaluation. Rifft was built to
        help you understand why a production run failed and prevent the same failure from recurring.
        If your primary question is "how do I make this prompt better?", LangSmith is the right
        room. If your primary question is "which agent broke this run, and is it getting worse?",
        Rifft is. Knowing which question you are actually trying to answer is, as usual, most of
        the work.
      </p>
    </>
  );
}

function renderPost(slug: string) {
  switch (slug) {
    case "how-to-debug-a-crewai-agent-pipeline-failure":
      return <CrewAIDebugPost />;
    case "crewai-vs-autogen-debugging-what-breaks-and-why":
      return <CrewAIVsAutoGenPost />;
    case "understanding-agent-handoff-failures-in-multi-agent-systems":
      return <HandoffFailuresPost />;
    case "rifft-vs-langsmith-multi-agent-debugging":
      return <RifftVsLangSmithPost />;
    default:
      return null;
  }
}

export default async function BlogPostPage({ params }: BlogPageProps) {
  const { slug } = await params;
  const post = getBlogPost(slug);
  if (!post) {
    notFound();
  }

  const content = renderPost(slug);
  if (!content) {
    notFound();
  }

  const relatedPosts = blogPosts.filter((candidate) => candidate.slug !== slug).slice(0, 2);

  return (
    <div className="min-h-screen bg-background px-6 py-8 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-[1200px] space-y-10">
        <PublicNav badge="Blog" />

        <article className="mx-auto max-w-3xl space-y-10">
            <Link
              href="/blog"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to blog
            </Link>

            <header className="space-y-6 border-b border-border/70 pb-10">
              <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <Badge variant="outline" className="rounded-full px-3 py-1">
                    {post.category}
                  </Badge>
                  <span>{formatPublishedDate(post.publishedAt)}</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock3 className="h-3.5 w-3.5" />
                    {post.readTime}
                  </span>
              </div>
              <div className="space-y-5">
                  <h1 className="text-balance text-4xl font-semibold tracking-[-0.035em] lg:text-6xl">
                    {post.title}
                  </h1>
                  <p className="max-w-2xl text-xl leading-9 text-muted-foreground">
                    {post.description}
                  </p>
                </div>
                <div className="overflow-hidden rounded-[1.75rem] border border-border/70 bg-muted/20">
                  <Image
                    src={post.image}
                    alt={post.title}
                    width={1200}
                    height={630}
                    className="h-auto w-full"
                    priority
                  />
                </div>
                <div className="grid gap-4 text-sm sm:grid-cols-3">
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Published
                    </div>
                    <div className="mt-2 font-medium text-foreground">
                      {formatPublishedDate(post.publishedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Reading time
                    </div>
                    <div className="mt-2 font-medium text-foreground">{post.readTime}</div>
                  </div>
                  <div>
                    <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      Focus
                    </div>
                    <div className="mt-2 font-medium text-foreground">
                      Root cause analysis for agent systems
                    </div>
                  </div>
                </div>
            </header>

            <div className="px-0">
              <div className={prose}>{content}</div>
            </div>

            <section className="space-y-4 border-t border-border/70 pt-8">
              <div className="flex items-center gap-2 text-sm uppercase tracking-[0.16em] text-muted-foreground">
                <BookOpen className="h-4 w-4" />
                Keep reading
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                {relatedPosts.map((relatedPost) => (
                  <Card key={relatedPost.slug} className="rounded-[1.5rem] border-border/70 bg-muted/25 shadow-none">
                    <CardContent className="space-y-4 p-5">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                        <Badge variant="outline">{relatedPost.category}</Badge>
                        <span>{formatPublishedDate(relatedPost.publishedAt)}</span>
                      </div>
                      <div className="space-y-2">
                        <h2 className="text-xl font-semibold tracking-tight">
                          <Link href={`/blog/${relatedPost.slug}`} className="hover:underline">
                            {relatedPost.title}
                          </Link>
                        </h2>
                        <p className="text-sm leading-7 text-muted-foreground">
                          {relatedPost.description}
                        </p>
                      </div>
                      <Link
                        href={`/blog/${relatedPost.slug}`}
                        className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
                      >
                        Read article
                        <ArrowRight className="h-4 w-4" />
                      </Link>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </section>
        </article>
      </div>
    </div>
  );
}
