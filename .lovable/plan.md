## Ghost integration plan

You picked all four scopes + real Ghost site as the test source. Here's the build, sequenced so each step is testable on its own.

### 1. Schema — store Ghost API credentials per stream

A new migration adds two columns to `streams`:

- `ghost_content_api_key text` — Ghost Content API key (used to pull posts + authors)
- `ghost_last_sync_at timestamptz` — surfaced in UI

No new tables. `contributors.ghost_author_id` and `content_items.ghost_post_id` already exist, so the upserts have a stable key.

The Content API key is low-risk (read-only, scoped to a single site) but still per-stream, so we keep it in the row rather than in shared secrets.

### 2. Server functions (`src/lib/ghost.functions.ts`)

- `updateGhostConnection({ streamId, ghostSiteUrl, ghostContentApiKey })` — saves URL + key on the stream. Auth-gated.
- `syncGhostContent({ streamId })` — calls `GET {site}/ghost/api/content/posts/?key=...&include=authors&limit=50&fields=id,title,slug,custom_excerpt,excerpt,published_at`. Then:
  - For each unique post author: upsert into `contributors` keyed by `ghost_author_id` (team-scoped). New authors land with `role='writer'` and no wallet — surfaced in UI so user can add a wallet.
  - For each post: upsert into `content_items` keyed by `ghost_post_id` with `type='article'`, `title`, `body_excerpt` from `custom_excerpt || excerpt`, `contributor_id` resolved from primary author.
  - Set `ghost_last_sync_at = now()`. Returns `{ postsSynced, contributorsAdded }`.

Both use `requireSupabaseAuth` and admin client inside the handler (because `contributors` is team-scoped and we need to upsert by `ghost_author_id`).

### 3. Webhook hardening (`src/routes/api/public/ghost-webhook.ts`)

Ghost actually sends distinct events. We tighten the existing handler to:

- Read event type from `request.headers.get('x-ghost-event')` (Ghost sets this) and the payload shape.
- Process only paid subscription activations:
  - `member.added` only when `member.current.subscriptions[0].status === 'active'` AND `plan.amount > 0`
  - `subscription.activated`
  - Ignore free signups, member updates without a new active paid sub, deletions, and anything else (return 200 OK so Ghost doesn't retry).
- Parse `plan.amount` (already minor units) and `plan.currency` directly; drop the $5 default.
- Keep idempotency on Ghost's real event id (fall back to `${subscriptionId}-${status}` if no top-level id), so a retry from Ghost doesn't double-pay.
- Add structured logs (`event`, `streamId`, `amountCents`, `subscriberEmail`) for debugging real traffic.

### 4. Stream detail UI (`streams.$streamId.tsx`)

Add a new "Connect Ghost" card above the existing webhook card:

- Inputs: Ghost site URL (e.g. `https://yourletter.ghost.io`) + Content API key. "Save" calls `updateGhostConnection`.
- Once saved, show "Sync content now" button + "Last synced: 3m ago". Button calls `syncGhostContent` and toasts `Synced 12 posts, added 2 contributors`.

The existing Ghost webhook card is updated with clearer step-by-step instructions:

> 1. In Ghost Admin → **Settings → Integrations → + Custom integration**, name it "SplitAI".
> 2. Click **+ Add webhook**. Event: `Member subscription created`. URL: (copy). Secret: (copy).
> 3. Add a second webhook for `Member added` if you also want trial conversions.

Plus a one-liner under contributors: "Auto-imported from Ghost authors when you sync."

### 5. Out of scope (call out)

- Ghost Admin API (would let us read drafts + author emails directly) — Content API is enough for the AI signal and avoids asking for an admin key.
- Wallet address backfill for Ghost-imported contributors — user fills those in manually.
- Auto-sync on a schedule — sync stays manual for now; we can add pg_cron later.

### Technical notes

- New file `src/lib/ghost.functions.ts` lives in `src/lib/` (client-safe path); admin client loaded inside `.handler()` via `await import('@/integrations/supabase/client.server')`.
- Ghost Content API is a public HTTPS call from the Worker — fetch only, no SDK. Validate the URL with `new URL()` and force `https:` before calling.
- Migration adds GRANTs only as needed (no new tables → no new grants); only `ALTER TABLE streams ADD COLUMN`.

### Order of operations

1. Migration: 2 new columns on `streams`.
2. `src/lib/ghost.functions.ts` with both server fns.
3. Harden `ghost-webhook.ts`.
4. UI updates in `streams.$streamId.tsx`.
5. You paste your Ghost site URL + Content API key, click Sync, then add the webhook in Ghost Admin and we test a real subscription end-to-end.

Shall I proceed?