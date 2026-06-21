/**
 * signWebhookSecurity.ts — verify Zoho Sign webhook callbacks (HMAC-SHA256).
 *
 * Zoho Sign signs each callback and sends the signature in the `X-ZS-WEBHOOK-SIGNATURE`
 * header as base64(HMAC-SHA256(rawBody, secretKey)). Verify against the RAW request body
 * string (never a re-serialized JSON — key order matters) before trusting the payload.
 *
 * Secret key = the value you set under "Security settings → HMAC" on the Zoho Sign webhook,
 * stored server-side as ZOHO_SIGN_WEBHOOK_SECRET. Same value both sides.
 */

import { createHmac, timingSafeEqual } from "crypto";

export const ZOHO_SIGN_SIGNATURE_HEADER = "x-zs-webhook-signature"; // header names are lower-cased by most frameworks

/** True iff the header signature matches our HMAC of the raw body. Constant-time compare. */
export function verifyZohoSignSignature(rawBody: string, headerSignature: string | undefined, secret: string): boolean {
  if (!headerSignature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  const a = Buffer.from(expected);
  const b = Buffer.from(headerSignature);
  return a.length === b.length && timingSafeEqual(a, b);
}
