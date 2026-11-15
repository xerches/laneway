#!/bin/sh
# Nightly Postgres backup for self-hosted Laneway (runs in the "backup"
# service of docker-compose.yml). Writes one gzipped dump right away and then
# one every 24 hours, and deletes dumps older than KEEP_DAYS.
set -u
KEEP_DAYS="${KEEP_DAYS:-14}"

while true; do
  file="/backups/laneway-$(date +%Y-%m-%d-%H%M).sql.gz"
  if pg_dump --no-owner --clean --if-exists | gzip > "$file.part"; then
    mv "$file.part" "$file"
    echo "backup written: $file"
  else
    rm -f "$file.part"
    echo "backup FAILED" >&2
  fi
  find /backups -name 'laneway-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
  sleep 86400
done
