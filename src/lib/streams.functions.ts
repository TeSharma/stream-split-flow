import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const createStream = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        teamId: z.string().uuid(),
        name: z.string().min(1).max(80),
        ghostSiteUrl: z.string().url().optional().or(z.literal("")),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // Insert via user client (RLS enforces team-owner permission).
    const { data: inserted, error } = await context.supabase
      .from("streams")
      .insert({
        team_id: data.teamId,
        name: data.name,
        ghost_site_url: data.ghostSiteUrl || null,
        source: "ghost",
      })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);

    // webhook_secret is column-restricted from `authenticated`. The caller
    // just created the stream (so they're an owner per RLS) — fetch the
    // secret via the admin client so they can configure the Ghost webhook.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: secretRow } = await supabaseAdmin
      .from("streams")
      .select("webhook_secret")
      .eq("id", inserted.id)
      .single();
    return { ...inserted, webhook_secret: secretRow?.webhook_secret ?? null };
  });

export const getStream = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ streamId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    // Base row via user client — RLS confirms team membership.
    const { data: stream, error } = await context.supabase
      .from("streams")
      .select("id, team_id, name, source, ghost_site_url, status, created_at, ghost_last_sync_at")
      .eq("id", data.streamId)
      .single();
    if (error) throw new Error(error.message);

    // Sensitive columns (webhook_secret, ghost_content_api_key) are only
    // readable by team owners, via the admin client.
    const { isTeamOwner } = await import("./access.server");
    const owner = await isTeamOwner(context.supabase, stream.team_id);
    if (!owner) {
      return { ...stream, webhook_secret: null, ghost_content_api_key: null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: secrets } = await supabaseAdmin
      .from("streams")
      .select("webhook_secret, ghost_content_api_key")
      .eq("id", stream.id)
      .single();
    return {
      ...stream,
      webhook_secret: secrets?.webhook_secret ?? null,
      ghost_content_api_key: secrets?.ghost_content_api_key ?? null,
    };
  });

/**
 * Demo trigger: insert a synthetic payment event so the live flow works
 * without a real Ghost webhook. The Ghost webhook produces the same shape.
 */
export const triggerDemoPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        streamId: z.string().uuid(),
        amountCents: z.number().int().min(50).max(100000).default(500),
        subscriberEmail: z.string().email().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // verify caller can access the stream (RLS will enforce on insert via service role
    // we use authenticated client here so RLS gates it).
    const { data: streamRow, error: streamErr } = await context.supabase
      .from("streams")
      .select("id, team_id")
      .eq("id", data.streamId)
      .single();
    if (streamErr || !streamRow) throw new Error("Stream not found or not accessible");

    // Use admin client for the insert because payment_events has no INSERT policy for authenticated.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const idempotency = `demo-${data.streamId}-${Date.now()}`;
    const { data: payment, error } = await supabaseAdmin
      .from("payment_events")
      .insert({
        stream_id: data.streamId,
        amount_cents: data.amountCents,
        currency: "usd",
        status: "received",
        subscriber_email: data.subscriberEmail ?? `demo+${Date.now()}@example.com`,
        idempotency_key: idempotency,
        ghost_event_id: idempotency,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);

    // Kick off AI split proposal immediately (fire-and-wait — UI expects it ready)
    try {
      const { buildProposalForPayment } = await import("./splits.functions");
      await buildProposalForPayment(payment.id);
    } catch (e) {
      console.error("[demo] proposal generation failed", e);
    }
    return payment;
  });
