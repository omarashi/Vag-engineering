BEGIN;

ALTER TABLE "User" ADD COLUMN "username" TEXT;

CREATE TEMP TABLE username_backfill ON COMMIT DROP AS
SELECT "id", "createdAt",
       CASE
           WHEN btrim(candidate, '_.-') = '' THEN 'user'
           WHEN length(candidate) < 3 THEN rpad(candidate, 3, '_')
           ELSE candidate
       END AS base
FROM (
    SELECT "id", "createdAt",
           left(regexp_replace(lower(split_part("email", '@', 1) COLLATE "C"), '[^a-z0-9_.-]+', '_', 'g'), 30) AS candidate
    FROM "User"
) candidates;

-- Reserve every original base before assigning suffixes to accounts that share it.
WITH ranked AS (
    SELECT "id", base, row_number() OVER (PARTITION BY base ORDER BY "createdAt", "id") AS occurrence
    FROM username_backfill
)
UPDATE "User" AS existing
SET "username" = ranked.base
FROM ranked
WHERE existing."id" = ranked."id" AND ranked.occurrence = 1;

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

DO $migration$
DECLARE
    pending RECORD;
    seq INTEGER;
    suffix TEXT;
    candidate TEXT;
BEGIN
    FOR pending IN
        SELECT backfill."id", backfill.base
        FROM username_backfill AS backfill
        JOIN "User" AS existing ON existing."id" = backfill."id"
        WHERE existing."username" IS NULL
        ORDER BY backfill."createdAt", backfill."id"
    LOOP
        seq := 2;
        LOOP
            suffix := '-' || seq;
            candidate := left(pending.base, 30 - length(suffix)) || suffix;
            EXIT WHEN NOT EXISTS (SELECT 1 FROM "User" WHERE "username" = candidate);
            seq := seq + 1;
        END LOOP;
        UPDATE "User" SET "username" = candidate WHERE "id" = pending."id";
    END LOOP;
END
$migration$;

ALTER TABLE "User"
    ALTER COLUMN "username" SET NOT NULL,
    ADD CONSTRAINT "User_username_format" CHECK ("username" COLLATE "C" ~ '^[a-z0-9_.-]{3,30}$');

COMMIT;
