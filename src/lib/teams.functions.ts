import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyTeams = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("teams")
      .select("id, name, owner_id, created_at")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createTeam = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().min(1).max(80) }).parse(input))
  .handler(async ({ data, context }) => {
    console.log("[createTeam] claims:", JSON.stringify({ sub: context.userId, role: (context.claims as { role?: string })?.role, aud: (context.claims as { aud?: string })?.aud }));
    const { data: team, error } = await context.supabase
      .from("teams")
      .insert({ name: data.name, owner_id: context.userId })
      .select("id, name")
      .single();
    if (error) throw new Error(error.message);
    return team;
  });

export const getTeamOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ teamId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const [streamsRes, contributorsRes, membersRes] = await Promise.all([
      context.supabase
        .from("streams")
        .select("id, name, source, ghost_site_url, status, created_at")
        .eq("team_id", data.teamId),
      context.supabase
        .from("contributors")
        .select("id, name, role, wallet_address")
        .eq("team_id", data.teamId),
      context.supabase
        .from("team_members")
        .select("user_id, role")
        .eq("team_id", data.teamId),
    ]);
    if (streamsRes.error) throw new Error(streamsRes.error.message);
    if (contributorsRes.error) throw new Error(contributorsRes.error.message);
    if (membersRes.error) throw new Error(membersRes.error.message);
    return {
      streams: streamsRes.data ?? [],
      contributors: contributorsRes.data ?? [],
      members: membersRes.data ?? [],
    };
  });

export const addContributor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        teamId: z.string().uuid(),
        name: z.string().min(1).max(80),
        role: z.string().min(1).max(40),
        walletAddress: z.string().optional(),
        ghostAuthorId: z.string().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: contributor, error } = await context.supabase
      .from("contributors")
      .insert({
        team_id: data.teamId,
        name: data.name,
        role: data.role,
        wallet_address: data.walletAddress || null,
        ghost_author_id: data.ghostAuthorId || null,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return contributor;
  });

export const getRecentPayments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ teamId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: streams, error: sErr } = await context.supabase
      .from("streams")
      .select("id")
      .eq("team_id", data.teamId);
    if (sErr) throw new Error(sErr.message);
    const ids = (streams ?? []).map((s) => s.id);
    if (ids.length === 0) return [];
    const { data: payments, error } = await context.supabase
      .from("payment_events")
      .select("id, stream_id, amount_cents, currency, status, received_at, subscriber_email")
      .in("stream_id", ids)
      .order("received_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return payments ?? [];
  });
