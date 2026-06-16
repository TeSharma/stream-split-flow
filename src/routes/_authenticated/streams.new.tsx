import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { getMyTeams } from "@/lib/teams.functions";
import { createStream } from "@/lib/streams.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio } from "lucide-react";

export const Route = createFileRoute("/_authenticated/streams/new")({
  head: () => ({ meta: [{ title: "New stream · SplitAI" }] }),
  component: NewStream,
});

function NewStream() {
  const navigate = useNavigate();
  const teamsFn = useServerFn(getMyTeams);
  const createFn = useServerFn(createStream);
  const teamsQ = useQuery({ queryKey: ["teams"], queryFn: () => teamsFn() });

  const [name, setName] = useState("");
  const [ghostUrl, setGhostUrl] = useState("");

  const m = useMutation({
    mutationFn: (teamId: string) =>
      createFn({ data: { teamId, name, ghostSiteUrl: ghostUrl } }),
    onSuccess: (s) => {
      toast.success("Stream created");
      navigate({ to: "/streams/$streamId", params: { streamId: s.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const team = teamsQ.data?.[0];

  return (
    <div className="mx-auto max-w-xl">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Radio className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Ghost stream</span>
          </div>
          <CardTitle>Create a new stream</CardTitle>
          <CardDescription>
            Connect a Ghost newsletter. After creating, you'll get a webhook URL and secret
            to paste into Ghost's Custom Integrations.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!team) return;
              m.mutate(team.id);
            }}
            className="space-y-4"
          >
            <div className="space-y-1.5">
              <Label htmlFor="stream-name">Stream name</Label>
              <Input
                id="stream-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Weekly Brief"
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ghost-url">Ghost site URL (optional)</Label>
              <Input
                id="ghost-url"
                type="url"
                value={ghostUrl}
                onChange={(e) => setGhostUrl(e.target.value)}
                placeholder="https://yourletter.ghost.io"
              />
            </div>
            <Button type="submit" className="w-full" disabled={!team || m.isPending}>
              {m.isPending ? "Creating…" : "Create stream"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
