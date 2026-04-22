import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/public-nav";
import { siteName, siteUrl } from "@/lib/seo";
import { statusPageHref } from "@/lib/status";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Rifft.",
  alternates: { canonical: "/terms" },
  openGraph: {
    title: `Terms of Service — ${siteName}`,
    url: `${siteUrl}/terms`,
  },
};

const EFFECTIVE_DATE = "1 May 2026";
const CONTACT_EMAIL = "hello@rifft.dev";

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav badge="Legal" />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10 space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Legal</p>
          <h1 className="text-4xl font-semibold tracking-tight">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-sm leading-7 text-muted-foreground [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2">

          <p>
            These Terms of Service ("<strong className="text-foreground">Terms</strong>") are a legal agreement between
            you and Rifft Inc. ("<strong className="text-foreground">Rifft</strong>", "we", "us", or "our") governing
            your access to and use of the Rifft platform and related services (the "
            <strong className="text-foreground">Service</strong>"). By creating an account or using the Service you
            agree to be bound by these Terms. If you are using the Service on behalf of an organisation,
            you represent that you have authority to bind that organisation.
          </p>

          <h2>1. The Service</h2>
          <p>
            Rifft provides hosted observability tooling for multi-agent AI pipelines, including span
            ingestion, trace visualisation, MAST failure classification, fork and replay, and related
            features. The specific features available to you depend on your plan (Cloud Free, Cloud Pro,
            or Cloud Scale).
          </p>
          <p>
            We also make Rifft available as open-source self-hosted software under the licence in the
            repository. These Terms apply to the hosted Service only, not to self-hosted deployments.
          </p>

          <h2>2. Accounts</h2>
          <p>
            You must provide accurate information when creating an account and keep it up to date. You
            are responsible for all activity that occurs under your account. You must not share your API
            keys or access credentials with anyone outside your organisation. Notify us immediately at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> if you suspect unauthorised access.
          </p>
          <p>
            You must be at least 16 years old to use the Service.
          </p>

          <h2>3. Plans, billing, and payment</h2>
          <p>
            Cloud Free is provided at no charge subject to the usage limits stated on the pricing page.
            Cloud Pro and Cloud Scale are billed monthly in advance via Stripe. All fees are in US
            dollars and are non-refundable except where required by law.
          </p>
          <p>
            Cloud Scale includes overage billing at $5 per 100K spans above the 2M monthly included
            allowance. Overages are calculated at the end of each billing period and charged to the
            payment method on file.
          </p>
          <p>
            We may change prices with at least 30 days' notice by email and by updating the pricing
            page. Continued use of the Service after a price change takes effect constitutes acceptance
            of the new price.
          </p>
          <p>
            If payment fails, we will notify you and give you a reasonable period to update your payment
            method before downgrading or suspending your account.
          </p>

          <h2>4. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Use the Service in violation of any applicable law or regulation</li>
            <li>Send data to the Service that you do not have the right to process</li>
            <li>Attempt to gain unauthorised access to any part of the Service or its infrastructure</li>
            <li>Reverse-engineer, decompile, or attempt to extract the source code of the hosted Service</li>
            <li>Use the Service to store or transmit malicious code</li>
            <li>Resell or sublicense access to the Service without our written consent</li>
            <li>Circumvent usage limits by creating multiple accounts to obtain additional free-tier resources</li>
          </ul>

          <h2>5. Your data</h2>
          <p>
            You retain all rights to the trace and span data you send to the Service. By sending data
            you grant Rifft a limited licence to store, process, and display that data solely to provide
            the Service to you.
          </p>
          <p>
            We do not use your data to train machine learning models and we do not sell your data.
            Refer to our <Link href="/privacy">Privacy Policy</Link> for full details.
          </p>
          <p>
            You are responsible for ensuring that any personal data included in your telemetry is
            collected and processed lawfully, and that you have an appropriate basis for sending it
            to a third-party processor.
          </p>

          <h2>6. Intellectual property</h2>
          <p>
            The Rifft name, logo, and the hosted Service (excluding open-source components) are the
            intellectual property of Rifft Inc. Nothing in these Terms transfers ownership of any
            intellectual property to you.
          </p>
          <p>
            Feedback, suggestions, or ideas you submit to us may be used by Rifft without obligation
            or compensation to you.
          </p>

          <h2>7. Uptime and support</h2>
          <p>
            We aim to maintain high availability but do not guarantee any specific uptime percentage
            except where stated in a separately executed service level agreement. Scheduled maintenance
            will be announced via{" "}
            <a href={statusPageHref}>
              {statusPageHref.startsWith("http") ? "status.rifft.dev" : "the local status page"}
            </a>{" "}
            where possible.
          </p>
          <p>
            Support is provided by email for Pro and Scale plans, and via community channels for Free
            users. Scale users receive priority support response times.
          </p>

          <h2>8. Suspension and termination</h2>
          <p>
            We may suspend or terminate your account if you materially breach these Terms and fail to
            cure the breach within 10 days of written notice. We may terminate immediately for serious
            violations including illegal activity or repeated abuse.
          </p>
          <p>
            You may terminate your account at any time from Settings. Termination does not entitle
            you to a refund of any pre-paid fees. Span data is purged within 24 hours of account
            deletion.
          </p>

          <h2>9. Disclaimers</h2>
          <p>
            THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE". TO THE MAXIMUM EXTENT PERMITTED BY
            APPLICABLE LAW, RIFFT DISCLAIMS ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES
            OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. RIFFT DOES
            NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR FREE OF HARMFUL
            COMPONENTS.
          </p>

          <h2>10. Limitation of liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, RIFFT&apos;S TOTAL LIABILITY TO YOU FOR
            ANY CLAIMS ARISING UNDER THESE TERMS WILL NOT EXCEED THE GREATER OF (A) THE AMOUNTS YOU
            PAID TO RIFFT IN THE 12 MONTHS PRECEDING THE CLAIM OR (B) US $100. IN NO EVENT WILL
            RIFFT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES.
          </p>

          <h2>11. Governing law</h2>
          <p>
            These Terms are governed by the laws of the State of Delaware, USA, without regard to
            conflict of law principles. Any disputes will be resolved in the state or federal courts
            located in Delaware, and you consent to personal jurisdiction in those courts.
          </p>

          <h2>12. Changes to these Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will be communicated by
            email or by a prominent notice in the Service at least 14 days before they take effect.
            Your continued use of the Service after the effective date constitutes acceptance of the
            updated Terms.
          </p>

          <h2>13. Contact</h2>
          <p>
            Rifft Inc.<br />
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </div>

        <div className="mt-12 border-t border-border pt-8 text-xs text-muted-foreground">
          See also:{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Privacy Policy
          </Link>
        </div>
      </main>
    </div>
  );
}
