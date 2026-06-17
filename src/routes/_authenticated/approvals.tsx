import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getPendingProposals, approveSplitProposal } from "@/lib/splits.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Sparkles, CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "Approvals · SplitAI" }] }),
  component: Approvals,
});

function Approvals() {
  const fn = useServerFn(getPendingProposals);
  const q = useQuery({ queryKey: ["pending-proposals"], queryFn: () => fn() });

  if (q.isLoading) return <div className="text-sm text-muted-foreground">Loading proposals…</div>;
  if (q.error) return <div className="text-sm text-destructive">{(q.error as Error).message}</div>;
  const items = q.data ?? [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wider">AI proposals</span>
        </div>
        <h1 className="text-3xl font-semibold">Split approvals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI suggests, you approve. Adjust percentages before confirming.
        </p>
      </div>
      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No pending proposals. Trigger a demo payment from the dashboard.
          </CardContent>
        </Card>
      ) : (
        items.map((p) => <ProposalCard key={p.id} proposal={p} />)
      )}
    </div>
  );
}

type Proposal = Awaited<ReturnType<typeof getPendingProposals>>[number];

function ProposalCard({ proposal }: { proposal: Proposal }) {
  const qc = useQueryClient();
  const [pct, setPct] = useState<Record<string, number>>(
    Object.fromEntries(proposal.contributors.map((c) => [c.id, c.percent])),
  );
  const approveFn = useServerFn(approveSplitProposal);
  const m = useMutation({
    mutationFn: () =>
      approveFn({ data: { proposalId: proposal.id, percentages: pct } }),
    onSuccess: () => {
      toast.success("Proposal approved — payouts queued");
      qc.invalidateQueries({ queryKey: ["pending-proposals"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const total = useMemo(
    () => +Object.values(pct).reduce((s, v) => s + (Number(v) || 0), 0).toFixed(2),
    [pct],
  );
  const amount = proposal.payment ? proposal.payment.amount_cents / 100 : 0;
  const stream = proposal.payment?.stream_name ?? "Stream";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-lg">
              ${amount.toFixed(2)} · {stream}
            </CardTitle>
            <CardDescription>
              {proposal.payment?.subscriber_email ?? "subscriber"} ·{" "}
              {new Date(proposal.created_at).toLocaleString()}
            </CardDescription>
          </div>
          <span className="rounded-full border border-primary/30 bg-primary/10 px-2 py-1 text-xs text-primary">
            AI suggested
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {proposal.ai_rationale && (
          <p className="rounded-md border border-border bg-card/60 p-3 text-xs leading-relaxed text-muted-foreground">
            {proposal.ai_rationale}
          </p>
        )}
        <div className="space-y-2">
          {proposal.contributors.map((c) => (
            <div key={c.id} className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{c.role}</div>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.01}
                  value={pct[c.id] ?? 0}
                  onChange={(e) =>
                    setPct((prev) => ({ ...prev, [c.id]: Number(e.target.value) }))
                  }
                  className="w-24 text-right"
                />
                <span className="w-6 text-xs text-muted-foreground">%</span>
                <span className="w-20 text-right font-mono text-xs text-muted-foreground">
                  ${((amount * (pct[c.id] ?? 0)) / 100).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-border pt-3">
          <div className="text-xs">
            Total:{" "}
            <span
              className={
                Math.abs(total - 100) < 0.5
                  ? "font-mono text-primary"
                  : "font-mono text-destructive"
              }
            >
              {total.toFixed(2)}%
            </span>
          </div>
          <Button
            size="sm"
            onClick={() => m.mutate()}
            disabled={m.isPending || Math.abs(total - 100) > 0.5}
          >
            <CheckCircle2 className="mr-1.5 h-4 w-4" />
            {m.isPending ? "Approving…" : "Approve & queue payouts"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
