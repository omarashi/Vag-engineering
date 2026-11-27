CREATE TYPE "LinePurpose" AS ENUM ('generalLabor', 'electricalWork', 'electricalLabor', 'importedItem');

ALTER TABLE "Line"
  ADD COLUMN "purpose" "LinePurpose",
  ADD COLUMN "supplierId" TEXT,
  ADD COLUMN "supplierName" TEXT NOT NULL DEFAULT '',
  ADD COLUMN "buyingPrice" BIGINT;

ALTER TABLE "Line" ADD CONSTRAINT "Line_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Line" ADD CONSTRAINT "workshop_line_purpose" CHECK (
  ("purpose" IS NULL AND "supplierId" IS NULL AND "supplierName" = '' AND "buyingPrice" IS NULL) OR
  ("purpose" IS NOT NULL AND "partId" IS NULL AND "stockQty" = 0 AND (
    ("purpose" = 'importedItem' AND "kind" = 'supplied' AND "supplierId" IS NOT NULL AND "supplierName" <> '' AND "buyingPrice" IS NOT NULL AND "buyingPrice" >= 0) OR
    ("purpose" IN ('generalLabor', 'electricalLabor') AND "kind" = 'labor' AND "supplierId" IS NULL AND "supplierName" = '' AND "buyingPrice" IS NULL) OR
    ("purpose" = 'electricalWork' AND "kind" = 'service' AND "supplierId" IS NULL AND "supplierName" = '' AND "buyingPrice" IS NULL)
  ))
);

CREATE INDEX "Line_purpose_documentId_idx" ON "Line"("purpose", "documentId");
CREATE INDEX "Line_supplierId_idx" ON "Line"("supplierId");
