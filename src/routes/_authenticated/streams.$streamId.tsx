import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getStream, triggerDemoPayment } from "@/lib/streams.functions";
import { addContributor, getTeamOverview } from "@/lib/teams.functions";
import { updateGhostConnection, syncGhostContent } from "@/lib/ghost.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Copy, Zap, ArrowLeft, RefreshCw, Plug } from "lucide-react";

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

      <ConnectGhostCard
        streamId={s.id}
        initialUrl={s.ghost_site_url ?? ""}
        hasKey={!!s.ghost_content_api_key}
        lastSyncAt={s.ghost_last_sync_at}
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Ghost webhook</CardTitle>
            <CardDescription>
              Sends a payment event into SplitAI every time a member subscribes on Ghost.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ol className="space-y-1.5 text-xs text-muted-foreground list-decimal pl-4">
              <li>
                In Ghost Admin → <b>Settings → Integrations</b> → <b>+ Add custom integration</b>,
                name it "SplitAI".
              </li>
              <li>
                Click <b>+ Add webhook</b>. Event: <code className="font-mono">Member subscription created</code>.
                Paste the URL and secret below.
              </li>
              <li>
                (Optional) Add a second webhook for <code className="font-mono">Member added</code> if you also
                want trial-to-paid conversions.
              </li>
            </ol>
            <Field label="Webhook URL" value={webhookUrl} />
            <Field
              label="Secret"
              value={s.webhook_secret ?? "— owner-only —"}
              mono
            />
            <DemoButton streamId={s.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contributors</CardTitle>
            <CardDescription>
              The team behind the content. Ghost authors are imported automatically when you sync.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contributors.length === 0 ? (
              <p className="text-sm text-muted-foreground">No contributors yet — sync Ghost or add one below.</p>
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

function ConnectGhostCard({
  streamId,
  initialUrl,
  hasKey,
  lastSyncAt,
}: {
  streamId: string;
  initialUrl: string;
  hasKey: boolean;
  lastSyncAt: string | null;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(updateGhostConnection);
  const syncFn = useServerFn(syncGhostContent);
  const [url, setUrl] = useState(initialUrl);
  const [key, setKey] = useState("");

  useEffect(() => setUrl(initialUrl), [initialUrl]);

  const save = useMutation({
    mutationFn: () =>
      saveFn({ data: { streamId, ghostSiteUrl: url, ghostContentApiKey: key } }),
    onSuccess: () => {
      toast.success("Ghost connection saved");
      setKey("");
      qc.invalidateQueries({ queryKey: ["stream", streamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sync = useMutation({
    mutationFn: () => syncFn({ data: { streamId } }),
    onSuccess: (r) => {
      toast.success(
        `Synced ${r.postsSynced} post${r.postsSynced === 1 ? "" : "s"}` +
          (r.contributorsAdded
            ? `, added ${r.contributorsAdded} contributor${r.contributorsAdded === 1 ? "" : "s"}`
            : ""),
      );
      qc.invalidateQueries({ queryKey: ["stream", streamId] });
      qc.invalidateQueries({ queryKey: ["team-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <div className="mb-2 flex items-center gap-2 text-primary">
          <Plug className="h-4 w-4" />
          <span className="text-xs uppercase tracking-wider">Connect Ghost</span>
        </div>
        <CardTitle>Sync posts & authors</CardTitle>
        <CardDescription>
          Paste your Ghost site URL and a Content API key. SplitAI imports authors as contributors
          and posts as content signal for the AI split agent. Find your key in Ghost Admin →{" "}
          <b>Settings → Integrations → SplitAI → Content API Key</b>.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (url && key) save.mutate();
          }}
          className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
        >
          <div className="space-y-1.5">
            <Label htmlFor="ghost-url" className="text-xs uppercase tracking-wider text-muted-foreground">
              Ghost site URL
            </Label>
            <Input
              id="ghost-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://yourletter.ghost.io"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ghost-key" className="text-xs uppercase tracking-wider text-muted-foreground">
              Content API key {hasKey && <span className="text-primary">· saved</span>}
            </Label>
            <Input
              id="ghost-key"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder={hasKey ? "Replace key (leave blank to keep)" : "22-char hex key"}
              className="font-mono text-xs"
              required={!hasKey}
            />
          </div>
          <Button type="submit" disabled={save.isPending || !url || !key}>
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          <p className="text-xs text-muted-foreground">
            {lastSyncAt
              ? `Last synced ${new Date(lastSyncAt).toLocaleString()}`
              : "Not synced yet"}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasKey || sync.isPending}
            onClick={() => sync.mutate()}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? "Syncing…" : "Sync content now"}
          </Button>
        </div>
      </CardContent>
    </Card>
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
