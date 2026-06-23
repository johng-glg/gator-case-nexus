import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getContact, zohoQuery } from "@/lib/zoho.functions";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { InvitePortalButton } from "@/components/portal/InvitePortalButton";

export const Route = createFileRoute("/_authenticated/clients/$clientId")({
  head: () => ({ meta: [{ title: "Client — Gator" }] }),
  component: ClientDetail,
});

const ID_RE = /^[A-Za-z0-9_]+$/;

function ClientDetail() {
  const { clientId } = Route.useParams();
  const validId = ID_RE.test(clientId);

  const fetchContact = useServerFn(getContact);
  const runQuery = useServerFn(zohoQuery);

  const contactQ = useQuery({
    queryKey: ["contact", clientId],
    enabled: validId,
    queryFn: () => fetchContact({ data: { contactId: clientId } }),
  });

  const engagementsQ = useQuery({
    queryKey: ["engagementsByContact", clientId],
    enabled: validId,
    queryFn: () => runQuery({ data: { name: "engagementsByContact", params: { contactId: clientId } } }),
  });

  if (!validId) return <div className="p-8 text-sm text-destructive-foreground">Invalid client id.</div>;
  if (contactQ.isLoading) return <div className="p-8 text-sm text-muted-foreground">Loading client…</div>;
  if (contactQ.error) return <div className="p-8 text-sm text-destructive-foreground">{(contactQ.error as Error).message}</div>;

  const rec = contactQ.data?.record as Record<string, any> | null | undefined;
  if (!rec) return <div className="p-8 text-sm text-muted-foreground">Client not found.</div>;

  const name = [rec.First_Name, rec.Last_Name].filter(Boolean).join(" ") || "—";
  const loc = [rec.Mailing_City, rec.Mailing_State, rec.Mailing_Zip].filter(Boolean).join(", ");
  const street = rec.Mailing_Street ? `${rec.Mailing_Street}${loc ? ", " + loc : ""}` : loc;

  return (
    <div className="max-w-5xl mx-auto px-8 py-5 space-y-3">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="text-xs uppercase tracking-[0.18em] text-primary/80">Client</div>
          <h1 className="font-display text-2xl text-foreground mt-0.5">{name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            {rec.Contact_Type && <span>{String(rec.Contact_Type)}</span>}
            {rec.Lead_Source && <span>· Source: {String(rec.Lead_Source)}</span>}
            {rec.Owner?.name && <span>· Owner: {String(rec.Owner.name)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <InvitePortalButton
            contactId={clientId}
            knownEmail={typeof rec.Email === "string" ? rec.Email : undefined}
          />
          <Link
            to="/clients"
            className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" /> Back to clients
          </Link>
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-5 grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <Field label="Email" value={rec.Email} />
        <Field label="Phone" value={rec.Phone} />
        <Field label="Mobile" value={rec.Mobile} />
        <Field label="Home" value={rec.Home_Phone} />
        <Field label="DOB" value={rec.DOB} />
        <Field label="Address" value={street} />
      </section>

      <section>
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">Engagements</div>
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <Th>Name</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Retainer</Th>
                <Th>Opened</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {engagementsQ.isLoading && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {engagementsQ.data && engagementsQ.data.rows.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No engagements for this client.</td></tr>
              )}
              {engagementsQ.data?.rows.map((e) => {
                const eid = String((e as Record<string, unknown>).id ?? "");
                return (
                  <tr key={eid} className="hover:bg-accent/30">
                    <Td>
                      <Link
                        to="/engagements/$engagementId"
                        params={{ engagementId: eid }}
                        className="font-medium text-primary hover:underline"
                      >
                        {String(e.Name ?? eid)}
                      </Link>
                    </Td>
                    <Td className="text-muted-foreground">{String(e.Engagement_Type ?? "—")}</Td>
                    <Td className="text-muted-foreground">{String(e.Engagement_Status ?? "—")}</Td>
                    <Td className="text-muted-foreground">{String(e.Retainer_Status ?? "—")}</Td>
                    <Td className="text-muted-foreground">{String(e.Open_Date ?? "—")}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: unknown }) {
  const v = value === null || value === undefined || value === "" ? "—" : String(value);
  return (
    <div>
      <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-foreground/90">{v}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-2.5 text-left font-medium">{children}</th>;
}
function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return <td className={cn("px-4 py-3", className)}>{children}</td>;
}
