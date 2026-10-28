#!/usr/bin/env bash
# Sauvegarde quotidienne de la base MonExamEnLigne (à placer dans cron, voir DEPLOIEMENT-ECOLE.md)
set -euo pipefail
cd "$(dirname "$0")"
DATE=$(date +%Y-%m-%d_%H%M)
mkdir -p sauvegardes
docker compose exec -T mongo mongodump --db "${DB_NAME:-monexam}" --archive --gzip > "sauvegardes/monexam_${DATE}.gz"
find sauvegardes -name 'monexam_*.gz' -mtime +30 -delete
echo "Sauvegarde OK : sauvegardes/monexam_${DATE}.gz"
