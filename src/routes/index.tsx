import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Zap, BrainCircuit, ShieldCheck, Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoAsset from "@/assets/SplitAi-transparent.png.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "SplitAI — real-time creator revenue streams" },
      {
        name: "description",
        content:
          "Turn Ghost subscriptions into live revenue streams. AI proposes contribution-based splits, your team approves, USDC pays out on Arc.",
      },
      { property: "og:title", content: "SplitAI — real-time creator revenue streams" },
      {
        property: "og:description",
        content:
          "Ghost payments → AI split → team approval → instant USDC on Arc. Every subscription becomes a flow.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="bg-grid absolute inset-0 opacity-60" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-background/60 to-background" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-primary pulse-mint" />
          <span className="font-mono text-sm tracking-wider">SPLIT.AI</span>
        </div>
        <nav className="flex items-center gap-3">
          <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
          <Button asChild size="sm">
            <Link to="/auth">
              Get started <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </Button>
        </nav>
      </header>

      <main className="relative z-10 mx-auto max-w-6xl px-6 pb-24 pt-12 lg:pt-24">
        <div className="max-w-3xl">
          
          <h1 className="text-5xl font-bold leading-[1.05] tracking-tight lg:text-7xl">
            Every subscription becomes a{" "}
            <span className="text-primary">real-time revenue stream.</span>
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            SplitAI ingests Ghost payments as live events. AI proposes contribution-based splits.
            Your team approves. USDC pays out instantly on Arc — to every contributor.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link to="/auth">
                Launch dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link to="/live">Watch live feed</Link>
            </Button>
          </div>
        </div>

        <div className="mt-24 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            {
              icon: Zap,
              title: "Stream events",
              body: "Ghost webhooks land as live payment events the moment a subscriber pays.",
            },
            {
              icon: BrainCircuit,
              title: "AI splits",
              body: "Articles, edits, assets — AI scores who contributed what and proposes a fair %.",
            },
            {
              icon: ShieldCheck,
              title: "Human approval",
              body: "Your team approves or adjusts every split. AI suggests, humans decide.",
            },
            {
              icon: Coins,
              title: "USDC on Arc",
              body: "Payouts settle in batches on Arc — every contributor paid, every tx logged.",
            },
          ].map((f) => (
            <div
              key={f.title}
              className="rounded-2xl border border-border bg-card/60 p-6 backdrop-blur transition-colors hover:border-primary/40"
            >
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-24 max-w-2xl text-sm text-muted-foreground">
          "This turns every subscription into a real-time revenue flow that automatically rewards
          everyone who contributed to the content."
        </p>
      </main>
    </div>
  );
}
