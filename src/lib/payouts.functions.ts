import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Execute all queued payouts for a single payment_event as ONE batched
 * on-chain transaction via Arc's predeployed Multicall3From contract.
 *
 * - Skips contributors without a wallet_address (status='skipped').
 * - Skips dust (< 0.000001 USDC, below 6-decimal resolution).
 * - Eligible payouts share one circle_tx_id and, after confirmation, one tx_hash.
 * - Idempotency key = payment_event_id, so retries are safe.
 * - State transitions: queued -> submitted (Circle accepted batch) -> confirmed.
 */
export async function executePayoutsForPayment(paymentEventId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { createContractExecution, getCircleWalletAddress } = await import("./circle.server");
  const {
    MULTICALL3_FROM_ADDRESS,
    MULTICALL3_FROM_AGGREGATE3_SIGNATURE,
    ARC_USDC_ADDRESS,
    encodeErc20Transfer,
    toUsdcBaseUnits,
  } = await import("./multicall.server");

  const { data: payouts, error } = await supabaseAdmin
    .from("payouts")
    .select("id, contributor_id, amount_usdc, status, contributors!inner(wallet_address)")
    .eq("payment_event_id", paymentEventId)
    .eq("status", "queued");
  if (error) throw new Error(error.message);
  if (!payouts || payouts.length === 0) return { submitted: 0, skipped: 0, failed: 0, batchTxId: null };

  type Eligible = { payoutId: string; to: string; amount6dp: bigint };
  const eligible: Eligible[] = [];
  let skipped = 0;

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
    eligible.push({
      payoutId: p.id,
      to: dest,
      amount6dp: toUsdcBaseUnits(Number(p.amount_usdc)),
    });
  }

  if (eligible.length === 0) {
    return { submitted: 0, skipped, failed: 0, batchTxId: null };
  }

  // Build aggregate3 args: Call3[] = (target, allowFailure, callData)[]
  const calls = eligible.map((e) => [
    ARC_USDC_ADDRESS,
    false,
    encodeErc20Transfer(e.to, e.amount6dp),
  ]);

  // Sanity: Circle wallet must be reachable. We don't need the address for
  // the batch encoding (Multicall3From reads `from` from the precompiled
  // CallFrom context = the tx sender), but failing fast here gives a clean
  // error message vs. an opaque Circle 400.
  try {
    await getCircleWalletAddress();
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    const ids = eligible.map((x) => x.payoutId);
    await supabaseAdmin.from("payouts").update({ status: "failed", error: msg }).in("id", ids);
    return { submitted: 0, skipped, failed: ids.length, batchTxId: null };
  }

  try {
    const tx = await createContractExecution({
      contractAddress: MULTICALL3_FROM_ADDRESS,
      abiFunctionSignature: MULTICALL3_FROM_AGGREGATE3_SIGNATURE,
      abiParameters: [calls],
      idempotencyKey: paymentEventId,
    });

    const ids = eligible.map((e) => e.payoutId);
    // One UPDATE for the whole batch — they all share the circle_tx_id.
    // destination_address is per-row, so do those individually (small N).
    await supabaseAdmin
      .from("payouts")
      .update({
        status: "submitted",
        circle_tx_id: tx.id,
        submitted_at: new Date().toISOString(),
        error: null,
      })
      .in("id", ids);
    for (const e of eligible) {
      await supabaseAdmin
        .from("payouts")
        .update({ destination_address: e.to })
        .eq("id", e.payoutId);
    }
    return { submitted: ids.length, skipped, failed: 0, batchTxId: tx.id };
  } catch (e) {
    const msg = (e as Error).message.slice(0, 500);
    const ids = eligible.map((x) => x.payoutId);
    await supabaseAdmin.from("payouts").update({ status: "failed", error: msg }).in("id", ids);
    return { submitted: 0, skipped, failed: ids.length, batchTxId: null };
  }
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
      .limit(200);
    if (!visible || visible.length === 0) return { updated: 0 };

    // Group rows by circle_tx_id so a batched payout costs one Circle API call.
    const byTx = new Map<string, string[]>();
    for (const row of visible) {
      if (!row.circle_tx_id) continue;
      const list = byTx.get(row.circle_tx_id) ?? [];
      list.push(row.id);
      byTx.set(row.circle_tx_id, list);
    }

    let updated = 0;
    for (const [txId, ids] of byTx.entries()) {
      try {
        const tx = await getCircleTransaction(txId);
        const s = tx.state?.toUpperCase();
        if (s === "COMPLETE" || s === "CONFIRMED") {
          await supabaseAdmin
            .from("payouts")
            .update({
              status: "confirmed",
              tx_hash: tx.txHash ?? null,
              confirmed_at: new Date().toISOString(),
            })
            .in("id", ids);
          updated += ids.length;
        } else if (s === "FAILED" || s === "CANCELLED" || s === "DENIED") {
          await supabaseAdmin
            .from("payouts")
            .update({ status: "failed", error: tx.errorReason ?? s })
            .in("id", ids);
          updated += ids.length;
        }
      } catch (e) {
        console.warn("[payouts] refresh failed for", txId, (e as Error).message);
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
      .select("id, stream_id, amount_cents, received_at")
      .in("stream_id", streamIds);
    const paymentIds = (payments ?? []).map((p) => p.id);
    if (paymentIds.length === 0) return [];
    const paymentById = new Map((payments ?? []).map((p) => [p.id, p]));

    // subscriber_email is column-restricted: read via admin, mask for non-owners.
    const { ownerTeamIds, maskEmail } = await import("./access.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ownedTeams = await ownerTeamIds(context.supabase, teamIds);
    const { data: emailRows } = await supabaseAdmin
      .from("payment_events")
      .select("id, subscriber_email")
      .in("id", paymentIds);
    const emailById = new Map((emailRows ?? []).map((r) => [r.id, r.subscriber_email]));

    const { data: payouts, error } = await context.supabase
      .from("payouts")
      .select(
        "id, payment_event_id, contributor_id, amount_usdc, status, tx_hash, circle_tx_id, destination_address, error, submitted_at, confirmed_at, created_at",
      )
      .in("payment_event_id", paymentIds)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);

    // Mark rows that share a circle_tx_id as part of a batch — UI hint only.
    const txCounts = new Map<string, number>();
    for (const p of payouts ?? []) {
      if (p.circle_tx_id) txCounts.set(p.circle_tx_id, (txCounts.get(p.circle_tx_id) ?? 0) + 1);
    }

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
      const batchSize = p.circle_tx_id ? txCounts.get(p.circle_tx_id) ?? 1 : 1;
      const rawEmail = payment ? emailById.get(payment.id) ?? null : null;
      const isOwner = stream ? ownedTeams.has(stream.team_id) : false;
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
        batched: batchSize > 1,
        batch_size: batchSize,
        contributor: c
          ? { id: c.id, name: c.name, role: c.role, wallet_address: c.wallet_address }
          : { id: p.contributor_id, name: "Unknown", role: "—", wallet_address: null },
        stream_name: stream?.name ?? "Stream",
        subscriber_email: isOwner ? rawEmail : maskEmail(rawEmail),
      };
    });
  });
