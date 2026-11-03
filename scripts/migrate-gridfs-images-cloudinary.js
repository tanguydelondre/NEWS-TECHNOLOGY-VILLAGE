/**
 * Migration sécurisée GridFS -> Cloudinary (optimisation) -> GridFS.
 * Mode lecture seule par défaut. Exécuter avec --apply après sauvegarde MongoDB.
 * Les vidéos et fichiers non-image sont ignorés.
 */
import 'dotenv/config';
import { MongoClient, GridFSBucket, ObjectId } from 'mongodb';
import { v2 as cloudinary } from 'cloudinary';
import { Readable } from 'node:stream';

const APPLY = process.argv.includes('--apply');
const MAX_BYTES = Number(process.env.MEDIA_MIGRATION_MAX_BYTES || 50 * 1024 * 1024);
const DB_NAME = process.env.MONGODB_DB || 'ntv_boutique';
const BUCKETS = [
  { name: 'productImages', route: '/api/images/' },
  { name: 'profileImages', route: '/api/profile-images/' }
];
const EXCLUDED_COLLECTIONS = new Set([
  'productImages.files', 'productImages.chunks',
  'profileImages.files', 'profileImages.chunks',
  'mediaMigrationJobs'
]);

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Variable manquante : ${name}`);
  return value;
}

function streamToBuffer(stream, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    stream.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) {
        stream.destroy(new Error(`Fichier supérieur à la limite ${maxBytes} octets`));
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

function cloudinaryUpload(buffer, contentType, folder) {
  return new Promise((resolve, reject) => {
    const upload = cloudinary.uploader.upload_stream({
      folder,
      resource_type: 'image',
      use_filename: false,
      unique_filename: true,
      overwrite: false,
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif']
    }, (error, result) => error ? reject(error) : resolve(result));
    Readable.from(buffer).pipe(upload);
  });
}

function transformedUrl(publicId, contentType) {
  // GIF reste en GIF pour préserver son animation. Les autres formats deviennent WebP.
  const outputFormat = contentType === 'image/gif' ? 'gif' : 'webp';
  return cloudinary.url(publicId, {
    secure: true,
    format: outputFormat,
    transformation: [
      { width: 1800, height: 1800, crop: 'limit' },
      { quality: 'auto:good' }
    ]
  });
}

function replaceDeep(value, oldUrl, newUrl) {
  if (typeof value === 'string') return value.split(oldUrl).join(newUrl);
  if (Array.isArray(value)) return value.map(item => replaceDeep(item, oldUrl, newUrl));
  if (value && typeof value === 'object' && !(value instanceof Date) && !(value instanceof ObjectId) && !Buffer.isBuffer(value)) {
    const output = {};
    for (const [key, item] of Object.entries(value)) output[key] = replaceDeep(item, oldUrl, newUrl);
    return output;
  }
  return value;
}

async function replaceReferences(db, oldUrl, newUrl) {
  const names = (await db.listCollections({}, { nameOnly: true }).toArray())
    .map(item => item.name)
    .filter(name => !EXCLUDED_COLLECTIONS.has(name));
  let updatedDocuments = 0;
  for (const name of names) {
    const collection = db.collection(name);
    const cursor = collection.find({});
    for await (const document of cursor) {
      const replaced = replaceDeep(document, oldUrl, newUrl);
      const changed = {};
      for (const [key, value] of Object.entries(replaced)) {
        if (key !== '_id' && JSON.stringify(value) !== JSON.stringify(document[key])) changed[key] = value;
      }
      if (Object.keys(changed).length) {
        await collection.updateOne({ _id: document._id }, { $set: changed });
        updatedDocuments += 1;
      }
    }
  }
  return updatedDocuments;
}

async function main() {
  const mongoUri = requiredEnv('MONGODB_URI');
  if (APPLY) {
    cloudinary.config({
      cloud_name: requiredEnv('CLOUDINARY_CLOUD_NAME'),
      api_key: requiredEnv('CLOUDINARY_API_KEY'),
      api_secret: requiredEnv('CLOUDINARY_API_SECRET'),
      secure: true
    });
  }

  const client = new MongoClient(mongoUri, { maxPoolSize: 3 });
  await client.connect();
  const db = client.db(DB_NAME);
  const jobs = db.collection('mediaMigrationJobs');
  if (APPLY) await jobs.createIndex({ bucket: 1, oldFileId: 1 }, { unique: true });

  let totalImages = 0;
  let totalBytes = 0;
  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const config of BUCKETS) {
      const bucket = new GridFSBucket(db, { bucketName: config.name });
      const files = db.collection(`${config.name}.files`);
      const cursor = files.find({ contentType: /^image\// }).sort({ uploadDate: 1 });
      for await (const file of cursor) {
        totalImages += 1;
        totalBytes += Number(file.length || 0);
        const oldId = file._id;
        const oldIdText = oldId.toString();
        const oldUrl = `${config.route}${oldIdText}`;
        const jobKey = { bucket: config.name, oldFileId: oldIdText };
        const previous = await jobs.findOne(jobKey);
        if (previous?.status === 'done') { skipped += 1; continue; }

        if (!APPLY) {
          console.log(`[APERÇU] ${config.name}/${oldIdText} | ${file.contentType} | ${file.length} octets`);
          continue;
        }
        if (Number(file.length || 0) > MAX_BYTES) {
          console.warn(`[IGNORÉ - trop volumineux] ${oldUrl} (${file.length} octets)`);
          skipped += 1;
          continue;
        }

        let cloudResult;
        let newId;
        try {
          await jobs.updateOne(jobKey, { $set: { ...jobKey, status: 'processing', startedAt: new Date() } }, { upsert: true });
          const original = await streamToBuffer(bucket.openDownloadStream(oldId), MAX_BYTES);
          cloudResult = await cloudinaryUpload(original, file.contentType, `ntvmall-migration/${config.name}`);
          const response = await fetch(transformedUrl(cloudResult.public_id, file.contentType));
          if (!response.ok) throw new Error(`Téléchargement Cloudinary impossible (HTTP ${response.status})`);
          const transformedType = (response.headers.get('content-type') || '').split(';')[0].toLowerCase();
          if (!transformedType.startsWith('image/')) throw new Error(`Type transformé inattendu : ${transformedType}`);
          const optimized = Buffer.from(await response.arrayBuffer());
          if (!optimized.length || optimized.length >= original.length) {
            console.log(`[CONSERVÉ - pas de gain] ${oldUrl} (${original.length} octets)`);
            await cloudinary.uploader.destroy(cloudResult.public_id, { resource_type: 'image', invalidate: true });
            await jobs.updateOne(jobKey, { $set: { status: 'no-savings', checkedAt: new Date(), originalBytes: original.length } });
            skipped += 1;
            continue;
          }

          newId = new ObjectId();
          const newName = `${String(file.filename || 'ntv-image').replace(/[^\w.-]/g, '_')}-optimized`;
          const outputBucket = new GridFSBucket(db, { bucketName: config.name });
          const output = outputBucket.openUploadStreamWithId(newId, newName, {
            contentType: transformedType,
            metadata: { ...(file.metadata || {}), optimizedBy: 'cloudinary', migratedAt: new Date(), sourceFileId: oldIdText }
          });
          await new Promise((resolve, reject) => {
            output.once('error', reject);
            output.once('finish', resolve);
            output.end(optimized);
          });

          const newUrl = `${config.route}${newId.toString()}`;
          const updatedDocuments = await replaceReferences(db, oldUrl, newUrl);
          if (updatedDocuments === 0) {
            await outputBucket.delete(newId);
            await cloudinary.uploader.destroy(cloudResult.public_id, { resource_type: 'image', invalidate: true });
            await jobs.updateOne(jobKey, { $set: { status: 'unreferenced', checkedAt: new Date() } });
            skipped += 1;
            console.warn(`[NON RÉFÉRENCÉ - ancienne image conservée] ${oldUrl}`);
            continue;
          }

          await bucket.delete(oldId);
          // La suppression de la copie Cloudinary est secondaire : elle ne doit pas annuler une migration déjà validée.
          try { await cloudinary.uploader.destroy(cloudResult.public_id, { resource_type: 'image', invalidate: true }); } catch (cleanupError) {
            console.warn(`[AVERTISSEMENT] Copie Cloudinary non supprimée (${cloudResult.public_id}) : ${cleanupError.message}`);
          }
          await jobs.updateOne(jobKey, { $set: {
            status: 'done', completedAt: new Date(), newFileId: newId.toString(),
            originalBytes: original.length, optimizedBytes: optimized.length,
            updatedDocuments, cloudinaryPublicId: cloudResult.public_id
          } });
          migrated += 1;
          console.log(`[OK] ${oldUrl} -> ${newUrl} | ${original.length} -> ${optimized.length} octets | ${updatedDocuments} documents`);
        } catch (error) {
          failed += 1;
          console.error(`[ÉCHEC] ${oldUrl}: ${error.message}`);
          await jobs.updateOne(jobKey, { $set: { status: 'error', error: error.message, failedAt: new Date() } }, { upsert: true });
          // On ne supprime jamais le fichier source en cas d'erreur.
          if (cloudResult?.public_id) {
            try { await cloudinary.uploader.destroy(cloudResult.public_id, { resource_type: 'image', invalidate: true }); } catch {}
          }
        }
      }
    }
  } finally {
    await client.close();
  }

  console.log('\n--- BILAN ---');
  console.log(`Images examinées : ${totalImages}`);
  console.log(`Volume source : ${(totalBytes / 1024 / 1024).toFixed(2)} Mo`);
  console.log(`Migrées : ${migrated} | Ignorées : ${skipped} | Échecs : ${failed}`);
  if (!APPLY) console.log('\nAucune modification effectuée. Relancer avec --apply uniquement après sauvegarde MongoDB.');
}

main().catch(error => { console.error('Migration interrompue :', error); process.exitCode = 1; });
