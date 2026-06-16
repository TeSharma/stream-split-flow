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
    const { data: stream, error } = await context.supabase
      .from("streams")
      .insert({
        team_id: data.teamId,
        name: data.name,
        ghost_site_url: data.ghostSiteUrl || null,
        source: "ghost",
      })
      .select("id, name, webhook_secret")
      .single();
    if (error) throw new Error(error.message);
    return stream;
  });

export const getStream = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ streamId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: stream, error } = await context.supabase
      .from("streams")
      .select("id, team_id, name, source, ghost_site_url, webhook_secret, status, created_at")
      .eq("id", data.streamId)
      .single();
    if (error) throw new Error(error.message);
    return stream;
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
    return payment;
  });
