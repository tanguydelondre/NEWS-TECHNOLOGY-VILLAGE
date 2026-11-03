# Migration sécurisée des images NTVMall (GridFS -> Cloudinary -> GridFS)

Cette migration optimise les images déjà stockées dans les buckets GridFS `productImages` et `profileImages`, puis remet les fichiers optimisés dans le même bucket GridFS. Les URLs `/api/images/:id` et `/api/profile-images/:id` sont mises à jour dans les documents MongoDB. Les vidéos et fichiers non-image ne sont pas modifiés.

## Garanties et limites
- Le script est en **aperçu sans écriture par défaut**. `--apply` est obligatoire pour modifier les données.
- Il traite un fichier à la fois et limite la mémoire à un fichier (50 Mo par défaut).
- Il crée le nouveau fichier GridFS, met à jour les références, puis seulement supprime l'ancien fichier.
- Si une étape échoue, le fichier source n'est pas supprimé.
- Les images GIF restent au format GIF pour préserver leur animation. Les autres images sont converties en WebP et limitées à 1800 x 1800 pixels.
- Les images sans référence trouvée, les fichiers trop volumineux et les fichiers dont l'optimisation n'apporte aucun gain sont conservés.
- Le journal `mediaMigrationJobs` permet de ne pas retraiter les fichiers marqués `done`.
- Les documents de toutes les collections applicatives sont parcourus pour retrouver les URLs concernées. Cela peut prendre du temps sur une grande base.

## Étape 0 — sauvegarde obligatoire
Avant toute exécution, faire une sauvegarde complète de la base MongoDB Atlas (snapshot Atlas ou `mongodump`). Vérifier que la sauvegarde est exploitable. Ne pas lancer la migration pendant une période de forte activité.

## Étape 1 — configurer les secrets
Installer les dépendances (`npm install`) puis configurer dans un terminal sécurisé ou dans l'environnement d'exécution :
- `MONGODB_URI`
- `MONGODB_DB` (facultatif, défaut `ntv_boutique`)
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

Ne jamais mettre `CLOUDINARY_API_SECRET` dans React, GitHub, ni dans un message. Pour un lancement local, utiliser un `.env` ignoré par Git. Ne pas lancer le script de migration dans la commande de démarrage Render.

## Étape 2 — aperçu sans modification
```bash
npm run media:migration:preview
```
Le mode aperçu compte et liste les images des deux buckets. Il ne contacte pas Cloudinary et ne modifie aucun fichier.

## Étape 3 — migration réelle
Après sauvegarde, vérifier le quota Cloudinary et lancer depuis un ordinateur/terminal contrôlé, pas automatiquement au démarrage du serveur :
```bash
npm run media:migration:apply
```
Le script est séquentiel. Laisser le terminal finir et conserver le bilan.

## Étape 4 — contrôles
- Ouvrir des produits anciens et vérifier toutes leurs photos.
- Vérifier les avatars des clients, vendeurs et administrateurs.
- Vérifier les images des annonces et confirmer que les vidéos sont intactes.
- Vérifier les URLs `/api/images/...` et `/api/profile-images/...` dans les pages.
- Contrôler `mediaMigrationJobs` et le bilan final avant de considérer la migration terminée.

## Important : nouvelles images après la migration
Ce script migre uniquement les images existantes. Les routes actuelles d'upload doivent ensuite être adaptées pour optimiser chaque nouvelle image avant son écriture GridFS. Cette modification doit être livrée séparément et testée, afin qu'aucune image future ne contourne la règle. Tant que cette seconde étape n'est pas déployée, les nouveaux uploads continuent selon le fonctionnement actuel.

## Reprise après incident
Relancer le script après correction de la cause. Les éléments `done` ne seront pas retraités. Les fichiers sources des opérations en échec restent en place. Examiner les éventuels fichiers orphelins avant tout nettoyage manuel.
