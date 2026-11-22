ALTER TABLE "Employee" ALTER COLUMN "paidDaysPerWeek" SET DEFAULT 6;

UPDATE "Employee"
SET "paidDaysPerWeek" = 6, "version" = "version" + 1
WHERE "paidDaysPerWeek" = 7 AND NOT "archived";
