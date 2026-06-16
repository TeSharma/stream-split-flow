import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  getMyTeams,
  createTeam,
  getTeamOverview,
  getRecentPayments,
} from "@/lib/teams.functions";
import { triggerDemoPayment } from "@/lib/streams.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Plus, Zap, Radio, Users, Coins, ArrowRight } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard · SplitAI" },
      { name: "description", content: "Your team's revenue streams and recent activity." },
    ],
  }),
  component: Dashboard,
});

function Dashboard() {
  const teamsFn = useServerFn(getMyTeams);
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => teamsFn() });

  if (teamsQ.isLoading) {
    return <div className="text-sm text-muted-foreground">Loading…</div>;
  }
  if (teamsQ.error) {
    return <div className="text-sm text-destructive">{(teamsQ.error as Error).message}</div>;
  }
  const teams = teamsQ.data ?? [];
  if (teams.length === 0) return <CreateFirstTeam />;
  return <TeamDashboard teamId={teams[0].id} teamName={teams[0].name} />;
}

function CreateFirstTeam() {
  const qc = useQueryClient();
  const createFn = useServerFn(createTeam);
  const [name, setName] = useState("");
  const m = useMutation({
    mutationFn: (n: string) => createFn({ data: { name: n } }),
    onSuccess: () => {
      toast.success("Team created");
      qc.invalidateQueries({ queryKey: ["teams"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="mx-auto max-w-md">
      <Card>
        <CardHeader>
          <CardTitle>Create your team</CardTitle>
          <CardDescription>
            Teams own streams, contributors, and approve splits together.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) m.mutate(name.trim());
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="team-name">Team name</Label>
              <Input
                id="team-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Indie Letter Co."
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={m.isPending}>
              {m.isPending ? "Creating…" : "Create team"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function TeamDashboard({ teamId, teamName }: { teamId: string; teamName: string }) {
  const overviewFn = useServerFn(getTeamOverview);
  const paymentsFn = useServerFn(getRecentPayments);
  const overview = useQuery({
    queryKey: ["team-overview", teamId],
    queryFn: () => overviewFn({ data: { teamId } }),
  });
  const payments = useQuery({
    queryKey: ["recent-payments", teamId],
    queryFn: () => paymentsFn({ data: { teamId } }),
  });

  const streams = overview.data?.streams ?? [];
  const contributors = overview.data?.contributors ?? [];
  const recentPayments = payments.data ?? [];
  const totalCents = recentPayments.reduce((s, p) => s + p.amount_cents, 0);

  const qc = useQueryClient();
  const demoFn = useServerFn(triggerDemoPayment);
  const demo = useMutation({
    mutationFn: (streamId: string) => demoFn({ data: { streamId, amountCents: 500 } }),
    onSuccess: () => {
      toast.success("Demo payment triggered");
      qc.invalidateQueries({ queryKey: ["recent-payments", teamId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Team</p>
          <h1 className="text-3xl font-semibold">{teamName}</h1>
        </div>
        <Button asChild>
          <Link to="/streams/new">
            <Plus className="mr-1.5 h-4 w-4" /> New stream
          </Link>
        </Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Stat icon={Radio} label="Streams" value={streams.length} />
        <Stat icon={Users} label="Contributors" value={contributors.length} />
        <Stat icon={Zap} label="Recent payments" value={recentPayments.length} />
        <Stat
          icon={Coins}
          label="Recent volume"
          value={`$${(totalCents / 100).toFixed(2)}`}
        />
      </div>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Streams
        </h2>
        {streams.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              No streams yet.{" "}
              <Link to="/streams/new" className="text-primary hover:underline">
                Create your first one
              </Link>{" "}
              to start ingesting Ghost payments.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {streams.map((s) => (
              <Card key={s.id} className="transition-colors hover:border-primary/40">
                <CardHeader>
                  <CardTitle className="text-lg">{s.name}</CardTitle>
                  <CardDescription>
                    {s.ghost_site_url || "No Ghost URL configured"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-wrap items-center justify-between gap-2">
                  <Button asChild size="sm" variant="outline">
                    <Link to="/streams/$streamId" params={{ streamId: s.id }}>
                      Open <ArrowRight className="ml-1 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => demo.mutate(s.id)}
                    disabled={demo.isPending}
                  >
                    <Zap className="mr-1 h-3.5 w-3.5" /> Trigger demo payment
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted-foreground">
          Recent payments
        </h2>
        {recentPayments.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No payments yet. Trigger a demo payment above or connect a Ghost webhook.
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Subscriber</th>
                  <th className="px-4 py-2 text-left">Amount</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id} className="border-t border-border">
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(p.received_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">{p.subscriber_email}</td>
                    <td className="px-4 py-2 font-mono">
                      ${(p.amount_cents / 100).toFixed(2)}
                    </td>
                    <td className="px-4 py-2">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between py-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-semibold">{value}</p>
        </div>
        <Icon className="h-5 w-5 text-primary" />
      </CardContent>
    </Card>
  );
}
