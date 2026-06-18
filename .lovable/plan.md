
## Goal

1. Move Phase 3 payouts from `ETH-SEPOLIA` to **Arc Testnet** (Circle chain code `ARC-TESTNET`), which Circle Developer-Controlled Wallets does support (EOA + SCA).
2. Remove the "Lepton Agents Hackathon · live demo" badge from the homepage.

## Changes

### 1. Provision an Arc Testnet wallet on the existing entity

I'll create a new wallet (same wallet set, same registered entity secret — no re-registration needed) on `ARC-TESTNET` via Circle's API. The returned wallet ID + address replace the current ETH-SEPOLIA values. Old `ETH-SEPOLIA` wallet stays orphaned but harmless.

### 2. Update runtime secrets

Update via `secrets--update_secret`:
- `CIRCLE_BLOCKCHAIN` → `ARC-TESTNET`
- `CIRCLE_WALLET_ID` → new Arc wallet UUID
- `CIRCLE_USDC_TOKEN_ADDRESS` → Arc Testnet USDC contract address (resolved from Circle's token list for ARC-TESTNET; the client also falls back to symbol="USDC" so this is belt-and-suspenders)

`CIRCLE_API_KEY` and `CIRCLE_ENTITY_SECRET` stay the same.

### 3. Code touch-ups

- `src/lib/circle.server.ts`: no logic change required — it already resolves `tokenId` dynamically from `/wallets/{id}/balances` and matches on `CIRCLE_USDC_TOKEN_ADDRESS` or symbol `USDC`. Just verify and leave.
- `src/routes/_authenticated/payouts.tsx`: swap the Etherscan tx link to the **Arc Sepolia explorer** (`https://sepolia.arcscan.net/tx/<hash>` — Circle's published Arc Testnet explorer; will confirm the exact URL when wiring it).
- `src/routes/index.tsx`: delete the `<div>` containing "Lepton Agents Hackathon · live demo" (lines ~52–55), keep everything else.

### 4. Funding note (user action)

After the new wallet exists, you fund the new Arc Testnet wallet address with test USDC from Circle's faucet (https://faucet.circle.com → select Arc Testnet → USDC). Old ETH-Sepolia funds stay where they are.

## Out of scope

- No DB migration. The `payouts` table is chain-agnostic; `tx_hash` and `circle_tx_id` already cover Arc.
- No change to the entity secret, recovery file, or AI/splits logic.

## Order of operations once you approve

1. Call Circle `POST /v1/w3s/developer/wallets` with `blockchains: ["ARC-TESTNET"]` and the existing `walletSetId`, signed with a fresh `entitySecretCiphertext`.
2. Read the resulting wallet ID + address back to you.
3. Update the 3 secrets above.
4. Edit `payouts.tsx` explorer link and `index.tsx` badge removal.
5. You fund the wallet, then approve a proposal to verify end-to-end on Arc.
