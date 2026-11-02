# NEWS TECHNOLOGY VILLAGE — édition Prestige 1.7.0

Cette édition rassemble la base marketplace NTV et les améliorations d'interface et de parcours disponibles dans cette livraison. Elle conserve les modules existants et leurs API : catalogue, boutiques vendeurs, comptes et validation, commandes multivendeurs, stock, livraison, administration, communications et réclamations.

## Changements de cette édition

- Accueil catalogue compact : catégories à gauche, mise en avant centrale et bloc d'accompagnement à droite.
- Produits du catalogue visibles dès la zone d'accueil, puis accès direct aux filtres et à la grille.
- Filtrage par catégorie et boutique, tri par prix ou nom.
- Panier conservé dans le navigateur après actualisation.
- Contrôle de quantité du panier selon le stock communiqué par le catalogue.
- Paiement électronique retiré du parcours de commande : le seul mode proposé est le paiement à la livraison. La commande reste soumise à confirmation de disponibilité, prix et frais de livraison.
- Palette et identité visuelle Prestige NTV, avec symbole ♏ discret.
- Limitation en mémoire des tentatives d'inscription, de connexion et de création de commandes côté API.

## Installation

```bash
npm install
cp .env.example .env
# Renseigner les variables privées dans .env
npm run build
npm start
```

Pour le développement : `npm run dev` (le proxy API vise `http://localhost:10000`).

## Configuration requise

Configurer dans l'environnement d'hébergement :

- `MONGODB_URI` et `MONGODB_DB` pour les comptes, vendeurs, produits et données MongoDB.
- `ADMIN_USERNAME` et `ADMIN_PASSWORD` pour l'administration.
- `AUTH_SECRET` : secret aléatoire privé, long et indépendant du mot de passe administrateur.
- `WHATSAPP_NUMBER` : numéro international, chiffres uniquement.
- `DATABASE_URL` si PostgreSQL est utilisé pour les commandes.

Ne jamais publier `.env` ou les secrets dans le dépôt. HTTPS est requis en production.

## Préservation des données et déploiement

Cette archive contient le code, pas les bases de données de production ni les secrets. Elle ne doit pas être déployée en remplaçant les données existantes. Avant toute mise à jour :

1. Sauvegarder MongoDB et PostgreSQL.
2. Tester l'archive dans un environnement de préproduction relié à une copie des données.
3. Vérifier les parcours client, vendeur, livreur et administration.
4. Vérifier les variables d'environnement et le domaine WhatsApp.
5. Conserver la version précédente pour permettre un retour arrière.

Les collections et tables existantes doivent être conservées. Les éventuelles évolutions de schéma doivent rester additives. Ne pas exécuter de réinitialisation de base de données.

## Vérifications et limites connues de cette livraison

- `node --check server/index.js` : vérification syntaxique serveur réussie.
- La compilation Vite complète n'a pas pu être exécutée dans l'environnement de création : l'installation des dépendances a dépassé le délai disponible. Il faut donc exécuter `npm install` puis `npm run build` avant déploiement.
- Les tests d'intégration avec les bases réelles, les tests visuels sur appareils et les parcours de bout en bout ne peuvent pas être certifiés sans environnement de préproduction.
- Le rate limiting est en mémoire du processus ; sur plusieurs instances, utiliser un stockage partagé (par exemple Redis).
- CORS est encore configuré de manière permissive dans cette base : définir une liste d'origines autorisées avant un lancement public à grande échelle.
- WebRTC nécessite un service TURN correctement configuré pour une connectivité fiable entre réseaux.
- Le paiement à la livraison est un choix de commande, pas un encaissement ou une confirmation automatique du paiement.

# NEWS TECHNOLOGY VILLAGE (NTV) — base marketplace

## Version 1.4.0 — règlements par profil et espace réclamations

- Trois textes de conditions d'utilisation sont proposés selon le profil : client, vendeur et livreur. Ils détaillent les obligations liées aux achats, à la conformité des produits, aux stocks, aux commandes, aux livraisons, aux paiements, à la confidentialité et aux litiges.
- L'inscription exige l'acceptation explicite du règlement correspondant au rôle. Le serveur contrôle la version `NTV-UTILISATION-2026-11-01` et enregistre le rôle, la version et la date d'acceptation.
- Les comptes existants qui n'ont pas accepté cette version voient une étape obligatoire d'acceptation après connexion. Le serveur enregistre cette acceptation via `/api/legal/accept`.
- Un onglet « Règlement NTV » permet ensuite de relire les règles du profil.
- Les clients, vendeurs et livreurs disposent d'un espace « Réclamations » pour créer un dossier avec catégorie, objet, numéro de commande facultatif et description, puis suivre son statut et les réponses NTV.
- L'administration dispose d'un onglet « Réclamations » pour consulter les dossiers, répondre, modifier le statut et déclencher une notification au compte concerné.
- Les dossiers sont conservés dans une nouvelle collection MongoDB `complaints`, avec un numéro de référence et un historique des changements. Aucune collection de comptes, commandes ou produits n'est remplacée.

**Important — validation juridique :** ces textes constituent une base opérationnelle rédigée pour NTV. Avant publication commerciale, NTV doit les faire vérifier par un professionnel du droit compétent au Bénin, notamment pour les règles de consommation, les remboursements, les données personnelles, la responsabilité des intermédiaires et les modalités de règlement des litiges. Le règlement de commande affiché au checkout reste distinct de ces conditions de compte.

## Mise à jour technique 1.1 — stock après confirmation vendeur (31/10/2026)

- Une nouvelle commande vérifie la disponibilité du stock sans le décrémenter immédiatement.
- Pour les articles d'une boutique, le stock est débité lorsque le vendeur accepte la commande.
- Le traitement regroupe les lignes d'un même produit afin d'éviter de contourner le contrôle de quantité en répétant un article dans le panier.
- Le débit utilise une mise à jour atomique du stock. Si le stock est insuffisant ou si la confirmation concurrente échoue, les quantités déjà débitées pendant cette tentative sont restaurées.
- Les confirmations de vendeurs sont mises à jour par vendeur afin de ne pas écraser la réponse d'un autre vendeur sur une commande multiboutique.
- Les anciennes commandes sans marqueur `stock_policy` gardent l'ancien comportement : elles ne sont pas débitées une deuxième fois lors d'une acceptation.
- PostgreSQL reçoit automatiquement la colonne `stock_policy` si elle n'existe pas. MongoDB enregistre le même marqueur dans les nouvelles commandes.

**Limite de cette livraison :** cette mise à jour corrige le cycle de stock et la concurrence des confirmations. Elle n'ajoute pas encore les modules complets de messagerie, notifications multi-rôles, appels audio/vidéo ni le traitement automatique des comptes clients inactifs pendant trois mois. Ces modules restent à développer et à tester dans les prochaines étapes.

Application React/Vite + API Express pour la marketplace multiboutique NEWS TECHNOLOGY VILLAGE. Le catalogue général, les boutiques publiques, les comptes vendeurs/livreurs, les commandes, les livraisons et l’administration sont intégrés.

## Fonctionnalités incluses

- Catalogue public et panier existants.
- Préparation de commande et transmission WhatsApp existantes.
- Administration des produits via `/admin` (authentification Basic existante).
- Inscription et connexion via `/compte` pour les clients, vendeurs et livreurs.
- Mots de passe hachés avec `scrypt` (aucun mot de passe en clair enregistré).
- Sessions signées HMAC, valables 7 jours.
- Les comptes clients sont activés dès l'inscription.
- Les candidatures vendeurs et livreurs sont `pending` et ne peuvent pas se connecter avant validation.
- Interface de validation par NTV via `/admin/comptes`, avec les mêmes identifiants administrateur que `/admin`.

## Marketplace multiboutique et formules vendeurs

- Le catalogue général affiche les produits des vendeurs actifs et permet de filtrer par boutique.
- La rubrique « Boutiques partenaires » répertorie les vitrines publiques actives. Chaque boutique possède une URL `/boutique/:slug`.
- Les clients peuvent acheter sans compte. Le panier conserve l'identification du vendeur pour chaque article.
- Chaque vendeur consulte les commandes contenant ses articles et confirme la disponibilité avec « Accepter » ou « Rejeter » (motif obligatoire en cas de rejet).
- Les vendeurs VIP peuvent également enregistrer l'état de préparation de leurs propres articles ; cela ne modifie pas directement le statut global d'une commande multivendeur ni le suivi du livreur.
- Le vendeur choisit une formule lors de son inscription : commission de 5 % sur chaque vente sans abonnement, accès limité à 2 500 FCFA/mois sans commission, ou VIP à 5 000 FCFA/mois sans commission.
- Les abonnements mensuels sont validés manuellement par NTV depuis l'onglet « Abonnements & commissions » du tableau de bord administrateur. Une validation prolonge l'accès d'un mois calendaire et enregistre l'opération dans l'historique de paiement. NTV peut également envoyer un rappel qui apparaît dans l'espace vendeur.
- Les boutiques des vendeurs sous abonnement non payé, suspendu ou expiré sont masquées du catalogue public. Les vendeurs peuvent toujours accéder à leur espace pour voir les rappels et notifications de renouvellement.
- Les commissions de 5 % sont calculées à partir du taux enregistré sur les lignes de commande au moment de l'achat ; l'administration peut consulter les montants estimés dans le tableau de bord.
- Le suivi colis existant reste opérationnel ; sa chronologie reçoit une présentation illustrée par icônes, sans changer les statuts ni le fonctionnement du suivi.

Les anciennes commandes, produits et comptes ne sont pas supprimés. Une colonne JSONB `seller_confirmations` est ajoutée automatiquement à PostgreSQL ; MongoDB stocke ces confirmations dans chaque commande.

## Configuration Render obligatoire

Dans Render → service web → Environment, définir :

- `MONGODB_URI` : URI privée MongoDB Atlas.
- `MONGODB_DB` : `ntv_boutique`.
- `ADMIN_USERNAME` : identifiant administrateur.
- `ADMIN_PASSWORD` : mot de passe administrateur long et unique.
- `AUTH_SECRET` : secret aléatoire privé d'au moins 32 caractères, différent du mot de passe administrateur.
- `WHATSAPP_NUMBER` : numéro international, chiffres seulement.
- `DATABASE_URL` : facultatif, utilisé pour enregistrer les commandes dans PostgreSQL.

Ne publiez jamais ces secrets dans GitHub et ne partagez pas le fichier `.env`. Si un vrai mot de passe a déjà été exposé, changez-le dans Render.

MongoDB est nécessaire pour les inscriptions et les connexions. Sans `MONGODB_URI`, le catalogue de démonstration reste visible mais les comptes ne fonctionneront pas.

## Installation locale

```bash
npm install
cp .env.example .env
# Renseigner les variables privées dans .env
npm run build
npm start
```

Pour développer l'interface : `npm run dev` (le proxy API cible `http://localhost:10000`). Dans un autre terminal, lancer `npm start`.

## Parcours de test

1. Ouvrir `/compte` et créer un compte client : il doit pouvoir se connecter.
2. Créer une candidature vendeur avec une autre adresse e-mail : l'interface doit annoncer l'attente de validation.
3. Ouvrir `/admin/comptes`, se connecter avec les identifiants administrateur Render, puis approuver la candidature.
4. Revenir sur `/compte` et se connecter avec le compte vendeur approuvé.
5. Vérifier `/admin` et le catalogue public pour confirmer que les fonctions historiques sont toujours présentes.

## Sauvegarde et sécurité

Faire une sauvegarde MongoDB avant tout remplacement en production. Utiliser HTTPS en production. Prévoir une politique de confidentialité et des conditions d'utilisation avant l'ouverture publique des inscriptions. Ajouter une limitation de tentatives de connexion et une vérification d'adresse e-mail avant un lancement à grande échelle.


## Commande client sans compte

Les clients peuvent parcourir le catalogue, remplir leur panier et envoyer une commande sans créer de compte ni se connecter. Les comptes sont réservés aux commerçants et aux livreurs, avec validation préalable par NTV.


## Administration centrale (nouveau)

- `/admin` : tableau de bord central NTV avec indicateurs, commandes récentes, demandes de vendeurs et de livreurs.
- `/admin` → onglet **Commandes** : consultation des coordonnées client, articles, montant indicatif, moyen de paiement souhaité et mise à jour du statut (à confirmer, confirmée, préparation, expédiée, livrée, annulée).
- `/admin` → onglets **Commerçants** et **Livreurs** : approbation ou refus des candidatures.
- `/admin/produits` : gestion historique du catalogue (ajout, modification, suppression et photos).
- `/admin/comptes` : écran détaillé de validation des comptes conservé.

Les commandes sont stockées dans PostgreSQL si `DATABASE_URL` est configuré. Sinon, elles sont stockées dans MongoDB via `MONGODB_URI`. Il faut donc configurer au moins l'une de ces bases pour conserver et suivre les commandes. Les comptes vendeurs/livreurs nécessitent MongoDB.

Le total affiché dans le tableau de bord représente le montant des commandes enregistrées ; il ne prouve pas que les paiements ont été encaissés. La sélection d'un moyen de paiement par le client reste une préférence tant qu'un prestataire de paiement n'est pas intégré.

## Pilotage manuel des étapes de commande par l'administrateur

L'administration centrale est accessible à l'adresse `/admin` avec les valeurs `ADMIN_USERNAME` et `ADMIN_PASSWORD` définies dans les variables d'environnement Render. Le lien **Administration** est également disponible en bas de la boutique.

Dans `/admin` → **Commandes**, l'administrateur peut faire avancer ou corriger lui-même le statut de chaque commande. Il n'est pas nécessaire que le vendeur ou le livreur se connecte pour que l'équipe NTV mette à jour le dossier. Les statuts proposés sont :

1. À confirmer — NTV vérifie la demande et les coordonnées.
2. Confirmée — NTV confirme la commande et coordonne le vendeur.
3. En préparation — le vendeur prépare les articles ; NTV peut mettre à jour l'étape après vérification directe.
4. Prête à expédier — le colis est prêt.
5. Expédiée — le colis est remis pour départ.
6. En livraison — le colis est acheminé vers le client.
7. Livrée — la remise au client est confirmée.
8. Annulée — la commande est annulée par NTV.

Le bouton **Passer à l'étape suivante** permet une mise à jour rapide ; la liste déroulante permet de corriger manuellement le statut. Chaque changement est inscrit dans l'historique avec la date et l'acteur (administration NTV). Les données d'historique sont ajoutées sans supprimer les commandes existantes. Pour PostgreSQL, une colonne d'historique est ajoutée si elle n'existe pas ; pour MongoDB, l'historique est conservé dans le document de commande.

**Important :** cette fonction donne à l'administrateur le contrôle des statuts. Elle ne déclenche pas automatiquement d'appel, de SMS ou de WhatsApp au vendeur/livreur ; l'équipe NTV doit les contacter si une confirmation physique est nécessaire.


## Suivi des commandes et profils

- Le catalogue public affiche un module de suivi : le client saisit le numéro de commande et le téléphone utilisé lors de l'achat pour consulter le statut, les articles et l'historique de livraison.
- Les comptes client, vendeur et livreur disposent d'une rubrique **Mon profil** pour téléverser une photo (JPG, PNG, WEBP ou GIF, 6 Mo maximum).
- L'administration dispose également d'une rubrique **Mon profil** pour enregistrer sa photo. Les images sont conservées dans GridFS, dans le bucket `profileImages`, sans toucher aux comptes, produits ou commandes existants.

## Mise à jour – acceptation du règlement avant commande (31/10/2026)

Le formulaire de commande exige désormais l'acceptation explicite du règlement intérieur avant l'envoi. Le serveur vérifie également `termsAccepted === true` (la validation côté navigateur seule ne suffit pas) et enregistre la version ainsi que la date d'acceptation dans la commande. PostgreSQL reçoit les colonnes `terms_accepted`, `terms_version` et `terms_accepted_at` via `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`; MongoDB stocke les champs équivalents dans le document de commande.

La version de règlement affichée est identifiée dans `src/main.jsx` par `termsVersion: "2026-10-31"`. Avant mise en production, faire valider le texte par NTV et un conseil juridique, puis modifier cette version à chaque révision du règlement.

## Version 1.3 – véritable espace client (31/10/2026)

- Le tableau de bord client comprend maintenant une vue d'ensemble avec le nombre de commandes, les commandes en cours et les notifications non lues.
- Le menu client donne un accès direct au catalogue, à l'historique des achats, au suivi des commandes et au service client NTV.
- La rubrique **Mes commandes** affiche les articles, les montants, les dates, les statuts, l'historique des étapes et l'état de livraison. Le client peut actualiser la liste et contacter NTV depuis une commande.
- Le serveur ajoute `GET /api/customer/orders`, réservé au compte client connecté. Il retrouve les commandes existantes avec le numéro de téléphone enregistré au compte, en normalisant les chiffres. Les achats historiques ne sont pas réécrits.
- Lorsqu'un client connecté revient sur le catalogue, son nom, son téléphone et son pays sont préremplis dans le formulaire de commande. Il lui reste à vérifier les coordonnées et à indiquer l'adresse de livraison. Le parcours d'achat invité reste disponible.

**Limite à connaître :** pour retrouver les achats historiques, le numéro de téléphone du compte doit correspondre au numéro utilisé lors de la commande. Les achats invités faits avec un autre numéro ne peuvent pas être attribués automatiquement au compte sans vérification par le service client NTV.

## Version 1.2 – Communication NTV

- `/admin` → **Messagerie & appels** : boîte de réception centralisée des conversations vendeurs et clients. L'administration peut répondre et lancer un appel audio/vidéo vers un vendeur.
- Espace vendeur → **Messages NTV** : ouverture d'une conversation avec l'administration, avec numéro de commande facultatif. Lorsqu'un numéro est fourni, le serveur vérifie que la commande contient bien un article de cette boutique. Le vendeur peut aussi initier un appel audio ou vidéo.
- Espace client → **Messages et service client** : ouverture d'une conversation avec le service client NTV. Le numéro de commande peut être renseigné dans l'objet de la conversation.
- Les messages et conversations sont conservés dans de nouvelles collections MongoDB (`conversations`, `messages`, `calls`). Les notifications de réponse sont ajoutées au centre de notifications du compte. Les comptes, commandes et produits historiques ne sont pas remplacés.
- Les écrans actualisent la boîte de réception par interrogation périodique. Les appels utilisent WebRTC en pair à pair avec signalisation conservée côté serveur. Le navigateur doit autoriser le microphone et, pour la vidéo, la caméra.

**Prérequis d'appels en production :** l'implémentation inclut un serveur STUN public pour établir les connexions courantes. Pour une fiabilité suffisante sur les réseaux mobiles, Wi-Fi d'entreprise et NAT restrictifs, NTV doit configurer un service TURN sécurisé (idéalement avec identifiants temporaires) et réaliser des essais réels entre plusieurs réseaux. Sans TURN, certains appels peuvent échouer à établir le média même si la signalisation fonctionne. Les appels nécessitent HTTPS en production. Les paramètres facultatifs `TURN_URL`, `TURN_USERNAME` et `TURN_CREDENTIAL` sont lus côté serveur et transmis à la configuration WebRTC ; utiliser des identifiants temporaires fournis par le prestataire TURN lorsque cela est possible.

**Limites de cette livraison :** les notifications et messages du service client sont accessibles aux clients connectés à un compte NTV ; le parcours de commande invité reste inchangé. La messagerie n'est pas un système de chat temps réel par WebSocket : elle s'actualise périodiquement. La compilation Vite doit être exécutée après installation des dépendances (`npm install`, puis `npm run build`) avant déploiement.
## Correctif 1.3.1 — suppression des comptes clients

- La suppression depuis l'administration accepte désormais les comptes `customer`, en plus des vendeurs et livreurs.
- Les commandes et historiques financiers sont conservés après suppression du compte.
- Aucun effacement ni migration des commandes existantes n'est effectué par ce correctif.


## Tests de la version 1.4

1. Créer un compte client, vendeur puis livreur en cochant l'acceptation du règlement adapté. Vérifier qu'une inscription sans acceptation est refusée par le serveur.
2. Se connecter avec un ancien compte sans `termsVersion` : l'écran d'acceptation obligatoire doit apparaître et bloquer le reste de l'espace jusqu'à acceptation.
3. Depuis chacun des trois rôles, déposer une réclamation et vérifier le numéro `NTV-REC-...`, l'affichage dans « Mes réclamations » et l'historique.
4. Dans `/admin`, ouvrir l'onglet « Réclamations », répondre au dossier, changer son statut et vérifier que le compte reçoit une notification.
5. Vérifier que les collections `users`, `orders` et `products` ainsi que les commandes historiques sont intactes.

La compilation complète doit être effectuée dans l'environnement de déploiement avec `npm install` puis `npm run build`. La validation réelle des écritures nécessite une base MongoDB de test ou de préproduction.


## Refonte visuelle — Prestige & Excellence (01/11/2026)

- Nouvelle palette discrète : bordeaux `#7B1537`, noir profond `#17151B`, or `#C9A227` et vert émeraude `#174C45`.
- Emblème de marque avec le glyphe astrologique du Scorpion, utilisé de façon discrète dans le logo.
- Bannière d'accueil fortement réduite en hauteur, y compris pour les visuels d'annonces.
- Catalogue général déplacé immédiatement après la bannière afin que les produits soient accessibles sans traverser les rubriques avantages, catégories et boutiques partenaires.
- Boutons, badges, cartes produits, navigation, panier et éléments d'interface harmonisés avec la nouvelle identité.
- Les fonctionnalités métier et les routes API n'ont pas été volontairement modifiées par cette refonte graphique.


## Chantier global NTV — copie de travail (01/11/2026)

La refonte catalogue et les premières mesures de sécurisation sont en cours dans la copie de travail. Le catalogue général adopte une structure compacte (catégories, mise en avant, accompagnement et accès rapide aux produits), avec une rangée de produits réels issus du catalogue, des filtres par catégorie/boutique, un tri et une meilleure adaptation mobile. Le panier est conservé localement après actualisation.

Le serveur limite désormais les tentatives par IP sur l'inscription (8 par 15 minutes), la connexion (10 par 15 minutes) et la création de commandes (20 par heure). Cette protection est locale au processus Node.js ; elle doit être remplacée ou complétée par un stockage partagé si plusieurs instances sont utilisées.

**État de validation :** `node --check server/index.js` et `node --check vite.config.js` réussissent. La compilation Vite n'a pas encore été validée : l'installation des dépendances n'a pas abouti dans l'environnement de travail. Ne pas déployer cette copie avant `npm install` puis `npm run build`, et avant les tests sur base de préproduction.


## Correctifs NTV Prestige 1.8

- Recherche catalogue insensible aux accents, espaces superflus et recherche aussi dans le nom de boutique/vendeur.
- Cartes catalogue compactées pour afficher davantage de produits à l'écran.
- Ouverture des photos en grand format avec navigation entre les deux vues.
- Espace vendeur : sélection directe de deux photos depuis l'appareil (JPG, PNG, WEBP ou GIF, 6 Mo maximum chacune), téléversement sécurisé vers MongoDB GridFS et association aux produits.
- Chaque nouvel article ou modification doit disposer de deux images. Les produits historiques avec une seule image restent visibles mais devront recevoir une deuxième image lors de leur prochaine modification.

Le téléversement nécessite une connexion MongoDB opérationnelle et le déploiement du nouveau serveur. Aucune migration destructive n'est requise : les champs `imageUrl` historiques sont conservés pour compatibilité et le champ `imageUrls` stocke la galerie.

## Identité NTV Mall et communication

- Domaine de marque : `ntvmall.com` (les variantes `www.ntvmall.com` et `ntvmall.com` doivent pointer vers le même déploiement dans le DNS/hébergeur).
- Adresse professionnelle par défaut affichée par l'API : `contact@ntvmall.com` et support : `support@ntvmall.com`. Configurez `PROFESSIONAL_EMAIL` dans l'environnement de production après avoir créé cette boîte chez votre fournisseur de messagerie.
- Le centre de communication actualise les conversations et les appels à intervalle court (3 secondes) et affiche les appels entrants en fenêtre prioritaire. Les médias d'appel utilisent WebRTC; configurez un serveur TURN (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`) pour une connectivité fiable derrière certains réseaux/NAT.
- La matrice d'appels autorisée est appliquée côté serveur : administration vers tous les rôles; vendeur vers administration/livreur; client vers administration/livreur; livreur vers administration/vendeur/client. Les appels directs entre client et vendeur sont interdits. Les médias audio/vidéo utilisent WebRTC et les événements entrants sont transmis par SSE.


### Appels entrants en temps réel

Le serveur expose un flux SSE authentifié (`/api/communications/events` et `/api/admin/communications/events`) pour pousser les événements d'appel sans attendre le rafraîchissement périodique. Les comptes client, vendeur et livreur (`delivery`) peuvent appeler l'administration ; l'administration peut rappeler ces comptes depuis une conversation. Les médias WebRTC restent pair-à-pair. Configurez un serveur TURN (`TURN_URL`, `TURN_USERNAME`, `TURN_CREDENTIAL`) pour améliorer la connectivité derrière certains NAT/firewalls. Le flux SSE est local à une instance ; un déploiement multi-instance nécessite Redis Pub/Sub ou un bus partagé.


## NTV Mall 2.4 — récupération, appels et alertes sonores (01/11/2026)

- Les clients, vendeurs et livreurs peuvent demander la récupération de leur mot de passe depuis l'écran de connexion. La demande est vérifiée par l'administration à partir du nom, de l'e-mail et du téléphone du compte.
- Le tableau de bord admin contient une rubrique « Récupération des mots de passe » avec contrôle obligatoire « Identité vérifiée », puis actions Autoriser / Refuser. L'autorisation émet un code aléatoire à 6 chiffres, valable 15 minutes et à transmettre manuellement par téléphone ou WhatsApp. Le code est stocké sous forme de hachage, à usage unique. Le compte administrateur ne peut pas utiliser ce parcours et doit contacter le développeur.
- Le livreur dispose d'un accès Communication dédié. Les règles d'appels serveur restent : admin vers tous les rôles; vendeur vers admin/livreur; client vers admin/livreur; livreur vers admin/vendeur/client. Les appels directs client-vendeur sont refusés aussi côté API.
- Les appels entrants apparaissent en fenêtre flottante sans changer de page. Une sonnerie répétée est jouée pendant l'appel entrant et un son court distinct accompagne les notifications. Le bouton « Activer le son » doit être actionné une première fois par l'utilisateur, car les navigateurs bloquent la lecture audio automatique avant une interaction. Le réglage est mémorisé sur l'appareil.
- La réception d'appels et de notifications en temps réel nécessite que l'application reste ouverte; les notifications push lorsque le navigateur est fermé nécessitent une configuration Web Push/VAPID séparée.

## NTV Mall PWA (v2.4.0)

The project now includes a Progressive Web App foundation:
- `public/manifest.webmanifest` defines the installable app identity and icons.
- `public/sw.js` registers the service worker, caches the app shell/static assets, provides an offline navigation fallback, and handles incoming Web Push events/clicks.
- `index.html` registers the service worker and includes mobile/Apple install metadata.

### Installation on phones
1. Deploy the site over HTTPS on `ntvmall.com` (service workers require HTTPS, except localhost).
2. Android: open the site in Chrome, choose **Install app** / **Add to Home screen**.
3. iPhone: open the site in Safari, tap **Share**, then **Add to Home Screen**.

### Push notifications
The service worker can display push messages, but production push delivery still requires server-side Web Push subscription handling, VAPID keys, permission/subscription UI, and sending notifications from the backend. This PWA update does not claim those server-side pieces are already configured.
