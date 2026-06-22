// @ts-nocheck
import { verifyZohoSignSignature } from "../signWebhookSecurity";
import { createHmac } from "crypto";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };

const body = '{"requests":{"request_name":"Test Name"},"notifications":{"operation_type":"RequestSigningSuccess"}}';
const secret = "thisisthesamplekeyfortestingpurposes";
const sig = createHmac("sha256", secret).update(body, "utf8").digest("base64");

ok("valid signature accepted", verifyZohoSignSignature(body, sig, secret) === true);
ok("tampered body rejected", verifyZohoSignSignature(body + " ", sig, secret) === false);
ok("wrong secret rejected", verifyZohoSignSignature(body, sig, "nope") === false);
ok("missing header rejected", verifyZohoSignSignature(body, undefined, secret) === false);
console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
