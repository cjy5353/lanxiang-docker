#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
backup_dir="backups/$(date +%Y%m%d-%H%M%S)"
mkdir -p "$backup_dir"
docker compose exec -T db sh -c 'pg_dump -U lanxiang_owner -d lanxiang -Fc -f /tmp/lanxiang.dump'
docker compose cp db:/tmp/lanxiang.dump "$backup_dir/lanxiang.dump"
cp .env "$backup_dir/config.env"
chmod 600 "$backup_dir/lanxiang.dump" "$backup_dir/config.env"
printf '备份完成：%s\n' "$backup_dir"
