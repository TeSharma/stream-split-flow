# SplitAI

> Turn Ghost subscriptions into real-time revenue streams. AI proposes contribution-based splits, your team approves, and USDC pays out instantly on Arc Testnet.

## What it does

SplitAI is a creator-economy settlement layer. Every time a subscriber pays through **Ghost**, the payment lands as a live event. An AI agent analyzes who contributed to the content (writers, editors, designers) and proposes a fair revenue split. Your team reviews and approves it. Once approved, USDC is transferred on-chain to every contributor via **Circle Developer-Controlled Wallets** on **Arc Testnet**.

The entire flow — from webhook to payout — is transparent, on-chain, and human-gated.

---

## The Flow

```
Ghost subscription payment
        |
        v
  ┌─────────────┐
  │ Payment event│  ← stored in Supabase, idempotent by Ghost event ID
  └──────┬──────┘
         |
         v
  ┌──────────────┐
  │ AI Split Agent│  ← reads content_items + contributors, returns percentages + rationale
  └──────┬───────┘
         |
         v
  ┌──────────────┐
  │ Team Approval │  ← human review & adjust, then approve
  └──────┬───────┘
         |
         v
  ┌──────────────┐
  │ USDC Payout   │  ← Circle transfer on Arc Testnet, tx hash logged
  └──────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | [TanStack Start](https://tanstack.com/start) v1 — full-stack React 19 with SSR/SSG and server functions |
| UI | React 19, Tailwind CSS v4, Radix UI primitives, shadcn/ui patterns |
| Auth | Supabase Auth (OAuth + email) with Row-Level Security (RLS) |
| Database | PostgreSQL via Supabase — teams, streams, contributors, payment_events, split_proposals, payouts |
| Realtime | Supabase Realtime for live payout status updates |
| AI | Lovable AI Gateway (`google/gemini-3-flash-preview`) via Vercel AI SDK |
| Blockchain | Arc Testnet (Circle chain code `ARC-TESTNET`) |
| Wallets | Circle Developer-Controlled Wallets (EOA) — server-side, no private keys in browser |
| Webhooks | HMAC-verified Ghost webhook ingestion at `/api/public/ghost-webhook` |

---

## Architecture

### Database Schema

- `teams` — creator teams; owner + members via `team_members`
- `streams` — revenue streams tied to a Ghost site; each gets a unique webhook URL + secret
- `contributors` — team members with roles and wallet addresses
- `content_items` — articles, edits, assets linked to contributors and streams (AI input signal)
- `payment_events` — every Ghost payment or demo trigger; idempotent by `idempotency_key`
- `split_proposals` — AI-generated or heuristic split suggestions awaiting approval
- `payouts` — queued → submitted → confirmed USDC transfers; linked to `circle_tx_id` and on-chain `tx_hash`

All tables live in the `public` schema with RLS policies. `GRANT` statements are included in every migration so the Supabase Data API works as expected.

### Auth Model

- Supabase Auth handles sign-up, sign-in, and sessions.
- `team_members` gates access: you can only see teams you belong to, and only approve splits for your own team's streams.
- Server functions use `requireSupabaseAuth` middleware. The `attachSupabaseAuth` global middleware injects the user's JWT into server function calls.

### AI Split Agent

The agent receives:
- A list of contributors (name, role)
- Recent content items per stream (type, title, excerpt)

It returns a structured JSON allocation (percentages summing to 100) plus a short rationale. If the AI call fails or no API key is configured, a deterministic heuristic fallback kicks in:
- Base weight 1 per contributor
- +2 for articles, +0.5 for edits, +0.25 for assets

### Blockchain Settlement

Payouts execute via Circle's `POST /v1/w3s/developer/transactions/transfer` API:
- Wallet: Circle Developer-Controlled EOA on Arc Testnet
- Token: USDC (resolved dynamically from wallet balances by symbol or contract address)
- Fee level: MEDIUM
- Idempotency: payout UUID reused as idempotency key

Transaction status is polled via Circle's transaction API and surfaced in the UI in real time through Supabase Realtime.

---

## Key Features

| Feature | Description |
|---------|-------------|
| **Ghost Integration** | One-click webhook URL + secret per stream. HMAC-verified ingestion. |
| **Demo Mode** | Trigger synthetic payment events from the dashboard to test the full split → payout flow without a real Ghost instance. |
| **Human-in-the-Loop** | Every AI proposal is editable before approval. Totals must sum to 100%. |
| **On-Chain Transparency** | Every confirmed payout links to the Arc Testnet explorer by transaction hash. |
| **Live Updates** | Payout statuses refresh in real time via Supabase Realtime. |

---

## Project Phases

| Phase | Status | What was built |
|-------|--------|----------------|
| Phase 1 | ✅ | Auth, teams, streams, Ghost webhook ingestion |
| Phase 2 | ✅ | Contributors, content items, AI split proposals |
| Phase 3 | ✅ | Approvals, Circle USDC payouts on Arc Testnet |
| Phase 4 | 🔄 | Live event stream (money-in-motion feed) — coming next |

---

## Local Development

### Prerequisites

- [bun](https://bun.sh) (or Node.js 20+ with npm/pnpm)
- A Supabase project
- A Circle Developer-Controlled Wallets account with an entity secret registered

### Install

```bash
bun install
```

### Environment Variables

Create a `.env` file with at least these values:

```bash
# Supabase (public — shipped to browser)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key

# Supabase (server-only)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Circle (server-only)
CIRCLE_API_KEY=your-circle-api-key
CIRCLE_ENTITY_SECRET=32-byte-hex-entity-secret
CIRCLE_WALLET_ID=uuid-of-your-arc-testnet-wallet
CIRCLE_BLOCKCHAIN=ARC-TESTNET
CIRCLE_USDC_TOKEN_ADDRESS=arc-testnet-usdc-contract-address

# AI Gateway (server-only)
LOVABLE_API_KEY=your-lovable-ai-gateway-key
```

> **Note:** `CIRCLE_ENTITY_SECRET` is the 32-byte hex secret you registered with Circle. The server encrypts it fresh for every API call using Circle's public key. Never commit it.

### Database Setup

Run the migrations in `supabase/migrations/` against your Supabase project. Each migration creates tables, grants, enables RLS, and defines policies.

### Start Dev Server

```bash
bun dev
```

The app runs at `http://localhost:3000`.

---

## Ghost Webhook Setup

1. In SplitAI, create a stream (Dashboard → New stream).
2. Open the stream detail page. Copy the **Webhook URL** and **Secret**.
3. In Ghost Admin → Settings → Integrations → Add custom integration:
   - Create a webhook for `member.added` (or `subscription.activated` for paid subscriptions).
   - Paste the URL and use the secret for HMAC verification.
4. Done. Every new member subscription now lands as a payment event in SplitAI.

---

## Funding the Wallet

Before payouts can execute, your Arc Testnet wallet needs USDC:

1. Go to [Circle Testnet Faucet](https://faucet.circle.com).
2. Select **Arc Testnet** and **USDC**.
3. Paste your wallet address (shown in payouts or from Circle dashboard).
4. Request tokens.

---

## Folder Structure

```
src/
  routes/              # TanStack file-based routing
    index.tsx          # Landing page
    auth.tsx           # Sign in / sign up
    _authenticated/    # Protected routes (layout gate)
      dashboard.tsx    # Team overview, streams, recent payments
      approvals.tsx    # Review & approve AI split proposals
      payouts.tsx      # USDC payout history & status
      live.tsx         # Phase 4: live event feed
      streams.new.tsx  # Create a stream
      streams.$streamId.tsx  # Stream detail + Ghost webhook config
    api/public/        # Public server routes (webhooks)
      ghost-webhook.ts # HMAC-verified Ghost payload ingestion
  lib/
    circle.server.ts   # Circle API client (fetch + Web Crypto)
    payouts.functions.ts  # Execute & refresh USDC payouts
    splits.functions.ts   # AI split proposals + heuristic fallback
    streams.functions.ts  # Stream CRUD + demo payment trigger
    teams.functions.ts    # Team CRUD + overview
    ai-gateway.server.ts  # Lovable AI Gateway wrapper
  integrations/
    supabase/          # Supabase client, auth middleware, types
  components/ui/       # shadcn/ui building blocks
  styles.css           # Tailwind v4 theme (dark, oklch tokens)
supabase/migrations/   # SQL migrations with RLS + GRANTs
```

---

## Design System

- **Dark-only** canvas: near-black background with electric mint primary and deep violet accents.
- **Typography**: Geist sans, JetBrains Mono for data.
- **Tokens**: All colors are semantic CSS variables (`--color-primary`, `--color-border`, etc.) — no hardcoded hex utilities in components.
- **Motion**: Subtle pulse-mint animation for live indicators; backdrop blur on cards.

---

## Testing the Flow End-to-End

1. Sign up and create a team.
2. Create a stream (optionally connect a Ghost URL).
3. Add contributors with wallet addresses.
4. Trigger a **demo payment** from the dashboard.
5. Navigate to **Approvals** — review the AI-proposed split.
6. Adjust percentages if needed, then **Approve & queue payouts**.
7. Go to **Payouts** — watch statuses move from `queued` → `submitted` → `confirmed`.
8. Click the transaction link to view it on the Arc Testnet explorer.

---

## License

MIT
