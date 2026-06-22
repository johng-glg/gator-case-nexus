// @ts-nocheck
import { buildExhibitIndex, sectionForDocType } from "../exhibits";
let pass=0,fail=0; const ok=(l:string,c:boolean)=>{console.log(`${c?"✓":"✗"} ${l}`);c?pass++:fail++;};
ok("MER → section F", sectionForDocType("MER")==="F");
ok("appeal form → section B", sectionForDocType("appeal-form")==="B");
ok("function report → section E", sectionForDocType("function-report")==="E");
ok("NOA → section A", sectionForDocType("payment-NOA")==="A");
const idx = buildExhibitIndex([
  { id:"d1", title:"Dr A records", docType:"MER", date:"2025-03-01", provider:"Dr A" },
  { id:"d2", title:"Dr B records", docType:"MER", date:"2025-01-15", provider:"Dr B" },
  { id:"d3", title:"Function report", docType:"function-report", date:"2025-02-01" },
  { id:"d4", title:"HA-501", docType:"appeal-form" },
]);
ok("medical numbered within F by date asc", idx.find(e=>e.sourceId==="d2")?.number==="1F" && idx.find(e=>e.sourceId==="d1")?.number==="2F");
ok("function report in E", idx.find(e=>e.sourceId==="d3")?.number==="1E");
ok("appeal form in B", idx.find(e=>e.sourceId==="d4")?.number==="1B");
ok("ordered B then E then F", idx.map(e=>e.section).join("")==="BEFF");
console.log(`\n${pass} passed, ${fail} failed`); if(fail) process.exit(1);
