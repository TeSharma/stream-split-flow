import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getStream, triggerDemoPayment } from "@/lib/streams.functions";
import { addContributor, getTeamOverview } from "@/lib/teams.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Zap, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/streams/$streamId")({
  head: ({ params }) => ({ meta: [{ title: `Stream ${params.streamId.slice(0, 8)} · SplitAI` }] }),
  component: StreamDetail,
});

function StreamDetail() {
  const { streamId } = Route.useParams();
  const getStreamFn = useServerFn(getStream);
  const overviewFn = useServerFn(getTeamOverview);
  const stream = useQuery({
    queryKey: ["stream", streamId],
    queryFn: () => getStreamFn({ data: { streamId } }),
  });
  const overview = useQuery({
    queryKey: ["team-overview", stream.data?.team_id],
    queryFn: () => overviewFn({ data: { teamId: stream.data!.team_id } }),
    enabled: !!stream.data?.team_id,
  });

  if (stream.isLoading) return <div className="text-sm text-muted-foreground">Loading…</div>;
  if (stream.error) return <div className="text-sm text-destructive">{(stream.error as Error).message}</div>;
  const s = stream.data!;
  const contributors = overview.data?.contributors ?? [];

  const origin =
    typeof window !== "undefined" ? window.location.origin : "https://your-app.lovable.app";
  const webhookUrl = `${origin}/api/public/ghost-webhook?stream=${s.id}`;

  return (
    <div className="space-y-8">
      <div>
        <Link
          to="/dashboard"
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" /> Dashboard
        </Link>
        <h1 className="text-3xl font-semibold">{s.name}</h1>
        <p className="text-sm text-muted-foreground">{s.ghost_site_url || "—"}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ghost webhook</CardTitle>
            <CardDescription>
              In Ghost Admin → Settings → Integrations → Add custom integration. Create a webhook
              for <span className="font-mono">member.added</span> and paste:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Webhook URL" value={webhookUrl} />
            <Field label="Secret" value={s.webhook_secret} mono />
            <DemoButton streamId={s.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contributors</CardTitle>
            <CardDescription>The team behind the content on this stream.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contributors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contributors yet — add one below.</p>
            ) : (
              <ul className="divide-y divide-border">
                {contributors.map((c) => (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <div>
                      <p className="font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.role}</p>
                    </div>
                    <p className="truncate font-mono text-xs text-muted-foreground">
                      {c.wallet_address ? `${c.wallet_address.slice(0, 6)}…${c.wallet_address.slice(-4)}` : "no wallet"}
                    </p>
                  </li>
                ))}
              </ul>
            )}
            <AddContributorForm teamId={s.team_id} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-2">
        <code className={`flex-1 truncate text-xs ${mono ? "font-mono" : ""}`}>{value}</code>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            toast.success("Copied");
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function DemoButton({ streamId }: { streamId: string }) {
  const fn = useServerFn(triggerDemoPayment);
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => fn({ data: { streamId, amountCents: 500 } }),
    onSuccess: () => {
      toast.success("Demo payment fired");
      qc.invalidateQueries({ queryKey: ["recent-payments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Button variant="outline" className="w-full" onClick={() => m.mutate()} disabled={m.isPending}>
      <Zap className="mr-1.5 h-4 w-4" /> Trigger demo payment ($5.00)
    </Button>
  );
}

function AddContributorForm({ teamId }: { teamId: string }) {
  const fn = useServerFn(addContributor);
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [role, setRole] = useState("writer");
  const [wallet, setWallet] = useState("");
  const m = useMutation({
    mutationFn: () => fn({ data: { teamId, name, role, walletAddress: wallet || undefined } }),
    onSuccess: () => {
      toast.success("Contributor added");
      setName(""); setWallet(""); setRole("writer");
      qc.invalidateQueries({ queryKey: ["team-overview", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <form
      onSubmit={(e) => { e.preventDefault(); if (name) m.mutate(); }}
      className="space-y-2 border-t border-border pt-4"
    >
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Add contributor</p>
      <div className="grid grid-cols-2 gap-2">
        <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <Input placeholder="Role (writer, editor…)" value={role} onChange={(e) => setRole(e.target.value)} />
      </div>
      <Input
        placeholder="Wallet address (USDC on Arc)"
        value={wallet}
        onChange={(e) => setWallet(e.target.value)}
        className="font-mono text-xs"
      />
      <Button type="submit" size="sm" disabled={m.isPending} className="w-full">
        {m.isPending ? "Adding…" : "Add"}
      </Button>
    </form>
  );
}
