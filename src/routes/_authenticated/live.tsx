import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Radio } from "lucide-react";

export const Route = createFileRoute("/_authenticated/live")({
  head: () => ({ meta: [{ title: "Live · SplitAI" }] }),
  component: () => (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <Radio className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Phase 4</span>
          </div>
          <CardTitle>Live event stream</CardTitle>
          <CardDescription>
            The money-in-motion feed lands here next — real-time payment events,
            AI splits, approvals, and USDC payouts as they happen.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Coming in Phase 4.
        </CardContent>
      </Card>
    </div>
  ),
});
