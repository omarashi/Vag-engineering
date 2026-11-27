#!/bin/sh
set -eu
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
keep="${BACKUP_KEEP:-4}"
backup_root="${BACKUP_ROOT:-/backups}"
attachment_root="${ATTACHMENT_ROOT:-/attachments}"
photo_root="${PHOTO_ROOT:-}"
case "$keep" in ''|*[!0-9]*) echo "Invalid BACKUP_KEEP" >&2; exit 1;; esac
[ "$keep" -ge 1 ]
tmp="$backup_root/.pending-$stamp-$$"
final="$backup_root/$stamp"
failed() { echo "$(date -u +%FT%TZ) backup failed at $tmp" >&2; }
trap failed EXIT
if [ -n "${PHOTO_STORAGE_VOLUME_ID:-}" ]; then
  sh "$(dirname "$0")/oracle-photos.sh" check-container "$photo_root" "$backup_root"
fi
mkdir "$tmp"

if [ -n "$photo_root" ]; then
  (
    cd "$tmp"
    # The inventory and dump must see the same attachment records.
    psql -X -q -v ON_ERROR_STOP=1 <<'SQL'
BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT pg_export_snapshot() AS snapshot \gset
\setenv VAG_BACKUP_SNAPSHOT :snapshot
\! pg_dump --snapshot="$VAG_BACKUP_SNAPSHOT" --format=custom --no-owner --no-privileges --file=database.dump
\if :SHELL_ERROR
  \echo Database dump failed
\else
  \copy (SELECT key, size FROM "Attachment" ORDER BY key) TO 'attachment-inventory' WITH (FORMAT csv, DELIMITER '|')
\endif
COMMIT;
SQL
    test -s database.dump
    test -f attachment-inventory
    : > photo-files.txt
    : > general-files
    while IFS='|' read -r key size; do
      case "$key" in
        photo-*) source="$photo_root"; manifest=photo-files.txt ;;
        *) source="$attachment_root"; manifest=general-files ;;
      esac
      case "${key#photo-}" in ????????-????-????-????-????????????) ;; *) exit 1;; esac
      case "${key#photo-}" in *[!a-f0-9-]*) exit 1;; esac
      if [ ! -f "$source/$key" ] || [ -L "$source/$key" ] || [ "$(wc -c < "$source/$key" | tr -d ' ')" != "$size" ]; then
        echo "Missing or invalid backup file: $key" >&2
        exit 1
      fi
      printf '%s\n' "$key" >> "$manifest"
    done < attachment-inventory
    tar -czf attachments.tar.gz -C "$attachment_root" -T "$PWD/general-files"
    sha256sum database.dump attachments.tar.gz photo-files.txt > SHA256SUMS
    rm -f attachment-inventory general-files
  )
else
  pg_dump --format=custom --no-owner --no-privileges --file="$tmp/database.dump"
  if [ "$(psql -XAt -v ON_ERROR_STOP=1 -c "SELECT count(*) FROM \"Attachment\" WHERE key LIKE 'photo-%'")" != 0 ]; then
    echo 'This backup needs the separate workshop photo volume configuration.' >&2
    exit 1
  fi
  tar -C "$attachment_root" -czf "$tmp/attachments.tar.gz" .
  (cd "$tmp" && sha256sum database.dump attachments.tar.gz > SHA256SUMS)
fi
mv "$tmp" "$final"
trap - EXIT
echo "$(date -u +%FT%TZ) backup complete $final"
find "$backup_root" -maxdepth 1 -mindepth 1 -type d -name '[0-9]*T[0-9]*Z' | sort -r | awk -v keep="$keep" 'NR>keep' |
while IFS= read -r old; do
  rm -f -- "$old/database.dump" "$old/attachments.tar.gz" "$old/photo-files.txt" "$old/SHA256SUMS"
  rmdir -- "$old"
done

