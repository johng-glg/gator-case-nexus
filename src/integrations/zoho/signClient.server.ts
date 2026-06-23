/**
 * signClient.server.ts — firm-level Zoho Sign access-token getter + retainer service factory.
 * Server-only. One Sign connection for the whole firm (not per-user).
 *
 * Env required at call time (read inside the handler, never at module scope):
 *   ZOHO_SIGN_CLIENT_ID, ZOHO_SIGN_CLIENT_SECRET, ZOHO_SIGN_REFRESH_TOKEN
 *   ZOHO_SIGN_TEMPLATE_ID, ZOHO_SIGN_ACTION_ID
 *   ZOHO_DC (optional, default "us") — shared with CRM client
 *   ZOHO_SIGN_WEBHOOK_SECRET (used by the webhook route, not here)
 */
import { createZohoSignAdapter, type ZohoSignAdapterConfig } from "./zohoSignAdapter";
import { createRetainerService } from "./retainerService";
import { createFormsService, gatorIntakeForms } from "./formsService";
import { makeZohoClient } from "./client.server";

const ACCOUNTS_HOSTS: Record<string, string> = {
  us: "https://accounts.zoho.com",
  eu: "https://accounts.zoho.eu",
  in: "https://accounts.zoho.in",
  au: "https://accounts.zoho.com.au",
  jp: "https://accounts.zoho.jp",
  ca: "https://accounts.zohocloud.ca",
};

let cachedToken: { token: string; exp: number } | null = null;

/** Refresh-token grant against the firm Sign connection. Prefers the DB-stored
 * refresh token (rotated via Settings → Connections) and falls back to the
 * ZOHO_SIGN_REFRESH_TOKEN env var. Cached in-process until ~60s before expiry. */
async function getFirmSignAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.exp > Date.now()) return cachedToken.token;

  // Prefer the credentials service (DB-backed refresh token) when available.
  try {
    const { getCredentialsService } = await import("./credentialsClient.server");
    const creds = await getCredentialsService();
    const token = await creds.getAccessToken("SIGN_FIRM");
    cachedToken = { token, exp: Date.now() + 60 * 60 * 1000 - 60_000 };
    return token;
  } catch (e) {
    // Fall back to env-based refresh below.
  }

  const clientId = process.env.ZOHO_SIGN_CLIENT_ID;
  const clientSecret = process.env.ZOHO_SIGN_CLIENT_SECRET;
  const refreshToken = process.env.ZOHO_SIGN_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Zoho Sign is not configured. Rotate it on Settings → Connections, or set ZOHO_SIGN_CLIENT_ID / ZOHO_SIGN_CLIENT_SECRET / ZOHO_SIGN_REFRESH_TOKEN.",
    );
  }

  const dc = (process.env.ZOHO_DC ?? "us") as keyof typeof ACCOUNTS_HOSTS;
  const accounts = ACCOUNTS_HOSTS[dc] ?? ACCOUNTS_HOSTS.us;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${accounts}/oauth/v2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const json = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(`Zoho Sign token refresh failed (${res.status}): ${json.error ?? JSON.stringify(json)}`);
  }
  cachedToken = {
    token: json.access_token,
    exp: Date.now() + (json.expires_in ?? 3600) * 1000 - 60_000,
  };
  return json.access_token;
}

/** Build the retainer service with the firm Sign adapter + per-user CRM client. */
/** Build the firm SignAdapter once (reused by retainer + forms). */
function makeFirmSignAdapter() {
  const templateId = process.env.ZOHO_SIGN_TEMPLATE_ID;
  const signActionId = process.env.ZOHO_SIGN_ACTION_ID;
  if (!templateId || !signActionId) {
    throw new Error(
      "Zoho Sign is not configured: missing ZOHO_SIGN_TEMPLATE_ID / ZOHO_SIGN_ACTION_ID.",
    );
  }
  const dc = (process.env.ZOHO_DC ?? "us") as ZohoSignAdapterConfig["dc"];
  return createZohoSignAdapter({
    getAccessToken: getFirmSignAccessToken,
    templateId,
    signActionId,
    dc,
  });
}

/** SSA-1696 / SSA-827 (+ optional SSA-1693) forms service, configured from env. */
export function makeFormsService() {
  // Trim — secret values sometimes get a trailing newline/space which Zoho's createdocument
  // rejects (GET tolerates it, POST returns 9004 "No match found").
  const ssa1696TemplateId = process.env.ZOHO_SIGN_SSA1696_TEMPLATE_ID?.trim();
  const ssa1696ActionId = process.env.ZOHO_SIGN_SSA1696_ACTION_ID?.trim();
  const ssa827TemplateId = process.env.ZOHO_SIGN_SSA827_TEMPLATE_ID?.trim();
  const ssa827ActionId = process.env.ZOHO_SIGN_SSA827_ACTION_ID?.trim();
  const ssa1693TemplateId = process.env.ZOHO_SIGN_SSA1693_TEMPLATE_ID?.trim();
  const ssa1693ActionId = process.env.ZOHO_SIGN_SSA1693_ACTION_ID?.trim();
  if (!ssa1696TemplateId || !ssa1696ActionId || !ssa827TemplateId || !ssa827ActionId) {
    throw new Error(
      "Zoho Sign SSA intake forms are not configured: set ZOHO_SIGN_SSA1696_TEMPLATE_ID / _ACTION_ID and ZOHO_SIGN_SSA827_TEMPLATE_ID / _ACTION_ID.",
    );
  }
  const sign = makeFirmSignAdapter();
  return createFormsService({
    zoho: makeZohoClient(),
    sign,
    forms: gatorIntakeForms({
      ssa1696TemplateId, ssa1696ActionId,
      ssa827TemplateId, ssa827ActionId,
      ssa1693TemplateId, ssa1693ActionId,
    }),
    archive: async ({ caseId, code, requestId }) => {
      // Sync the checklist: SSA-1696 / SSA-827 just got Signed → reflect as Received
      // unless the firm already marked it Filed. Best-effort; never block the webhook.
      try {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existing } = await supabaseAdmin
          .from("case_document_status")
          .select("status")
          .eq("case_id", caseId)
          .eq("doc_code", code)
          .maybeSingle();
        if (existing?.status !== "Filed") {
          await supabaseAdmin.from("case_document_status").upsert(
            {
              case_id: caseId,
              doc_code: code,
              status: "Received",
              updated_by: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "case_id,doc_code" },
          );
        }
      } catch (err) {
        console.error("[forms-archive] checklist sync failed", err);
      }

      if (!sign.downloadCompleted) return;
      const files = await sign.downloadCompleted(requestId);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      for (const f of files) {
        const safeCode = code.replace(/[^A-Za-z0-9-]/g, "_");
        const storagePath = `cases/${caseId}/ssa-forms/${safeCode}-${requestId}-${f.kind}.pdf`;
        const up = await supabaseAdmin.storage.from("case-documents").upload(storagePath, f.bytes, {
          contentType: f.contentType, upsert: true,
        });
        if (up.error) {
          console.error("[forms-archive] storage upload failed", { storagePath, err: up.error.message });
          continue;
        }
        const { error: insErr } = await supabaseAdmin.from("document_uploads").insert({
          case_id: caseId,
          request_id: null,
          storage_path: storagePath,
          original_name: `${code} — ${f.kind === "signed" ? "signed PDF" : "audit certificate"}.pdf`,
          size_bytes: f.bytes.byteLength,
          mime_type: f.contentType,
          uploaded_by_user: null,
          uploaded_by_email: "zoho-sign@system",
        });
        if (insErr && !/duplicate key/i.test(insErr.message)) {
          console.error("[forms-archive] document_uploads insert failed", insErr.message);
        }
      }
    },

  });
}

/** Build the retainer service with the firm Sign adapter + per-user CRM client. */
export function makeRetainerService() {
  const sign = makeFirmSignAdapter();
  const zoho = makeZohoClient();
  // Lazy-import to avoid a circular dep at module load. On retainer signature: open the
  // SSDI case, then auto-send SSA-1696 + SSA-827 to the client.
  const onRetainerSigned = async (ctx: { engagementId: string }) => {
    const { createSsdiCaseOpener } = await import("./intakeService");
    const { caseId } = await createSsdiCaseOpener(zoho)(ctx);
    if (!caseId) return;
    try {
      const { fillCaseIdOnLink } = await import("@/integrations/portal/autoInvite.server");
      await fillCaseIdOnLink({ engagementId: ctx.engagementId, caseId });
    } catch (err) {
      console.error("[signClient] fillCaseIdOnLink failed", err);
    }
    try {
      // Run the full intake playbook (SSA-1696, task bundle, portal invite,
      // welcome email, intake questionnaire, doc request, etc.). Idempotent.
      const { onCaseOpened } = await import("./caseIntakeService");
      await onCaseOpened({ zoho, caseId });
    } catch (err) {
      console.error("[signClient] onCaseOpened failed", err);
    }
  };

  return createRetainerService({ zoho, sign, onRetainerSigned });
}
