/**
 * registry.ts — practice-area catalog.
 *
 * Drives nav, dashboard pipeline breakouts, and Engagement-Type filtering.
 * `engagementTypes` are the EXACT values used in Zoho's `Engagement_Type` field.
 * Add a new practice by appending an entry; do NOT hardcode practice strings
 * elsewhere in the app.
 */

export type PracticeSlug = "ssdi" | "fcra" | "fdcpa" | "tcpa" | "class-actions";

export interface Practice {
  slug: PracticeSlug;
  label: string;
  shortLabel: string;
  /** Exact `Engagement_Type` values in Zoho that belong to this practice. */
  engagementTypes: string[];
  /** True when the practice workspace is built and routable. */
  active: boolean;
  /** Tagline shown in the empty/coming-soon state. */
  tagline: string;
}

export const PRACTICES: Practice[] = [
  {
    slug: "ssdi",
    label: "SSDI",
    shortLabel: "SSDI",
    engagementTypes: ["SSDI"],
    active: true,
    tagline: "Disability benefits — appeals lifecycle from Initial through Appeals Council.",
  },
  {
    slug: "fcra",
    label: "FCRA",
    shortLabel: "FCRA",
    engagementTypes: ["FCRA Investigation", "FCRA Case"],
    active: false,
    tagline: "Credit report errors — investigations and disputes.",
  },
  {
    slug: "fdcpa",
    label: "FDCPA",
    shortLabel: "FDCPA",
    engagementTypes: ["FDCPA"],
    active: false,
    tagline: "Debt collector harassment.",
  },
  {
    slug: "tcpa",
    label: "TCPA",
    shortLabel: "TCPA",
    engagementTypes: ["TCPA"],
    active: false,
    tagline: "Robocalls and unwanted texts.",
  },
  {
    slug: "class-actions",
    label: "Class Actions",
    shortLabel: "Class",
    engagementTypes: ["Class Actions", "Class Action"],
    active: false,
    tagline: "Multi-plaintiff consumer protection actions.",
  },
];

export const ALL_ENGAGEMENT_TYPES: string[] = PRACTICES.flatMap((p) => p.engagementTypes);

export function practiceForEngagementType(type: string | null | undefined): Practice | null {
  if (!type) return null;
  return PRACTICES.find((p) => p.engagementTypes.includes(type)) ?? null;
}
