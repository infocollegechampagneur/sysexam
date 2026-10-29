#!/usr/bin/env bash
# Toutes les 10 min (cron) : vérifie que l'API répond via Internet (tunnel Cloudflare) et que les conteneurs tournent.
# Courriel à ADMIN_EMAIL quand ça tombe, et quand ça revient. Un seul courriel par incident (fichier d'état).
set -uo pipefail
cd "$(dirname "$0")"
DOMAIN=$(grep '^API_DOMAIN=' ecole.env | cut -d= -f2-)
ETAT=sauvegardes/.etat-surveillance
mkdir -p sauvegardes
alerte() { docker compose exec -T api python alerte.py "$1" "$2" || true; }

PROBLEMES=""
for svc in api mongo tunnel; do
  if ! docker compose ps --status running --services 2>/dev/null | grep -qx "$svc"; then PROBLEMES+="- conteneur « $svc » arrêté
"; fi
done
if ! docker compose exec -T api python -c "import urllib.request;urllib.request.urlopen('http://localhost:8001/api/',timeout=5)" >/dev/null 2>&1; then
  PROBLEMES+="- l'API ne répond pas localement (docker compose logs api)
"
fi
CODE=$(curl -s -o /dev/null -m 15 -w '%{http_code}' "https://$DOMAIN/api/" || echo 000)
if [ "$CODE" != "200" ]; then PROBLEMES+="- https://$DOMAIN/api/ renvoie $CODE depuis Internet (tunnel Cloudflare ? docker compose logs tunnel)
"; fi

AVANT=$(cat "$ETAT" 2>/dev/null || echo OK)
if [ -n "$PROBLEMES" ]; then
  echo "PROBLEME: $PROBLEMES"
  if [ "$AVANT" = "OK" ]; then
    # restart automatique du tunnel si c'est le seul problème
    if echo "$PROBLEMES" | grep -q "renvoie" && ! echo "$PROBLEMES" | grep -q "localement\|arrêté"; then docker compose --profile tunnel restart tunnel >/dev/null 2>&1 || true; fi
    alerte "Serveur d'examens : problème détecté" "Le $(date '+%Y-%m-%d %H:%M') sur $(hostname) :

$PROBLEMES
Un redémarrage automatique du tunnel a été tenté si nécessaire. Si ce courriel n'est pas suivi d'un « rétabli » dans 10 min : cd /opt/monexam && docker compose ps && docker compose logs --tail 50 api tunnel"
    echo KO > "$ETAT"
  fi
else
  echo "OK $(date '+%H:%M')"
  if [ "$AVANT" = "KO" ]; then alerte "Serveur d'examens : rétabli" "Tout répond de nouveau normalement depuis le $(date '+%Y-%m-%d %H:%M')."; fi
  echo OK > "$ETAT"
fi
