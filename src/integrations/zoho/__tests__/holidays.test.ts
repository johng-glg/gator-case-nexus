// @ts-nocheck
import { isFederalHoliday, isFederalNonWorkDay, asUTCDate, computeAppealDeadline } from "../deadlines";
let pass = 0, fail = 0;
const ok = (l: string, c: boolean) => { console.log(`${c ? "✓" : "✗"} ${l}`); c ? pass++ : fail++; };
const H = (s: string) => isFederalHoliday(asUTCDate(s));

// Parity with the OLD hardcoded 2026 set
const set2026 = ["2026-01-01","2026-01-19","2026-02-16","2026-05-25","2026-06-19","2026-07-03","2026-09-07","2026-10-12","2026-11-11","2026-11-26","2026-12-25"];
ok("2026 holidays all recognized", set2026.every(H));
ok("2026 July 4 (Sat) observed Fri Jul 3, not Jul 4", H("2026-07-03") && !H("2026-07-04"));

// Parity with OLD 2027 set (incl. Dec 31 boundary, Juneteenth/July4/Christmas shifts)
const set2027 = ["2027-01-01","2027-01-18","2027-02-15","2027-05-31","2027-06-18","2027-07-05","2027-09-06","2027-10-11","2027-11-11","2027-11-25","2027-12-24","2027-12-31"];
ok("2027 holidays all recognized", set2027.every(H));
ok("2027 Dec 31 is a holiday (NY 2028 falls Sat)", H("2027-12-31"));

// Future years the old code could NOT handle
ok("2028 MLK = 3rd Mon Jan (Jan 17)", H("2028-01-17"));
ok("2028 Juneteenth Jun 19 (Mon) observed on the day", H("2028-06-19"));
ok("2030 Christmas Dec 25 (Wed)", H("2030-12-25"));
ok("2031 July 4 (Fri) observed on the day", H("2031-07-04"));
ok("non-holiday weekday is not flagged", !H("2028-03-10"));

// rollForward still works through a computed holiday
// Notice 2028-04-24 → +5 = 04-29 → +60 = 06-28 (Wed) ... just assert it returns a working day
const d = computeAppealDeadline("2028-04-24");
ok("2028 deadline lands on a working day", !isFederalNonWorkDay(d));

console.log(`\n${pass} passed, ${fail} failed`); if (fail) process.exit(1);
