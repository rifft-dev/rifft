import type { Metadata } from "next";
import Link from "next/link";
import { PublicNav } from "@/components/public-nav";
import { siteName, siteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Rifft collects, uses, and protects your data.",
  alternates: { canonical: "/privacy" },
  openGraph: {
    title: `Privacy Policy — ${siteName}`,
    url: `${siteUrl}/privacy`,
  },
};

const EFFECTIVE_DATE = "1 May 2026";
const CONTACT_EMAIL = "hello@rifft.dev";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <PublicNav badge="Legal" />

      <main className="mx-auto max-w-3xl px-6 py-16">
        <div className="mb-10 space-y-2">
          <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Legal</p>
          <h1 className="text-4xl font-semibold tracking-tight">Privacy Policy</h1>
          <p className="text-sm text-muted-foreground">Effective {EFFECTIVE_DATE}</p>
        </div>

        <div className="prose prose-neutral dark:prose-invert max-w-none space-y-8 text-sm leading-7 text-muted-foreground [&_h2]:mb-3 [&_h2]:mt-10 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-foreground [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-2">

          <p>
            Rifft Inc. ("<strong className="text-foreground">Rifft</strong>", "we", "us", or "our") operates the Rifft
            platform at rifft.dev (the "<strong className="text-foreground">Service</strong>"). This Privacy Policy
            explains what information we collect, how we use it, and your rights in relation to it. By
            using the Service you agree to the practices described here.
          </p>

          <h2>1. Information we collect</h2>
          <p>
            <strong className="text-foreground">Account information.</strong> When you create an account we collect your
            email address and, if you sign in via GitHub, your GitHub username and public profile
            information.
          </p>
          <p>
            <strong className="text-foreground">Trace and span data.</strong> The core of the Service is the ingestion
            and display of telemetry you send to our hosted collector. This data — spans, attributes,
            agent identifiers, LLM token counts, cost figures, and MAST failure annotations — is
            stored on your behalf and associated with your project. You control what you send.
          </p>
          <p>
            <strong className="text-foreground">Usage data.</strong> We collect standard web analytics — pages visited,
            features used, error rates — to understand how the product is performing. We do not sell
            this data.
          </p>
          <p>
            <strong className="text-foreground">Billing information.</strong> Payments are handled by Stripe. Rifft
            stores only the Stripe customer ID and subscription status. We never store raw card
            numbers.
          </p>
          <p>
            <strong className="text-foreground">Communications.</strong> If you contact us by email or enable alert
            notifications we store the email address you provide for that purpose.
          </p>

          <h2>2. How we use your information</h2>
          <p>We use the information we collect to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Provide, operate, and improve the Service</li>
            <li>Send transactional emails — magic links, billing receipts, and alert notifications</li>
            <li>Enforce usage limits and billing</li>
            <li>Investigate security incidents and abuse</li>
            <li>Comply with legal obligations</li>
          </ul>
          <p>
            We do not use your trace data to train machine learning models, and we do not sell your
            data to third parties.
          </p>

          <h2>3. Data retention</h2>
          <p>
            Span and trace data is retained according to your plan: 14 days on Cloud Free, 90 days on
            Cloud Pro, and 1 year on Cloud Scale. Account information is retained for the lifetime of
            your account and for up to 90 days after deletion to allow for dispute resolution.
          </p>

          <h2>4. Data sharing</h2>
          <p>We share data only with the following categories of recipients:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li><strong className="text-foreground">Infrastructure providers</strong> — cloud hosting, database, and object storage vendors who process data on our behalf under appropriate data processing agreements</li>
            <li><strong className="text-foreground">Stripe</strong> — for payment processing</li>
            <li><strong className="text-foreground">Resend</strong> — for transactional email delivery</li>
            <li><strong className="text-foreground">Law enforcement</strong> — where required by valid legal process</li>
          </ul>
          <p>
            Shareable incident links (a Pro and Scale feature) give anyone with the link read-only
            access to a specific trace. You are responsible for controlling who you share these links
            with.
          </p>

          <h2>5. Security</h2>
          <p>
            All data is transmitted over TLS. Span data at rest is encrypted using AES-256. API keys
            are stored as hashed values and are never displayed in full after creation. We conduct
            regular security reviews. If you discover a vulnerability, please report it to{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
          </p>

          <h2>6. Your rights</h2>
          <p>
            Depending on where you are located, you may have rights to access, correct, export, or
            delete the personal data we hold about you. To exercise any of these rights, email us at{" "}
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address associated with
            your account. We will respond within 30 days.
          </p>
          <p>
            You can delete your account and all associated project data at any time from Settings.
            Span data in ClickHouse is purged within 24 hours of project deletion.
          </p>

          <h2>7. Cookies</h2>
          <p>
            We use a single session cookie to keep you signed in. We do not use third-party
            advertising cookies or fingerprinting.
          </p>

          <h2>8. Children</h2>
          <p>
            The Service is not directed at children under 16. We do not knowingly collect personal
            data from children. If you believe a child has provided us with personal data, contact us
            and we will delete it promptly.
          </p>

          <h2>9. Changes to this policy</h2>
          <p>
            We may update this policy from time to time. When we make material changes we will notify
            you by email (if you have alerts configured) or by a notice on the Service at least 14
            days before the change takes effect. Continued use of the Service after the effective date
            constitutes acceptance of the updated policy.
          </p>

          <h2>10. Contact</h2>
          <p>
            Rifft Inc.<br />
            <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
          </p>
        </div>

        <div className="mt-12 border-t border-border pt-8 text-xs text-muted-foreground">
          See also:{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-foreground transition-colors">
            Terms of Service
          </Link>
        </div>
      </main>
    </div>
  );
}
