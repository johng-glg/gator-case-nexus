import type { LeadTier, ScreenResult, ScreenerInput } from "./leadScreening";

const START = "----- SSDI SCREENER -----";
const END = "----- END SSDI SCREENER -----";
const DATA_PREFIX = "Data: ";

export type StoredLeadScreener = {
  savedAt: string;
  input: ScreenerInput & {
    dateOfBirth?: string;
    primaryImpairment?: string;
  };
  result: {
    tier: LeadTier;
    score: number;
    urgent: boolean;
    knockouts: string[];
  };
};

export function parseScreenerBlock(description: unknown): StoredLeadScreener | null {
  if (typeof description !== "string") return null;
  const start = description.indexOf(START);
  const end = description.indexOf(END, start + START.length);
  if (start === -1 || end === -1) return null;

  const block = description.slice(start + START.length, end);
  const dataLine = block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith(DATA_PREFIX));
  if (!dataLine) return null;

  try {
    const parsed = JSON.parse(dataLine.slice(DATA_PREFIX.length)) as StoredLeadScreener;
    if (!parsed || typeof parsed !== "object" || !parsed.result || !parsed.input) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function stripScreenerBlock(description: unknown): string {
  if (typeof description !== "string") return "";
  const start = description.indexOf(START);
  const end = description.indexOf(END, start + START.length);
  if (start === -1 || end === -1) return description.trim();
  return `${description.slice(0, start)}${description.slice(end + END.length)}`.trim();
}

export function buildStoredScreener(input: StoredLeadScreener["input"], result: ScreenResult): StoredLeadScreener {
  return {
    savedAt: new Date().toISOString(),
    input,
    result: {
      tier: result.tier,
      score: result.score,
      urgent: result.urgent,
      knockouts: result.knockouts.map((k) => `[${k.severity}] ${k.label}`),
    },
  };
}

export function upsertScreenerBlock(description: unknown, stored: StoredLeadScreener, maxLength = 30000): string {
  const base = stripScreenerBlock(description);
  const lines = [
    START,
    `Saved: ${stored.savedAt}`,
    `Result: ${stored.result.tier} (${stored.result.score})${stored.result.urgent ? " — urgent" : ""}`,
    stored.result.knockouts.length ? `Notes: ${stored.result.knockouts.join("; ")}` : "Notes: none",
    `${DATA_PREFIX}${JSON.stringify(stored)}`,
    END,
  ];
  const block = lines.join("\n");
  if (!base) return block.slice(0, maxLength);

  const separator = "\n\n";
  const roomForBase = maxLength - block.length - separator.length;
  const preservedBase = roomForBase > 0 ? base.slice(0, roomForBase).trim() : "";
  return preservedBase ? `${preservedBase}${separator}${block}` : block.slice(0, maxLength);
}