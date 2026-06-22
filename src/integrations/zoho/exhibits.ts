/**
 * exhibits.ts — ODAR hearing exhibit index builder (Gator SSDI).
 *
 * Turns tagged case documents into a numbered ODAR-style exhibit list (sections A/B/D/E/F, numbered
 * sequentially within each section: 1F, 2F, …, ordered by date). Depends on documents being tagged
 * with a type (the document-tagging gap is the prerequisite). Pure; the PDF index render lives in
 * the app.
 */

export type ExhibitSection = "A" | "B" | "D" | "E" | "F";

export interface SourceDoc {
  id: string;
  title: string;
  docType: string;      // e.g. "MER", "RFC", "treating-source", "function-report", "appeal-form", "payment"
  date?: string;        // YYYY-MM-DD, for ordering within a section
  provider?: string;
}

export interface Exhibit {
  number: string;       // ODAR style: "1F", "2F", ...
  section: ExhibitSection;
  title: string;
  date?: string;
  provider?: string;
  sourceId: string;
}

/** ODAR sections: A payment, B jurisdictional/procedural, D non-disability, E disability-related, F medical. */
export function sectionForDocType(docType: string): ExhibitSection {
  const t = docType.toLowerCase();
  if (/(payment|noa|award|benefit)/.test(t)) return "A";
  if (/(appeal-form|ssa-561|ha-501|ha-520|decision|procedural|jurisdic|1696|827|retainer)/.test(t)) return "B";
  if (/(non-disability|earnings|work-history|ssa-3369)/.test(t)) return "D";
  if (/(function-report|adl|disability-report|ssa-3441|questionnaire)/.test(t)) return "E";
  return "F"; // default: medical evidence of record (MER, RFC, treating-source, hospital, labs…)
}

const SECTION_ORDER: ExhibitSection[] = ["A", "B", "D", "E", "F"];

/** Build the numbered exhibit index: group by section, order by date asc (undated last), number per section. */
export function buildExhibitIndex(docs: SourceDoc[]): Exhibit[] {
  const out: Exhibit[] = [];
  for (const section of SECTION_ORDER) {
    const inSection = docs
      .filter((d) => sectionForDocType(d.docType) === section)
      .sort((a, b) => (a.date ?? "9999").localeCompare(b.date ?? "9999"));
    inSection.forEach((d, i) => {
      out.push({ number: `${i + 1}${section}`, section, title: d.title, date: d.date, provider: d.provider, sourceId: d.id });
    });
  }
  return out;
}
