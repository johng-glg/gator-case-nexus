/**
 * state.server.ts — HMAC-signed OAuth state for the Zoho per-user round-trip.
 *
 * Carries the signed-in user id through the redirect without trusting client cookies.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.ZOHO_STATE_SECRET;
  if (!s) throw new Error("ZOHO_STATE_SECRET is not set.");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

export function signState(userId: string): string {
  const payload = `${userId}.${Date.now()}`;
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  return `${b64url(Buffer.from(payload))}.${sig}`;
}

export function verifyState(state: string, maxAgeMs = 10 * 60_000): string | null {
  try {
    const [payloadB64, sig] = state.split(".");
    if (!payloadB64 || !sig) return null;
    const payload = Buffer.from(payloadB64.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const expected = b64url(createHmac("sha256", secret()).update(payload).digest());
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const [userId, tsStr] = payload.split(".");
    const ts = Number(tsStr);
    if (!userId || !ts || Date.now() - ts > maxAgeMs) return null;
    return userId;
  } catch {
    return null;
  }
}
