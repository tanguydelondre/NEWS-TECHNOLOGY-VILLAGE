# NEWS TECHNOLOGY VILLAGE — Boutique officielle

Boutique React/Vite avec API Express et espace d'administration intégré à `/admin`.

## Administration des produits

L'espace `/admin` permet d'ajouter, modifier et supprimer les produits, de fixer un prix ou de choisir « Prix sur devis », et de télécharger une photo depuis un ordinateur ou un téléphone. Les produits et images sont enregistrés dans MongoDB Atlas (les images utilisent GridFS).

## Configuration obligatoire sur Render

Dans Render → service web → Environment, ajouter :

- `MONGODB_URI` : URI de connexion MongoDB Atlas (secret, ne jamais l'envoyer dans GitHub).
- `MONGODB_DB` : `ntv_boutique` (ou un nom choisi).
- `ADMIN_USERNAME` : identifiant administrateur unique.
- `ADMIN_PASSWORD` : mot de passe fort, unique, idéalement 16 caractères ou plus.
- `WHATSAPP_NUMBER` : numéro international, chiffres seulement.
- `DATABASE_URL` reste facultative pour l'enregistrement PostgreSQL des commandes.

Dans MongoDB Atlas, créer un utilisateur de base de données avec un mot de passe, autoriser la connexion réseau du service Render (ou une règle réseau adaptée), et copier l'URI de connexion dans la variable Render `MONGODB_URI`. Ne mettez jamais cette URI dans un fichier commité sur GitHub.

Après le déploiement, ouvrir `https://VOTRE-SITE/admin`, se connecter, puis ajouter ou modifier un produit. Au premier démarrage MongoDB, les produits de démonstration sont importés automatiquement si la collection est vide. Remplacez leurs prix et photos par les données réelles.

## Sécurité et limites

- L'API d'administration est protégée par une authentification HTTP Basic sur HTTPS. Le navigateur conserve l'identifiant de la session de cet onglet via `sessionStorage`; utilisez un mot de passe fort et ne partagez pas vos accès.
- Les images acceptées sont JPG, PNG, WEBP ou GIF jusqu'à 6 Mo chacune.
- Les images sont stockées dans MongoDB GridFS. Configurez des sauvegardes régulières MongoDB Atlas.
- Le site doit être testé avant la mise en production. Les moyens de paiement électroniques ne sont pas activés par cette modification; ils nécessitent toujours un prestataire de paiement connecté.

## Développement

```bash
npm install
cp .env.example .env
npm run build
npm start
```

Sans `MONGODB_URI`, le catalogue public utilise les produits de démonstration et l'espace admin ne permet pas d'enregistrer les changements. Configurez MongoDB avant de publier l'administration.
