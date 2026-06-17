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

export const Route = createFileRoute("/api/public/ghost-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const streamId = url.searchParams.get("stream");
        if (!streamId) return new Response("Missing stream param", { status: 400 });

        const body = await request.text();
        const sig = parseGhostSignature(request.headers.get("x-ghost-signature"));

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

        // Ghost sends events like { member: { current, previous } } for member.added.
        // We treat any new paid subscription as a payment event. For real-money events,
        // hook subscription.activated / member.updated with paid status.
        const member = payload?.member?.current ?? payload?.member ?? payload?.subscription ?? {};
        const eventId =
          payload?.id ??
          payload?.event_id ??
          `${streamId}-${member?.id ?? "unknown"}-${Date.now()}`;
        const email = member?.email ?? null;
        // Default $5/mo if Ghost didn't include price. Real Ghost subscriptions carry
        // member.subscriptions[0].plan.amount in minor units.
        const amountCents =
          member?.subscriptions?.[0]?.plan?.amount ??
          payload?.subscription?.plan?.amount ??
          500;

        const { data: inserted, error } = await supabaseAdmin
          .from("payment_events")
          .upsert(
            {
              stream_id: streamId,
              ghost_event_id: eventId,
              ghost_subscription_id: member?.subscriptions?.[0]?.id ?? null,
              subscriber_email: email,
              amount_cents: amountCents,
              currency: member?.subscriptions?.[0]?.plan?.currency ?? "usd",
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
