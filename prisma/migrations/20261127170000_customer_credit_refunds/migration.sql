CREATE TABLE "RefundBatch" (
  "id" TEXT PRIMARY KEY,
  "partyId" TEXT NOT NULL REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "at" TIMESTAMP(3) NOT NULL,
  "actorId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "settlement" TEXT NOT NULL CHECK ("settlement" IN ('keep', 'apply', 'payout')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RefundBatch_partyId_at_idx" ON "RefundBatch"("partyId", "at");

ALTER TABLE "Document" ADD COLUMN "refundBatchId" TEXT REFERENCES "RefundBatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Document_refundBatchId_idx" ON "Document"("refundBatchId");
ALTER TABLE "Document" ADD CONSTRAINT "refund_batch_credit_note" CHECK ("refundBatchId" IS NULL OR ("kind" = 'credit' AND "sourceId" IS NOT NULL));

ALTER TABLE "Line" ADD COLUMN "returnDisposition" TEXT CHECK ("returnDisposition" IN ('none', 'restock', 'damaged', 'remove'));

CREATE TABLE "CustomerCreditUse" (
  "id" TEXT PRIMARY KEY,
  "creditId" TEXT REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "receiptId" TEXT REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "invoiceId" TEXT REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "payoutId" TEXT REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "amount" BIGINT NOT NULL CHECK ("amount" > 0),
  "at" TIMESTAMP(3) NOT NULL,
  "actorId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reversedAt" TIMESTAMP(3),
  "reversedBy" TEXT,
  "reverseReason" TEXT,
  CONSTRAINT "credit_use_source" CHECK (num_nonnulls("creditId", "receiptId") = 1),
  CONSTRAINT "credit_use_target" CHECK (num_nonnulls("invoiceId", "payoutId") = 1 AND ("payoutId" IS NULL OR "receiptId" IS NOT NULL)),
  CONSTRAINT "credit_use_reversal" CHECK (num_nonnulls("reversedAt", "reversedBy", "reverseReason") IN (0, 3))
);
CREATE UNIQUE INDEX "CustomerCreditUse_payoutId_key" ON "CustomerCreditUse"("payoutId");
CREATE INDEX "CustomerCreditUse_creditId_reversedAt_idx" ON "CustomerCreditUse"("creditId", "reversedAt");
CREATE INDEX "CustomerCreditUse_receiptId_reversedAt_idx" ON "CustomerCreditUse"("receiptId", "reversedAt");
CREATE INDEX "CustomerCreditUse_invoiceId_reversedAt_idx" ON "CustomerCreditUse"("invoiceId", "reversedAt");
