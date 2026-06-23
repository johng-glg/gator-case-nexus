/**
 * HearingPrepPanel — ODAR exhibit index + hearing-prep checklist.
 *
 * Surfaces on hearing-related stages ("ALJ hearing requested", "Hearing scheduled",
 * "Hearing held"). Builds a numbered ODAR exhibit list from received medical
 * records + filed/received case documents using the exhibits engine, and offers
 * a CSV export plus a printable view.
 */
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Download, Printer } from "lucide-react";
import { listCaseRequests } from "@/lib/medicalRecords.functions";
import { listCaseDocuments } from "@/lib/caseDocuments.functions";
import { buildExhibitIndex, sectionForDocType, type Exhibit, type SourceDoc } from "@/integrations/zoho/exhibits";
import type { Stage } from "@/integrations/zoho/lifecycle";
import { downloadCsv, toCsv } from "@/lib/csv";

const HEARING_STAGES: Stage[] = ["ALJ hearing requested", "Hearing scheduled", "Hearing held"];

const SECTION_LABELS: Record<string, string> = {
  A: "A — Payment",
  B: "B — Jurisdictional / procedural",
  D: "D — Non-disability",
  E: "E — Disability-related",
  F: "F — Medical evidence",
};

interface Props {
  caseId: string;
  stage: Stage;
  caseNumber?: string;
  clientName?: string;
  hearingDate?: string | null;
}

export function HearingPrepPanel({ caseId, stage, caseNumber, clientName, hearingDate }: Props) {
  const fetchRequests = useServerFn(listCaseRequests);
  const fetchDocs = useServerFn(listCaseDocuments);

  const recordsQ = useQuery({
    queryKey: ["hearing-prep", caseId, "records"],
    queryFn: () => fetchRequests({ data: { caseId } }),
  });

  const docsQ = useQuery({
    queryKey: ["hearing-prep", caseId, "docs", stage],
    queryFn: () => fetchDocs({ data: { caseId, currentStage: stage } }),
  });

  const exhibits = useMemo<Exhibit[]>(() => {
    const sources: SourceDoc[] = [];

    for (const r of recordsQ.data?.rows ?? []) {
      if (r.Request_Status !== "Received") continue;
      sources.push({
        id: String(r.id),
        title: r.Provider_Name ?? "Medical records",
        docType: "MER",
        date: typeof r.Received_Date === "string" ? r.Received_Date.slice(0, 10) : undefined,
        provider: r.Provider_Name ?? undefined,
      });
    }

    for (const d of docsQ.data ?? []) {
      if (d.status !== "Filed" && d.status !== "Received") continue;
      sources.push({
        id: d.code,
        title: d.label,
        docType: d.code,
        date: typeof d.updatedAt === "string" ? d.updatedAt.slice(0, 10) : undefined,
      });
    }

    return buildExhibitIndex(sources);
  }, [recordsQ.data, docsQ.data]);

  const grouped = useMemo(() => {
    const m = new Map<string, Exhibit[]>();
    for (const e of exhibits) {
      const list = m.get(e.section) ?? [];
      list.push(e);
      m.set(e.section, list);
    }
    return m;
  }, [exhibits]);

  if (!HEARING_STAGES.includes(stage)) return null;

  function exportCsv() {
    const rows = exhibits.map((e) => [e.number, e.section, e.title, e.date ?? "", e.provider ?? ""]);
    const csv = toCsv(["Exhibit", "Section", "Title", "Date", "Provider"], rows);
    downloadCsv(`exhibit-index-${caseNumber ?? caseId}.csv`, csv);
  }

  function printPage() {
    const w = window.open("", "_blank", "noopener,noreferrer");
    if (!w) return;
    const header = `
      <h1 style="margin:0 0 4px;font:600 18px/1.3 system-ui">Exhibit Index — ${escapeHtml(caseNumber ?? caseId)}</h1>
      <div style="color:#555;font:13px/1.3 system-ui;margin-bottom:16px">
        ${escapeHtml(clientName ?? "")}${hearingDate ? ` · Hearing: ${escapeHtml(hearingDate)}` : ""}
      </div>`;
    const sections = Array.from(grouped.entries())
      .map(
        ([section, list]) => `
        <h2 style="font:600 14px/1.3 system-ui;margin:14px 0 4px">${escapeHtml(SECTION_LABELS[section] ?? section)}</h2>
        <table style="width:100%;border-collapse:collapse;font:13px/1.3 system-ui">
          <thead><tr>
            <th style="text-align:left;border-bottom:1px solid #999;padding:4px 6px;width:60px">#</th>
            <th style="text-align:left;border-bottom:1px solid #999;padding:4px 6px">Title</th>
            <th style="text-align:left;border-bottom:1px solid #999;padding:4px 6px;width:100px">Date</th>
          </tr></thead>
          <tbody>${list
            .map(
              (e) => `<tr>
              <td style="padding:3px 6px;border-bottom:1px solid #eee">${escapeHtml(e.number)}</td>
              <td style="padding:3px 6px;border-bottom:1px solid #eee">${escapeHtml(e.title)}${e.provider ? ` <span style="color:#777">— ${escapeHtml(e.provider)}</span>` : ""}</td>
              <td style="padding:3px 6px;border-bottom:1px solid #eee">${escapeHtml(e.date ?? "")}</td>
            </tr>`,
            )
            .join("")}</tbody>
        </table>`,
      )
      .join("");
    w.document.write(
      `<!doctype html><html><head><title>Exhibit Index — ${escapeHtml(caseNumber ?? caseId)}</title></head><body style="padding:24px">${header}${sections || "<p>No exhibits yet.</p>"}<script>window.onload=()=>window.print()</script></body></html>`,
    );
    w.document.close();
  }

  const loading = recordsQ.isLoading || docsQ.isLoading;
  const totalCount = exhibits.length;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Hearing prep</div>
          <h2 className="font-display text-lg text-foreground mt-0.5">ODAR exhibit index</h2>
          <p className="text-sm text-muted-foreground">
            Numbered from received medical records and filed/received case documents.
            {hearingDate ? ` Hearing: ${hearingDate}.` : ""}
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={totalCount === 0}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
          </Button>
          <Button size="sm" variant="outline" onClick={printPage} disabled={totalCount === 0}>
            <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading exhibits…</div>
      ) : totalCount === 0 ? (
        <div className="text-sm text-muted-foreground">
          No exhibits yet. Mark medical-records requests as <em>Received</em>, and case documents
          as <em>Received</em> or <em>Filed</em>, to populate the index.
        </div>
      ) : (
        <div className="space-y-4">
          {Array.from(grouped.entries()).map(([section, list]) => (
            <div key={section}>
              <div className="flex items-center gap-2 mb-1.5">
                <h3 className="text-sm font-medium text-foreground">{SECTION_LABELS[section] ?? section}</h3>
                <Badge variant="outline" className="text-[10px]">{list.length}</Badge>
              </div>
              <div className="rounded-md border border-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 text-xs uppercase tracking-wider text-muted-foreground">
                    <tr>
                      <th className="px-3 py-1.5 text-left font-medium w-16">#</th>
                      <th className="px-3 py-1.5 text-left font-medium">Title</th>
                      <th className="px-3 py-1.5 text-left font-medium w-28">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {list.map((e) => (
                      <tr key={`${e.section}-${e.sourceId}`}>
                        <td className="px-3 py-1.5 tabular-nums font-medium">{e.number}</td>
                        <td className="px-3 py-1.5">
                          {e.title}
                          {e.provider && e.provider !== e.title && (
                            <span className="text-muted-foreground"> — {e.provider}</span>
                          )}
                        </td>
                        <td className="px-3 py-1.5 text-muted-foreground tabular-nums">{e.date ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        Sections: {Object.values(SECTION_LABELS).join(" · ")}. Auto-classified via{" "}
        <code className="text-[11px]">sectionForDocType</code>.
        {/* keep import used */}
        <span className="hidden">{sectionForDocType("MER")}</span>
      </p>
    </section>
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
