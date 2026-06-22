// @ts-nocheck
import { appealFormsForStage, mergeFieldsForForm, APPEAL_FORMS } from "../appealForms";
let pass=0,fail=0; const ok=(l:string,c:boolean)=>{console.log(`${c?"✓":"✗"} ${l}`);c?pass++:fail++;};
ok("initial denial → SSA-561 + SSA-3441", JSON.stringify(appealFormsForStage("Initial decision denied"))===JSON.stringify(["SSA-561","SSA-3441"]));
ok("recon denial → HA-501", JSON.stringify(appealFormsForStage("Recon decision denied"))===JSON.stringify(["HA-501"]));
ok("ALJ denial → HA-520", JSON.stringify(appealFormsForStage("ALJ decision denied"))===JSON.stringify(["HA-520"]));
ok("approval → no forms", appealFormsForStage("Initial decision approved").length===0);
ok("every form has an official url", Object.values(APPEAL_FORMS).every(f=>f.url.endsWith(".pdf")));
const mf = mergeFieldsForForm("SSA-561", { clientFullName:"Jane Doe", ssn:"111-22-3333", claimNumber:"C1", today:"2026-06-20", priorDecisionDate:"2026-06-01", extra:{ Reason_For_Appeal:"New evidence" } });
ok("SSA-561 merge includes claimant + claim + reason", mf.Claimant_Full_Name==="Jane Doe" && mf.SSA_Claim_Number==="C1" && mf.Reason_For_Appeal==="New evidence");
ok("merge drops fields the form doesn't want", !("ALJ_Decision_Date" in mf));
ok("merge drops empty values", !("Recon_Denial_Date" in mergeFieldsForForm("HA-501",{clientFullName:"X",today:"t"})) );
console.log(`\n${pass} passed, ${fail} failed`); if(fail) process.exit(1);
