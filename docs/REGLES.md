# Règles de mon appli de scan

À jour au 3 novembre 2026. Ce fichier résume ce que fait l'appli, pour s'en souvenir au moment d'acheter.

## 1. Ma liste de pépites

La liste contient 10 736 livres au 3/11 : environ 10 250 en français et 450 en anglais. Parmi eux, 1 306 sont des livres chers qui se vendent lentement (voir l'exception ci-dessous). Elle est construite à partir d'Amazon.fr, via Keepa, dans le fichier [`data/pepites.csv`](../data/pepites.csv).

| | Livres en français | Livres en anglais |
| --- | --- | --- |
| Prix d'occasion actuel | 10 € et plus | 25 € et plus |
| Prix d'occasion moyen sur 90 jours | au moins le bas de la tranche | au moins 25 € |
| Classement des ventes Amazon (moyenne 6 mois) | meilleur que 400 000 | meilleur que 150 000 |
| Ventes sur les 6 derniers mois | au moins 3 | au moins 3 |

**Exception pour les livres chers** : un livre dont le prix médian de vente est de **50 € ou plus** reste dans la liste s'il s'est vendu **au moins une fois en 2 ans**, même s'il a moins de 3 ventes en 6 mois. Je les achète souvent autour de 1 €, donc le risque est faible. Pour les trouver, l'appli cherche aussi les livres en français vendus 50 à 300 € d'occasion dont le classement moyen est entre 400 000 et 1,5 million.

Règles communes :

- Seulement la catégorie Livres d'Amazon.fr, et pas les livres vendus directement par Amazon.
- Aucun livre érotique. Les catégories érotiques sont exclues, et les titres repérés par mots-clés sont retirés.
- Un prix d'occasion de plus de 5 fois le prix neuf est jugé absurde et effacé.
- Depuis le 6/11, un livre sans prix neuf (épuisé) peut entrer dans la liste : on regarde le prix d'occasion moyen sur 90 jours, plus le prix neuf.
- Les tranches de prix en français sont : 35 € et plus, 25–35 €, 15–25 € et 10–15 €.
- Un livre que j'ajoute avec « ⭐ Ajouter à ma liste » compte comme une pépite, quelle que soit la règle.

## 2. Mise à jour

- **Quand** : le 1er et le 15 de chaque mois, toute seule, en 6 passages ce jour-là, toutes les 4 heures (vers 2 h, 6 h, 10 h, 14 h, 18 h et 22 h, heure de Paris).
- **Quoi** : les nouveaux livres qui remplissent les règles sont ajoutés. Chaque livre déjà présent est remis à jour tous les 14 jours : prix, ventes, classement.
- **Sortie de la liste** : un livre vendu moins de 3 fois en 6 mois sort de la liste, sauf un livre à 50 € et plus vendu au moins une fois en 2 ans. Il est revu deux semaines plus tard et revient s'il se vend de nouveau.
- **Jamais supprimés** : les livres que j'ai ajoutés à la main. Ils sont enregistrés dans l'appli, pas dans le fichier.
- **À la demande** : GitHub, onglet Actions, « Pépites Keepa », bouton « Run workflow » en laissant la case vide.
- **Coût** : environ 1 jeton Keepa par livre mis à jour. C'est compris dans mon abonnement Keepa et ne coûte rien de plus.

## 3. Au scan : ce qui s'affiche

| Le livre est… | Badge | Prix affiché | Ce que je peux faire |
| --- | --- | --- | --- |
| dans ma liste | ⭐ Liste pépites | oui, tout de suite, tiré du fichier sans jeton Keepa | rien, tout est là |
| ajouté à la main | ⭐ Liste pépites | oui, demandé à Keepa | « ✖ Retirer de ma liste » |
| hors liste, pas encore identifié | « Pas dans ta liste · pas encore identifié » | non, seulement le titre lu sur la tranche | « 🔎 Identifier ce livre » (gratuit), puis « ⭐ Ajouter à ma liste » ou « Actualiser les prix » |
| hors liste, identifié | aucun | non : « pas dans ta liste » | « ⭐ Ajouter à ma liste » ou « Actualiser les prix » |
| hors liste, déjà vu avant | aucun | l'ancien prix, qui n'est plus mis à jour | regarder la date, « Actualiser les prix » si besoin |
| introuvable dans les catalogues | « Non identifié » (rouge) | non | chercher à la main, ou scanner son code-barres |

- **Le scan est fini dès que la photo est lue.** Les livres de ma liste sont reconnus tout de suite, par leur titre ou leur ISBN. Les autres ne sont cherchés dans les catalogues (Google Books, Open Library…) que si je clique sur « 🔎 Identifier ce livre ». Le bouton « Identifier tous les livres restants » les cherche tous d'un coup, mais c'est long.
- La couverture vient du catalogue, sinon d'Amazon ou d'Open Library par l'ISBN. 📕 veut dire qu'aucune couverture n'a été trouvée.

## 4. Lire une fiche au moment d'acheter

| Information | Ce que ça veut dire |
| --- | --- |
| **Prix médian de vente** | La médiane des 5 dernières ventes connues, même anciennes. À défaut, les offres d'occasion. |
| **Ventes sur 12 mois** | Le nombre de ventes estimé par Keepa d'après le classement Amazon. |
| **Vendu actuellement à** | L'offre la moins chère en ce moment et le nombre d'offres, c'est-à-dire la concurrence. |
| **Profit net estimé** | Le prix médian moins 20 % de frais, moins 4,10 €. |
| **Profit pondéré 30 j** | Le profit net multiplié par la chance de vendre dans le mois, d'après le rythme des 5 dernières ventes et au plus 1. |
| **Prix max d'achat conseillé** | Le profit net divisé par 3, pour gagner 2 fois sa mise. Si Momox rachète plus cher, c'est le prix de rachat. |
| **BiblioRank (0 à 100)** | Le gain espéré : profit net multiplié par la chance de vendre, réduit si quelqu'un vend en ce moment sous la médiane. Environ 63 pour 10 € espérés, 86 pour 20 €. Au plus 5 si aucune vente en 12 mois. |
| **Livre « intéressant »** | Prix médian d'au moins 35 €, au moins 3 ventes sur 12 mois, prix au moins 1,2 fois le prix éditeur, et aucune offre actuelle sous 27 €. |

Exemple : le *Dictionnaire des symboles* a un prix médian de 18,34 €. Son profit net est de 18,34 × 0,8 − 4,10 = 10,57 €, et son prix max d'achat de 10,57 ÷ 3 = 3,52 €.

## 5. Pièges à connaître

- **Ancien prix d'un livre hors liste** : il ne se met plus à jour. Je regarde sa date avant de m'y fier.
- **Prix du fichier** : ils peuvent avoir jusqu'à 2 semaines. Au-delà de 18 jours, l'appli redemande le prix à Keepa.
- **Prix moyen sur 90 jours** : il est parfois absurde dans le fichier (par exemple 1 622 € pour un Dicobat), ce défaut n'est pas encore corrigé. Je me fie plutôt au prix médian de vente et aux dernières ventes.
- **Livre hors liste** : ça ne veut pas dire qu'il ne vaut rien. Il a pu sortir à cause des ventes, ou ne jamais être entré. En cas de doute, j'utilise « Actualiser les prix ».
- **Plusieurs éditions** : quand ma liste contient plusieurs éditions du même livre (par exemple le *Dictionnaire des symboles* de 1982 à 18 € et de 1996 à 30 €), l'appli affiche la plus chère avec le badge « ⚠️ 2 éditions dans ta liste ». Je vérifie l'année ou la couverture avant d'acheter.
- **Livres sans ISBN** : l'appli cherche le livre sur Amazon par titre et auteur, avec une règle générale (aucun titre de livre n'est écrit dans le code) :
  - tous les mots importants du titre principal doivent être dans la fiche Amazon (accents et pluriels ignorés), et l'auteur ;
  - pas de coffret ni d'intégrale (« tomes 1 à 4 », « I-II », « complet en 5 tomes ») pour un seul tome, ni un autre tome de la série (« l'art médiéval » au lieu de « l'art renaissant ») ;
  - entre les fiches qui passent : celle qui nomme le tome, puis l'édition la plus vendue ;
  - rien avec le titre complet : 2e recherche avec le titre court et l'auteur (10 jetons Keepa de plus) ;
  - toujours rien : pas de prix, et la fiche affiche « À vérifier ». Pas de prix plutôt qu'un faux prix.
- **Mauvaise identification** : l'appli peut se tromper de livre. Je vérifie le titre et l'édition avec le bouton « emplacement » avant d'acheter.
