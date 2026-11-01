# NTV Prestige v1.9 — Panneau publicitaire dynamique

## Nouveautés
- Le panneau principal du catalogue conserve son format et ses dimensions, mais accepte désormais une image ou une vidéo en arrière-plan.
- Les annonces actives défilent automatiquement toutes les 7 secondes.
- Le texte, la description et le lien de destination restent configurables depuis Administration > Publicités.
- L'administration permet de sélectionner un fichier local (ordinateur/téléphone) au lieu de saisir uniquement une URL.
- Formats image : JPG, PNG, WEBP, GIF. Vidéo : MP4, WEBM ou MOV/QuickTime. Limite : 40 Mo par média.
- Les fichiers sont stockés dans GridFS MongoDB, servis via /api/images/:id, et les métadonnées restent dans siteSettings/catalogAnnouncements.
- Le paiement à la livraison et les données métier existantes ne sont pas modifiés.

## Mise en service
1. Déployer le code serveur et le build frontend ensemble.
2. Vérifier que MongoDB/GridFS est configuré comme dans la version précédente.
3. Ouvrir Administration > Publicités, ajouter une annonce, choisir une image ou vidéo, compléter titre/description/lien, puis enregistrer.
4. Activer l'annonce pour l'afficher sur le catalogue.

Les annonces existantes avec mediaUrl HTTPS restent compatibles. Les vidéos sont lues en mode muet et en boucle pour respecter les règles des navigateurs.
