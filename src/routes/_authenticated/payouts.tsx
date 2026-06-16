import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Coins } from "lucide-react";

export const Route = createFileRoute("/_authenticated/payouts")({
  head: () => ({ meta: [{ title: "Payouts · SplitAI" }] }),
  component: () => (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Coins className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Phase 5</span>
          </div>
          <CardTitle>USDC payouts on Arc</CardTitle>
          <CardDescription>
            Confirmed payouts and Arc transaction hashes will appear here.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Settlement integration arrives in Phase 5.
        </CardContent>
      </Card>
    </div>
  ),
});
