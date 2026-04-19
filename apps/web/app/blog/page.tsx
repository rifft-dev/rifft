import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BookOpen } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PublicNav } from "@/components/public-nav";
import { blogPosts } from "@/lib/blog";
import { siteName, siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Guides for debugging CrewAI, AutoGen, and multi-agent systems, including handoff failures, trace analysis, and real debugging workflows.",
  alternates: {
    canonical: "/blog",
  },
  openGraph: {
    title: `${siteName} Blog`,
    description:
      "Guides for debugging CrewAI, AutoGen, and multi-agent systems, including handoff failures, trace analysis, and real debugging workflows.",
    url: `${siteUrl}/blog`,
  },
};

export default function BlogIndexPage() {
  return (
    <div className="min-h-screen bg-background px-6 py-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-10">
        <PublicNav badge="Blog" />

        <section className="space-y-4">
          <div className="space-y-3">
            <h1 className="text-4xl font-semibold tracking-tight lg:text-5xl">
              Practical guides for debugging AI agent systems
            </h1>
            <p className="max-w-3xl text-base text-muted-foreground lg:text-lg">
              Useful debugging guides for CrewAI, AutoGen, and multi-agent systems. These posts are
              written to help engineers solve real failures, not just describe the product.
            </p>
          </div>
        </section>

        <section className="grid gap-6">
          {blogPosts.map((post) => (
            <Card key={post.slug} className="rounded-3xl">
              <CardHeader className="space-y-3">
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>{post.publishedAt}</span>
                  <span>·</span>
                  <span>{post.readTime}</span>
                </div>
                <CardTitle className="text-2xl leading-tight">
                  <Link href={`/blog/${post.slug}`} className="hover:underline">
                    {post.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="max-w-3xl text-sm text-muted-foreground">{post.description}</p>
                <div className="flex flex-wrap gap-2">
                  {post.keywords.slice(0, 3).map((keyword) => (
                    <Badge key={keyword} variant="secondary">
                      {keyword}
                    </Badge>
                  ))}
                </div>
                <Link
                  href={`/blog/${post.slug}`}
                  className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
                >
                  <BookOpen className="h-4 w-4" />
                  Read article
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </CardContent>
            </Card>
          ))}
        </section>
      </div>
    </div>
  );
}
