/**
 * csv.ts — tiny RFC-4180-ish CSV helpers used by trust-accounting exports.
 * Escapes fields that contain comma / quote / newline; quotes consistently.
 */

function esc(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = typeof v === "string" ? v : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: Array<Array<unknown>>): string {
  const head = headers.map(esc).join(",");
  const body = rows.map((r) => r.map(esc).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

/** Trigger a browser download of `content` as `filename`. No-op on SSR. */
export function downloadCsv(filename: string, content: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
