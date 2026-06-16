import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/approvals")({
  head: () => ({ meta: [{ title: "Approvals · SplitAI" }] }),
  component: () => (
    <div className="mx-auto max-w-2xl">
      <Card>
        <CardHeader>
          <div className="mb-2 flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-4 w-4" />
            <span className="text-xs uppercase tracking-wider">Phase 3</span>
          </div>
          <CardTitle>Split approvals</CardTitle>
          <CardDescription>
            Pending AI split proposals will appear here. Review the AI rationale,
            adjust percentages, approve.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Coming up next — the AI engine wires into this view.
        </CardContent>
      </Card>
    </div>
  ),
});
