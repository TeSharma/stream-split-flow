/**
 * Arc Testnet batched USDC payouts via Multicall3From.
 *
 * Multicall3From is a predeployed Arc contract that batches calls like
 * Multicall3 but preserves the original `msg.sender` in each subcall via
 * the CallFrom precompile. That's required for ERC20 `transfer` — a vanilla
 * Multicall3 would make `msg.sender` the multicall contract, so the USDC
 * would move FROM the multicall contract instead of FROM our wallet.
 *
 * Docs: https://docs.arc.io/arc/references/contract-addresses
 */

export const MULTICALL3_FROM_ADDRESS =
  process.env.ARC_MULTICALL3_FROM_ADDRESS ?? "0x522fAf9A91c41c443c66765030741e4AaCe147D0";

// USDC ERC-20 interface on Arc Testnet (6 decimals).
export const ARC_USDC_ADDRESS =
  process.env.ARC_USDC_ADDRESS ?? "0x3600000000000000000000000000000000000000";

// Same shape as mds1/multicall3 aggregate3 — Arc's Multicall3From mirrors it.
export const MULTICALL3_FROM_AGGREGATE3_SIGNATURE = "aggregate3((address,bool,bytes)[])";

function stripHex(s: string): string {
  return s.startsWith("0x") || s.startsWith("0X") ? s.slice(2) : s;
}

function pad32(hex: string): string {
  const h = stripHex(hex).toLowerCase();
  if (h.length > 64) throw new Error(`pad32: value longer than 32 bytes: ${hex}`);
  return h.padStart(64, "0");
}

function assertAddress(addr: string): string {
  const h = stripHex(addr);
  if (!/^[0-9a-fA-F]{40}$/.test(h)) throw new Error(`Invalid address: ${addr}`);
  return "0x" + h.toLowerCase();
}

/**
 * Encode ERC-20 `transfer(address,uint256)` calldata.
 * `amount6dp` is USDC base units (6 decimals).
 */
export function encodeErc20Transfer(to: string, amount6dp: bigint): string {
  if (amount6dp < 0n) throw new Error("encodeErc20Transfer: negative amount");
  const selector = "a9059cbb"; // keccak256("transfer(address,uint256)")[0:4]
  const toPadded = pad32(assertAddress(to));
  const amtPadded = pad32(amount6dp.toString(16));
  return "0x" + selector + toPadded + amtPadded;
}

export type Call3 = { target: string; allowFailure: boolean; callData: string };

/** Build the `Call3[]` array for a list of USDC transfers. */
export function buildUsdcTransferCalls(
  transfers: Array<{ to: string; amount6dp: bigint }>,
): Call3[] {
  return transfers.map((t) => ({
    target: ARC_USDC_ADDRESS,
    allowFailure: false,
    callData: encodeErc20Transfer(t.to, t.amount6dp),
  }));
}

/**
 * Convert a USDC amount in decimal units (e.g. 1.234567) to 6-decimal base units.
 * Rounds half-away-from-zero. Truncates anything beyond 6 decimals.
 */
export function toUsdcBaseUnits(amountUsdc: number | string): bigint {
  const n = Number(amountUsdc);
  if (!Number.isFinite(n) || n < 0) throw new Error(`Bad USDC amount: ${amountUsdc}`);
  return BigInt(Math.round(n * 1e6));
}
