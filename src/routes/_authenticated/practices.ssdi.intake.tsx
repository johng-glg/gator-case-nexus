import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { intakeConflictCheck, intakeCreate, zohoQuery } from "@/lib/zoho.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/practices/ssdi/intake")({
  head: () => ({ meta: [{ title: "New SSDI client — Gator" }] }),
  component: IntakeWizard,
});

type Step = 1 | 2 | 3 | 4;

type ClientForm = {
  firstName: string; lastName: string; email: string; mobile: string; homePhone: string;
  dob: string; ssn: string; referralSourceId: string; leadSource: string;
  mailingStreet: string; mailingCity: string; mailingState: string; mailingZip: string;
};

type SsdiForm = {
  claimType: "" | "DIB (Title II)" | "SSI (Title XVI)" | "Concurrent";
  onset: string; lastWorked: string; dli: string;
  disabilityType: "" | "Physical" | "Mental" | "Both";
  primaryImpairment: string; secondaryImpairments: string; ssaClaimNumber: string;
};

type ConflictMatch = { id: string; First_Name?: string; Last_Name?: string; Email?: string };
type ConflictDecision = { status: "Cleared" | "Conflict found"; note?: string };

function IntakeWizard() {
  const navigate = useNavigate();
  const runConflict = useServerFn(intakeConflictCheck);
  const runCreate = useServerFn(intakeCreate);
  const runQ = useServerFn(zohoQuery);

  const [step, setStep] = useState<Step>(1);
  const [client, setClient] = useState<ClientForm>({
    firstName: "", lastName: "", email: "", mobile: "", homePhone: "",
    dob: "", ssn: "", referralSourceId: "", leadSource: "",
    mailingStreet: "", mailingCity: "", mailingState: "", mailingZip: "",
  });
  const [ssdi, setSsdi] = useState<SsdiForm>({
    claimType: "", onset: "", lastWorked: "", dli: "",
    disabilityType: "", primaryImpairment: "", secondaryImpairments: "", ssaClaimNumber: "",
  });
  const [decision, setDecision] = useState<ConflictDecision | null>(null);
  const [overrideNote, setOverrideNote] = useState("");

  const referrals = useQuery({
    queryKey: ["referrals-all"],
    queryFn: () => runQ({ data: { name: "allReferrals" } }),
    staleTime: 60_000,
  });

  const conflict = useMutation({
    mutationFn: () => runConflict({ data: { lastName: client.lastName, email: client.email || undefined } }),
    onSuccess: (res) => {
      if (res.status === "Cleared") setDecision({ status: "Cleared" });
      else setDecision(null);
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!decision) throw new Error("Conflict check is required.");
      return await runCreate({
        data: {
          client: {
            firstName: client.firstName.trim(),
            lastName: client.lastName.trim(),
            email: client.email.trim() || undefined,
            mobile: client.mobile.trim() || undefined,
            homePhone: client.homePhone.trim() || undefined,
            dob: client.dob || undefined,
            ssn: client.ssn.trim() || undefined,
            referralSourceId: client.referralSourceId || undefined,
            leadSource: client.leadSource.trim() || undefined,
            mailingStreet: client.mailingStreet.trim() || undefined,
            mailingCity: client.mailingCity.trim() || undefined,
            mailingState: client.mailingState.trim() || undefined,
            mailingZip: client.mailingZip.trim() || undefined,
          },
          conflict: decision,
          ssdi: {
            claimType: ssdi.claimType || undefined,
            onset: ssdi.onset || undefined,
            lastWorked: ssdi.lastWorked || undefined,
            dli: ssdi.dli || undefined,
            disabilityType: ssdi.disabilityType || undefined,
            primaryImpairment: ssdi.primaryImpairment.trim() || undefined,
            secondaryImpairments: ssdi.secondaryImpairments.trim() || undefined,
            ssaClaimNumber: ssdi.ssaClaimNumber.trim() || undefined,
          },
        },
      });
    },
    onSuccess: (res) => {
      navigate({ to: "/practices/ssdi/cases/$caseId", params: { caseId: res.caseId } });
    },
  });

  const canNext1 = client.firstName.trim() && client.lastName.trim();

  function gotoStep2() {
    setDecision(null);
    setOverrideNote("");
    setStep(2);
    conflict.mutate();
  }

  function acceptConflictOverride() {
    setDecision({ status: "Conflict found", note: overrideNote.trim() || undefined });
  }

  return (
    <div className="max-w-3xl mx-auto px-8 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-primary/80">SSDI intake</div>
      <h1 className="font-display text-3xl text-foreground mt-0.5">New SSDI client</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Creates the client contact, an SSDI engagement, and the first case — attributed to you.
      </p>

      <Stepper step={step} />

      {step === 1 && (
        <Section title="Client">
          <Grid>
            <Field label="First name *"><Input value={client.firstName} onChange={(v) => setClient({ ...client, firstName: v })} /></Field>
            <Field label="Last name *"><Input value={client.lastName} onChange={(v) => setClient({ ...client, lastName: v })} /></Field>
            <Field label="Email"><Input type="email" value={client.email} onChange={(v) => setClient({ ...client, email: v })} /></Field>
            <Field label="Mobile"><Input value={client.mobile} onChange={(v) => setClient({ ...client, mobile: v })} /></Field>
            <Field label="Home phone"><Input value={client.homePhone} onChange={(v) => setClient({ ...client, homePhone: v })} /></Field>
            <Field label="Date of birth"><Input type="date" value={client.dob} onChange={(v) => setClient({ ...client, dob: v })} /></Field>
            <Field label="SSN"><Input value={client.ssn} onChange={(v) => setClient({ ...client, ssn: v })} /></Field>
            <Field label="Referral source">
              <select
                className={selectCls}
                value={client.referralSourceId}
                onChange={(e) => setClient({ ...client, referralSourceId: e.target.value })}
              >
                <option value="">{referrals.isLoading ? "Loading…" : "— None —"}</option>
                {(referrals.data?.rows ?? []).map((r) => {
                  const id = String((r as Record<string, unknown>).id ?? "");
                  return <option key={id} value={id}>{String(r.Name ?? id)}</option>;
                })}
              </select>
            </Field>
            <Field label="Lead source"><Input value={client.leadSource} onChange={(v) => setClient({ ...client, leadSource: v })} /></Field>
          </Grid>
          <div className="mt-6">
            <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Mailing address</div>
            <Grid>
              <Field label="Street" wide><Input value={client.mailingStreet} onChange={(v) => setClient({ ...client, mailingStreet: v })} /></Field>
              <Field label="City"><Input value={client.mailingCity} onChange={(v) => setClient({ ...client, mailingCity: v })} /></Field>
              <Field label="State"><Input value={client.mailingState} onChange={(v) => setClient({ ...client, mailingState: v })} /></Field>
              <Field label="ZIP"><Input value={client.mailingZip} onChange={(v) => setClient({ ...client, mailingZip: v })} /></Field>
            </Grid>
          </div>
          <Nav>
            <Link to="/practices/ssdi/cases" className={btnGhost}>Cancel</Link>
            <button disabled={!canNext1} onClick={gotoStep2} className={btnPrimary}>Next: conflict check</button>
          </Nav>
        </Section>
      )}

      {step === 2 && (
        <Section title="Conflict check">
          {conflict.isPending && <p className="text-sm text-muted-foreground">Checking existing contacts…</p>}
          {conflict.error && <p className="text-sm text-destructive">{(conflict.error as Error).message}</p>}
          {conflict.data && conflict.data.status === "Cleared" && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
              ✓ Cleared — no prior contacts match.
            </div>
          )}
          {conflict.data && conflict.data.status === "Conflict found" && (
            <div className="space-y-4">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                Possible conflict — {conflict.data.matches.length} matching contact(s).
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr><th className="px-3 py-2 text-left">Name</th><th className="px-3 py-2 text-left">Email</th></tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(conflict.data.matches as unknown as ConflictMatch[]).map((m) => (
                      <tr key={m.id}>
                        <td className="px-3 py-2">{[m.First_Name, m.Last_Name].filter(Boolean).join(" ") || "—"}</td>
                        <td className="px-3 py-2 text-muted-foreground">{m.Email ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Field label="Override note (why it's safe to proceed)">
                <textarea
                  className={cn(selectCls, "min-h-[80px]")}
                  value={overrideNote}
                  onChange={(e) => setOverrideNote(e.target.value)}
                />
              </Field>
              <button onClick={acceptConflictOverride} className={btnGhost}>
                No conflict — proceed
              </button>
              {decision?.status === "Conflict found" && (
                <p className="text-xs text-emerald-300">Override recorded.</p>
              )}
            </div>
          )}
          <Nav>
            <button onClick={() => setStep(1)} className={btnGhost}>Back</button>
            <button disabled={!decision} onClick={() => setStep(3)} className={btnPrimary}>Next: case basics</button>
          </Nav>
        </Section>
      )}

      {step === 3 && (
        <Section title="SSDI case basics">
          <Grid>
            <Field label="Claim type">
              <select className={selectCls} value={ssdi.claimType} onChange={(e) => setSsdi({ ...ssdi, claimType: e.target.value as SsdiForm["claimType"] })}>
                <option value="">—</option>
                <option>DIB (Title II)</option>
                <option>SSI (Title XVI)</option>
                <option>Concurrent</option>
              </select>
            </Field>
            <Field label="Disability type">
              <select className={selectCls} value={ssdi.disabilityType} onChange={(e) => setSsdi({ ...ssdi, disabilityType: e.target.value as SsdiForm["disabilityType"] })}>
                <option value="">—</option>
                <option>Physical</option>
                <option>Mental</option>
                <option>Both</option>
              </select>
            </Field>
            <Field label="Alleged onset date"><Input type="date" value={ssdi.onset} onChange={(v) => setSsdi({ ...ssdi, onset: v })} /></Field>
            <Field label="Date last worked"><Input type="date" value={ssdi.lastWorked} onChange={(v) => setSsdi({ ...ssdi, lastWorked: v })} /></Field>
            <Field label="Date last insured"><Input type="date" value={ssdi.dli} onChange={(v) => setSsdi({ ...ssdi, dli: v })} /></Field>
            <Field label="SSA claim number"><Input value={ssdi.ssaClaimNumber} onChange={(v) => setSsdi({ ...ssdi, ssaClaimNumber: v })} /></Field>
            <Field label="Primary impairment" wide><Input value={ssdi.primaryImpairment} onChange={(v) => setSsdi({ ...ssdi, primaryImpairment: v })} /></Field>
            <Field label="Secondary impairments" wide>
              <textarea className={cn(selectCls, "min-h-[80px]")} value={ssdi.secondaryImpairments} onChange={(e) => setSsdi({ ...ssdi, secondaryImpairments: e.target.value })} />
            </Field>
          </Grid>
          <Nav>
            <button onClick={() => setStep(2)} className={btnGhost}>Back</button>
            <button onClick={() => setStep(4)} className={btnPrimary}>Next: review</button>
          </Nav>
        </Section>
      )}

      {step === 4 && (
        <Section title="Review & create">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <Row k="Client">{client.firstName} {client.lastName}</Row>
            <Row k="Email">{client.email || "—"}</Row>
            <Row k="Mobile">{client.mobile || "—"}</Row>
            <Row k="DOB">{client.dob || "—"}</Row>
            <Row k="Conflict check">
              {decision?.status === "Cleared" ? "✓ Cleared" : `⚠ Conflict found — override${decision?.note ? `: ${decision.note}` : ""}`}
            </Row>
            <Row k="Claim type">{ssdi.claimType || "—"}</Row>
            <Row k="Disability type">{ssdi.disabilityType || "—"}</Row>
            <Row k="Onset">{ssdi.onset || "—"}</Row>
            <Row k="DLI">{ssdi.dli || "—"}</Row>
            <Row k="Primary impairment">{ssdi.primaryImpairment || "—"}</Row>
          </dl>
          {create.error && <p className="mt-4 text-sm text-destructive">{(create.error as Error).message}</p>}
          <Nav>
            <button onClick={() => setStep(3)} className={btnGhost} disabled={create.isPending}>Back</button>
            <button onClick={() => create.mutate()} disabled={create.isPending} className={btnPrimary}>
              {create.isPending ? "Creating…" : "Create client, engagement & case"}
            </button>
          </Nav>
        </Section>
      )}
    </div>
  );
}

const selectCls = "w-full rounded-md border border-border bg-input px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40";
const btnPrimary = "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50";
const btnGhost = "rounded-md border border-border bg-background/40 px-4 py-2 text-sm hover:bg-accent/60 disabled:opacity-50";

function Stepper({ step }: { step: Step }) {
  const labels = ["Client", "Conflict", "Case", "Review"];
  return (
    <ol className="mt-6 mb-8 flex items-center gap-2 text-xs">
      {labels.map((l, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <li key={l} className="flex items-center gap-2">
            <span className={cn(
              "h-6 w-6 rounded-full flex items-center justify-center text-[11px] border",
              done ? "bg-primary/80 border-primary text-primary-foreground"
                   : active ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground",
            )}>{n}</span>
            <span className={cn(active ? "text-foreground" : "text-muted-foreground")}>{l}</span>
            {i < labels.length - 1 && <span className="mx-1 h-px w-6 bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-card p-6">
      <h2 className="font-display text-lg text-foreground mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <label className={cn("block text-sm", wide && "sm:col-span-2")}>
      <span className="block text-xs uppercase tracking-wider text-muted-foreground mb-1">{label}</span>
      {children}
    </label>
  );
}

function Input({ value, onChange, type = "text" }: { value: string; onChange: (v: string) => void; type?: string }) {
  return <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={selectCls} />;
}

function Nav({ children }: { children: React.ReactNode }) {
  return <div className="mt-6 flex items-center justify-between">{children}</div>;
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-foreground">{children}</dd>
    </>
  );
}
