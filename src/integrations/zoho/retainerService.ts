/**
 * retainerService.ts — e-sign the engagement retainer (Gator Law)
 *
 * Two responsibilities:
 *   - sendRetainer(userKey, engagementId) — merge the client's data into the firm's Zoho Sign
 *     retainer template and send it for signature; stamp the Engagement (Retainer_ID / _Link /
 *     _Sent_Date, Retainer_Status = "Sent"). CRM reads/writes are AS the acting user (attribution);
 *     the Sign send itself goes out on the firm's single Sign connection (see SignAdapter).
 *   - handleSignCompleted(payload) — Zoho Sign webhook ("RequestCompleted" et al.): find the
 *     Engagement by Retainer_ID and flip Retainer_Status (Signed / Declined / Expired / Recalled).
 *     Runs as the SERVICE actor — there is no user session on a webhook.
 *
 * ── Zoho-side prerequisites (one-time) ────────────────────────────────────────────────
 *   1. A Zoho Sign template built from "Gator Law SSDI Retainer.docx" with one SIGN recipient
 *      role (the client) and merge tags {{Client_Full_Name}} / {{Today_Date}}.
 *   2. Engagement fields: Retainer_Status (picklist: Not sent | Sent | Signed | Declined |
 *      Expired), Retainer_ID (single line), Retainer_Link (URL), Retainer_Sent_Date (datetime),
 *      Retainer_Signed_Date (datetime). (Retainer_Status already exists.)
 *   3. A Sign webhook posting to your /webhooks/zoho-sign route → handleSignCompleted(payload).
 *
 * The actual Sign HTTP call lives behind SignAdapter so this orchestration stays testable and
 * the firm can implement it against Zoho Sign REST ("send using template") OR by invoking the
 * existing Deluge sign_mail_merge function — without touching this file.
 */

import { localToday } from "./deadlines";
import type { ZohoClient, ZohoRecord } from "./zohoClient";
import { SERVICE_ACTOR } from "./zohoClient";

const ENGAGEMENTS = "Engagements";
const CONTACTS = "Contacts";

/** Engagement.Retainer_Status values. */
export type RetainerStatus = "Not sent" | "Sent" | "Viewed" | "Signed" | "Declined" | "Expired";

export interface SignSendResult {
  /** Zoho Sign request id — persisted to Engagement.Retainer_ID; the webhook joins back on it. */
  requestId: string;
  /** Optional view/sign URL to persist to Engagement.Retainer_Link. */
  signLink?: string;
}

/** The firm's e-sign transport. One implementation = one Sign connection for the whole firm. */
export interface SignAdapter {
  sendTemplate(input: {
    /** Optional per-call template override; falls back to the adapter's default template. */
    templateId?: string;
    /** Optional per-call signer action id override; falls back to the adapter's default. */
    actionId?: string;
    recipient: { name: string; email: string };
    /** Merge values for the template's tags (e.g. Client_Full_Name, Today_Date). */
    mergeData: Record<string, string>;
    /** Free-text note shown to the signer. */
    note?: string;
    /** Your CRM record id, echoed into Sign so the webhook can be correlated if needed. */
    reference?: string;
  }): Promise<SignSendResult>;
}

export interface RetainerServiceDeps {
  zoho: ZohoClient;
  sign: SignAdapter;
  now?: () => Date;
  /** Called after the Engagement flips to Signed — opens the practice-specific Case. */
  onRetainerSigned?: (ctx: { engagementId: string }) => Promise<void>;
}

const isoDateTime = (d: Date) => d.toISOString().slice(0, 19) + "+00:00";
const esc = (s: string) => s.replace(/'/g, "''");
/** Zoho create/update returns [{ details:{ id } }] etc.; pull the lookup id whether bare or object. */
const lookupId = (v: unknown): string | undefined =>
  typeof v === "string" ? v : (v as { id?: string })?.id;

export function createRetainerService(deps: RetainerServiceDeps) {
  const now = () => (deps.now ? deps.now() : localToday());

  /**
   * Send the retainer for the given Engagement. Reads the linked Client for name/email,
   * sends via the firm Sign connection, and stamps the Engagement. Idempotency: refuses to
   * resend once the retainer is already Signed.
   */
  async function sendRetainer(userKey: string, engagementId: string) {
    const api = deps.zoho.as(userKey);

    const eng = await api.getRecord<ZohoRecord>(ENGAGEMENTS, engagementId, [
      "Name", "Client", "Retainer_Status",
    ]);
    if (!eng) throw new Error(`Engagement ${engagementId} not found`);
    if (eng.Retainer_Status === "Signed") {
      throw new Error(`Engagement ${engagementId} retainer is already Signed; not resending.`);
    }

    const clientId = lookupId(eng.Client);
    if (!clientId) throw new Error(`Engagement ${engagementId} has no linked Client.`);

    const client = await api.getRecord<ZohoRecord>(CONTACTS, clientId, [
      "First_Name", "Last_Name", "Email",
    ]);
    if (!client?.Email) throw new Error(`Client ${clientId} has no email; cannot send for signature.`);

    const fullName = [client.First_Name, client.Last_Name].filter(Boolean).join(" ").trim();
    const t = now();

    const result = await deps.sign.sendTemplate({
      recipient: { name: fullName, email: client.Email as string },
      mergeData: {
        Client_Full_Name: fullName,
        Today_Date: t.toISOString().slice(0, 10),
      },
      note: "Please review and sign your Gator Law SSDI representation agreement.",
      reference: engagementId,
    });

    await api.updateRecords(ENGAGEMENTS, [{
      id: engagementId,
      Retainer_ID: result.requestId,
      Retainer_Link: result.signLink,
      Retainer_Sent_Date: isoDateTime(t),
      Retainer_Status: "Sent" as RetainerStatus,
    }]);

    return { engagementId, requestId: result.requestId, signLink: result.signLink };
  }

  /**
   * Zoho Sign webhook handler. Maps the request's terminal status to Retainer_Status on the
   * Engagement matched by Retainer_ID. Returns what it did (or null if no matching engagement /
   * non-terminal event) so the route can log it. Safe to call on every Sign notification.
   */
  async function handleSignCompleted(payload: unknown): Promise<
    { engagementId: string; status: RetainerStatus } | null
  > {
    const evt = parseSignWebhook(payload);
    if (!evt?.requestId || !evt.status) return null;

    const svc = deps.zoho.as(SERVICE_ACTOR);
    const rows = await svc.coql<ZohoRecord>(
      `select id, Retainer_Status from ${ENGAGEMENTS} where Retainer_ID = '${esc(evt.requestId)}'`,
    );
    const eng = rows[0];
    if (!eng?.id) return null;

    // Don't downgrade a terminal status (Signed/Declined/Expired) to Viewed if
    // a later notification arrives out of order.
    const current = String(eng.Retainer_Status ?? "");
    const isTerminal = current === "Signed" || current === "Declined" || current === "Expired";
    if (evt.status === "Viewed" && isTerminal) {
      return { engagementId: eng.id as string, status: current as RetainerStatus };
    }

    const update: ZohoRecord = { id: eng.id as string, Retainer_Status: evt.status };
    if (evt.status === "Signed") update.Retainer_Signed_Date = isoDateTime(now());
    if (evt.status === "Viewed") update.Retainer_Viewed_Date = isoDateTime(now());
    await svc.updateRecords(ENGAGEMENTS, [update]);

    if (evt.status === "Signed" && deps.onRetainerSigned) {
      try {
        await deps.onRetainerSigned({ engagementId: eng.id as string });
      } catch (err) {
        // Don't fail the webhook if case opening errors; log so it can be retried.
        console.error("[retainerService] onRetainerSigned failed", err);
      }
    }

    return { engagementId: eng.id as string, status: evt.status };
  }

  return { sendRetainer, handleSignCompleted };
}

/**
 * Normalize a Zoho Sign webhook body to { requestId, status }. Zoho posts the request object
 * under `requests` with a `request_status` and a notification `action_type`/`operation_type`.
 * Defensive across shapes; returns null for non-terminal events (e.g. "viewed").
 */
export function parseSignWebhook(payload: unknown): { requestId?: string; status?: RetainerStatus } | null {
  const p = payload as Record<string, any> | undefined;
  if (!p) return null;
  const req = p.requests ?? p.request ?? p.notifications?.requests ?? p;
  const requestId =
    req?.request_id ?? req?.requestId ?? p.request_id ?? undefined;
  // Only trust the notification event name. request_status / per-action fields
  // fire on "viewed" / per-signer events and would prematurely mark Signed.
  const raw: string | undefined =
    p.notifications?.operation_type ?? p.operation_type ?? p.action_type ?? undefined;
  if (!requestId || !raw) return null;

  const key = String(raw).toLowerCase().replace(/[_\s-]/g, "");
  // Terminal events only. "RequestSigned" fires per-signer and is NOT terminal for
  // multi-signer requests — wait for "RequestCompleted". Single-signer retainers
  // still emit RequestCompleted, so this is safe.
  if (key === "requestcompleted" || key === "completed")       return { requestId, status: "Signed" };
  if (key === "requestdeclined"  || key === "declined")        return { requestId, status: "Declined" };
  if (key === "requestexpired"   || key === "expired")         return { requestId, status: "Expired" };
  if (key === "requestrecalled"  || key === "recalled" ||
      key === "requestwithdrawn" || key === "withdrawn")       return { requestId, status: "Not sent" as RetainerStatus };
  if (key === "requestviewed"    || key === "viewed")          return { requestId, status: "Viewed" };
  return { requestId, status: undefined };
}
