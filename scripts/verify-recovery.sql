SELECT 'stock', COUNT(*), SUM("onHand"), SUM(reserved) FROM "Part";
SELECT kind, COUNT(*), SUM(total) FROM "Document" GROUP BY kind ORDER BY kind;
SELECT 'allocations', COUNT(*), SUM(amount) FROM "Allocation" WHERE "releasedAt" IS NULL;
SELECT 'cash', COUNT(*), SUM(amount) FROM "CashMovement";
SELECT 'payroll', COUNT(*), SUM(amount) FROM "PayEntry";
SELECT 'audit', COUNT(*) FROM "Audit";
SELECT 'attachments', COUNT(*), SUM(size) FROM "Attachment";

