export type BlogPostMeta = {
  slug: string;
  title: string;
  description: string;
  publishedAt: string;
  readTime: string;
  keywords: string[];
};

export const blogPosts: BlogPostMeta[] = [
  {
    slug: "how-to-debug-a-crewai-agent-pipeline-failure",
    title: "How to debug a CrewAI agent pipeline failure",
    description:
      "A practical guide to debugging a CrewAI agent pipeline failure, including how to isolate the bad handoff, inspect the trace, and confirm the fix.",
    publishedAt: "2026-04-18",
    readTime: "8 min read",
    keywords: [
      "how to debug a crewai agent pipeline failure",
      "crewai debugging",
      "debug crewai agent failure",
      "crewai pipeline failed",
    ],
  },
  {
    slug: "crewai-vs-autogen-debugging-what-breaks-and-why",
    title: "CrewAI vs AutoGen debugging — what breaks and why",
    description:
      "A practical comparison of CrewAI and AutoGen debugging, including the failure patterns each framework tends to produce and how to investigate them.",
    publishedAt: "2026-04-18",
    readTime: "7 min read",
    keywords: [
      "crewai vs autogen debugging",
      "crewai autogen comparison",
      "debugging autogen agents",
      "debugging crewai agents",
    ],
  },
  {
    slug: "understanding-agent-handoff-failures-in-multi-agent-systems",
    title: "Understanding agent handoff failures in multi-agent systems",
    description:
      "A guide to agent handoff failures in multi-agent systems, including dropped handoffs, malformed payloads, context loss, and how to classify them systematically.",
    publishedAt: "2026-04-18",
    readTime: "9 min read",
    keywords: [
      "understanding agent handoff failures in multi-agent systems",
      "agent handoff failures",
      "multi agent system failures",
      "mast taxonomy agent failures",
    ],
  },
];

export const getBlogPost = (slug: string) =>
  blogPosts.find((post) => post.slug === slug) ?? null;
