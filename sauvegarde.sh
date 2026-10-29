#!/usr/bin/env bash
# Sauvegarde quotidienne de la base MonExamEnLigne (Atlas ou locale, selon MONGO_URL de ecole.env). Courriel à ADMIN_EMAIL en cas d'échec.
set -uo pipefail
cd "$(dirname "$0")"
DATE=$(date +%Y-%m-%d_%H%M)
MONGO_URL=$(grep '^MONGO_URL=' ecole.env | cut -d= -f2-)
DB_NAME=$(grep '^DB_NAME=' ecole.env | cut -d= -f2-)
mkdir -p sauvegardes
OUT="sauvegardes/monexam_${DATE}.gz"
alerte() { docker compose exec -T api python alerte.py "$1" "$2" || true; }
if ! ERR=$(docker compose exec -T mongo mongodump --uri="$MONGO_URL" --db="${DB_NAME:-monexam}" --archive --gzip 2>&1 >"$OUT"); then
  rm -f "$OUT"
  echo "ECHEC sauvegarde : $ERR"
  alerte "Échec de la sauvegarde nocturne" "La sauvegarde de la base ${DB_NAME:-monexam} du $(date '+%Y-%m-%d %H:%M') a échoué sur $(hostname).

$ERR

À faire : connectez-vous à la VM, puis : cd /opt/monexam && ./sauvegarde.sh"
  exit 1
fi
SIZE=$(stat -c %s "$OUT")
if [ "$SIZE" -lt 1024 ]; then
  echo "ECHEC sauvegarde : archive vide ($SIZE octets)"
  alerte "Sauvegarde nocturne suspecte (archive vide)" "L'archive $OUT ne fait que $SIZE octets. Vérifiez MONGO_URL / DB_NAME dans ecole.env."
  exit 1
fi
find sauvegardes -name 'monexam_*.gz' -mtime +30 -delete
echo "Sauvegarde OK : $OUT ($SIZE octets)"
