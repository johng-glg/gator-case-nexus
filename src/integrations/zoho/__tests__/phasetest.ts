// @ts-nocheck
import { phaseForStage, phaseIndex, PHASES } from "../lifecycle";
const ok=(l:string,c:boolean)=>console.log(`${c?"✓":"✗"} ${l}`);
ok("7 phases", PHASES.length===7);
ok("Hearing prep -> alj", phaseForStage("Hearing prep")==="alj");
ok("Retained -> intake", phaseForStage("Retained")==="intake");
ok("Award/NOA -> award", phaseForStage("Award / NOA received")==="award");
ok("phaseIndex monotonic", phaseIndex("Retained")===0 && phaseIndex("Closed")===6);
