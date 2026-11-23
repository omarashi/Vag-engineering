-- The earlier status migrations reopen jobs without changing their metadata.
UPDATE "Document"
SET "metadata" = "metadata" - 'finishedAt', "version" = "version" + 1
WHERE "kind" = 'job'
  AND "status" IN ('new', 'inProgress')
  AND jsonb_typeof("metadata") = 'object'
  AND "metadata" ? 'finishedAt';
