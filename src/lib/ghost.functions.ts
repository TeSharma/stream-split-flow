import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Persist the Ghost connection (site URL + Content API key) on a stream.
 * Content API keys are read-only and scoped to one site, so we store them
 * inline on the stream row.
 */
export const updateGhostConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        streamId: z.string().uuid(),
        ghostSiteUrl: z.string().url(),
        ghostContentApiKey: z
          .string()
          .trim()
          .min(8)
          .max(128)
          .regex(/^[a-f0-9]+$/i, "Ghost Content API key must be hex"),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    // RLS on streams allows only owners to update.
    const url = new URL(data.ghostSiteUrl);
    if (url.protocol !== "https:") throw new Error("Ghost site URL must be HTTPS");
    const cleanUrl = `${url.protocol}//${url.host}`;

    const { error } = await context.supabase
      .from("streams")
      .update({
        ghost_site_url: cleanUrl,
        ghost_content_api_key: data.ghostContentApiKey,
      })
      .eq("id", data.streamId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

type GhostAuthor = {
  id: string;
  name?: string;
  slug?: string;
  email?: string;
};

type GhostPost = {
  id: string;
  title: string;
  custom_excerpt?: string | null;
  excerpt?: string | null;
  published_at?: string | null;
  primary_author?: GhostAuthor;
  authors?: GhostAuthor[];
};

/**
 * Pull posts + authors from a stream's Ghost site via the Content API,
 * upserting contributors (keyed by ghost_author_id) and content_items
 * (keyed by ghost_post_id).
 */
export const syncGhostContent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ streamId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: stream, error: streamErr } = await context.supabase
      .from("streams")
      .select("id, team_id, ghost_site_url, ghost_content_api_key")
      .eq("id", data.streamId)
      .maybeSingle();
    if (streamErr || !stream) throw new Error("Stream not found");
    if (!stream.ghost_site_url || !stream.ghost_content_api_key) {
      throw new Error("Connect Ghost first — site URL and Content API key are required.");
    }

    const base = stream.ghost_site_url.replace(/\/+$/, "");
    const apiUrl =
      `${base}/ghost/api/content/posts/` +
      `?key=${encodeURIComponent(stream.ghost_content_api_key)}` +
      `&include=authors` +
      `&limit=50` +
      `&fields=id,title,custom_excerpt,excerpt,published_at`;

    const res = await fetch(apiUrl, { headers: { Accept: "application/json" } });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Ghost API ${res.status}: ${body.slice(0, 200) || res.statusText}`);
    }
    const payload = (await res.json()) as { posts?: GhostPost[] };
    const posts = payload.posts ?? [];

    // Load admin client INSIDE handler (not at module scope) — required by
    // import-graph rules. Needed because we upsert across all contributors
    // for the team using ghost_author_id, which has no unique constraint.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Collect unique authors across all posts
    const authorMap = new Map<string, GhostAuthor>();
    for (const p of posts) {
      const primary = p.primary_author ?? p.authors?.[0];
      if (primary?.id) authorMap.set(primary.id, primary);
      for (const a of p.authors ?? []) if (a.id) authorMap.set(a.id, a);
    }

    // Look up existing contributors for this team by ghost_author_id
    const { data: existing } = await supabaseAdmin
      .from("contributors")
      .select("id, ghost_author_id")
      .eq("team_id", stream.team_id);
    const byGhostId = new Map<string, string>();
    for (const c of existing ?? []) {
      if (c.ghost_author_id) byGhostId.set(c.ghost_author_id, c.id);
    }

    let contributorsAdded = 0;
    for (const [ghostId, author] of authorMap) {
      if (byGhostId.has(ghostId)) continue;
      const { data: inserted, error: insErr } = await supabaseAdmin
        .from("contributors")
        .insert({
          team_id: stream.team_id,
          ghost_author_id: ghostId,
          name: author.name || author.slug || "Unnamed",
          role: "writer",
        })
        .select("id")
        .single();
      if (insErr) {
        console.error("[ghost-sync] contributor insert failed", insErr);
        continue;
      }
      byGhostId.set(ghostId, inserted.id);
      contributorsAdded++;
    }

    // Upsert posts as content_items keyed by ghost_post_id
    let postsSynced = 0;
    for (const p of posts) {
      const primary = p.primary_author ?? p.authors?.[0];
      const contributorId = primary?.id ? byGhostId.get(primary.id) : undefined;
      if (!contributorId) continue;

      const excerpt = (p.custom_excerpt ?? p.excerpt ?? "").slice(0, 1000) || null;

      // Try update first (matched on ghost_post_id within this stream), else insert.
      const { data: updated, error: updErr } = await supabaseAdmin
        .from("content_items")
        .update({
          contributor_id: contributorId,
          title: p.title,
          body_excerpt: excerpt,
        })
        .eq("stream_id", data.streamId)
        .eq("ghost_post_id", p.id)
        .select("id")
        .maybeSingle();
      if (updErr) {
        console.error("[ghost-sync] content update failed", updErr);
        continue;
      }
      if (!updated) {
        const { error: insErr } = await supabaseAdmin.from("content_items").insert({
          stream_id: data.streamId,
          contributor_id: contributorId,
          type: "article",
          title: p.title,
          body_excerpt: excerpt,
          ghost_post_id: p.id,
        });
        if (insErr) {
          console.error("[ghost-sync] content insert failed", insErr);
          continue;
        }
      }
      postsSynced++;
    }

    await supabaseAdmin
      .from("streams")
      .update({ ghost_last_sync_at: new Date().toISOString() })
      .eq("id", data.streamId);

    return { postsSynced, contributorsAdded, totalAuthors: authorMap.size };
  });
