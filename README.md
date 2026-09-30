# Carte des sites web publics de Côte d'Ivoire

Les sites de l'État ivoirien, rangés par ministère : une **carte interactive**, une **liste
filtrable** et un **tableau de bord de pilotage**, avec les données en CSV, JSON et GEXF
([Gephi](https://gephi.org)).

L'idée vient de la [carte des sites web publics de l'État français](https://github.com/jbledevehat/graph-gouv-fr)
de Jean-Baptiste Le Dévéhat. Le code est réécrit pour la Côte d'Ivoire, sans dépendance :
seul Node.js 20 ou plus est nécessaire.

> Proposition indépendante, pas un outil officiel.

## Voir la carte

```bash
npm run build
```

puis ouvrir `out/web/index.html` dans un navigateur (page autonome, sans serveur). Lien direct
vers un site : `index.html#finances.gouv.ci`.

| Vue | Contenu |
|---|---|
| **Carte** | Un pôle par ministère (Présidence au centre, Premier ministre relié à chaque ministère), les sites et sous-domaines en grappes autour. Recherche, légende filtrante, fiche de chaque élément, zoom à la molette, au pincement ou au clavier. |
| **Liste** | Tous les sites par pôle, avec filtre et statut. Version textuelle de la carte. |
| **Pilotage** | Chiffres clés, constats à traiter (ministères sans site, sites hors ligne, certificats en erreur, rattachements à confirmer), tableau par pôle, téléchargements. |

## Données

Générées par `npm run build` et versionnées dans `donnees/` :

- [`donnees/sites.csv`](donnees/sites.csv) (séparateur virgule, UTF-8) ;
- [`donnees/sites.json`](donnees/sites.json) (tableau d'objets).

| Champ | Contenu |
|---|---|
| `url`, `domaine` | Adresse et domaine (sans `www.`) |
| `type` | `site`, `sous-domaine` ou `archivé` |
| `statut` | `En ligne`, `Redirigé`, `Hors ligne`, `Indéterminé` ou `Non vérifié` |
| `code_http`, `url_finale`, `tls_erreur`, `verifie_le` | Résultat de la dernière vérification HTTP |
| `site_parent` | Site dont c'est un sous-domaine |
| `organisme` | Entité qui porte le site |
| `pole` | Ministère, ou « Institutions et juridictions », « Autorités et organismes publics », « Portails et services transverses » |
| `rattachement` | Comment le site a été rattaché (voir ci-dessous) |
| `source`, `note` | Origine de l'information et remarques |

### Valeurs de `rattachement`

| Valeur | Sens |
|---|---|
| `annuaire` | Le site est listé sous ce ministère dans l'[Annuaire des services publics](https://annuaire.gouv.ci) |
| `officiel` | Site officiel de l'entité, relevé sur un site public ou par recherche |
| `portail` | Portail transversal du Gouvernement, sans ministère propre |
| `déduit` | Rattachement déduit (direction d'un ministère, ancien nom…) : **à confirmer** |
| `candidat` | Adresse plausible mais jamais vérifiée : **à confirmer** |
| `site parent` / `à rattacher` | Sous-domaine trouvé automatiquement / site trouvé sans organisme connu |

## Mettre à jour

```bash
npm run update
```

enchaîne les trois étapes, qui peuvent aussi être lancées séparément :

| Commande | Rôle | Résultat |
|---|---|---|
| `npm run subdomains` | Cherche les sous-domaines de `gouv.ci` et des domaines connus dans les journaux de certificats ([crt.sh](https://crt.sh)) | `donnees/candidats.json` |
| `npm run check` | Vérifie en HTTP chaque site (et, avec `--candidats`, chaque candidat) | `donnees/checks/latest.json` |
| `npm run build` | Construit la carte, les listes et le rapport | `donnees/sites.*`, `out/` |

Options de `check` : `--only=new` (jamais vérifiés), `--only=unknown` (restés indéterminés),
`--candidats` (inclut les sous-domaines de crt.sh), `--limit=N` pour un essai.

`out/rapport.md` résume chaque construction : ministères sans site, rattachements à confirmer,
sites à rattacher, avertissements. `npm test` lance les tests.

### Vérification HTTP

Chaque domaine est essayé en `https://`, en `http://`, puis en `https://www.` ; les redirections
sont suivies une à une.

| Résultat | Statut |
|---|---|
| 2xx ou 3xx sur le même domaine, ou 401 / 403 (accès restreint) | En ligne |
| Redirection vers un autre domaine | Redirigé (site archivé) |
| Domaine introuvable, 404, 410 | Hors ligne (site archivé) |
| Délai dépassé, 5xx, limitation de débit | Indéterminé (à relancer) |

Un certificat en erreur (expiré, autosigné, établi pour un autre nom) n'empêche pas de lire le
site : il est signalé dans `tls_erreur`.

## Sources

Relevé effectué le 30 septembre 2026 :

- **Gouvernement** : les 34 membres du gouvernement Beugré Mambé du 23 janvier 2026
  ([Fraternité Matin](https://www.fratmat.info/article/2639536/politique/nouveau-gouvernement-ivoirien-voici-la-liste-des-34-ministres-nommes),
  [Yessouan](https://www.yessouan.ci/Voici-la-liste-du-gouvernement-du-23-janvier-2026-du-Premier-ministre-Beugre-Mambe_a6692.html)) ;
- **Institutions** : [Secrétariat général du Gouvernement](https://web.sgg.gouv.ci/institutions-de-cote-d-ivoire) ;
- **Sites des ministères** : [Annuaire des services publics](https://annuaire.gouv.ci/accueil/liste_institution/ministres),
  pages « Annuaire web » (dont la mise à jour de certaines fiches date de 2017) ;
- **Portails** : [Service public](https://servicepublic.gouv.ci), [data.gouv.ci](https://data.gouv.ci/pages/oragnisations) ;
- **Sous-domaines** : journaux de certificats ([crt.sh](https://crt.sh)), à la mise à jour.

## Limites

- L'annuaire ivoirien n'offre ni API ni export : la liste de départ (`config/sites.csv`) est
  saisie à la main. Elle est complétée par les sous-domaines trouvés dans crt.sh.
- Les statuts sont « Non vérifiés » tant que `npm run check` n'a pas été lancé depuis un poste
  qui accède aux sites.
- Cinq ministères n'ont pas de site connu (Portefeuille de l'État, Infrastructures, Transition
  numérique, Femme et Famille, Environnement), ni les trois ministères délégués rattachés à
  d'autres portefeuilles.
- Pas encore de niveau territorial (14 districts, 31 régions, préfectures, communes) ni
  d'entreprises et établissements publics.

## Modifier les données

| Fichier | Rôle |
|---|---|
| `config/entites.csv` | Ministères, institutions, autorités et pôles (à mettre à jour après chaque remaniement) |
| `config/sites.csv` | Liste des sites de départ, avec l'entité qui les porte |
| `config/config.json` | Domaine de publication, réglages de la vérification, filtres de noms techniques |

Un rattachement manquant se corrige dans `config/sites.csv` (colonne `entite`), puis
`npm run build`.

## Publication (VPS)

La carte est une page statique (`out/web/`) servie par nginx sur **gouvci.arnoldkouya.com**
(domaine défini par `site.domaine` dans `config/config.json`).

**Sur le serveur**, une fois :

1. DNS : un enregistrement `A` (et `AAAA` si IPv6) `gouvci` → adresse du VPS.
2. nginx : copier [`deploy/nginx.conf`](deploy/nginx.conf), adapter `root`, activer le site.
3. HTTPS : `sudo certbot --nginx -d gouvci.arnoldkouya.com`.

**Déployer à la main** : `./deploy/deploy.sh utilisateur@serveur:/var/www/gouvci/`
(construit la carte puis la copie par rsync).

**Déployer automatiquement** : la GitHub Action [`carte.yml`](.github/workflows/carte.yml)
reconstruit et envoie la carte sur le VPS à chaque push sur `main` ; le 1er de chaque mois,
elle relance les sous-domaines et les vérifications, puis versionne les résultats. Secrets à
créer : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (clé dédiée), `VPS_KNOWN_HOSTS`
(`ssh-keyscan -H <VPS_HOST>`), `VPS_PATH` et, si besoin, `VPS_PORT`.

## Organisation du code

```
src/
  cli.mjs          commandes
  lib.mjs          CSV, fichiers, noms de domaine
  subdomains.mjs   sous-domaines (crt.sh)
  check.mjs        vérification HTTP
  build.mjs        assemblage, rattachements, placement de la carte, exports
config/            entités, sites, réglages
deploy/            configuration nginx et script de déploiement
donnees/           liste des sites, vérifications, candidats
web/index.html     page de la carte (canvas, sans bibliothèque)
test/              tests (node --test)
```

## Licence

Arnold Kouya, 2026, [licence MIT](LICENSE).
