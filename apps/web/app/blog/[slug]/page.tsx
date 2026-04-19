import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { PublicNav } from "@/components/public-nav";
import { getBlogPost, blogPosts } from "@/lib/blog";
import { siteName, siteUrl } from "@/lib/seo";

type BlogPageProps = {
  params: Promise<{ slug: string }>;
};

const prose =
  "prose prose-neutral max-w-none dark:prose-invert prose-headings:scroll-mt-24 prose-pre:overflow-x-auto prose-pre:rounded-2xl prose-pre:border prose-pre:bg-muted/30 prose-pre:p-4";

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
        technically completes, but produces the wrong downstream behavior because one agent handed
        off the wrong payload, omitted required context, or propagated an unverified answer.
      </p>
      <p>
        A good debugging flow should answer four questions quickly:
      </p>
      <ol>
        <li>Which agent first introduced the bad state?</li>
        <li>Which handoff carried that bad state forward?</li>
        <li>What changed between a healthy run and the failed one?</li>
        <li>What is the smallest point in the pipeline where you can test a fix?</li>
      </ol>
      <h2>Example failure</h2>
      <p>
        Imagine a three-agent CrewAI pipeline:
      </p>
      <ul>
        <li><strong>Planner</strong> decomposes the task.</li>
        <li><strong>Researcher</strong> gathers evidence.</li>
        <li><strong>Writer</strong> drafts the final answer.</li>
      </ul>
      <p>
        The final output is wrong. At first glance the <strong>Writer</strong> looks like the bad
        agent, because that is where the visible error appears. In practice, the root cause is often
        earlier: the <strong>Researcher</strong> may have sent incomplete notes or an unchecked
        answer to the Writer, which then amplified the mistake.
      </p>
      <h2>Step 1: confirm the visible failure</h2>
      <p>
        Start with the failing trace and verify what actually went wrong:
      </p>
      <ul>
        <li>Did the run end in an explicit error?</li>
        <li>Did it complete with a bad answer?</li>
        <li>Did the output omit required context?</li>
      </ul>
      <p>
        In Rifft, open the trace detail page and use the incident summary to see the failing agent,
        the inferred root cause agent, and the handoff path through the run. This is useful because
        CrewAI failures often look like “the last agent failed” when the real issue started earlier.
      </p>
      <h2>Step 2: inspect the handoff, not just the final agent</h2>
      <p>
        In multi-agent systems, bad state usually spreads through messages. That means the fastest
        useful question is: <em>what did the upstream agent actually send?</em>
      </p>
      <p>
        Open the selected handoff in the trace:
      </p>
      <ul>
        <li>Check the payload preview.</li>
        <li>Look for dropped fields, malformed structure, or weak evidence.</li>
        <li>Compare the message to what the downstream agent needed.</li>
      </ul>
      <p>
        In CrewAI, a common pattern is that a research agent returns a summary that sounds plausible
        but is missing citations or the exact structured fields the next agent expects. The writer
        then produces a polished but incorrect answer.
      </p>
      <h2>Step 3: classify the failure mode</h2>
      <p>
        Once you see the bad handoff, classify the failure in plain language. Useful categories are:
      </p>
      <ul>
        <li>unverified output propagation</li>
        <li>dropped handoff</li>
        <li>context overflow</li>
        <li>schema mismatch between agents</li>
      </ul>
      <p>
        Rifft maps failures into MAST-style categories so you can tell whether this is a one-off
        bug or a recurring pattern across traces.
      </p>
      <h2>Step 4: compare against a healthy baseline</h2>
      <p>
        If you have a healthy trace from the same workflow, mark it as your baseline. Then compare
        the failing run against it:
      </p>
      <ul>
        <li>Did the root cause agent change?</li>
        <li>Did a new failure mode appear?</li>
        <li>Did the handoff content get longer, shorter, or structurally different?</li>
      </ul>
      <p>
        This step matters because CrewAI failures often show up after a prompt tweak, tool change,
        or role definition change that looks harmless in code review.
      </p>
      <h2>Step 5: test the smallest possible fix</h2>
      <p>
        Do not restart the whole mental model from scratch. Save a draft from the failing handoff
        and change only the message payload you suspect is wrong. That gives you a precise fix
        hypothesis:
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
        Then rerun the pipeline with that adjusted handoff and open the new trace. If the failure
        disappears, you have isolated the real defect instead of just patching symptoms.
      </p>
      <h2>Checklist for debugging CrewAI failures</h2>
      <ul>
        <li>Start with the failing trace, not the prompt file.</li>
        <li>Check the handoff that fed the failing agent.</li>
        <li>Classify the failure mode before changing prompts.</li>
        <li>Compare against a healthy baseline if one exists.</li>
        <li>Test the smallest payload-level fix you can.</li>
      </ul>
      <p>
        That workflow works well whether you use Rifft or not. Rifft mainly makes the handoff,
        attribution, and comparison steps faster to execute on real runs.
      </p>
    </>
  );
}

function CrewAIVsAutoGenPost() {
  return (
    <>
      <p>
        CrewAI and AutoGen both make it easier to build multi-agent systems. They do not fail in
        exactly the same way, and the debugging workflow changes depending on which framework you
        use.
      </p>
      <h2>The debugging difference in one sentence</h2>
      <p>
        <strong>CrewAI</strong> failures are often role-and-handoff problems. <strong>AutoGen</strong>{" "}
        failures are often conversation-loop, tool-execution, or termination-condition problems.
      </p>
      <h2>What typically breaks in CrewAI</h2>
      <ul>
        <li>One agent hands off incomplete context to the next.</li>
        <li>Role prompts drift, so an agent returns the wrong shape of answer.</li>
        <li>A downstream agent trusts upstream output too early.</li>
        <li>The final visible failure appears late, even though the root cause was earlier.</li>
      </ul>
      <p>
        That means CrewAI debugging is usually about tracing the failure backwards through handoffs
        and comparing the bad run with a healthy one.
      </p>
      <h2>What typically breaks in AutoGen</h2>
      <ul>
        <li>Agents loop too long before termination.</li>
        <li>Tool calls succeed syntactically but produce unusable outputs.</li>
        <li>Conversation state becomes noisy, repetitive, or contradictory.</li>
        <li>Stop conditions are wrong, so the run “finishes” in the wrong place.</li>
      </ul>
      <p>
        AutoGen debugging often starts from the conversation timeline and tool invocation sequence
        rather than just a single bad handoff.
      </p>
      <h2>How the failure feels in practice</h2>
      <p>
        In CrewAI, you often ask: <em>which agent gave the next agent the wrong thing?</em>
      </p>
      <p>
        In AutoGen, you often ask: <em>why did this conversation keep going, stop too early, or
        produce a tool result nobody validated?</em>
      </p>
      <h2>What to inspect first</h2>
      <h3>CrewAI</h3>
      <ol>
        <li>Open the failing trace.</li>
        <li>Inspect the handoff into the failing agent.</li>
        <li>Check whether the payload structure drifted.</li>
        <li>Compare to a healthy baseline.</li>
      </ol>
      <h3>AutoGen</h3>
      <ol>
        <li>Open the full conversation timeline.</li>
        <li>Check tool-call results and follow-up turns.</li>
        <li>Inspect stop conditions and retry behavior.</li>
        <li>Look for message explosion or circular reasoning.</li>
      </ol>
      <h2>Why this matters for tooling</h2>
      <p>
        If your framework mostly fails through message propagation, you need strong handoff
        inspection and root-cause attribution. If your framework mostly fails through long
        conversational state and tool loops, you need strong timeline and tool visibility.
      </p>
      <p>
        Rifft is strongest when the debugging question is “which agent caused the cascade?” and
        “which handoff carried the bad state forward?” That tends to be especially useful in CrewAI
        and handoff-heavy AutoGen systems.
      </p>
      <h2>Practical recommendation</h2>
      <ul>
        <li>If your agents pass structured work between roles, prioritize handoff inspection.</li>
        <li>If your agents negotiate in long conversations, prioritize timeline inspection.</li>
        <li>In both cases, keep one healthy baseline trace around for comparisons.</li>
      </ul>
      <p>
        The important part is not picking a winner. It is matching your debugging workflow to the
        failure shape your framework produces most often.
      </p>
    </>
  );
}

function HandoffFailuresPost() {
  return (
    <>
      <p>
        Agent handoff failures are one of the hardest classes of multi-agent bugs because they often
        look like downstream failures. The visible error appears in the receiving agent, but the
        actual defect began when another agent sent the wrong state forward.
      </p>
      <h2>What is a handoff failure?</h2>
      <p>
        A handoff failure happens when one agent passes a message, payload, or decision artifact to
        another agent, and that transfer is incomplete, malformed, misleading, or silently wrong.
      </p>
      <p>Typical examples:</p>
      <ul>
        <li>a summarizer drops evidence the next agent needs</li>
        <li>a planner emits the wrong schema for an executor</li>
        <li>a researcher forwards an unverified answer as if it were trusted</li>
        <li>a tool result is passed along without error context</li>
      </ul>
      <h2>Why handoff failures are dangerous</h2>
      <p>
        They create cascades. One bad handoff can make multiple downstream agents appear broken even
        though they were behaving consistently with the state they received.
      </p>
      <p>
        That is why root-cause attribution matters. If you only inspect the final error, you often
        fix the wrong prompt or the wrong agent.
      </p>
      <h2>A useful classification model</h2>
      <p>
        You do not need a huge taxonomy to start, but systematic debugging gets much easier if you
        classify failures consistently. A useful MAST-style view includes:
      </p>
      <ul>
        <li><strong>Dropped handoff</strong>: key fields or instructions never arrive.</li>
        <li><strong>Malformed handoff</strong>: structure is wrong for the receiving agent.</li>
        <li><strong>Unverified output propagation</strong>: uncertain output is treated as trusted.</li>
        <li><strong>Context overflow</strong>: the handoff is so large that key details are lost.</li>
        <li><strong>Termination mismatch</strong>: upstream agent signals completion too early.</li>
      </ul>
      <h2>How to debug handoff failures</h2>
      <ol>
        <li>Find the first downstream agent that visibly misbehaves.</li>
        <li>Inspect the exact payload it received.</li>
        <li>Check whether that payload matches the contract the agent expects.</li>
        <li>Trace backward to the agent that originated the bad state.</li>
        <li>Compare the handoff against a healthy run.</li>
      </ol>
      <p>
        This is where a trace view with communication edges helps. You want to see the handoff as a
        first-class debugging object, not just a buried log line.
      </p>
      <h2>What a healthy handoff looks like</h2>
      <ul>
        <li>clear ownership of who produced it</li>
        <li>predictable schema</li>
        <li>evidence or provenance where needed</li>
        <li>enough context for the next agent to act safely</li>
        <li>explicit uncertainty when the output is provisional</li>
      </ul>
      <h2>What to do once you find one</h2>
      <p>
        Resist the urge to rewrite the whole pipeline. First test the smallest intervention:
      </p>
      <ul>
        <li>tighten the schema</li>
        <li>add missing fields</li>
        <li>mark uncertain outputs as untrusted</li>
        <li>reduce payload size if context pressure is involved</li>
      </ul>
      <p>
        Then compare the new run against a healthy baseline and confirm that the root cause and
        failure mode changed the way you expected.
      </p>
      <h2>Why systematic classification helps</h2>
      <p>
        Teams often debug handoff failures as isolated incidents. Over time, that hides the real
        pattern. If you classify failures the same way across traces, you can answer better
        questions:
      </p>
      <ul>
        <li>Are dropped handoffs recurring in one part of the system?</li>
        <li>Are tool outputs being propagated without verification?</li>
        <li>Did a prompt change increase context pressure across multiple runs?</li>
      </ul>
      <p>
        That is where frameworks like the MAST taxonomy become useful. They make failures easier to
        group, compare, and prioritize instead of treating every run as a unique mystery.
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

  return (
    <div className="min-h-screen bg-background px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <PublicNav badge="Blog" />

        <article className="mx-auto max-w-3xl space-y-8">
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to blog
        </Link>

        <header className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">Blog</Badge>
            <span>{post.publishedAt}</span>
            <span>·</span>
            <span>{post.readTime}</span>
          </div>
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">{post.title}</h1>
            <p className="max-w-2xl text-base text-muted-foreground lg:text-lg">
              {post.description}
            </p>
          </div>
        </header>

        <div className={prose}>{content}</div>
        </article>
      </div>
    </div>
  );
}
