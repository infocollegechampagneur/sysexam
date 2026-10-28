#!/usr/bin/env bash
# Met à jour l'API à l'école après un « Save to GitHub » : git pull + reconstruction + redémarrage sans perte de données.
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
docker compose build api
PROFILE=$(grep -q '^CF_TUNNEL_TOKEN=.\+' ecole.env && echo tunnel || echo https)
docker compose --profile "$PROFILE" up -d
docker compose ps
echo "Mise à jour terminée. Test : curl -s https://$(grep ^API_DOMAIN ecole.env | cut -d= -f2)/api/"
