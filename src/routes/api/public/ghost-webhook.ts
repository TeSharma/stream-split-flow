// Ghost webhook ingestion. Public route (auth bypassed); verifies HMAC per-stream.
// URL: /api/public/ghost-webhook?stream=<streamId>
// Ghost signs payloads using the configured webhook "secret" — header format:
//   X-Ghost-Signature: sha256=<hex>, t=<timestampMs>
// Spec: https://ghost.org/docs/webhooks/
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";

function parseGhostSignature(header: string | null) {
  if (!header) return null;
  const parts = Object.fromEntries(
    header.split(",").map((p) => p.trim().split("=").map((s) => s.trim())),
  );
  const sigEntry = Object.entries(parts).find(([k]) => k.startsWith("sha256"));
  const sig = sigEntry?.[1] ?? parts["sha256"];
  const t = parts["t"];
  if (!sig || !t) return null;
  return { sig, t };
}

function safeEqualHex(a: string, b: string) {
  try {
    const ab = Buffer.from(a, "hex");
    const bb = Buffer.from(b, "hex");
    if (ab.length !== bb.length) return false;
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

type GhostSubscription = {
  id?: string;
  status?: string;
  plan?: { amount?: number; currency?: string; interval?: string };
};

type GhostMember = {
  id?: string;
  email?: string | null;
  status?: string;
  subscriptions?: GhostSubscription[];
};

/**
 * Extract the active paid subscription from a Ghost webhook payload.
 * Returns null if this event is not a paid activation we should process.
 */
function extractPaidActivation(payload: any, eventHeader: string | null) {
  // Ghost may send: { member: { current, previous } } for member.*,
  // or { subscription: { current, previous } } for subscription.*.
  const member: GhostMember | undefined =
    payload?.member?.current ?? payload?.member;
  const previousMember: GhostMember | undefined = payload?.member?.previous;
  const subscription: GhostSubscription | undefined =
    payload?.subscription?.current ??
    payload?.subscription ??
    member?.subscriptions?.[0];
  const previousSubscription: GhostSubscription | undefined =
    payload?.subscription?.previous;

  if (!subscription || !subscription.plan) return null;
  const amount = subscription.plan.amount ?? 0;
  if (!amount || amount <= 0) return null;
  if (subscription.status !== "active") return null;

  // Idempotency: skip if subscription was already active in the previous state
  // (e.g. unrelated member.* update on an already-subscribed member).
  if (previousSubscription?.status === "active") return null;
  if (
    !payload?.subscription &&
    previousMember?.subscriptions?.some((s) => s.status === "active")
  ) {
    return null;
  }

  return {
    member,
    subscription,
    amountCents: amount,
    currency: (subscription.plan.currency ?? "usd").toLowerCase(),
    eventLabel: eventHeader ?? "unknown",
  };
}

export const Route = createFileRoute("/api/public/ghost-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const streamId = url.searchParams.get("stream");
        if (!streamId) return new Response("Missing stream param", { status: 400 });

        const body = await request.text();
        const sig = parseGhostSignature(request.headers.get("x-ghost-signature"));
        const eventHeader = request.headers.get("x-ghost-event");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: stream, error: sErr } = await supabaseAdmin
          .from("streams")
          .select("id, webhook_secret")
          .eq("id", streamId)
          .maybeSingle();
        if (sErr || !stream) return new Response("Unknown stream", { status: 404 });

        if (!sig) return new Response("Missing signature", { status: 401 });
        const expected = createHmac("sha256", stream.webhook_secret)
          .update(`${body}${sig.t}`)
          .digest("hex");
        if (!safeEqualHex(sig.sig, expected)) {
          return new Response("Invalid signature", { status: 401 });
        }

        let payload: any;
        try {
          payload = JSON.parse(body);
        } catch {
          return new Response("Invalid JSON", { status: 400 });
        }

        const activation = extractPaidActivation(payload, eventHeader);
        if (!activation) {
          console.log("[ghost-webhook] skipped non-paid event", {
            streamId,
            event: eventHeader,
          });
          // Return 200 so Ghost doesn't retry; we just don't process it.
          return Response.json({ ok: true, skipped: true });
        }

        const { member, subscription, amountCents, currency, eventLabel } = activation;
        const eventId =
          payload?.id ??
          payload?.event_id ??
          (subscription.id ? `${subscription.id}-${subscription.status}` : null) ??
          `${streamId}-${member?.id ?? "unknown"}-${amountCents}-${sig.t}`;

        console.log("[ghost-webhook] paid activation", {
          streamId,
          event: eventLabel,
          eventId,
          amountCents,
          currency,
          subscriberEmail: member?.email,
        });

        const { data: inserted, error } = await supabaseAdmin
          .from("payment_events")
          .upsert(
            {
              stream_id: streamId,
              ghost_event_id: eventId,
              ghost_subscription_id: subscription.id ?? null,
              subscriber_email: member?.email ?? null,
              amount_cents: amountCents,
              currency,
              status: "received",
              idempotency_key: eventId,
            },
            { onConflict: "idempotency_key", ignoreDuplicates: true },
          )
          .select("id")
          .maybeSingle();
        if (error) {
          console.error("[ghost-webhook] insert failed", error);
          return new Response("DB error", { status: 500 });
        }

        if (inserted?.id) {
          try {
            const { buildProposalForPayment } = await import("@/lib/splits.functions");
            await buildProposalForPayment(inserted.id);
          } catch (e) {
            console.error("[ghost-webhook] proposal failed", e);
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});
