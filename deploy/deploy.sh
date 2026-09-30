#!/usr/bin/env bash
# Déploiement manuel : ./deploy/deploy.sh utilisateur@serveur:/var/www/gouvci/
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -eq 1 ] || { echo "Usage : $0 utilisateur@serveur:/chemin/" >&2; exit 1; }
npm run build
rsync -az --delete out/web/ "$1"
echo "Carte déployée sur $1"
