import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Contributor = { id: string; name: string; role: string };
type ContentItem = { contributor_id: string; type: string; title: string; body_excerpt: string | null };

/**
 * Heuristic fallback: equal split when no AI/content signal exists.
 * Returns map contributorId -> percent (sums to 100).
 */
function heuristicSplit(contributors: Contributor[], items: ContentItem[]) {
  if (contributors.length === 0) return { percentages: {}, rationale: "No contributors." };
  // weight: 1 base + 2 per article + 0.5 per edit + 0.25 per asset by that contributor
  const weights = new Map<string, number>(contributors.map((c) => [c.id, 1]));
  for (const it of items) {
    const w = weights.get(it.contributor_id);
    if (w == null) continue;
    const bump = it.type === "article" ? 2 : it.type === "edit" ? 0.5 : 0.25;
    weights.set(it.contributor_id, w + bump);
  }
  const total = Array.from(weights.values()).reduce((s, v) => s + v, 0);
  const pct: Record<string, number> = {};
  let running = 0;
  const entries = Array.from(weights.entries());
  entries.forEach(([id, w], i) => {
    const p = i === entries.length - 1 ? +(100 - running).toFixed(2) : +((w / total) * 100).toFixed(2);
    pct[id] = p;
    running += p;
  });
  return {
    percentages: pct,
    rationale: items.length
      ? `Heuristic split: weighted by contribution count (articles 2x, edits 0.5x, assets 0.25x) across ${items.length} content items.`
      : "Heuristic split: equal share across all contributors (no content logged yet).",
  };
}

async function callAiForSplit(
  contributors: Contributor[],
  items: ContentItem[],
): Promise<{ percentages: Record<string, number>; rationale: string } | null> {
  const key = process.env.LOVABLE_API_KEY;
  if (!key || contributors.length === 0) return null;
  try {
    const { generateText, Output } = await import("ai");
    const { createLovableGateway } = await import("./ai-gateway.server");
    const gateway = createLovableGateway(key);

    const schema = z.object({
      allocations: z
        .array(
          z.object({
            contributor_id: z.string(),
            percent: z.number().min(0).max(100),
          }),
        )
        .min(1),
      rationale: z.string().min(1).max(600),
    });

    const contribList = contributors
      .map((c) => `- id=${c.id} | name=${c.name} | role=${c.role}`)
      .join("\n");
    const contentList = items.length
      ? items
          .slice(0, 30)
          .map(
            (i) =>
              `- contributor_id=${i.contributor_id} | type=${i.type} | title=${i.title}` +
              (i.body_excerpt ? ` | excerpt=${i.body_excerpt.slice(0, 200)}` : ""),
          )
          .join("\n")
      : "(no content items logged yet)";

    const prompt = [
      "You are SplitAI, splitting a single subscription payment across creator team members based on their contributions.",
      "Return percentages summing to exactly 100. Use ONLY the contributor_ids provided.",
      "",
      "CONTRIBUTORS:",
      contribList,
      "",
      "RECENT CONTENT (for this stream):",
      contentList,
      "",
      "Weight articles most, then edits, then assets. If no content exists, split equally. Keep rationale under 3 sentences.",
    ].join("\n");

    const { experimental_output } = await generateText({
      model: gateway("google/gemini-3-flash-preview"),
      experimental_output: Output.object({ schema }),
      prompt,
    });

    const valid = new Set(contributors.map((c) => c.id));
    const filtered = experimental_output.allocations.filter((a) => valid.has(a.contributor_id));
    if (!filtered.length) return null;
    // normalize to 100
    const total = filtered.reduce((s, a) => s + a.percent, 0);
    if (total <= 0) return null;
    const pct: Record<string, number> = {};
    let running = 0;
    filtered.forEach((a, i) => {
      const p =
        i === filtered.length - 1
          ? +(100 - running).toFixed(2)
          : +((a.percent / total) * 100).toFixed(2);
      pct[a.contributor_id] = p;
      running += p;
    });
    return { percentages: pct, rationale: experimental_output.rationale };
  } catch (e) {
    console.warn("[splits] AI call failed, falling back:", (e as Error).message);
    return null;
  }
}

/**
 * Internal: build an AI-or-heuristic split proposal for a payment_event.
 * Idempotent — unique constraint on payment_event_id.
 */
export async function buildProposalForPayment(paymentEventId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: payment, error: pErr } = await supabaseAdmin
    .from("payment_events")
    .select("id, stream_id")
    .eq("id", paymentEventId)
    .single();
  if (pErr || !payment) throw new Error("Payment event not found");

  const { data: stream } = await supabaseAdmin
    .from("streams")
    .select("id, team_id")
    .eq("id", payment.stream_id)
    .single();
  if (!stream) throw new Error("Stream not found");

  const [{ data: contributors }, { data: items }] = await Promise.all([
    supabaseAdmin.from("contributors").select("id, name, role").eq("team_id", stream.team_id),
    supabaseAdmin
      .from("content_items")
      .select("contributor_id, type, title, body_excerpt")
      .eq("stream_id", payment.stream_id)
      .order("created_at", { ascending: false })
      .limit(30),
  ]);

  const cs = (contributors ?? []) as Contributor[];
  const its = (items ?? []) as ContentItem[];

  const ai = await callAiForSplit(cs, its);
  const result = ai ?? heuristicSplit(cs, its);
  const source = ai ? "ai" : "heuristic";

  const { data: existing } = await supabaseAdmin
    .from("split_proposals")
    .select("id")
    .eq("payment_event_id", paymentEventId)
    .maybeSingle();
  if (existing) return existing;

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from("split_proposals")
    .insert({
      payment_event_id: paymentEventId,
      ai_percentages: result.percentages,
      ai_rationale: `[${source}] ${result.rationale}`,
      status: "pending",
    })
    .select("id")
    .single();
  if (insErr) throw new Error(insErr.message);
  return inserted;
}

/** Server fn — list pending proposals for the user's teams */
export const getPendingProposals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: members } = await context.supabase
      .from("team_members")
      .select("team_id");
    const teamIds = (members ?? []).map((m) => m.team_id);
    if (teamIds.length === 0) return [];

    const { data: streams } = await context.supabase
      .from("streams")
      .select("id, name, team_id")
      .in("team_id", teamIds);
    const streamIds = (streams ?? []).map((s) => s.id);
    if (streamIds.length === 0) return [];
    const streamById = new Map((streams ?? []).map((s) => [s.id, s]));

    const { data: payments } = await context.supabase
      .from("payment_events")
      .select("id, stream_id, amount_cents, currency, received_at")
      .in("stream_id", streamIds)
      .order("received_at", { ascending: false })
      .limit(100);
    const paymentIds = (payments ?? []).map((p) => p.id);
    if (paymentIds.length === 0) return [];
    const paymentById = new Map((payments ?? []).map((p) => [p.id, p]));

    // subscriber_email column-restricted; admin read + owner-aware masking.
    const { ownerTeamIds, maskEmail } = await import("./access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownedTeams = await ownerTeamIds(context.supabase, teamIds);
    const { data: emailRows } = await supabaseAdmin
      .from("payment_events")
      .select("id, subscriber_email")
      .in("id", paymentIds);
    const emailById = new Map((emailRows ?? []).map((r) => [r.id, r.subscriber_email]));

    const { data: proposals, error } = await context.supabase
      .from("split_proposals")
      .select("id, payment_event_id, ai_percentages, ai_rationale, status, created_at")
      .in("payment_event_id", paymentIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const contribIds = new Set<string>();
    for (const p of proposals ?? []) {
      Object.keys((p.ai_percentages as Record<string, number>) ?? {}).forEach((id) =>
        contribIds.add(id),
      );
    }
    const { data: contribs } = await context.supabase
      .from("contributors")
      .select("id, name, role")
      .in("id", Array.from(contribIds.size ? contribIds : ["00000000-0000-0000-0000-000000000000"]));
    const contribById = new Map((contribs ?? []).map((c) => [c.id, c]));

    return (proposals ?? []).map((p) => {
      const payment = paymentById.get(p.payment_event_id);
      const stream = payment ? streamById.get(payment.stream_id) : undefined;
      return {
        id: p.id,
        ai_percentages: p.ai_percentages as Record<string, number>,
        ai_rationale: p.ai_rationale,
        created_at: p.created_at,
        payment: payment
          ? {
              id: payment.id,
              amount_cents: payment.amount_cents,
              currency: payment.currency,
              subscriber_email: payment.subscriber_email,
              received_at: payment.received_at,
              stream_name: stream?.name ?? "Stream",
            }
          : null,
        contributors: Object.keys((p.ai_percentages as Record<string, number>) ?? {}).map((id) => ({
          id,
          name: contribById.get(id)?.name ?? "Unknown",
          role: contribById.get(id)?.role ?? "—",
          percent: (p.ai_percentages as Record<string, number>)[id],
        })),
      };
    });
  });

/** Approve a proposal with possibly-adjusted percentages; queue payouts. */
export const approveSplitProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        proposalId: z.string().uuid(),
        percentages: z.record(z.string().uuid(), z.number().min(0).max(100)),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS: caller must be a team member of the related stream's team.
    const { data: proposal, error: pErr } = await context.supabase
      .from("split_proposals")
      .select("id, payment_event_id, status")
      .eq("id", data.proposalId)
      .single();
    if (pErr || !proposal) throw new Error("Proposal not found");
    if (proposal.status !== "pending") throw new Error("Proposal already resolved");

    const total = Object.values(data.percentages).reduce((s, v) => s + v, 0);
    if (Math.abs(total - 100) > 0.5) throw new Error(`Percentages must sum to 100 (got ${total.toFixed(2)})`);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: payment } = await supabaseAdmin
      .from("payment_events")
      .select("id, amount_cents")
      .eq("id", proposal.payment_event_id)
      .single();
    if (!payment) throw new Error("Payment not found");

    const usdcRows = Object.entries(data.percentages)
      .filter(([, pct]) => pct > 0)
      .map(([contributorId, pct]) => ({
        payment_event_id: payment.id,
        contributor_id: contributorId,
        amount_usdc: +(payment.amount_cents * (pct / 100) / 100).toFixed(6),
        status: "queued",
      }));

    if (usdcRows.length) {
      const { error: payErr } = await supabaseAdmin
        .from("payouts")
        .upsert(usdcRows, { onConflict: "payment_event_id,contributor_id" });
      if (payErr) throw new Error(payErr.message);
    }

    const { error: updErr } = await context.supabase
      .from("split_proposals")
      .update({
        approved_percentages: data.percentages,
        status: "approved",
        approved_by: context.userId,
        approved_at: new Date().toISOString(),
      })
      .eq("id", data.proposalId);
    if (updErr) throw new Error(updErr.message);

    // Phase 3: kick off Circle USDC transfers for queued payouts.
    let execution: { submitted: number; skipped: number; failed: number } = {
      submitted: 0,
      skipped: 0,
      failed: 0,
    };
    try {
      const { executePayoutsForPayment } = await import("./payouts.functions");
      execution = await executePayoutsForPayment(payment.id);
    } catch (e) {
      console.warn("[splits.approve] payout execution failed:", (e as Error).message);
    }

    return { ok: true, payouts: usdcRows.length, execution };
  });

/** Server fn — generate a proposal explicitly (used after demo trigger or backfill). */
export const generateProposal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ paymentEventId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    return buildProposalForPayment(data.paymentEventId);
  });
