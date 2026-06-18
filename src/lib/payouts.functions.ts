import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Execute all queued payouts for a single payment_event via Circle.
 * - Skips contributors without a wallet_address (status='skipped').
 * - One transfer per payout; payout uuid is used as idempotency key.
 * - State transitions: queued -> submitted (after Circle accepts) -> confirmed (poll).
 */
export async function executePayoutsForPayment(paymentEventId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createUsdcTransfer } = await import("./circle.server");

  const { data: payouts, error } = await supabaseAdmin
    .from("payouts")
    .select("id, contributor_id, amount_usdc, status, contributors!inner(wallet_address)")
    .eq("payment_event_id", paymentEventId)
    .eq("status", "queued");
  if (error) throw new Error(error.message);
  if (!payouts || payouts.length === 0) return { submitted: 0, skipped: 0, failed: 0 };

  let submitted = 0;
  let skipped = 0;
  let failed = 0;
  for (const p of payouts) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dest = (p as any).contributors?.wallet_address as string | null | undefined;
    if (!dest) {
      await supabaseAdmin
        .from("payouts")
        .update({ status: "skipped", error: "No wallet_address on contributor" })
        .eq("id", p.id);
      skipped++;
      continue;
    }
    if (Number(p.amount_usdc) < 0.000001) {
      await supabaseAdmin
        .from("payouts")
        .update({ status: "skipped", error: "Amount below 0.000001 USDC" })
        .eq("id", p.id);
      skipped++;
      continue;
    }
    try {
      const tx = await createUsdcTransfer({
        destinationAddress: dest,
        amountUsdc: Number(p.amount_usdc),
        idempotencyKey: p.id,
      });
      await supabaseAdmin
        .from("payouts")
        .update({
          status: "submitted",
          circle_tx_id: tx.id,
          destination_address: dest,
          submitted_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", p.id);
      submitted++;
    } catch (e) {
      await supabaseAdmin
        .from("payouts")
        .update({ status: "failed", error: (e as Error).message.slice(0, 500) })
        .eq("id", p.id);
      failed++;
    }
  }
  return { submitted, skipped, failed };
}

export const executePayouts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ paymentEventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // authorize: RLS-bound read confirms access to this payment via team membership
    const { data: pe } = await context.supabase
      .from("payment_events")
      .select("stream_id")
      .eq("id", data.paymentEventId)
      .single();
    if (!pe) throw new Error("Payment not found or no access");
    return executePayoutsForPayment(data.paymentEventId);
  });

export const refreshPayoutStatuses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getCircleTransaction } = await import("./circle.server");

    const { data: visible } = await context.supabase
      .from("payouts")
      .select("id, circle_tx_id, status")
      .eq("status", "submitted")
      .not("circle_tx_id", "is", null)
      .limit(50);
    if (!visible || visible.length === 0) return { updated: 0 };

    let updated = 0;
    for (const row of visible) {
      if (!row.circle_tx_id) continue;
      try {
        const tx = await getCircleTransaction(row.circle_tx_id);
        const s = tx.state?.toUpperCase();
        if (s === "COMPLETE" || s === "CONFIRMED") {
          await supabaseAdmin
            .from("payouts")
            .update({
              status: "confirmed",
              tx_hash: tx.txHash ?? null,
              confirmed_at: new Date().toISOString(),
            })
            .eq("id", row.id);
          updated++;
        } else if (s === "FAILED" || s === "CANCELLED" || s === "DENIED") {
          await supabaseAdmin
            .from("payouts")
            .update({ status: "failed", error: tx.errorReason ?? s })
            .eq("id", row.id);
          updated++;
        }
      } catch (e) {
        console.warn("[payouts] refresh failed for", row.id, (e as Error).message);
      }
    }
    return { updated };
  });

export const listMyPayouts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: members } = await context.supabase.from("team_members").select("team_id");
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
      .select("id, stream_id, amount_cents, subscriber_email, received_at")
      .in("stream_id", streamIds);
    const paymentIds = (payments ?? []).map((p) => p.id);
    if (paymentIds.length === 0) return [];
    const paymentById = new Map((payments ?? []).map((p) => [p.id, p]));

    const { data: payouts, error } = await context.supabase
      .from("payouts")
      .select(
        "id, payment_event_id, contributor_id, amount_usdc, status, tx_hash, circle_tx_id, destination_address, error, submitted_at, confirmed_at, created_at",
      )
      .in("payment_event_id", paymentIds)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    const contribIds = Array.from(new Set((payouts ?? []).map((p) => p.contributor_id)));
    const { data: contribs } = await context.supabase
      .from("contributors")
      .select("id, name, role, wallet_address")
      .in("id", contribIds.length ? contribIds : ["00000000-0000-0000-0000-000000000000"]);
    const contribById = new Map((contribs ?? []).map((c) => [c.id, c]));

    return (payouts ?? []).map((p) => {
      const payment = paymentById.get(p.payment_event_id);
      const stream = payment ? streamById.get(payment.stream_id) : undefined;
      const c = contribById.get(p.contributor_id);
      return {
        id: p.id,
        amount_usdc: Number(p.amount_usdc),
        status: p.status,
        tx_hash: p.tx_hash,
        circle_tx_id: p.circle_tx_id,
        destination_address: p.destination_address,
        error: p.error,
        submitted_at: p.submitted_at,
        confirmed_at: p.confirmed_at,
        created_at: p.created_at,
        contributor: c
          ? { id: c.id, name: c.name, role: c.role, wallet_address: c.wallet_address }
          : { id: p.contributor_id, name: "Unknown", role: "—", wallet_address: null },
        stream_name: stream?.name ?? "Stream",
        subscriber_email: payment?.subscriber_email ?? null,
      };
    });
  });
