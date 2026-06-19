import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield, Lock, KeyRound, Database, Mail, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust & security · SplitAI" },
      {
        name: "description",
        content:
          "How SplitAI protects subscriber data, webhook secrets, and on-chain payouts. Maintained by the SplitAI team.",
      },
      { property: "og:title", content: "Trust & security · SplitAI" },
      {
        property: "og:description",
        content:
          "How SplitAI protects subscriber data, webhook secrets, and on-chain payouts.",
      },
    ],
  }),
  component: TrustPage,
});

function TrustPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 px-6 py-12">
      <header className="space-y-3">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Home
        </Link>
        <div className="flex items-center gap-2 text-primary">
          <Shield className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wider">Trust &amp; security</span>
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">
          How SplitAI handles your data
        </h1>
        <p className="text-sm text-muted-foreground">
          This page is maintained by the SplitAI team to answer common security and
          privacy questions about the app. It describes controls currently enabled in
          the product. It is not an independent certification or audit report.
        </p>
      </header>

      <Section
        icon={<Lock className="h-4 w-4" />}
        title="Authentication &amp; access"
      >
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            All app pages outside the landing page and this page require a signed-in
            account. Sign-in uses email + password or Google.
          </li>
          <li>
            Data is scoped per team. A user only sees streams, contributors,
            payments, proposals and payouts for teams they belong to.
          </li>
          <li>
            Sensitive fields (subscriber email addresses, webhook secrets, Ghost API
            keys) are restricted to <strong>team owners</strong>. Other team members
            see masked or hidden values.
          </li>
        </ul>
      </Section>

      <Section
        icon={<Database className="h-4 w-4" />}
        title="Data we store"
      >
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            <strong>Account data:</strong> your email, display name, avatar (from your
            sign-in provider).
          </li>
          <li>
            <strong>Stream &amp; content data:</strong> Ghost posts and author metadata
            that you pull in to feed the split-suggestion model.
          </li>
          <li>
            <strong>Payments:</strong> the subscriber email and amount reported by your
            Ghost webhooks. Subscriber emails are visible only to team owners.
          </li>
          <li>
            <strong>Payouts:</strong> contributor wallet addresses, amounts, and
            on-chain transaction hashes for batched USDC distributions on Arc.
          </li>
        </ul>
      </Section>

      <Section
        icon={<KeyRound className="h-4 w-4" />}
        title="Secrets &amp; integrations"
      >
        <ul className="list-disc space-y-2 pl-5 text-sm text-muted-foreground">
          <li>
            Webhook secrets and third-party API keys are stored server-side and are
            not returned to non-owner team members through the API.
          </li>
          <li>
            Ghost webhook deliveries are verified with an HMAC signature before any
            payment is recorded.
          </li>
          <li>
            USDC payouts are signed by a Circle developer-controlled wallet and
            batched on-chain via Arc&apos;s predeployed Multicall3From contract.
          </li>
        </ul>
      </Section>

      <Section
        icon={<Mail className="h-4 w-4" />}
        title="Reporting a security issue"
      >
        <p className="text-sm text-muted-foreground">
          If you believe you have found a security vulnerability in SplitAI, please
          contact the team directly so we can investigate and respond. Include steps
          to reproduce; do not test against accounts or data you do not own.
        </p>
      </Section>

      <footer className="border-t border-border pt-6 text-xs text-muted-foreground">
        This page reflects controls currently in the product and is updated by the
        SplitAI team. It does not constitute a regulatory certification, an audit
        report, or a legal commitment.
      </footer>
    </div>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="flex items-center gap-2 text-lg font-medium">
        <span className="text-primary">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}
