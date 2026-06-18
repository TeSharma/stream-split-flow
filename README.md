# SplitAI
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
## License

MIT
