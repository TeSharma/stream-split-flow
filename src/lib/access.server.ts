/**
 * Server-only access-control helpers. Used by server functions to decide
 * whether the caller is allowed to see sensitive columns (subscriber email,
 * webhook secret, Ghost API key) — those columns are no longer readable via
 * the Data API by the `authenticated` role, so reads must go through the
 * service-role admin client guarded by these checks.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** True when the authenticated user has role='owner' on the given team. */
export async function isTeamOwner(
  userClient: SupabaseClient,
  teamId: string,
): Promise<boolean> {
  const { data, error } = await userClient
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("role", "owner")
    .maybeSingle();
  if (error) return false;
  return !!data;
}

/** Subset of team_ids (from input list) where the caller is an owner. */
export async function ownerTeamIds(
  userClient: SupabaseClient,
  teamIds: string[],
): Promise<Set<string>> {
  if (teamIds.length === 0) return new Set();
  const { data } = await userClient
    .from("team_members")
    .select("team_id, role")
    .in("team_id", teamIds)
    .eq("role", "owner");
  return new Set((data ?? []).map((r) => r.team_id));
}

/** Mask an email for display to non-owners: `j***@example.com`. */
export function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const at = email.indexOf("@");
  if (at <= 0) return "***";
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  const head = user.slice(0, 1);
  return `${head}***@${domain}`;
}
