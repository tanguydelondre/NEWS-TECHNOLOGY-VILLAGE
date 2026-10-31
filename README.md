# NEWS TECHNOLOGY VILLAGE (NTV) — base marketplace

Application React/Vite + API Express. Cette version conserve la boutique, le catalogue, les commandes, l'administration des produits et ajoute la première fondation des comptes utilisateurs.

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

## Important : périmètre de cette livraison

Cette version est une fondation fonctionnelle des comptes et de la validation. Elle ne prétend pas encore livrer tous les modules d'une marketplace complète : les boutiques individuelles, la séparation des produits et commandes par vendeur, les abonnements payants, le calcul et reversement des commissions, l'affectation des livraisons et le paiement électronique devront faire l'objet des prochaines phases. Les produits de démonstration existants ne sont pas automatiquement attribués à un vendeur.

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
