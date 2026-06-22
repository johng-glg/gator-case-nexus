// @ts-nocheck
import { ssdiProjectedFee, ssdiUserFee, ssdiNetFee, reconcileSsdiFee } from "../fees";
let pass=0,fail=0; const ok=(l:string,c:boolean)=>{console.log(`${c?"✓":"✗"} ${l}`);c?pass++:fail++;};
ok("fee = 25% under cap", ssdiProjectedFee(20000)===5000);
ok("fee capped at 9200", ssdiProjectedFee(80000)===9200);
ok("user fee capped at 123", ssdiUserFee(9200)===123);
ok("net = fee - user fee", ssdiNetFee(20000)===5000-Math.min(123,0.063*5000));
const r = reconcileSsdiFee({ backPay: 20000, actualPaidToFirm: 5000-Math.min(123,0.063*5000) });
ok("reconcile matches when paid = net", r.matches===true && r.shortfall===0);
const r2 = reconcileSsdiFee({ backPay: 20000, actualPaidToFirm: 4000 });
ok("reconcile flags shortfall", r2.matches===false && r2.shortfall>0);
console.log(`\n${pass} passed, ${fail} failed`); if(fail) process.exit(1);
