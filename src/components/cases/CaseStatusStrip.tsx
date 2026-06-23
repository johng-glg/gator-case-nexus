/**
 * CaseStatusStrip — thin "orient" row directly under the page header.
 * Shows current stage, deadline countdown (color-coded), and risk flag chips.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, Clock, FileSignature, Mail, ShieldAlert } from "lucide-react";
import type { Stage } from "@/integrations/zoho/lifecycle";

interface FlagChip {
  label: string;
  tone: "ok" | "warn" | "danger" | "muted";
  icon?: React.ReactNode;
}

interface Props {
  stage: Stage;
  deadlineISO: string | null;
  daysToDeadline: number | null;
  activeDeadlineType?: string;
  flags: {
    retainerSigned: boolean;
    ssa1696Status: string;
    ssa827Status: string;
    releaseExpiringSoon: boolean;
    openTaskCount: number;
    welcomeEmailSent: boolean;
  };
  tasksAnchor?: string;
}

const toneClass: Record<FlagChip["tone"], string> = {
  ok: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  warn: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300",
  danger: "border-destructive/40 bg-destructive/10 text-destructive",
  muted: "border-border bg-muted/40 text-muted-foreground",
};

export function CaseStatusStrip(props: Props) {
  const { stage, deadlineISO, daysToDeadline, activeDeadlineType, flags } = props;
  const chips: FlagChip[] = [];

  chips.push({
    label: flags.retainerSigned ? "Retainer ✓" : "Retainer pending",
    tone: flags.retainerSigned ? "ok" : "warn",
    icon: <FileSignature className="h-3 w-3" />,
  });

  if (flags.ssa1696Status === "Signed") {
    chips.push({ label: "SSA-1696 signed", tone: "ok", icon: <CheckCircle2 className="h-3 w-3" /> });
  } else if (flags.ssa1696Status === "Sent") {
    chips.push({ label: "SSA-1696 sent", tone: "muted", icon: <Mail className="h-3 w-3" /> });
  } else {
    chips.push({ label: "SSA-1696 pending", tone: "warn", icon: <Mail className="h-3 w-3" /> });
  }

  if (flags.ssa827Status === "Signed") {
    chips.push({
      label: flags.releaseExpiringSoon ? "827 release expiring" : "SSA-827 signed",
      tone: flags.releaseExpiringSoon ? "warn" : "ok",
      icon: flags.releaseExpiringSoon ? <AlertTriangle className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />,
    });
  } else {
    chips.push({
      label: "SSA-827 needs attestation",
      tone: "warn",
      icon: <ShieldAlert className="h-3 w-3" />,
    });
  }

  if (flags.openTaskCount > 0) {
    chips.push({
      label: `${flags.openTaskCount} open task${flags.openTaskCount === 1 ? "" : "s"}`,
      tone: "muted",
    });
  }

  // Deadline tone
  let deadlineLabel = "No appeal deadline active";
  let deadlineTone: FlagChip["tone"] = "muted";
  if (deadlineISO && typeof daysToDeadline === "number") {
    if (daysToDeadline < 0) {
      deadlineLabel = `${Math.abs(daysToDeadline)}d OVERDUE — ${activeDeadlineType ?? "appeal"} (was ${deadlineISO})`;
      deadlineTone = "danger";
    } else if (daysToDeadline <= 7) {
      deadlineLabel = `${daysToDeadline}d to ${activeDeadlineType ?? "deadline"} (${deadlineISO})`;
      deadlineTone = "danger";
    } else if (daysToDeadline <= 29) {
      deadlineLabel = `${daysToDeadline}d to ${activeDeadlineType ?? "deadline"} (${deadlineISO})`;
      deadlineTone = "warn";
    } else {
      deadlineLabel = `${daysToDeadline}d to ${activeDeadlineType ?? "deadline"} (${deadlineISO})`;
      deadlineTone = "ok";
    }
  }

  // Stage chip removed — stage is already shown in the Lifecycle bar below.
  void stage;
  return (
    <section className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-xs">
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium ${toneClass[deadlineTone]}`}>
        <Clock className="h-3 w-3" /> {deadlineLabel}
      </span>
      <span className="h-3 w-px bg-border mx-1" />
      {chips.map((c, i) => {
        const node = (
          <span
            key={i}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${toneClass[c.tone]}`}
          >
            {c.icon}
            {c.label}
          </span>
        );
        if (c.label.includes("open task") && props.tasksAnchor) {
          return (
            <a key={i} href={`#${props.tasksAnchor}`} className="no-underline">
              {node}
            </a>
          );
        }
        return node;
      })}
      {flags.welcomeEmailSent && (
        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 ${toneClass.ok}`}>
          <Mail className="h-3 w-3" /> Welcome sent
        </span>
      )}
    </section>
  );
}
