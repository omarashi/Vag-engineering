BEGIN;

DO $migration$
DECLARE
    channel RECORD;
    account_id TEXT;
BEGIN
    FOR channel IN
        SELECT * FROM (VALUES
            ('account-workshop-cash',     'C',  'مرحل كاش',         'cash'),
            ('account-visa-hadida',       'H',  'مرحل فيزا حديدة',  'visa'),
            ('account-visa-turky',        'T',  'مرحل فيزا تركي',    'visa'),
            ('account-card-terminal-m1', 'M1', 'مرحل ماكينة ١',    'cardTerminal'),
            ('account-card-terminal-m2', 'M2', 'مرحل ماكينة ٢',    'cardTerminal'),
            ('account-vodafone-cash',     'F',  'مرحل فودافون',     'vodafoneCash'),
            ('account-visa-youssef',      'Y',  'فيزا يوسف',        'visa'),
            ('account-visa-gamal',        'G',  'فيزا جمال',        'visa'),
            ('account-visa-ahmed-nagy',   'A',  'فيزا أحمد ناجي',   'visa')
        ) AS channels(id, code, name, kind)
    LOOP
        SELECT existing."id" INTO account_id
        FROM "MoneyAccount" AS existing
        WHERE existing."name" = channel.name
           OR (existing."code" = channel.code AND
               (existing."kind" = channel.kind OR (existing."kind" = 'bank' AND channel.kind = 'visa')))
           OR (existing."code" IS NULL AND channel.code = 'C' AND existing."kind" = 'cash'
               AND lower(existing."name") IN ('cash', 'workshop cash'))
        ORDER BY (existing."name" = channel.name) DESC,
                 (existing."code" = channel.code) DESC NULLS LAST,
                 existing."archived", existing."name", existing."id"
        LIMIT 1;

        -- Release a conflicting code while keeping the original account and its movements.
        UPDATE "MoneyAccount"
        SET "code" = NULL, "version" = "version" + 1
        WHERE "code" = channel.code AND "id" IS DISTINCT FROM account_id;

        IF account_id IS NULL THEN
            INSERT INTO "MoneyAccount" ("id", "name", "code", "kind")
            VALUES (channel.id, channel.name, channel.code, channel.kind);
        ELSE
            UPDATE "MoneyAccount"
            SET "name" = channel.name, "code" = channel.code, "kind" = channel.kind,
                "archived" = false, "version" = "version" + 1
            WHERE "id" = account_id;
        END IF;
    END LOOP;
END
$migration$;

COMMIT;
