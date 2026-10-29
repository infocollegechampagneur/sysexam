#!/usr/bin/env bash
# Met à jour l'API à l'école après un « Save to GitHub » : git pull + reconstruction + redémarrage sans perte de données.
set -euo pipefail
cd "$(dirname "$0")"
git pull --ff-only
chmod +x ./*.sh
export GIT_SHA=$(git rev-parse --short HEAD)
docker compose build api
PROFILE=$(grep -q '^TUNNEL_TOKEN=.\+' ecole.env && echo tunnel || echo https)
docker compose --profile "$PROFILE" up -d
docker compose ps
echo "Mise à jour terminée (version $GIT_SHA). Test : curl -s https://$(grep ^API_DOMAIN ecole.env | cut -d= -f2)/api/"
