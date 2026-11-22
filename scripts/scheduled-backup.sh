#!/bin/sh
set -eu
project="${VAG_PROJECT_DIR:-/srv/vag-erp}"
cd "$project"
if docker compose --profile operations run --rm backup; then
  exit 0
fi
message="$(date -u +%FT%TZ) VAG ERP backup failed on $(hostname)"
printf '%s\n' "$message" >&2
if [ -n "${BACKUP_ALERT_TO:-}" ] && command -v mail >/dev/null 2>&1; then
  printf '%s\n' "$message" | mail -s "VAG ERP backup failure" "$BACKUP_ALERT_TO"
fi
exit 1

