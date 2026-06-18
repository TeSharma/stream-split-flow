import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listMyPayouts, refreshPayoutStatuses } from "@/lib/payouts.functions";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, RefreshCw, ExternalLink, CheckCircle2, Clock, AlertCircle, MinusCircle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payouts")({
  head: () => ({ meta: [{ title: "Payouts · SplitAI" }] }),
  component: Payouts,
});

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; Icon: typeof Clock }> = {
    queued: { label: "Queued", cls: "border-muted-foreground/30 bg-muted/40 text-muted-foreground", Icon: Clock },
    submitted: { label: "Submitted", cls: "border-primary/40 bg-primary/10 text-primary", Icon: Clock },
    confirmed: { label: "Confirmed", cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-400", Icon: CheckCircle2 },
    failed: { label: "Failed", cls: "border-destructive/40 bg-destructive/10 text-destructive", Icon: AlertCircle },
    skipped: { label: "Skipped", cls: "border-muted-foreground/30 bg-muted/40 text-muted-foreground", Icon: MinusCircle },
  };
  const m = map[status] ?? map.queued;
  const Icon = m.Icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider ${m.cls}`}>
      <Icon className="h-3 w-3" /> {m.label}
    </span>
  );
}

function explorer(txHash: string | null | undefined) {
  if (!txHash) return null;
  return `https://explorer-testnet.arc.network/tx/${txHash}`;
}

function Payouts() {
  const qc = useQueryClient();
  const fn = useServerFn(listMyPayouts);
  const refreshFn = useServerFn(refreshPayoutStatuses);
  const q = useQuery({ queryKey: ["my-payouts"], queryFn: () => fn() });

  // Realtime: refetch on any payouts row change
  useEffect(() => {
    const channel = supabase
      .channel("payouts-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "payouts" }, () => {
        qc.invalidateQueries({ queryKey: ["my-payouts"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  const refresh = useMutation({
    mutationFn: () => refreshFn(),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["my-payouts"] });
      toast.success(r.updated ? `Updated ${r.updated} payout(s)` : "No status changes");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const items = q.data ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Coins className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">USDC payouts</span>
          </div>
          <h1 className="text-3xl font-semibold">Payouts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Live settlement via Circle Developer Wallets on Arc Testnet. Updates stream in as they confirm on-chain.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refresh.mutate()} disabled={refresh.isPending}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${refresh.isPending ? "animate-spin" : ""}`} />
          Refresh status
        </Button>
      </div>

      {q.isLoading ? (
        <div className="text-sm text-muted-foreground">Loading payouts…</div>
      ) : items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No payouts yet</CardTitle>
            <CardDescription>Approve a split proposal to queue USDC transfers.</CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            After approval, payouts here move through <span className="font-medium">queued → submitted → confirmed</span>.
            Contributors without a wallet address show as <span className="font-medium">skipped</span>.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {items.map((p) => {
                const url = explorer(p.tx_hash);
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{p.contributor.name}</span>
                        <span className="text-xs text-muted-foreground">· {p.contributor.role}</span>
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">
                        {p.stream_name}
                        {p.destination_address ? (
                          <span className="ml-2 font-mono">
                            → {p.destination_address.slice(0, 6)}…{p.destination_address.slice(-4)}
                          </span>
                        ) : null}
                      </div>
                      {p.error ? (
                        <div className="mt-1 text-xs text-destructive">{p.error}</div>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <div className="font-mono text-sm">{p.amount_usdc.toFixed(4)} USDC</div>
                      <div className="mt-1 flex items-center justify-end gap-2">
                        <StatusBadge status={p.status} />
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                          >
                            tx <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
