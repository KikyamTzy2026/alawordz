import crypto from "node:crypto";

export const roomChannel = (code: string) => `wh-${code}`; // server -> clients (state events), presence
export const selChannel = (code: string) => `wh-sel-${code}`; // players -> everyone (live drag previews)

/**
 * Signs an Ably TokenRequest with the root key (HMAC-SHA256, Ably's documented format).
 * Done locally so token issuing never depends on an SDK runtime. The browser then exchanges
 * this request with Ably for a short-lived token. The secret part of the key never leaves the server.
 */
export function signTokenRequest(o: { clientId: string; capability: string; ttl: number; timestamp?: number; nonce?: string }) {
  const key = (process.env.ABLY_API_KEY || "").trim();
  if (!key) throw new Error("ABLY_API_KEY is not set");
  const i = key.indexOf(":");
  if (i < 1 || i === key.length - 1) throw new Error("ABLY_API_KEY format is invalid (expected keyName:keySecret)");
  const keyName = key.slice(0, i);
  const secret = key.slice(i + 1);
  const timestamp = o.timestamp ?? Date.now();
  const nonce = o.nonce ?? crypto.randomBytes(8).toString("hex");
  const text = [keyName, o.ttl, o.capability, o.clientId, timestamp, nonce].join("\n") + "\n";
  const mac = crypto.createHmac("sha256", secret).update(text).digest("base64");
  return { keyName, ttl: o.ttl, capability: o.capability, clientId: o.clientId, timestamp, nonce, mac };
}
