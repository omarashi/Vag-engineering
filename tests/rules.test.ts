import assert from "node:assert/strict";
import { test } from "node:test";
import { amountDue,cents,date,extended,today,unitAmount,units } from "../lib/rules";
import { can } from "../lib/permissions";
import { signature } from "../lib/storage";
import { currentWeekEnding, defaultEmployeeStart, weekStarting } from "../lib/payroll-rules";

test("EGP parsing and half-up line rounding use minor units",()=>{
  assert.equal(cents("١٢٣٫٤٥"),12345n);
  assert.equal(extended(units("0.005"),100n),1n);
  assert.equal(extended(units("2.375"),1999n),4748n);
  assert.equal(extended(units("-1.5",true),1n),-2n);
  assert.equal(unitAmount(5n,units("2")),3n);
  assert.equal(unitAmount(5n,units("0.125")),40n);
  assert.equal(amountDue(1000000n,600000n,0n),400000n);
  assert.throws(()=>cents("1.005"));
});
test("Cairo dates preserve business dates and reject malformed values",()=>{
  for(const value of ["2026-01-17","2026-07-17"])assert.equal(today(date(value+"T00:00")),value);
  assert.throws(()=>date("2026-02-30"));
});
test("posting, administration and payroll permissions",()=>{
  assert.equal(can("technician","jobUpdate"),true);
  assert.equal(can("technician","payEntry"),false);
  assert.equal(can("accountant","payEntry"),true);
  assert.equal(can("owner","payEntry"),true);
  assert.equal(can("accountant","user"),false);
  assert.equal(can("owner","user"),true);
});
test("Weekly payroll closes on Saturday after six workdays",()=>{
  assert.equal(defaultEmployeeStart("2026-11-26"),"2026-11-30");
  assert.equal(defaultEmployeeStart("2026-12-01"),"2026-12-01");
  assert.equal(weekStarting("2026-12-05"),"2026-11-30");
  assert.equal(currentWeekEnding("2026-11-30"),"2026-12-05");
  assert.equal(currentWeekEnding("2026-12-04"),"2026-12-05");
  assert.equal(currentWeekEnding("2026-12-05"),"2026-12-05");
  assert.equal(currentWeekEnding("2026-12-06"),"2026-12-12");
});
test("attachment magic bytes distinguish supported files",()=>{
  assert.equal(signature(Buffer.from("%PDF-1.4")),"application/pdf");
  assert.equal(signature(Buffer.from("<script>")) ,null);
});

