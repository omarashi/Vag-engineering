ALTER TABLE "Employee"
  ADD COLUMN "weeklySalary" BIGINT,
  ADD COLUMN "dismissalReason" TEXT NOT NULL DEFAULT '';

CREATE TABLE "EmployeeAbsence" (
  "id" TEXT NOT NULL,
  "employeeId" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "actorId" TEXT NOT NULL,
  "voidedAt" TIMESTAMP(3),
  CONSTRAINT "EmployeeAbsence_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "EmployeeAbsence_employeeId_fkey" FOREIGN KEY ("employeeId")
    REFERENCES "Employee"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "EmployeeAbsence_employeeId_day_key" ON "EmployeeAbsence"("employeeId", "day");
