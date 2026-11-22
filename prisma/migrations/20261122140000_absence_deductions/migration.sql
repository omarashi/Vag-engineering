ALTER TABLE "Employee" ADD COLUMN "paidDaysPerWeek" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "EmployeeAbsence"
  ADD COLUMN "deductSalary" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "deductionEntryId" TEXT;
CREATE UNIQUE INDEX "EmployeeAbsence_deductionEntryId_key" ON "EmployeeAbsence"("deductionEntryId");
ALTER TABLE "EmployeeAbsence" ADD CONSTRAINT "EmployeeAbsence_deductionEntryId_fkey"
  FOREIGN KEY ("deductionEntryId") REFERENCES "PayEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
