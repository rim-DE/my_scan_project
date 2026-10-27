# BiblioScan perso

Application web personnelle inspirée de BiblioScan : tu photographies une étagère ou une pile de livres, l'appli repère chaque livre, l'identifie (titre, auteur, ISBN, éditeur) et affiche les prix observés sur plusieurs plateformes, avec une estimation de revente.

## Ce que fait cette première version

| Page | Contenu |
| --- | --- |
| **Dashboard** | Scans passés (nom, date, nombre de photos, nombre de livres, statut, favori, suppression, recherche), listes d'achat, scans favoris, scans par code-barres |
| **Nouveau scan** | Envoi de plusieurs photos (glisser-déposer ou appareil photo), choix de la langue des livres, traitement en arrière-plan avec statut *En attente / En cours / Terminé / Erreur*. Ou recherche directe par ISBN avec choix du pays |
| **Résultat d'un scan** | Photo avec le contour incliné de chaque livre (4 coins, comme BiblioScan), recherche, export CSV, 8 tris (profit 30j, rachat, profit net, médian, prix actuel, ventes, dernière vente, ordre de la photo), et une liste déroulante où chaque livre montre : sa tranche découpée et redressée pour vérifier que c'est le bon, couverture, profit net, profit pondéré sur 30 jours, prix médian de ventes, prix max d'achat conseillé, ventes sur 12 mois, 5 dernières ventes, prix actuel, rachat Momox, ratio prix/prix éditeur, ISBN-13/10, toutes les offres par site. À droite de la tranche, trois boutons : **emplacement** (la photo avec le livre surligné en rose et un rond qui clignote, la tranche et l'ISBN-13 \| ISBN-10), **historique des ventes** (graphique par mois et liste des ventes sur 12 mois) et **« … »** (les sites de vente avec le meilleur prix connu, chaque icône ouvre les annonces du livre sur ce site, plus la meilleure offre Amazon et le bouton Actualiser) |
| **Calculer un prix** | Estimation de revente d'un livre (ISBN ou photo) selon son état |
| **Mon stock** | Livres gardés pour la revente : état, statut (en stock / en vente / vendu), prix d'achat et de vente, valeur estimée totale |
| **Listes d'achat** | Listes de livres à acheter |
| **Badges** | 6 badges calculés à partir de ton activité |
| **Profil** | Prénom, langue de l'interface, crédits, déconnexion |
| **Crédits** | Chaque photo consomme un crédit (réglable) ; les recherches par ISBN sont gratuites |
| **Langues** | Interface en français (par défaut) et en anglais |

Pas encore inclus : Tarifs, Guide, Contact (prévus plus tard), application mobile.

## La stack, et pourquoi

- **Next.js 15 + TypeScript + Tailwind CSS** : un seul projet pour l'interface et le serveur (routes API, actions serveur), typé de bout en bout, et déployable en un clic sur Vercel. La même base servira plus tard d'API pour une appli mobile.
- **PostgreSQL + Prisma** : base relationnelle solide (scans → photos → livres détectés → prix), Prisma génère des types TypeScript à partir du schéma et gère les migrations.
- **API Claude (vision)** : un seul appel par photo repère tous les livres, lit les tranches (même verticales ou abîmées) et renvoie un JSON validé (titre, auteur, éditeur, ISBN s'il est lisible, position du livre sur la photo).
- **Google Books puis Open Library** : catalogues publics et gratuits pour retrouver l'ISBN, l'éditeur et la couverture à partir du titre lu.
- **File d'attente** : la table `Scan` sert de file (statut `PENDING`). Le traitement démarre juste après l'envoi (`after()` de Next.js). Un filet de sécurité reprend les scans bloqués : la route `/api/cron` (Vercel Cron, toutes les 10 min) ou `npm run worker` sur un serveur classique. Pas besoin de Redis pour un usage perso ; on pourra passer à une vraie file (Inngest, BullMQ…) si le volume augmente.
- **Stockage des photos** : dossier local en développement, S3 ou compatible (Cloudflare R2, Scaleway…) en production.
- **Cache des prix** : chaque appel à une source de prix est mémorisé (`PriceFetch`) ; la source n'est pas rappelée avant `PRICE_CACHE_TTL_HOURS` (24 h par défaut). Les recherches titre → livre sont aussi mises en cache (`LookupCache`).

## Sources de prix : ce qui est autorisé

Le scraping (lire automatiquement les pages d'un site) est **interdit par les conditions d'utilisation** de la plupart de ces sites, et peut mener à un blocage de ton IP ou à des poursuites. L'appli n'en fait donc pas. Voici ce qui est utilisé à la place :

| Plateforme | Accès légal aux prix | Dans l'appli |
| --- | --- | --- |
| **eBay** | API officielle *Browse* (gratuite, clé développeur) : annonces en cours. Les ventes passées passent par une API restreinte (Marketplace Insights) | ✅ Intégré (`EBAY_CLIENT_ID`/`SECRET`) |
| **Amazon** | Scraping interdit. **Keepa** (payant, données sous licence) ou l'API *Product Advertising* (compte Partenaires avec ventes régulières requis) | ✅ Keepa intégré (`KEEPA_API_KEY`) |
| **Fnac** | Pas d'API publique. Flux produits via leur programme d'affiliation (Awin) | Lien de recherche + saisie manuelle |
| **Rakuten** | Pas d'API publique de prix. Flux via le programme d'affiliation | Lien de recherche + saisie manuelle |
| **Leboncoin** | Aucune API publique, scraping interdit par les CGU | Lien de recherche + saisie manuelle |
| **Vinted** | Aucune API publique, scraping interdit par les CGU | Lien de recherche + saisie manuelle |
| **Momox** | Pas d'API publique de rachat, scraping interdit | Lien vers leur estimation + saisie manuelle |
| **Recyclivre** | Pas d'API publique | Lien de recherche + saisie manuelle |
| **AbeBooks** | Programme d'affiliation (données sur demande) | Lien de recherche + saisie manuelle |

Pour chaque livre, le bouton **« Ajouter un prix vu »** te permet d'enregistrer un prix que tu as constaté toi-même sur un site : il est pris en compte dans les calculs (médiane, fourchette…). Les boutons **« Vérifier sur … »** ouvrent la recherche du livre sur chaque site dans ton navigateur, ce qui est toujours autorisé.

Pour tester l'interface sans aucune clé, mets `PRICE_DEMO_MODE=true` : l'appli génère des prix **faux** (stables pour un même ISBN), clairement signalés par un bandeau « Données de démonstration ».

### Comment sont calculés les chiffres

- **Prix médian** : médiane des prix d'occasion et des ventes (ou des prix neufs s'il n'y a rien d'autre).
- **Fourchette de revente conseillée** : du 1er quartile à la médiane, pour vendre vite sans brader.
- **Profit net estimé** : prix médian − commission (`RESALE_FEE_RATE`, 20 %) − frais fixes (`RESALE_FIXED_COST_CENTS`, 4,10 €, envoi compris). Réglages calés sur BiblioScan.
- **Pépite 🏅** : profit pondéré sur 30 jours ≥ 20 € (`BANGER_MIN_PROFIT_CENTS`). Un popup présente chaque pépite à la fin du scan.
- **Prix d'achat max conseillé** : profit net ÷ (1 + `TARGET_ROI`). Avec `TARGET_ROI=2` (défaut), tu triples ta mise. Si un site de rachat (Momox…) paie plus, c'est ce prix qui sert de plancher.
- **Ventes sur 12 mois / 30 jours** : estimation de Keepa (baisses du classement des ventes Amazon) si `KEEPA_API_KEY` est configurée, sinon le nombre de ventes enregistrées (saisies « Vendu » ou mode démo). Les ventes individuelles avec leur prix ne sont pas disponibles légalement chez Amazon ou eBay sans accès spécial (eBay Marketplace Insights est réservé) : le tableau « Vendu il y a / Au prix de » se remplit avec tes saisies et le mode démo.
- **Profit pondéré sur 30 jours** : profit net × chance de vendre dans le mois (ventes par mois sur l'année, plafonnées à 1). C'est le tri par défaut, proche du « BiblioRank ».
- **Ratio** : prix médian ÷ prix éditeur.
- **Estimation selon l'état** : médiane × coefficient (Neuf 1,25 · Comme neuf 1,1 · Très bon 1 · Bon 0,85 · Correct 0,6).

## Installation en local

Prérequis : Node.js 20 ou plus, et Docker (pour la base de données) ou un PostgreSQL déjà installé.

```bash
# 1. Installer les dépendances
npm install

# 2. Lancer PostgreSQL
docker compose up -d

# 3. Configurer
cp .env.example .env
# puis ouvre .env et remplis au minimum AUTH_SECRET et ANTHROPIC_API_KEY
# (AUTH_SECRET : colle le résultat de `openssl rand -base64 32`)

# 4. Créer les tables
npm run db:migrate

# 5. Démarrer
npm run dev
```

Ouvre http://localhost:3000, clique sur **Créer un compte** (le premier compte est toujours accepté ; ensuite les inscriptions sont fermées sauf si `ALLOW_REGISTRATION=true`).

### Tester

```bash
npm test          # tests automatiques (ISBN, calculs de prix, lecture des réponses des API…)
npm run typecheck # vérification des types
npm run lint
```

Test manuel conseillé :
1. Mets `PRICE_DEMO_MODE=true` dans `.env` et relance `npm run dev`.
2. **Nouveau scan** → recherche l'ISBN `9781452151755` → la fiche du livre s'affiche avec des prix de démonstration.
3. **Nouveau scan** → envoie une photo d'étagère → le statut passe à *En cours* puis *Terminé* (environ 30 s à 2 min selon le nombre de livres), les livres sont encadrés sur la photo.
4. Ajoute un livre au stock, puis ouvre **Mon stock**.

### Tester la détection sur une photo, sans base de données

```bash
npm run scan:report -- etagere.jpg                  # Claude + catalogues + sources de prix configurées
npm run scan:report -- etagere.jpg --demo           # idem avec des prix de démonstration (faux)
npm run scan:report -- etagere.jpg --detections etagere-resultat-lecture.json   # rejoue une lecture sans rappeler Claude
```

La commande écrit une page HTML autonome (photo comprise) avec la même mise en page que la page de résultats : contours sur la photo, tranches redressées, statistiques, les trois boutons de chaque livre, tris, export. Chaque vraie détection est aussi enregistrée en JSON pour pouvoir la rejouer gratuitement.

## Variables d'environnement

Toutes sont décrites dans [`.env.example`](.env.example).

| Variable | Obligatoire | Rôle |
| --- | --- | --- |
| `DATABASE_URL` | oui | Connexion PostgreSQL |
| `AUTH_SECRET` | oui | Signature des sessions (32 caractères min.) |
| `ANTHROPIC_API_KEY` | oui pour les photos | Détection des livres par Claude |
| `ANTHROPIC_MODEL` | non | Modèle Claude (défaut `claude-opus-5-5`) |
| `ANTHROPIC_EFFORT` | non | Effort de réflexion pour la détection : `high` (défaut, plus précis), `medium` ou `low` (plus rapides) |
| `GOOGLE_BOOKS_API_KEY` | conseillé | Évite le quota partagé de Google Books |
| `ALLOW_REGISTRATION` | non | Autoriser d'autres inscriptions après le premier compte |
| `INITIAL_CREDITS`, `CREDITS_PER_PHOTO` | non | Crédits offerts et coût d'une photo |
| `STORAGE_DRIVER` | non | `local`, `blob` ou `s3` (par défaut : `blob` si `BLOB_STORE_ID` ou `BLOB_READ_WRITE_TOKEN` existe, sinon `local`) |
| `BLOB_STORE_ID` ou `BLOB_READ_WRITE_TOKEN` | si `blob` | Ajouté automatiquement par Vercel quand un magasin Blob est relié au projet |
| `LOCAL_UPLOAD_DIR` | non | Dossier des photos en mode local |
| `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | si `s3` | Stockage S3 ou compatible |
| `PRICE_CACHE_TTL_HOURS` | non | Durée du cache des prix |
| `EBAY_CLIENT_ID`, `EBAY_CLIENT_SECRET` | non | API eBay Browse |
| `KEEPA_API_KEY` | non | Prix Amazon via Keepa |
| `PRICE_DEMO_MODE` | non | Prix factices pour tester |
| `RESALE_FEE_RATE`, `RESALE_FIXED_COST_CENTS`, `TARGET_ROI`, `BANGER_MIN_PROFIT_CENTS` | non | Paramètres de rentabilité et seuil des pépites |
| `CRON_SECRET` | en production | Protège la route `/api/cron` |

## Déployer

**Vercel** (hébergement) + **Neon** (PostgreSQL gratuit) + **Vercel Blob** (photos, 1 Go gratuit).

1. **Neon** : crée un projet (région Europe). Dans « Connect », désactive *Connection pooling* puis copie l'adresse dans `DATABASE_URL` (les migrations Prisma ont besoin d'une connexion directe).
2. **Vercel** : importe le dépôt GitHub, ajoute les variables d'environnement (`DATABASE_URL`, `AUTH_SECRET`, `ANTHROPIC_API_KEY`, `CRON_SECRET`, et si tu les as `GOOGLE_BOOKS_API_KEY`, `EBAY_*`, `KEEPA_API_KEY`), puis déploie. Pour `AUTH_SECRET` et `CRON_SECRET` : `openssl rand -base64 32`.
3. **Photos** : dans le projet Vercel, onglet *Storage* → *Create* → *Blob*, accès **Private**, relié au projet. Vercel ajoute tout seul `BLOB_STORE_ID` (connexion OIDC) ou `BLOB_READ_WRITE_TOKEN`, et l'appli utilise Blob dès que l'un des deux est présent. Redéploie ensuite (*Deployments* → *Redeploy*). Sur Vercel le disque n'est pas permanent : le stockage local ne marche pas.
4. Ouvre l'adresse donnée par Vercel et crée ton compte (le premier compte peut toujours s'inscrire).

Plutôt un stockage S3 (Cloudflare R2, Scaleway…) ? Crée un bucket et une clé « lecture/écriture », puis renseigne `STORAGE_DRIVER=s3` et les variables `S3_*` (pour R2 : `S3_REGION=auto`, `S3_ENDPOINT=https://<id-de-compte>.r2.cloudflarestorage.com`).

Rien d'autre à lancer : Vercel utilise le script `vercel-build`, qui applique les migrations (`prisma migrate deploy`) avant chaque build.

Points propres à Vercel :

- **Taille des envois** : Vercel refuse les requêtes de plus de 4,5 Mo. Le navigateur réduit donc chaque photo (taille lue par le modèle, environ 1 Mo en JPEG) et l'envoie seule : `POST /api/scans` crée le scan, `POST /api/scans/[id]/photos` ajoute une photo, `POST /api/scans/[id]/start` lance le traitement.
- **Cron** : la formule gratuite (Hobby) n'autorise qu'un passage par jour, donc `vercel.json` appelle `/api/cron` à 4 h (UTC). Avec Vercel Pro, remets `*/10 * * * *` pour reprendre les scans interrompus toutes les 10 minutes.
- **Durée** : le traitement d'un scan tourne jusqu'à 300 s par fonction. Au-delà (beaucoup de photos d'un coup), le cron reprend le scan.

## Organisation du code

```
prisma/schema.prisma        schéma de la base
src/lib/vision.ts           détection des livres par Claude (contours à 4 coins, sens de lecture)
src/lib/geometry.ts         contours, recouvrement, redressement des tranches
src/components/BookPanels.tsx  boutons emplacement / historique / « … » d'un livre
src/lib/report.ts           page HTML autonome de résultats
src/lib/books.ts            Google Books / Open Library
src/lib/catalog.ts          enregistrement des livres + cache des recherches
src/lib/prices/             sources de prix, plateformes, calculs, cache
src/lib/scan-processor.ts   traitement asynchrone d'un scan
src/lib/i18n/               textes FR / EN
src/app/(app)/              pages (dashboard, scans, prix, stock, listes, badges, profil)
src/app/api/                envoi des photos, statut, photos, identification, cron
src/app/actions.ts          actions serveur (favoris, stock, listes, notes…)
scripts/worker.ts           worker en ligne de commande
scripts/scan-report.ts      test d'une photo sans base de données (npm run scan:report)
```

## Pistes pour la suite

- Application mobile (React Native / Expo) qui réutilise les mêmes routes API.
- Historique des prix dans le temps (graphique, « calendrier des ventes »).
- Flux d'affiliation Fnac / Rakuten / AbeBooks si tu t'inscris à leurs programmes.
- Pages Tarifs, Guide, Contact.
