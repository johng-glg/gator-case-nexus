/**
 * zohoSignAdapter.ts — default SignAdapter backed by Zoho Sign REST ("send using template").
 *
 * One firm-level Sign connection (NOT per-user): the retainer goes out from the firm, not from
 * an individual staff member. Supply an access-token getter for that connection (its refresh
 * token needs scope ZohoSign.documents.ALL) plus the template id and the SIGN action/role id
 * from your template.
 *
 * Zoho Sign send-using-template:
 *   POST {signHost}/api/v1/templates/{template_id}/createdocument
 *   multipart/form-data, field `data` = JSON:
 *     { "templates": { "field_data": { "field_text_data": { <tag>: <value>, ... } },
 *                       "actions": [ { "action_id": "<role action id>", "action_type": "SIGN",
 *                                      "recipient_name": "...", "recipient_email": "..." } ],
 *                       "notes": "<note>" } }
 * The endpoint both creates AND sends. It returns { requests: { request_id, ... } }.
 *
 * NOTE: action_id and the exact merge-tag keys are specific to YOUR template — read them once
 * from GET /api/v1/templates/{template_id} and set them in the config below. Verify field names
 * against your Sign account before relying on this in production.
 */

import type { SignAdapter, SignCompletedFile, SignSendResult } from "./retainerService";

const SIGN_HOSTS: Record<string, string> = {
  us: "https://sign.zoho.com", eu: "https://sign.zoho.eu", in: "https://sign.zoho.in",
  au: "https://sign.zoho.com.au", jp: "https://sign.zoho.jp", ca: "https://sign.zohocloud.ca",
};

export interface ZohoSignAdapterConfig {
  /** Returns a valid OAuth access token for the firm Sign connection (ZohoSign.documents.ALL). */
  getAccessToken: () => Promise<string>;
  /** Zoho Sign template id (send-using-template). */
  templateId: string;
  /** The template's SIGN role action id (the client signer). */
  signActionId: string;
  dc?: keyof typeof SIGN_HOSTS; // default "us"
  /** Map our mergeData keys → the template's field-tag names, if they differ. */
  mapMergeKey?: (key: string) => string;
}

export function createZohoSignAdapter(cfg: ZohoSignAdapterConfig): SignAdapter {
  const host = SIGN_HOSTS[cfg.dc ?? "us"];
  const mapKey = cfg.mapMergeKey ?? ((k) => k);

  return {
    async sendTemplate(input): Promise<SignSendResult> {
      const field_text_data: Record<string, string> = {};
      for (const [k, v] of Object.entries(input.mergeData)) field_text_data[mapKey(k)] = v;

      const templateId = input.templateId ?? cfg.templateId;
      const actionId = input.actionId ?? cfg.signActionId;
      // Only include field_data when we actually have merge values that match the template.
      // Sending an unknown tag makes Zoho return 9004 "No match found".
      const hasMerge = Object.keys(field_text_data).length > 0;
      const data: Record<string, unknown> = {
        templates: {
          ...(hasMerge ? { field_data: { field_text_data } } : {}),
          actions: [{
            action_id: actionId,
            action_type: "SIGN",
            recipient_name: input.recipient.name,
            recipient_email: input.recipient.email,
          }],
          notes: input.note ?? "",
        },
      };

      const form = new FormData();
      form.append("data", JSON.stringify(data));

      const token = await cfg.getAccessToken();
      const res = await fetch(`${host}/api/v1/templates/${templateId}/createdocument`, {
        method: "POST",
        headers: { Authorization: `Zoho-oauthtoken ${token}` }, // let fetch set multipart boundary
        body: form,
      });
      const json: any = await res.json().catch(() => ({}));
      if (!res.ok || json?.status === "failure") {
        throw new Error(`Zoho Sign send failed (${res.status}): ${JSON.stringify(json)}`);
      }

      const req = json?.requests ?? json?.request ?? {};
      const requestId = req.request_id ?? req.requestId;
      if (!requestId) throw new Error(`Zoho Sign response missing request_id: ${JSON.stringify(json)}`);
      const signLink = req.sign_url ?? req.signing_url ?? undefined;
      return { requestId: String(requestId), signLink };
    },

    /** Pull the signed PDF + completion certificate. Used to retain ≥ 3 years (SSA CPAS rule). */
    async downloadCompleted(requestId: string): Promise<SignCompletedFile[]> {
      const token = await cfg.getAccessToken();
      const headers = { Authorization: `Zoho-oauthtoken ${token}` };
      const out: SignCompletedFile[] = [];
      // Signed PDF
      const pdfRes = await fetch(`${host}/api/v1/requests/${requestId}/pdf`, { headers });
      if (!pdfRes.ok) {
        throw new Error(`Zoho Sign pdf download failed (${pdfRes.status})`);
      }
      out.push({
        name: `${requestId}-signed.pdf`,
        contentType: pdfRes.headers.get("content-type") ?? "application/pdf",
        bytes: new Uint8Array(await pdfRes.arrayBuffer()),
        kind: "signed",
      });
      // Completion certificate (audit trail) — endpoint varies by tenant; tolerate 404.
      const certRes = await fetch(`${host}/api/v1/requests/${requestId}/certificate`, { headers });
      if (certRes.ok) {
        out.push({
          name: `${requestId}-audit.pdf`,
          contentType: certRes.headers.get("content-type") ?? "application/pdf",
          bytes: new Uint8Array(await certRes.arrayBuffer()),
          kind: "audit",
        });
      } else {
        console.warn(`[zohoSignAdapter] audit certificate not available (${certRes.status}) for ${requestId}`);
      }
      return out;
    },
  };
}
