#!/bin/sh
set -eu
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
keep="${BACKUP_KEEP:-4}"
backup_root="${BACKUP_ROOT:-/backups}"
attachment_root="${ATTACHMENT_ROOT:-/attachments}"
case "$keep" in ''|*[!0-9]*) echo "Invalid BACKUP_KEEP" >&2; exit 1;; esac
[ "$keep" -ge 1 ]
tmp="$backup_root/.pending-$stamp-$$"
final="$backup_root/$stamp"
failed() { echo "$(date -u +%FT%TZ) backup failed at $tmp" >&2; }
trap failed EXIT
mkdir "$tmp"
pg_dump --format=custom --no-owner --no-privileges --file="$tmp/database.dump"
# Files are immutable. New uploads after the database snapshot are harmless extra files.
tar -C "$attachment_root" -czf "$tmp/attachments.tar.gz" .
(
  cd "$tmp"
  sha256sum database.dump attachments.tar.gz > SHA256SUMS
)
mv "$tmp" "$final"
trap - EXIT
echo "$(date -u +%FT%TZ) backup complete $final"
find "$backup_root" -maxdepth 1 -mindepth 1 -type d -name '[0-9]*T[0-9]*Z' | sort -r | awk -v keep="$keep" 'NR>keep' |
while IFS= read -r old; do
  rm -f -- "$old/database.dump" "$old/attachments.tar.gz" "$old/SHA256SUMS"
  rmdir -- "$old"
done

