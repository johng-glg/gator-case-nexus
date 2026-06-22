import { useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, AlertTriangle, ShieldCheck, Info } from "lucide-react";
import {
  screenLead,
  type ClaimType,
  type LeadLevel,
  type LeadTier,
  type ScreenerInput,
} from "@/integrations/zoho/leadScreening";
import { saveLeadScreener, updateLeadStatus } from "@/lib/zoho.functions";
import { cn } from "@/lib/utils";

const TIER_STYLE: Record<LeadTier, string> = {
  Strong: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700",
  Marginal: "border-amber-500/40 bg-amber-500/10 text-amber-700",
  "Needs review": "border-sky-500/40 bg-sky-500/10 text-sky-700",
  Decline: "border-rose-500/40 bg-rose-500/10 text-rose-700",
};

const SMS_CONSENT_TEXT =
  "By providing my mobile number and checking this box, I agree to receive SMS messages from Gator Law about my potential case. Message frequency varies. Message and data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of representation.";

type FormState = {
  workingAboveSGA?: boolean;
  monthlyEarnings?: string;
  isBlind?: boolean;
  receivingTreatment?: boolean;
  meetsTwelveMonthDuration?: boolean;
  claimType?: ClaimType;
  dateLastInsured?: string;
  alreadyRepresented?: boolean;
  dateOfBirth?: string;
  currentLevel?: LeadLevel;
  appealDeadlineDate?: string;
  primaryImpairment?: string;
  smsConsent?: boolean;
};

function ageFromDob(dob?: string): number | undefined {
  if (!dob) return undefined;
  const d = new Date(dob + "T00:00:00Z");
  if (Number.isNaN(d.getTime())) return undefined;
  const now = new Date();
  let age = now.getUTCFullYear() - d.getUTCFullYear();
  const beforeBirthday = now < new Date(Date.UTC(now.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (beforeBirthday) age -= 1;
  return age;
}

function initialFromRecord(rec: Record<string, unknown> | null | undefined): FormState {
  if (!rec) return {};
  const v = <T,>(k: string): T | undefined => (rec[k] as T | undefined) ?? undefined;
  return {
    workingAboveSGA: v<boolean>("Working_Above_SGA"),
    monthlyEarnings: typeof rec.Monthly_Earnings === "number" ? String(rec.Monthly_Earnings) : "",
    isBlind: v<boolean>("Is_Blind"),
    receivingTreatment: v<boolean>("Receiving_Treatment"),
    meetsTwelveMonthDuration: v<boolean>("Meets_12mo_Duration"),
    claimType: v<ClaimType>("Claim_Type"),
    dateLastInsured: (rec.Date_Last_Insured as string) ?? "",
    alreadyRepresented: v<boolean>("Already_Represented"),
    dateOfBirth: (rec.Date_of_Birth as string) ?? "",
    currentLevel: v<LeadLevel>("Current_Level"),
    appealDeadlineDate: (rec.Appeal_Deadline_Date as string) ?? "",
    primaryImpairment: (rec.Primary_Impairment as string) ?? "",
    smsConsent: !!rec.SMS_Consent_At,
  };
}

export function ScreenerPanel({
  leadId,
  record,
  alreadyConverted,
}: {
  leadId: string;
  record: Record<string, unknown> | null | undefined;
  alreadyConverted: boolean;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveLeadScreener);
  const updateStatusFn = useServerFn(updateLeadStatus);
  const [form, setForm] = useState<FormState>(() => initialFromRecord(record));

  const screenerInput: ScreenerInput = useMemo(() => ({
    workingAboveSGA: form.workingAboveSGA,
    monthlyEarnings: form.monthlyEarnings ? Number(form.monthlyEarnings) : undefined,
    isBlind: form.isBlind,
    receivingTreatment: form.receivingTreatment,
    meetsTwelveMonthDuration: form.meetsTwelveMonthDuration,
    claimType: form.claimType,
    dateLastInsured: form.dateLastInsured || undefined,
    alreadyRepresented: form.alreadyRepresented,
    age: ageFromDob(form.dateOfBirth),
    currentLevel: form.currentLevel,
    appealDeadlineDate: form.appealDeadlineDate || undefined,
  }), [form]);

  const live = useMemo(() => screenLead(screenerInput), [screenerInput]);

  const save = useMutation({
    mutationFn: async () => {
      const res = await saveFn({
        data: {
          leadId,
          input: {
            workingAboveSGA: form.workingAboveSGA,
            monthlyEarnings: form.monthlyEarnings ? Number(form.monthlyEarnings) : undefined,
            isBlind: form.isBlind,
            receivingTreatment: form.receivingTreatment,
            meetsTwelveMonthDuration: form.meetsTwelveMonthDuration,
            claimType: form.claimType,
            dateLastInsured: form.dateLastInsured || undefined,
            alreadyRepresented: form.alreadyRepresented,
            dateOfBirth: form.dateOfBirth || undefined,
            currentLevel: form.currentLevel,
            appealDeadlineDate: form.appealDeadlineDate || undefined,
            primaryImpairment: form.primaryImpairment || undefined,
          },
          smsConsent: form.smsConsent
            ? { granted: true, text: SMS_CONSENT_TEXT, source: "app:screener" }
            : undefined,
        },
      });
      const tier = (res as { result: { tier: LeadTier } }).result.tier;
      // Mirror status to keep pipeline consistent
      if (tier !== "Decline" && tier !== "Needs review") {
        await updateStatusFn({ data: { leadId, status: "Qualified" } });
      } else if (tier === "Decline") {
        await updateStatusFn({ data: { leadId, status: "Disqualified" } });
      }
      return res;
    },
    onSuccess: (res) => {
      const r = (res as { result: { tier: LeadTier; score: number } }).result;
      toast.success(`Screener saved — ${r.tier} (${r.score})`);
      qc.invalidateQueries({ queryKey: ["lead", leadId] });
      qc.invalidateQueries({ queryKey: ["allLeads"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed to save screener"),
  });

  const disabled = alreadyConverted || save.isPending;

  return (
    <section className="rounded-lg border border-border bg-card p-5 space-y-4">
      <header className="flex items-baseline justify-between flex-wrap gap-2">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-primary/80">SSDI Screener</div>
          <h2 className="font-display text-lg text-foreground mt-0.5">Qualification</h2>
        </div>
        <TierBadge tier={live.tier} score={live.score} urgent={live.urgent} />
      </header>

      {alreadyConverted && (
        <div className="flex gap-2 items-start rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm text-emerald-700">
          <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0" />
          This lead has been converted — screener is read-only.
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 text-sm">
        <Tri label="Working above SGA?" value={form.workingAboveSGA}
          onChange={(v) => setForm({ ...form, workingAboveSGA: v })} disabled={disabled} />
        <Field label="Monthly earnings ($)">
          <input type="number" min={0} step={50} disabled={disabled}
            value={form.monthlyEarnings ?? ""}
            onChange={(e) => setForm({ ...form, monthlyEarnings: e.target.value })}
            className="input" />
        </Field>
        <Tri label="Statutorily blind?" value={form.isBlind}
          onChange={(v) => setForm({ ...form, isBlind: v })} disabled={disabled} />
        <Tri label="Currently receiving treatment?" value={form.receivingTreatment}
          onChange={(v) => setForm({ ...form, receivingTreatment: v })} disabled={disabled} />
        <Tri label="Expected to last ≥12 months?" value={form.meetsTwelveMonthDuration}
          onChange={(v) => setForm({ ...form, meetsTwelveMonthDuration: v })} disabled={disabled} />
        <Tri label="Already represented?" value={form.alreadyRepresented}
          onChange={(v) => setForm({ ...form, alreadyRepresented: v })} disabled={disabled} />

        <Field label="Claim type">
          <select disabled={disabled} value={form.claimType ?? ""}
            onChange={(e) => setForm({ ...form, claimType: (e.target.value || undefined) as ClaimType })}
            className="input">
            <option value="">—</option>
            {(["DIB", "SSI", "Concurrent", "Unknown"] as ClaimType[]).map((c) =>
              <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Date Last Insured (DIB)">
          <input type="date" disabled={disabled} value={form.dateLastInsured ?? ""}
            onChange={(e) => setForm({ ...form, dateLastInsured: e.target.value })} className="input" />
        </Field>

        <Field label="Date of birth">
          <input type="date" disabled={disabled} value={form.dateOfBirth ?? ""}
            onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })} className="input" />
          {form.dateOfBirth && (
            <div className="text-xs text-muted-foreground mt-1">Age {ageFromDob(form.dateOfBirth)}</div>
          )}
        </Field>
        <Field label="Current level">
          <select disabled={disabled} value={form.currentLevel ?? ""}
            onChange={(e) => setForm({ ...form, currentLevel: (e.target.value || undefined) as LeadLevel })}
            className="input">
            <option value="">—</option>
            {(["No application yet", "Initial pending", "Initial denied", "Recon denied", "ALJ denied", "Other"] as LeadLevel[])
              .map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Appeal deadline">
          <input type="date" disabled={disabled} value={form.appealDeadlineDate ?? ""}
            onChange={(e) => setForm({ ...form, appealDeadlineDate: e.target.value })} className="input" />
        </Field>
        <Field label="Primary impairment" className="sm:col-span-2">
          <input type="text" disabled={disabled} value={form.primaryImpairment ?? ""}
            onChange={(e) => setForm({ ...form, primaryImpairment: e.target.value })}
            placeholder="e.g. Degenerative disc disease, MDD" className="input" />
        </Field>
      </div>

      {/* Live results */}
      {live.knockouts.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {live.knockouts.map((k) => (
            <span key={k.code} className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
              k.severity === "decline"
                ? "border-rose-500/40 bg-rose-500/10 text-rose-700"
                : "border-amber-500/40 bg-amber-500/10 text-amber-700",
            )}>
              <AlertTriangle className="h-3 w-3" />
              {k.label}
            </span>
          ))}
        </div>
      )}
      {live.reasons.length > 0 && (
        <div className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{live.reasons.join(" · ")}</span>
        </div>
      )}

      {/* TCPA consent */}
      <div className="rounded-md border border-border bg-background/40 p-3">
        <label className="flex items-start gap-2 text-xs cursor-pointer">
          <input type="checkbox" disabled={disabled} className="mt-0.5"
            checked={!!form.smsConsent}
            onChange={(e) => setForm({ ...form, smsConsent: e.target.checked })} />
          <span className="text-muted-foreground leading-snug">
            <span className="font-medium text-foreground">SMS consent (TCPA):</span> {SMS_CONSENT_TEXT}
          </span>
        </label>
        {record?.SMS_Consent_At && (
          <div className="mt-1.5 text-[11px] text-emerald-700">
            Recorded: {String(record.SMS_Consent_At).slice(0, 16).replace("T", " ")} UTC
          </div>
        )}
      </div>

      <div className="border-t border-border pt-3 flex justify-end">
        <button type="button" onClick={() => save.mutate()} disabled={disabled}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40">
          {save.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          {save.isPending ? "Saving…" : "Save & screen"}
        </button>
      </div>

      <style>{`
        .input { width: 100%; border: 1px solid hsl(var(--border)); background: hsl(var(--background));
                 border-radius: 6px; padding: 6px 8px; font-size: 13px; color: hsl(var(--foreground)); }
        .input:disabled { opacity: 0.6; }
      `}</style>
    </section>
  );
}

function TierBadge({ tier, score, urgent }: { tier: LeadTier; score: number; urgent: boolean }) {
  return (
    <div className="flex items-center gap-2">
      {urgent && (
        <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/40 bg-rose-500/10 px-2 py-0.5 text-[11px] font-medium text-rose-700">
          <AlertTriangle className="h-3 w-3" /> Urgent
        </span>
      )}
      <span className={cn("inline-flex items-center gap-2 rounded-full border px-2.5 py-0.5 text-xs font-medium", TIER_STYLE[tier])}>
        {tier}{tier === "Strong" || tier === "Marginal" ? <span className="text-[10px] opacity-75">· {score}</span> : null}
      </span>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Tri({ label, value, onChange, disabled }: {
  label: string; value: boolean | undefined; onChange: (v: boolean | undefined) => void; disabled?: boolean;
}) {
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{label}</div>
      <div className="mt-1 inline-flex rounded-md border border-border overflow-hidden">
        {([
          ["Yes", true], ["No", false], ["—", undefined],
        ] as const).map(([lbl, v]) => (
          <button key={lbl} type="button" disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              "px-2.5 py-1 text-xs transition-colors disabled:opacity-50",
              value === v
                ? "bg-primary/15 text-primary"
                : "bg-background hover:bg-muted/40 text-muted-foreground",
              lbl !== "—" ? "border-r border-border" : null,
            )}>
            {lbl}
          </button>
        ))}
      </div>
    </div>
  );
}
