# Batch payouts via Arc's Multicall3From

Replace the loop of individual `createUsdcTransfer` calls in `executePayoutsForPayment` with **one** on-chain transaction that distributes USDC to every contributor in a payment, using Arc Testnet's predeployed `Multicall3From` contract. The Circle developer-controlled wallet stays — it just signs one contract call instead of N transfers.

## Why this works on Arc
- USDC is the native gas token, so the Circle wallet pays gas in USDC and transfers USDC value in the same tx — no separate gas top-up.
- `Multicall3From` executes a batch of `(target, callData, value)` tuples *from the EOA's context*, so each inner `USDC.transfer(contributor, amount)` has `msg.sender == Circle wallet`. A vanilla Multicall3 would break ERC20 transfers (msg.sender would be the multicall contract).

## Changes

### 1. `src/lib/multicall.server.ts` (new)
Pure helper, no Circle coupling:
- `encodeErc20Transfer(to, amount6dp) -> 0x…` — ABI-encodes `transfer(address,uint256)` by hand (4-byte selector `0xa9059cbb` + 32-byte address + 32-byte amount) so we don't pull in viem/ethers.
- `encodeMulticall3FromAggregate(from, calls[]) -> 0x…` — ABI-encodes the `aggregate` entrypoint with `{target, allowFailure:false, value:0, callData}` tuples and the `from` address.
- Exports `MULTICALL3_FROM_ADDRESS` and `USDC_ADDRESS` (read from env, fall back to known Arc Testnet constants).

### 2. `src/lib/circle.server.ts` (extend)
Add `createContractExecution({ contractAddress, callData, idempotencyKey, abiFunctionSignature? })`:
- POSTs to `/v1/w3s/developer/transactions/contractExecution` with `walletId`, fresh `entitySecretCiphertext`, raw `callData`, and `feeLevel: "MEDIUM"`.
- Returns `{ id, state }` shaped like `createUsdcTransfer` so the rest of the pipeline (status polling, `tx_hash`) is unchanged.
- `getCircleTransaction` already works for contract execution txs — no change.

### 3. `src/lib/payouts.functions.ts` (rewrite `executePayoutsForPayment`)
- Load queued payouts + contributor wallet addresses as today.
- Pre-flight filter: rows with no `wallet_address` or `< 0.000001 USDC` get marked `skipped` individually (same UX as today).
- Build the eligible set. If empty → return early.
- Resolve the Circle wallet's on-chain address once (cache it; fetched via `GET /v1/w3s/wallets/{id}` and reused).
- Encode one `Multicall3From.aggregate` call containing one `USDC.transfer` per eligible payout. Amounts use 6-decimal USDC units (`BigInt(Math.round(amount * 1e6))`).
- Idempotency key = `payment_event_id` (one batch per payment, safe to retry).
- Submit via `createContractExecution`. On success, update **all** eligible payouts in one `UPDATE … WHERE id IN (…)` to `status='submitted'`, set the same `circle_tx_id`, `destination_address`, `submitted_at`.
- On failure, mark the same set `failed` with the truncated error.

### 4. `refreshPayoutStatuses` (small tweak)
- Already polls by `circle_tx_id`. Because many payout rows now share one `circle_tx_id`, group by it before calling `getCircleTransaction` (one API call updates N rows). Keeps Circle API usage flat as batch sizes grow.

### 5. Config / secrets
- New optional env vars: `ARC_MULTICALL3_FROM_ADDRESS`, `ARC_USDC_ADDRESS`. Defaults baked in for Arc Testnet so nothing is required up front; we'll expose `add_secret` only if the user wants to override.
- `CIRCLE_BLOCKCHAIN` must already be set to Arc Testnet (it is).

### 6. UI (minor)
- `streams.$streamId.tsx` and payouts list already render `circle_tx_id` / `tx_hash`. With batching, every row in a payment shows the same hash — that's correct and worth a one-line "(batched)" hint next to the hash. No schema changes needed.

## Out of scope / explicit non-goals
- No new database columns. Sharing `circle_tx_id` across rows is fine; if we later want a dedicated `batch_id`, that's a follow-up.
- No fallback to per-transfer mode. If the batch tx fails, the whole set is marked `failed` and the user retries — simpler than partial recovery and matches the "atomic distribution" goal.
- No change to split-proposal logic or the AI agent.

## Verification
1. Trigger a Ghost test webhook → confirm one `payment_events` row → call `executePayouts` from the stream page.
2. Inspect `payouts` table: all rows for that payment share one `circle_tx_id`, status `submitted`.
3. After Circle confirms, `refreshPayoutStatuses` flips them all to `confirmed` with the same `tx_hash`. Open the hash on Arc Testnet explorer and verify N `Transfer` events from the Circle wallet inside one transaction.
