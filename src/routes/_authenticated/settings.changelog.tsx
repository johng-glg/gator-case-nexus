import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { myRoles } from "@/lib/users.functions";
import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";

export const Route = createFileRoute("/_authenticated/settings/changelog")({
  component: ChangelogPage,
});

function formatMarkdown(entries: ChangelogEntry[]): string {
  const lines: string[] = ["# Change Log", ""];
  for (const e of entries) {
    lines.push(`## ${e.date} — ${e.title}`);
    if (e.summary) lines.push("", e.summary);
    if (e.changes?.length) {
      lines.push("");
      for (const c of e.changes) lines.push(`- ${c}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function ChangelogPage() {
  const fetchRoles = useServerFn(myRoles);
  const { data: roles = [] } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
  });
  const isAdmin = roles.includes("admin");
  const [copied, setCopied] = useState(false);

  const markdown = useMemo(() => formatMarkdown(CHANGELOG), []);

  if (!isAdmin) {
    return (
      <div className="text-sm text-muted-foreground">
        You need admin access to view the change log.
      </div>
    );
  }

  const copy = async () => {
    await navigator.clipboard.writeText(markdown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium">Change Log</h2>
          <p className="text-sm text-muted-foreground">
            History of updates made to this app. Copy as Markdown to share with Claude Cowork or your team.
          </p>
        </div>
        <Button onClick={copy} variant="outline" size="sm">
          {copied ? <Check className="h-4 w-4 mr-2" /> : <Copy className="h-4 w-4 mr-2" />}
          {copied ? "Copied" : "Copy as Markdown"}
        </Button>
      </div>

      <div className="space-y-6">
        {CHANGELOG.map((entry) => (
          <article
            key={`${entry.date}-${entry.title}`}
            className="border border-border rounded-lg p-4 bg-card"
          >
            <header className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
              <h3 className="font-medium">{entry.title}</h3>
              <time className="text-xs text-muted-foreground font-mono">{entry.date}</time>
            </header>
            {entry.summary && (
              <p className="text-sm text-muted-foreground mb-3">{entry.summary}</p>
            )}
            {entry.changes?.length ? (
              <ul className="list-disc pl-5 space-y-1 text-sm">
                {entry.changes.map((c, i) => (
                  <li key={i}>{c}</li>
                ))}
              </ul>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
