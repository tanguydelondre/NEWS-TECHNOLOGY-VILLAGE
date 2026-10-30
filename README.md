# NEWS TECHNOLOGY VILLAGE — Boutique officielle

Boutique de démarrage en français pour trois activités :
- Motos et scooters électriques
- Panneaux et équipements solaires
- Électroménager et équipements électriques
- Matériel électrique
- Toiture et matériaux de construction

## Ce qui fonctionne dans ce prototype

- Interface responsive pour ordinateur et téléphone
- Catalogue de démonstration, recherche et filtres
- Panier avec quantités et suppression
- Formulaire de commande
- Préparation d'une demande et ouverture de WhatsApp
- API Express pour le catalogue et la validation des commandes
- Enregistrement des commandes dans PostgreSQL si `DATABASE_URL` est configurée
- Fichier `render.yaml` pour faciliter le déploiement sur Render

## Avant de publier pour de vrais clients

Les produits, emojis, descriptions et prix sont des données de démonstration. Remplace-les par les vrais produits et prix, vérifie les coordonnées de contact et teste les commandes. Le formulaire ne traite pas réellement les paiements Mobile Money ou par carte : il enregistre une préférence et prépare un message WhatsApp. Les produits, prix et images restent des exemples de démonstration et doivent être validés/remplacés avant toute mise en vente. Il faudra intégrer un prestataire de paiement compatible et tester son mode de production avant d'accepter des paiements.

Cette version ne comprend pas encore d'authentification administrateur ni d'espace vendeur multi-vendeurs. Ne pas exposer de routes d'administration publiques. Ces modules doivent être développés avec authentification, autorisations et tests avant utilisation en production.

## Lancer en local

Prérequis : Node.js 20 ou version compatible et npm.

```bash
npm install
cp .env.example .env
npm run dev
```

Le frontend Vite sera disponible sur `http://localhost:5173`. Le proxy API attend Express sur le port `10000`; dans un second terminal, exécutez :

```bash
npm start
```

Pour une prévisualisation de production :

```bash
npm run build
npm start
```

## Déployer sur GitHub et Render

1. Créez un dépôt GitHub nommé `news-technology-village`.
2. Envoyez-y tous les fichiers de ce projet.
3. Dans Render, choisissez **New + → Blueprint** et connectez le dépôt GitHub.
4. Render lira `render.yaml`. Vérifiez les paramètres avant de lancer le déploiement.
5. Pour conserver les commandes entre les redémarrages, créez une base PostgreSQL et ajoutez `DATABASE_URL` aux variables d'environnement du service web.
6. Vérifiez `/api/health` et réalisez une commande de test.
7. Remplacez les données de démonstration avant d'annoncer la boutique.

## Variables d'environnement

- `PORT` : défini automatiquement par Render
- `WHATSAPP_NUMBER` : numéro international, chiffres uniquement, sans `+`
- `DATABASE_URL` : URL de connexion PostgreSQL, facultative en développement

## Produits de démonstration

Les données sont définies dans `server/index.js`, dans le tableau `products`. Les prix sont indicatifs et doivent être modifiés avant la publication.
