/**
 * formsService.ts — e-sign the SSA intake forms (SSA-1696, SSA-827, SSA-1693) for an SSDI case.
 *
 * Mirrors retainerService, generalized over a FormSpec[] so adding more forms later (SSA-561,
 * SSA-3441, HA-501…) is just config — no new code. The forms are signed by the client and live on
 * the SSDI_Case (claim-specific), unlike the retainer which lives on the Engagement.
 *
 *   - sendForm(userKey, caseId, code, opts?) — send one form for signature; stamp the case.
 *     SSA-827 requires `opts.attested = true` (POMS DI 11005.017 §C.6 → DI 11005.056D /
 *     DI 22501.007: CPAS-signed 827 needs an attestation step before SSA accepts it).
 *   - sendIntakeForms(userKey, caseId) — send every form flagged onIntake. Default config:
 *     SSA-1696 auto-sends; SSA-827 + SSA-1693 are manual-only.
 *   - handleFormSigned(payload) — Zoho Sign webhook: find the case by the matching per-form
 *     request id, flip <code>_Status, then (if configured) call `deps.archive` so the firm can
 *     retain the signed PDF + audit certificate for the required 3 years (SSA CPAS rule).
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
  code: string;                 // "SSA-1696" | "SSA-827" | "SSA-1693"
  label: string;
  templateId: string;
  actionId: string;
  onIntake?: boolean;           // auto-send when case opens
  /** SSA-827 (CPAS) needs an attestation step before submission; gate the Send. */
  requiresAttestation?: boolean;
  statusField: string;
  requestIdField: string;
  sentDateField: string;
  signedDateField: string;
  signedDateIsDate?: boolean;
  linkField?: string;
}

/** Archive hook — called on Signed so the firm can keep the audit trail for ≥ 3 years. */
export type FormArchive = (ctx: {
  caseId: string;
  code: string;
  requestId: string;
}) => Promise<void>;

export interface FormsServiceDeps {
  zoho: ZohoClient;
  sign: SignAdapter;
  forms: FormSpec[];
  now?: () => Date;
  archive?: FormArchive;
}

export function createFormsService(deps: FormsServiceDeps) {
  const now = () => (deps.now ? deps.now() : localToday());
  const byCode = (code: string): FormSpec => {
    const f = deps.forms.find((x) => x.code === code);
    if (!f) throw new Error(`Unknown SSA form "${code}".`);
    return f;
  };

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
  async function sendForm(
    userKey: string,
    caseId: string,
    code: string,
    opts: { attested?: boolean } = {},
  ) {
    const api = deps.zoho.as(userKey);
    const spec = byCode(code);
    if (spec.requiresAttestation && !opts.attested) {
      throw new Error(
        `${spec.label} requires attestation (POMS DI 11005.017 §C.6). Confirm the attestation procedure before sending.`,
      );
    }

    const c = await api.getRecord<ZohoRecord>(CASES, caseId, [spec.statusField]);
    if (!c) throw new Error(`SSDI case ${caseId} not found`);
    if (c[spec.statusField] === "Signed") throw new Error(`${spec.label} is already signed for ${caseId}.`);

    const signer = await resolveSigner(api, caseId);
    const t = now();
    const res = await deps.sign.sendTemplate({
      templateId: spec.templateId, actionId: spec.actionId,
      recipient: { name: signer.fullName, email: signer.email },
      // SSA templates are pre-printed PDFs — no merge tags to fill from our side.
      mergeData: {},
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

  /** Send every onIntake form. Default config: only SSA-1696. */
  async function sendIntakeForms(userKey: string, caseId: string) {
    const out: Array<{ caseId: string; code: string; requestId: string }> = [];
    for (const f of deps.forms.filter((x) => x.onIntake)) {
      // onIntake implies the form is allowed without attestation (1696). 827 must not be onIntake.
      out.push(await sendForm(userKey, caseId, f.code, { attested: true }));
    }
    return out;
  }

  /** Zoho Sign webhook: match the case by whichever form's request id equals the event, flip status. */
  async function handleFormSigned(payload: unknown): Promise<
    { caseId: string; code: string; status: string } | null
  > {
    const evt = parseSignWebhook(payload);
    if (!evt?.requestId || !evt.status) return null;
    const requestId = evt.requestId;

    const svc = deps.zoho.as(SERVICE_ACTOR);
    const cols = ["id", ...deps.forms.map((f) => f.requestIdField), ...deps.forms.map((f) => f.statusField)];
    const where = deps.forms.map((f) => `${f.requestIdField} = '${esc(requestId)}'`).join(" or ");
    const rows = await svc.coql<ZohoRecord>(`select ${cols.join(", ")} from ${CASES} where ${where}`);
    const row = rows[0];
    if (!row?.id) return null;

    const spec = deps.forms.find((f) => row[f.requestIdField] === requestId);
    if (!spec) return null;
    if (row[spec.statusField] === evt.status) return null;

    const upd: ZohoRecord = { id: row.id as string, [spec.statusField]: evt.status };
    if (evt.status === "Signed") {
      upd[spec.signedDateField] = spec.signedDateIsDate ? isoDate(now()) : isoDateTime(now());
    }
    await svc.updateRecords(CASES, [upd]);

    // Archive on Signed — best-effort; never block the webhook ack.
    if (evt.status === "Signed" && deps.archive) {
      try {
        await deps.archive({ caseId: row.id as string, code: spec.code, requestId });
      } catch (err) {
        console.error("[formsService] archive failed", { caseId: row.id, code: spec.code, err: String(err) });
      }
    }

    return { caseId: row.id as string, code: spec.code, status: evt.status };
  }

  return { sendForm, sendIntakeForms, handleFormSigned };
}

/** The standard Gator intake forms. Template/action ids come from env. SSA-1693 is optional. */
export function gatorIntakeForms(env: {
  ssa1696TemplateId: string; ssa1696ActionId: string;
  ssa827TemplateId: string; ssa827ActionId: string;
  ssa1693TemplateId?: string; ssa1693ActionId?: string;
}): FormSpec[] {
  const out: FormSpec[] = [
    // SSA-1696 — on SSA's commercial e-signature list; safe to auto-send.
    { code: "SSA-1696", label: "SSA-1696 (Appointment of Representative)", onIntake: true,
      templateId: env.ssa1696TemplateId, actionId: env.ssa1696ActionId,
      statusField: "SSA1696_Status", requestIdField: "SSA1696_Request_ID",
      sentDateField: "SSA1696_Sent_Date", signedDateField: "SSA1696_Signed_Date", linkField: "SSA1696_Link" },
    // SSA-827 — NOT on the commercial list; CPAS-signed 827 requires attestation before SSA accepts it.
    { code: "SSA-827", label: "SSA-827 (Authorization to Disclose Information)",
      onIntake: false, requiresAttestation: true,
      templateId: env.ssa827TemplateId, actionId: env.ssa827ActionId,
      statusField: "SSA827_Status", requestIdField: "SSA827_Request_ID",
      sentDateField: "SSA827_Sent_Date",
      signedDateField: "Release_Signed_Date", signedDateIsDate: true, linkField: "SSA827_Link" },
  ];
  if (env.ssa1693TemplateId && env.ssa1693ActionId) {
    // SSA-1693 — fee agreement (invokes 25%/$9,200 cap). On the commercial list, but wired manual-only
    // until attorney confirms which fee box is in use.
    out.push({
      code: "SSA-1693", label: "SSA-1693 (Fee Agreement)", onIntake: false,
      templateId: env.ssa1693TemplateId, actionId: env.ssa1693ActionId,
      statusField: "SSA1693_Status", requestIdField: "SSA1693_Request_ID",
      sentDateField: "SSA1693_Sent_Date", signedDateField: "SSA1693_Signed_Date", linkField: "SSA1693_Link",
    });
  }
  return out;
}
