// @ts-nocheck
import { screenLead, sgaExceeded, SGA_2026 } from "../leadScreening";
let pass=0,fail=0; const ok=(l:string,c:boolean)=>{console.log(`${c?"✓":"✗"} ${l}`);c?pass++:fail++;};

ok("sgaExceeded non-blind 2026", sgaExceeded(1700)===true && sgaExceeded(1500)===false);
ok("sgaExceeded blind 2026", sgaExceeded(2000, true)===false && sgaExceeded(3000, true)===true);

const today = new Date("2026-06-22");

// hard knockouts
const r1 = screenLead({ workingAboveSGA: true, receivingTreatment: true, meetsTwelveMonthDuration: true }, { today });
ok("above SGA → Decline", r1.tier==="Decline" && r1.knockouts.some(k=>k.code==="above_sga"));

const r2 = screenLead({ monthlyEarnings: 2500, receivingTreatment: true, meetsTwelveMonthDuration: true }, { today });
ok("earnings > SGA derives above_sga → Decline", r2.tier==="Decline");

const r3 = screenLead({ workingAboveSGA: false, receivingTreatment: true, meetsTwelveMonthDuration: false }, { today });
ok("duration <12mo → Decline", r3.tier==="Decline" && r3.knockouts.some(k=>k.code==="duration_under_12mo"));

// cautions, not decline
const r4 = screenLead({ workingAboveSGA: false, receivingTreatment: false, meetsTwelveMonthDuration: true, age: 60 }, { today });
ok("no_treatment caution, not decline", r4.tier!=="Decline" && r4.knockouts.some(k=>k.code==="no_treatment"));

const r5 = screenLead({ workingAboveSGA: false, receivingTreatment: true, meetsTwelveMonthDuration: true,
  claimType: "DIB", dateLastInsured: "2024-01-01" }, { today });
ok("expired DLI for DIB → caution", r5.knockouts.some(k=>k.code==="dli_expired"));

const r6 = screenLead({ workingAboveSGA: false, receivingTreatment: true, meetsTwelveMonthDuration: true,
  alreadyRepresented: true }, { today });
ok("already_represented caution", r6.knockouts.some(k=>k.code==="already_represented"));

// tiers / scoring
const strong = screenLead({ workingAboveSGA: false, receivingTreatment: true, meetsTwelveMonthDuration: true, age: 60 }, { today });
ok("age ≥55 pushes to Strong", strong.tier==="Strong" && strong.score>=70);

const marginal = screenLead({ workingAboveSGA: false, receivingTreatment: true, meetsTwelveMonthDuration: true, age: 35 }, { today });
ok("young viable lead is Marginal", marginal.tier==="Marginal" && marginal.score<70);

const dev = screenLead({ workingAboveSGA: false, receivingTreatment: true, meetsTwelveMonthDuration: true, age: 50, currentLevel: "ALJ denied" }, { today });
ok("age 50-54 + developed record boosts score", dev.score >= marginal.score + 25);

// missing critical → Needs review
const nr = screenLead({ receivingTreatment: true }, { today });
ok("missing critical → Needs review", nr.tier==="Needs review");

// urgent
const urg = screenLead({ workingAboveSGA: false, receivingTreatment: true, meetsTwelveMonthDuration: true,
  appealDeadlineDate: "2026-07-01" }, { today });
ok("appeal deadline within 21d → urgent", urg.urgent===true);

const notUrg = screenLead({ workingAboveSGA: false, receivingTreatment: true, meetsTwelveMonthDuration: true,
  appealDeadlineDate: "2026-12-01" }, { today });
ok("far deadline → not urgent", notUrg.urgent===false);

// score bounds
ok("score bounded 0-100", strong.score<=100 && marginal.score>=0 && r1.score===0);

console.log(`\n${pass} passed, ${fail} failed`); if(fail) process.exit(1);
