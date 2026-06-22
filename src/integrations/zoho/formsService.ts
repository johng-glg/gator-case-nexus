/**
 * formsService.ts — e-sign the SSA intake forms (SSA-1696, SSA-827) for an SSDI case.
 *
 * Mirrors retainerService, generalized over a FormSpec[] so adding more forms later (SSA-561,
 * SSA-3441, HA-501…) is just config — no new code. The forms are signed by the client and live on
 * the SSDI_Case (claim-specific), unlike the retainer which lives on the Engagement.
 *
 *   - sendForm(userKey, caseId, code) — send one form for signature; stamp the case
 *     (<code>_Status="Sent", request id, sent date).
 *   - sendIntakeForms(userKey, caseId) — send every form flagged onIntake (SSA-1696 + SSA-827).
 *     Wire this to fire right after the case opens (createSsdiCaseOpener returns the caseId).
 *   - handleFormSigned(payload) — Zoho Sign webhook: find the case by the matching per-form request
 *     id and flip <code>_Status. SSA-827 (the medical release) stamps Release_Signed_Date, so the
 *     EXISTING release-expiry sweep (deadlines.ts) lights up automatically.
 *
 * Signer = the case's client, resolved case → Engagement → Contact. Sends go out on the firm Sign
 * connection (the SignAdapter); the webhook runs as SERVICE (no user session).
 */

import { localToday } from "./deadlines";
import { parseSignWebhook, type SignAdapter } from "./retainerService";
import type { ZohoClient, ZohoRecord } from "./zohoClient";
import { SERVICE_ACTOR } from "./zohoClient";

const CASES = "SSDI_Cases";
const ENGAGEMENTS = "Engagements";
const CONTACTS = "Contacts";

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const isoDateTime = (d: Date) => d.toISOString().slice(0, 19) + "+00:00";
const esc = (s: string) => s.replace(/'/g, "''");
const lookupId = (v: unknown): string | undefined =>
  typeof v === "string" ? v : (v as { id?: string })?.id;

/** One SSA form's Zoho Sign template + the SSDI_Case fields it writes. */
export interface FormSpec {
  code: string;                 // "SSA-1696" | "SSA-827"
  label: string;                // human label for notes/UI
  templateId: string;           // Zoho Sign template id
  actionId: string;             // signer action id within that template
  onIntake?: boolean;           // sent automatically when the case opens (Retained)
  statusField: string;          // picklist: Not sent | Sent | Signed | Declined | Expired
  requestIdField: string;       // Zoho Sign request id (join key for the webhook)
  sentDateField: string;        // Date
  signedDateField: string;      // for SSA-827 use "Release_Signed_Date" (feeds release-expiry sweep)
  signedDateIsDate?: boolean;   // true => write YYYY-MM-DD (Release_Signed_Date is a Date)
  linkField?: string;           // optional URL field
}

export interface FormsServiceDeps {
  zoho: ZohoClient;
  sign: SignAdapter;
  forms: FormSpec[];
  now?: () => Date;
}

export function createFormsService(deps: FormsServiceDeps) {
  const now = () => (deps.now ? deps.now() : localToday());
  const byCode = (code: string): FormSpec => {
    const f = deps.forms.find((x) => x.code === code);
    if (!f) throw new Error(`Unknown SSA form "${code}".`);
    return f;
  };

  /** Resolve the signer (the case's client) via case → Engagement → Contact. */
  async function resolveSigner(api: ReturnType<ZohoClient["as"]>, caseId: string) {
    const c = await api.getRecord<ZohoRecord>(CASES, caseId, ["Engagement"]);
    if (!c) throw new Error(`SSDI case ${caseId} not found`);
    const engId = lookupId(c.Engagement);
    if (!engId) throw new Error(`Case ${caseId} has no Engagement.`);
    const eng = await api.getRecord<ZohoRecord>(ENGAGEMENTS, engId, ["Client"]);
    const clientId = lookupId(eng?.Client);
    if (!clientId) throw new Error(`Engagement ${engId} has no Client.`);
    const client = await api.getRecord<ZohoRecord>(CONTACTS, clientId, ["First_Name", "Last_Name", "Email"]);
    if (!client?.Email) throw new Error(`Client ${clientId} has no email; cannot send for signature.`);
    const fullName = [client.First_Name, client.Last_Name].filter(Boolean).join(" ").trim();
    return { fullName, email: client.Email as string };
  }

  /** Send one SSA form for signature and stamp the case. */
  async function sendForm(userKey: string, caseId: string, code: string) {
    const api = deps.zoho.as(userKey);
    const spec = byCode(code);

    const c = await api.getRecord<ZohoRecord>(CASES, caseId, [spec.statusField]);
    if (!c) throw new Error(`SSDI case ${caseId} not found`);
    if (c[spec.statusField] === "Signed") throw new Error(`${spec.label} is already signed for ${caseId}.`);

    const signer = await resolveSigner(api, caseId);
    const t = now();
    const res = await deps.sign.sendTemplate({
      templateId: spec.templateId, actionId: spec.actionId,
      recipient: { name: signer.fullName, email: signer.email },
      mergeData: { Client_Full_Name: signer.fullName, Today_Date: isoDate(t) },
      note: `Please review and sign your ${spec.label}.`,
      reference: caseId,
    });

    const upd: ZohoRecord = {
      id: caseId,
      [spec.statusField]: "Sent",
      [spec.requestIdField]: res.requestId,
      [spec.sentDateField]: isoDate(t),
    };
    if (spec.linkField && res.signLink) upd[spec.linkField] = res.signLink;
    await api.updateRecords(CASES, [upd]);

    return { caseId, code: spec.code, requestId: res.requestId };
  }

  /** Send every onIntake form (SSA-1696 + SSA-827). Call right after the case opens. */
  async function sendIntakeForms(userKey: string, caseId: string) {
    const out: Array<{ caseId: string; code: string; requestId: string }> = [];
    for (const f of deps.forms.filter((x) => x.onIntake)) out.push(await sendForm(userKey, caseId, f.code));
    return out;
  }

  /** Zoho Sign webhook: match the case by whichever form's request id equals the event, flip status. */
  async function handleFormSigned(payload: unknown): Promise<
    { caseId: string; code: string; status: string } | null
  > {
    const evt = parseSignWebhook(payload);
    if (!evt?.requestId || !evt.status) return null;
    const requestId = evt.requestId; // narrowed to string

    const svc = deps.zoho.as(SERVICE_ACTOR);
    const cols = ["id", ...deps.forms.map((f) => f.requestIdField), ...deps.forms.map((f) => f.statusField)];
    const where = deps.forms.map((f) => `${f.requestIdField} = '${esc(requestId)}'`).join(" or ");
    const rows = await svc.coql<ZohoRecord>(`select ${cols.join(", ")} from ${CASES} where ${where}`);
    const row = rows[0];
    if (!row?.id) return null;

    const spec = deps.forms.find((f) => row[f.requestIdField] === requestId);
    if (!spec) return null;
    if (row[spec.statusField] === evt.status) return null; // duplicate webhook → no-op

    const upd: ZohoRecord = { id: row.id as string, [spec.statusField]: evt.status };
    if (evt.status === "Signed") {
      upd[spec.signedDateField] = spec.signedDateIsDate ? isoDate(now()) : isoDateTime(now());
    }
    await svc.updateRecords(CASES, [upd]);
    return { caseId: row.id as string, code: spec.code, status: evt.status };
  }

  return { sendForm, sendIntakeForms, handleFormSigned };
}

/** The standard Gator intake forms. Template/action ids come from env (one Zoho Sign template each). */
export function gatorIntakeForms(env: {
  ssa1696TemplateId: string; ssa1696ActionId: string;
  ssa827TemplateId: string; ssa827ActionId: string;
}): FormSpec[] {
  return [
    { code: "SSA-1696", label: "SSA-1696 (Appointment of Representative)", onIntake: true,
      templateId: env.ssa1696TemplateId, actionId: env.ssa1696ActionId,
      statusField: "SSA1696_Status", requestIdField: "SSA1696_Request_ID",
      sentDateField: "SSA1696_Sent_Date", signedDateField: "SSA1696_Signed_Date", linkField: "SSA1696_Link" },
    { code: "SSA-827", label: "SSA-827 (Authorization to Disclose Information)", onIntake: true,
      templateId: env.ssa827TemplateId, actionId: env.ssa827ActionId,
      statusField: "SSA827_Status", requestIdField: "SSA827_Request_ID",
      sentDateField: "SSA827_Sent_Date",
      // signed → Release_Signed_Date (a Date) so the existing release-expiry sweep computes +1yr.
      signedDateField: "Release_Signed_Date", signedDateIsDate: true, linkField: "SSA827_Link" },
  ];
}
