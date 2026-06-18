/**
 * Circle Developer-Controlled Wallets — minimal client using fetch + Web Crypto.
 * Avoids the Node-only SDK so this works in the Cloudflare Workers runtime.
 * Docs: https://developers.circle.com/w3s/reference/createdevelopertransaction
 */

const BASE = "https://api.circle.com";

function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function b64encode(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/^0x/, "");
  if (clean.length % 2) throw new Error("Bad hex");
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.substr(i * 2, 2), 16);
  return out;
}

let cachedPublicKey: CryptoKey | null = null;
let cachedTokenId: string | null = null;

async function getCirclePublicKey(): Promise<CryptoKey> {
  if (cachedPublicKey) return cachedPublicKey;
  const r = await fetch(`${BASE}/v1/w3s/config/entity/publicKey`, {
    headers: { Authorization: `Bearer ${env("CIRCLE_API_KEY")}` },
  });
  if (!r.ok) throw new Error(`Circle publicKey fetch failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as { data: { publicKey: string } };
  const pem = j.data.publicKey
    .replace(/-----BEGIN PUBLIC KEY-----/g, "")
    .replace(/-----END PUBLIC KEY-----/g, "")
    .replace(/\s+/g, "");
  const der = b64decode(pem);
  cachedPublicKey = await crypto.subtle.importKey(
    "spki",
    der.buffer.slice(der.byteOffset, der.byteOffset + der.byteLength) as ArrayBuffer,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["encrypt"],
  );
  return cachedPublicKey;
}

/** Fresh entity-secret ciphertext per request (Circle requirement). */
async function encryptEntitySecret(): Promise<string> {
  const key = await getCirclePublicKey();
  const secretBytes = hexToBytes(env("CIRCLE_ENTITY_SECRET"));
  if (secretBytes.length !== 32) throw new Error("CIRCLE_ENTITY_SECRET must be 32 bytes hex");
  const buf = secretBytes.buffer.slice(
    secretBytes.byteOffset,
    secretBytes.byteOffset + secretBytes.byteLength,
  ) as ArrayBuffer;
  const cipher = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, key, buf);
  return b64encode(new Uint8Array(cipher));
}

async function resolveUsdcTokenId(): Promise<string> {
  if (cachedTokenId) return cachedTokenId;
  const walletId = env("CIRCLE_WALLET_ID");
  const r = await fetch(`${BASE}/v1/w3s/wallets/${walletId}/balances?includeAll=true`, {
    headers: { Authorization: `Bearer ${env("CIRCLE_API_KEY")}` },
  });
  if (!r.ok) throw new Error(`Circle balances fetch failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as {
    data: { tokenBalances: Array<{ token: { id: string; symbol?: string; tokenAddress?: string } }> };
  };
  const wantedAddr = (process.env.CIRCLE_USDC_TOKEN_ADDRESS ?? "").toLowerCase();
  const match =
    j.data.tokenBalances.find((b) => wantedAddr && b.token.tokenAddress?.toLowerCase() === wantedAddr) ??
    j.data.tokenBalances.find((b) => b.token.symbol?.toUpperCase() === "USDC");
  if (!match) throw new Error("USDC token not found in wallet balances. Fund the testnet wallet first.");
  cachedTokenId = match.token.id;
  return cachedTokenId;
}

export type CircleTransferResult = { id: string; state: string };

export async function createUsdcTransfer(opts: {
  destinationAddress: string;
  amountUsdc: number;
  idempotencyKey: string;
}): Promise<CircleTransferResult> {
  const tokenId = await resolveUsdcTokenId();
  const entitySecretCiphertext = await encryptEntitySecret();
  const body = {
    idempotencyKey: opts.idempotencyKey,
    entitySecretCiphertext,
    amounts: [opts.amountUsdc.toFixed(6)],
    destinationAddress: opts.destinationAddress,
    feeLevel: "MEDIUM",
    tokenId,
    walletId: env("CIRCLE_WALLET_ID"),
  };
  const r = await fetch(`${BASE}/v1/w3s/developer/transactions/transfer`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env("CIRCLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Circle transfer failed: ${r.status} ${txt}`);
  const j = JSON.parse(txt) as { data: { id: string; state: string } };
  return { id: j.data.id, state: j.data.state };
}

export async function getCircleTransaction(id: string): Promise<{
  id: string;
  state: string;
  txHash?: string;
  errorReason?: string;
}> {
  const r = await fetch(`${BASE}/v1/w3s/transactions/${id}`, {
    headers: { Authorization: `Bearer ${env("CIRCLE_API_KEY")}` },
  });
  if (!r.ok) throw new Error(`Circle tx get failed: ${r.status} ${await r.text()}`);
  const j = (await r.json()) as {
    data: { transaction: { id: string; state: string; txHash?: string; errorReason?: string } };
  };
  return j.data.transaction;
}
