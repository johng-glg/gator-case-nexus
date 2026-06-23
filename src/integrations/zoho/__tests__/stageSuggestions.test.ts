// @ts-nocheck
import { getStageSuggestions, needsEvidenceGate, HEARING_STAGES } from "../stageSuggestions";
const ok = (l: string, c: boolean) => console.log(`${c ? "✓" : "✗"} ${l}`);

const nonClosed = [
  "Retained","Application filed","Initial decision denied","Initial decision approved",
  "Reconsideration filed","Recon decision denied","Recon decision approved",
  "ALJ hearing requested","Hearing scheduled","Hearing held",
  "ALJ decision denied","ALJ decision approved","Appeals Council requested",
  "AC decision denied","AC decision approved","Award / NOA received","Fee petition filed",
];
ok("every non-closed stage has ≥1 suggestion", nonClosed.every((s) => getStageSuggestions(s).length > 0));
ok("Closed has none", getStageSuggestions("Closed").length === 0);

ok("Initial-denied → Reconsideration filed", getStageSuggestions("Initial decision denied")[0].advanceTo === "Reconsideration filed");
ok("Recon-denied → ALJ hearing requested", getStageSuggestions("Recon decision denied")[0].advanceTo === "ALJ hearing requested");
ok("ALJ-denied → Appeals Council requested", getStageSuggestions("ALJ decision denied")[0].advanceTo === "Appeals Council requested");

ok("AC-denied warns federal court is separate engagement",
  /separate engagement/i.test(getStageSuggestions("AC decision denied")[0].label));

ok("hearing-stage set matches eight-rail expectation",
  HEARING_STAGES.join(",") === "ALJ hearing requested,Hearing scheduled,Hearing held");

ok("evidence gate trips with 0 records at every hearing stage",
  HEARING_STAGES.every((s) => needsEvidenceGate(s, 0) === true));
ok("evidence gate clears at every hearing stage with 1 received",
  HEARING_STAGES.every((s) => needsEvidenceGate(s, 1) === false));
ok("evidence gate does not trip pre-hearing", needsEvidenceGate("Reconsideration filed", 0) === false);
ok("evidence gate does not trip post-hearing", needsEvidenceGate("ALJ decision denied", 0) === false);
