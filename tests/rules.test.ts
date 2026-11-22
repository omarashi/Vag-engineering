import assert from "node:assert/strict";
import { test } from "node:test";
import { amountDue,cents,date,extended,today,units } from "../lib/rules";
import { can } from "../lib/permissions";
import { signature } from "../lib/storage";

test("EGP parsing and half-up line rounding use minor units",()=>{
  assert.equal(cents("١٢٣٫٤٥"),12345n);
  assert.equal(extended(units("0.005"),100n),1n);
  assert.equal(extended(units("2.375"),1999n),4748n);
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
test("attachment magic bytes distinguish supported files",()=>{
  assert.equal(signature(Buffer.from("%PDF-1.4")),"application/pdf");
  assert.equal(signature(Buffer.from("<script>")) ,null);
});

