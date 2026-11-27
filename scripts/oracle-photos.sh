#!/bin/sh
set -eu
umask 077

fail() { printf '%s\n' "$*" >&2; exit 1; }

if [ "${1:-}" = check-container ]; then
  photo_root="$2"
  backup_root="$3"
  [ -n "${PHOTO_STORAGE_VOLUME_ID:-}" ] &&
    [ -d "$photo_root" ] && [ ! -L "$photo_root" ] &&
    [ -f "$photo_root/.vag-photo-volume" ] && [ ! -L "$photo_root/.vag-photo-volume" ] &&
    [ "$(cat "$photo_root/.vag-photo-volume")" = "$PHOTO_STORAGE_VOLUME_ID" ] &&
    [ "$(stat -c %d "$photo_root")" != "$(stat -c %d /)" ] &&
    [ "$(stat -c %d "$photo_root")" != "$(stat -c %d "${ATTACHMENT_ROOT:-/attachments}")" ] &&
    [ "$(stat -c %d "$photo_root")" = "$(stat -c %d "$backup_root")" ] ||
    fail 'The Oracle photo volume or the backup staging mount is unavailable.'
  exit 0
fi

cd "$(dirname "$0")/.."
export VAG_DATA_MOUNT="${VAG_DATA_MOUNT:-/mnt/vag-data}"
photo_root="$VAG_DATA_MOUNT/vehicle-photos"
stage_root="$VAG_DATA_MOUNT/backup-staging"

compose() { docker compose -f compose.yaml -f compose.oracle.yaml "$@"; }

check_mount() {
  mountpoint -q "$VAG_DATA_MOUNT" || fail "Missing Oracle mount at $VAG_DATA_MOUNT."
  uuid=$(findmnt -n -o UUID --mountpoint "$VAG_DATA_MOUNT")
  [ -n "$uuid" ] && [ -d "$photo_root" ] && [ ! -L "$photo_root" ] &&
    [ -f "$photo_root/.vag-photo-volume" ] && [ ! -L "$photo_root/.vag-photo-volume" ] &&
    [ "$(cat "$photo_root/.vag-photo-volume")" = "$uuid" ] &&
    [ -d "$stage_root" ] && [ ! -L "$stage_root" ] &&
    [ "$(stat -c %d "$VAG_DATA_MOUNT")" != "$(stat -c %d /)" ] &&
    [ "$(stat -c %d "$photo_root")" = "$(stat -c %d "$VAG_DATA_MOUNT")" ] &&
    [ "$(stat -c %d "$stage_root")" = "$(stat -c %d "$VAG_DATA_MOUNT")" ] ||
    fail 'The expected Oracle photo filesystem or its directories are missing.'
}

report_disk() {
  stats=$(df -Pk "$1" | awk 'NR == 2 { print $2, $3, $4, $5 }')
  set -- $stats
  used_percent="${4%%%}"
  case "$used_percent" in ''|*[!0-9]*) fail 'Could not read disk utilization.';; esac
  report="$disk_name: total=$1 KiB used=$2 KiB available=$3 KiB usage=$4${photo_count:+ photos=$photo_count}"
  logger -t vag-disk "$report"
  if [ "$used_percent" -ge 95 ]; then
    printf 'CRITICAL (95%%): %s\n' "$report"
  elif [ "$used_percent" -ge 80 ]; then
    printf 'WARNING (80%%): %s\n' "$report"
  fi
}

start_backup_run() {
  remote="${PHOTO_BACKUP_REMOTE:?Set an independent rclone crypt remote in PHOTO_BACKUP_REMOTE}"
  # Serialize backup/restore and keep the lock and all scratch files off the boot disk.
  exec 9>"$stage_root/.operations.lock"
  flock -n 9 || fail 'Another Oracle photo backup or restore is running.'
  stage=$(mktemp -d "$stage_root/.run-XXXXXXXX")
  trap 'rm -rf -- "$stage"' EXIT
  trap 'exit 1' HUP INT TERM
}

verify_photos() {
  manifest="$bundle/photo-files.txt"
  if [ -s "$manifest" ]; then
    rclone cryptcheck "$photo_root" "$remote/photos" --log-level ERROR --one-way --files-from-raw "$manifest" --match "$stage/photo-matches"
    LC_ALL=C sort "$manifest" > "$stage/expected"
    LC_ALL=C sort "$stage/photo-matches" > "$stage/verified"
    cmp -s "$stage/expected" "$stage/verified" || fail 'The verified photos do not match the database snapshot.'
  fi
}

case "${1:-}" in
  check) check_mount ;;
  monitor)
    disk_name='Boot volume'
    photo_count=''
    report_disk /
    check_mount
    disk_name='Oracle photo volume'
    photo_count=$(compose exec -T db psql -XAt -U vag -d vag -v ON_ERROR_STOP=1 \
      -c "SELECT count(*) FROM \"Attachment\" WHERE key LIKE 'photo-%'")
    report_disk "$VAG_DATA_MOUNT"
    ;;
  backup)
    check_mount
    start_backup_run
    compose --profile operations run --rm -e BACKUP_KEEP=1 -e "BACKUP_ROOT=/backups/${stage##*/}" backup
    set -- "$stage"/????????T??????Z
    [ "$#" -eq 1 ] && [ -d "$1" ] || fail 'Backup bundle was not created.'
    bundle="$1"
    stamp="${bundle##*/}"
    if [ -s "$bundle/photo-files.txt" ]; then
      rclone copy "$photo_root" "$remote/photos" --immutable --files-from-raw "$bundle/photo-files.txt"
    fi
    verify_photos
    rclone copy "$bundle" "$remote/bundles/$stamp" --immutable
    rclone cryptcheck "$bundle" "$remote/bundles/$stamp" --log-level ERROR --one-way
    printf '%s\n' "$stamp" > "$stage/COMPLETE"
    rclone copyto "$stage/COMPLETE" "$remote/bundles/$stamp/COMPLETE" --immutable
    printf 'Verified off-server backup %s\n' "$stamp"
    ;;
  restore)
    [ "$#" -eq 3 ] && [ "$2" = RESTORE_TO_EMPTY_TARGET ] || fail 'Usage: oracle-photos.sh restore RESTORE_TO_EMPTY_TARGET YYYYMMDDTHHMMSSZ'
    stamp="$3"
    case "$stamp" in ????????T??????Z) ;; *) fail 'Invalid restore timestamp.';; esac
    case "$stamp" in *[!0-9TZ]*) fail 'Invalid restore timestamp.';; esac
    check_mount
    start_backup_run
    [ -z "$(find "$photo_root" -mindepth 1 -maxdepth 1 ! -name .vag-photo-volume -print -quit)" ] ||
      fail 'Restore target already has workshop photo files.'
    [ "$(compose exec -T db psql -XAt -U vag -d vag -v ON_ERROR_STOP=1 \
      -c "SELECT count(*) FROM pg_tables WHERE schemaname='public'")" = 0 ] || fail 'Restore database is not empty.'
    [ "$(rclone cat "$remote/bundles/$stamp/COMPLETE")" = "$stamp" ] || fail 'The selected off-server backup is incomplete.'
    bundle="$stage/$stamp"
    rclone copy "$remote/bundles/$stamp" "$bundle" --exclude /COMPLETE
    (cd "$bundle" && sha256sum -c SHA256SUMS)
    if [ -s "$bundle/photo-files.txt" ]; then
      if LC_ALL=C grep -qEv '^photo-[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' "$bundle/photo-files.txt"; then
        fail 'Invalid photo file key in backup manifest.'
      fi
      rclone copy "$remote/photos" "$photo_root" --immutable --files-from-raw "$bundle/photo-files.txt"
      verify_photos
    fi
    compose --profile operations run --rm -e "BACKUP_ROOT=/backups/${stage##*/}" restore RESTORE_TO_EMPTY_TARGET "$stamp"
    ;;
  *) fail 'Usage: oracle-photos.sh check | monitor | backup | restore RESTORE_TO_EMPTY_TARGET TIMESTAMP' ;;
esac
