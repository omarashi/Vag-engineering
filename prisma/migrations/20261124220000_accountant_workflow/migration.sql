ALTER TABLE "MoneyAccount" ADD COLUMN "code" TEXT;
CREATE UNIQUE INDEX "MoneyAccount_code_key" ON "MoneyAccount"("code");
CREATE INDEX "CashMovement_at_idx" ON "CashMovement"("at");

INSERT INTO "MoneyAccount" ("id", "name", "code", "kind")
VALUES ('account-card-terminal-m1', 'M1', 'M1', 'cardTerminal'),
       ('account-card-terminal-m2', 'M2', 'M2', 'cardTerminal')
ON CONFLICT DO NOTHING;

ALTER TABLE "EmployeeAbsence" ADD COLUMN "halfDay" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "PayrollExcess" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "absenceId" TEXT,
    "paymentId" TEXT,
    "remaining" BIGINT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PayrollExcess_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PayrollExcess_paymentId_key" ON "PayrollExcess"("paymentId");
CREATE INDEX "PayrollExcess_documentId_idx" ON "PayrollExcess"("documentId");
CREATE INDEX "PayrollExcess_absenceId_idx" ON "PayrollExcess"("absenceId");
ALTER TABLE "PayrollExcess" ADD CONSTRAINT "PayrollExcess_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollExcess" ADD CONSTRAINT "PayrollExcess_absenceId_fkey" FOREIGN KEY ("absenceId") REFERENCES "EmployeeAbsence"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollExcess" ADD CONSTRAINT "PayrollExcess_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
