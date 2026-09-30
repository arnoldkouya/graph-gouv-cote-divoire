#!/usr/bin/env bash
# Déploiement manuel (Plesk) :
#   ./deploy/deploy.sh utilisateur@serveur:/var/www/vhosts/gouvci.arnoldkouya.com/httpdocs/
set -euo pipefail
cd "$(dirname "$0")/.."
[ $# -eq 1 ] || { echo "Usage : $0 utilisateur@serveur:/chemin/" >&2; exit 1; }
npm run build
rsync -rz --delete --chmod=D755,F644 out/web/ "$1"
echo "Carte déployée sur $1"
