# NEWS TECHNOLOGY VILLAGE (NTV) — base marketplace

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
