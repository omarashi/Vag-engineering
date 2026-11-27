#!/bin/sh
set -eu
umask 077
[ "$#" -eq 2 ] && [ "$1" = "RESTORE_TO_EMPTY_TARGET" ] || {
  echo 'Usage: restore RESTORE_TO_EMPTY_TARGET YYYYMMDDTHHMMSSZ' >&2
  exit 1
}
case "$2" in ????????T??????Z) ;; *) exit 1;; esac
case "$2" in *[!0-9TZ]*) exit 1;; esac
bundle="${BACKUP_ROOT:-/backups}/$2"
attachment_root="${ATTACHMENT_ROOT:-/attachments}"
photo_root="${PHOTO_ROOT:-}"
start=$(date +%s)
if [ -n "${PHOTO_STORAGE_VOLUME_ID:-}" ]; then
  sh "$(dirname "$0")/oracle-photos.sh" check-container "$photo_root" "${BACKUP_ROOT:-/backups}"
fi
(cd "$bundle" && sha256sum -c SHA256SUMS)
if [ -s "$bundle/photo-files.txt" ] && [ -z "$photo_root" ]; then
  echo 'This backup needs the separate workshop photo volume configuration.' >&2
  exit 1
fi
[ "$(psql -At -v ON_ERROR_STOP=1 -c "SELECT COUNT(*) FROM pg_tables WHERE schemaname='public'")" = 0 ] || {
  echo 'Restore target already has database tables.' >&2
  exit 1
}
[ -z "$(find "$attachment_root" -mindepth 1 -maxdepth 1 -print -quit)" ] || {
  echo 'Restore target already has attachments.' >&2
  exit 1
}
stage=$(mktemp -d "${TMPDIR:-/tmp}/vag-restore.XXXXXXXX")
case "$stage" in "${TMPDIR:-/tmp}"/vag-restore.*) trap 'rm -rf -- "$stage"' EXIT;; *) exit 1;; esac
tar -xzvf "$bundle/attachments.tar.gz" --no-same-owner --no-same-permissions -C "$stage" >/dev/null
pg_restore --exit-on-error --single-transaction --no-owner --no-privileges --dbname="$PGDATABASE" "$bundle/database.dump"
psql -At -v ON_ERROR_STOP=1 -c 'SELECT key, size FROM "Attachment" ORDER BY key' > "$stage/.expected"
while IFS="|" read -r key size; do
  size=$(printf "%s" "$size" | tr -d "\r")
  case "${key#photo-}" in ????????-????-????-????-????????????) ;; *) exit 1;; esac
  case "${key#photo-}" in *[!a-f0-9-]*) exit 1;; esac
  case "$key" in
    photo-*)
      [ -n "$photo_root" ] || { echo 'Missing workshop photo volume configuration.' >&2; exit 1; }
      source="$photo_root/$key"
      target="$source"
      ;;
    *) source="$stage/$key"; target="$attachment_root/$key" ;;
  esac
  if [ ! -f "$source" ] || [ -L "$source" ]; then echo "Missing attachment in backup: $key" >&2; exit 1; fi
  if [ "$(wc -c < "$source" | tr -d " ")" != "$size" ]; then echo "Attachment length mismatch: $key" >&2; exit 1; fi
  if [ "$source" != "$target" ]; then cp -- "$source" "$target"; fi
  if [ -n "${RESTORE_ATTACHMENT_OWNER:-}" ]; then chown "$RESTORE_ATTACHMENT_OWNER" "$target"; fi
done < "$stage/.expected"
psql -v ON_ERROR_STOP=1 <<'SQL'
SELECT kind, COUNT(*), SUM(total) FROM "Document" GROUP BY kind ORDER BY kind;
SELECT COUNT(*) AS parts, SUM("onHand") AS quantity, SUM(reserved) AS reserved FROM "Part";
SELECT COUNT(*) AS compensation_entries, SUM(amount) FROM "PayEntry";
SELECT COUNT(*) AS audit_entries FROM "Audit";
SQL
echo "$(date -u +%FT%TZ) restored $2 in $(($(date +%s)-start)) seconds"

