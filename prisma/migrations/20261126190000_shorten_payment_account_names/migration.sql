UPDATE "MoneyAccount"
SET "name" = substring("name" FROM char_length('مرحل ') + 1),
    "version" = "version" + 1
WHERE "code" IN ('C', 'H', 'T', 'M1', 'M2', 'F')
  AND starts_with("name", 'مرحل ');
