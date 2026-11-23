UPDATE "Document"
SET "status" = 'inProgress', "version" = "version" + 1
WHERE "kind" = 'job' AND "status" = 'waitingParts';
