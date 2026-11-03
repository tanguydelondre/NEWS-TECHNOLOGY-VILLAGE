
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";
import { MongoClient, GridFSBucket, ObjectId } from "mongodb";
import multer from "multer";
import crypto from "crypto";
dotenv.config();

// Une ancienne CLOUDINARY_URL mal formée ne doit pas empêcher le serveur de démarrer.
// Si elle n'utilise pas le protocole Cloudinary officiel, on l'ignore et on utilise
// les trois variables séparées (CLOUDINARY_CLOUD_NAME/API_KEY/API_SECRET).
if (process.env.CLOUDINARY_URL && !/^cloudinary:\/\//i.test(process.env.CLOUDINARY_URL.trim())) {
  console.warn("CLOUDINARY_URL ignorée : format invalide. Utilisation des variables Cloudinary séparées.");
  delete process.env.CLOUDINARY_URL;
}
const { v2: cloudinary } = await import("cloudinary");

// Les nouveaux médias sont normalisés avant stockage dans Cloudinary.
if (process.env.CLOUDINARY_URL) {
  cloudinary.config({ secure: true });
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
}

function cloudinaryReady() {
  const c = cloudinary.config();
  return Boolean(c.cloud_name && c.api_key && c.api_secret);
}

function uploadOptimizedMedia(buffer, { folder, resourceType = "image" } = {}) {
  return new Promise((resolve, reject) => {
    if (!cloudinaryReady()) return reject(new Error("Cloudinary n'est pas configuré."));
    // Le hash du contenu donne un public_id stable : renvoyer exactement le même
    // fichier ne crée pas un nouvel asset à chaque tentative.
    const targetFolder = folder || "ntv-mall";
    const publicId = crypto.createHash("sha256").update(`${targetFolder}/`).update(buffer).digest("hex").slice(0, 40);
    // Les transformations d'upload normalisent le fichier stocké ; les mêmes
    // contraintes sont aussi appliquées à l'URL de livraison pour les navigateurs.
    // Pour les vidéos, on force un MP4/H.264 compatible et un débit plafonné.
    const transformation = resourceType === "video"
      ? [{
          width: 720,
          crop: "limit",
          quality: "auto:low",
          video_codec: "h264",
          bit_rate: "900k",
          audio_codec: "aac",
          audio_frequency: "44100",
          format: "mp4"
        }]
      : [{
          width: 1400,
          height: 1400,
          crop: "limit",
          quality: "auto:eco",
          fetch_format: "webp"
        }];
    const options = {
      folder: targetFolder,
      resource_type: resourceType,
      transformation,
      tags: ["ntv-mall", "optimized"],
      public_id: publicId,
      overwrite: true,
      invalidate: true,
      unique_filename: false
    };
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) return reject(error);
      if (!result?.secure_url || !result?.public_id) return reject(new Error("Réponse Cloudinary incomplète."));
      const optimizedDeliveryUrl = cloudinary.url(result.public_id, {
        secure: true,
        resource_type: result.resource_type,
        quality: resourceType === "video" ? "auto:low" : "auto:eco",
        ...(resourceType === "video"
          ? { width: 720, crop: "limit", video_codec: "h264", bit_rate: "900k", audio_codec: "aac", audio_frequency: "44100", format: "mp4" }
          : { width: 1400, height: 1400, crop: "limit", fetch_format: "auto" })
      });
      resolve({
        url: optimizedDeliveryUrl,
        originalUrl: result.secure_url,
        publicId: result.public_id,
        format: result.format,
        bytes: result.bytes,
        resourceType: result.resource_type
      });
    });
    stream.on("error", reject);
    stream.end(buffer);
  });
}

async function deleteCloudinaryAsset(resourceType, publicId) {
  if (!publicId || !String(publicId).startsWith("ntv-mall/")) return;
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: "upload", invalidate: true });
}

async function deleteCloudinaryTag(resourceType, tag) {
  const result = await cloudinary.api.delete_resources_by_tag(tag, { resource_type: resourceType, type: "upload" });
  return Object.values(result.deleted || {}).filter(status => status === "deleted" || status === "not_found").length;
}

async function deleteCloudinaryPrefix(resourceType, prefix) {
  let nextCursor;
  let deleted = 0;
  do {
    const result = await cloudinary.api.delete_resources_by_prefix(prefix, {
      resource_type: resourceType,
      type: "upload",
      ...(nextCursor ? { next_cursor: nextCursor } : {})
    });
    deleted += Object.values(result.deleted || {}).filter(status => status === "deleted" || status === "not_found").length;
    nextCursor = result.next_cursor;
  } while (nextCursor);
  return deleted;
}


const { Pool } = pg;
const app = express();
// Render est placé derrière un proxy HTTPS ; cette option permet de lire l'IP client.
if (process.env.RENDER) app.set("trust proxy", 1);
const port = process.env.PORT || 10000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../dist");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// Canal temps réel SSE pour les événements de communication (appels/messages).
// Connexions locales à cette instance ; pour plusieurs instances, utiliser Redis Pub/Sub.
const realtimeClients = new Map();
function publishRealtime(recipientId, event) {
  const key = String(recipientId || "");
  const clients = realtimeClients.get(key);
  if (!clients) return;
  const payload = `data: ${JSON.stringify({ ...event, at: new Date().toISOString() })}\n\n`;
  for (const res of clients) { try { res.write(payload); } catch {} }
}
function openRealtimeStream(req, res, recipientId) {
  res.status(200);
  res.set({ "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive", "X-Accel-Buffering": "no" });
  res.flushHeaders?.();
  res.write(`data: ${JSON.stringify({ type: "ready", at: new Date().toISOString() })}\n\n`);
  const key = String(recipientId);
  if (!realtimeClients.has(key)) realtimeClients.set(key, new Set());
  realtimeClients.get(key).add(res);
  const heartbeat = setInterval(() => { try { res.write(": keepalive\n\n"); } catch {} }, 20000);
  req.on("close", () => { clearInterval(heartbeat); const set = realtimeClients.get(key); if (set) { set.delete(res); if (!set.size) realtimeClients.delete(key); } });
}

// Limitation basique des tentatives sensibles par adresse IP.
// En déploiement multi-instance, compléter par un stockage partagé (Redis).
const requestBuckets = new Map();
function rateLimit({ scope, windowMs, max, message }) {
  return (req, res, next) => {
    const now = Date.now();
    const ip = String(req.ip || req.socket?.remoteAddress || "unknown");
    const key = `${scope}:${ip}`;
    let bucket = requestBuckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0, windowMs };
    }
    bucket.count += 1;
    requestBuckets.set(key, bucket);
    if (requestBuckets.size > 5000) {
      for (const [address, value] of requestBuckets) {
        if (now - value.startedAt >= value.windowMs) requestBuckets.delete(address);
      }
    }
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, max - bucket.count)));
    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000))));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
const authRegisterLimit = rateLimit({
  scope: "register",
  windowMs: 15 * 60 * 1000,
  max: 8,
  message: "Trop de tentatives de création de compte. Réessayez dans 15 minutes."
});
const authLoginLimit = rateLimit({
  scope: "login",
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: "Trop de tentatives de connexion. Réessayez dans 15 minutes."
});
const passwordRecoveryRequestLimit = rateLimit({
  scope: "password-recovery-request", windowMs: 60 * 60 * 1000, max: 5,
  message: "Trop de demandes de récupération. Réessayez plus tard."
});
const passwordRecoveryResetLimit = rateLimit({
  scope: "password-recovery-reset", windowMs: 15 * 60 * 1000, max: 8,
  message: "Trop de tentatives de validation. Réessayez dans 15 minutes."
});
const orderCreateLimit = rateLimit({
  scope: "orders",
  windowMs: 60 * 60 * 1000,
  max: 20,
  message: "Trop de demandes de commande depuis cette connexion. Réessayez plus tard."
});

// --------------------------------------------------
// PRODUITS DE DÉMONSTRATION
// --------------------------------------------------

const demoProducts = [
  { id: "moto-1", name: "Scooter électrique urbain", category: "Mobilité électrique", price: 650000, priceType: "fixed", emoji: "🛵", description: "Scooter électrique pour les déplacements quotidiens.", badge: "Populaire", stock: 8 },
  { id: "helmet-1", name: "Casque de protection", category: "Mobilité électrique", price: 25000, priceType: "fixed", emoji: "🪖", description: "Casque de protection pour vos déplacements.", stock: 25 },
  { id: "battery-1", name: "Batterie solaire", category: "Énergie solaire", price: 185000, priceType: "fixed", emoji: "🔋", description: "Batterie pour installation solaire. Capacité à confirmer selon le modèle.", stock: 10 },
  { id: "panel-1", name: "Panneau solaire", category: "Énergie solaire", price: 85000, priceType: "fixed", emoji: "☀️", description: "Panneau photovoltaïque. Puissance à confirmer selon le modèle.", stock: 15 },
  { id: "inverter-1", name: "Onduleur solaire", category: "Énergie solaire", price: 145000, priceType: "fixed", emoji: "⚡", description: "Onduleur pour système solaire. Caractéristiques à confirmer.", stock: 6 },
  { id: "fridge-1", name: "Réfrigérateur", category: "Équipements électriques", price: 275000, priceType: "fixed", emoji: "🧊", description: "Réfrigérateur domestique. Modèle et capacité à confirmer.", stock: 4 },
  { id: "ac-1", name: "Climatiseur", category: "Équipements électriques", price: 220000, priceType: "fixed", emoji: "❄️", description: "Climatiseur. Puissance et modèle à confirmer.", stock: 5 },
  { id: "generator-1", name: "Groupe électrogène", category: "Équipements électriques", price: 480000, priceType: "fixed", emoji: "🔌", description: "Groupe électrogène. Puissance à confirmer selon le modèle.", stock: 3 },
  { id: "roof-1", name: "Métro tuile", category: "Matériaux de toiture", price: 6500, priceType: "fixed", emoji: "🏠", description: "Élément de toiture. Prix indicatif par unité, à confirmer.", stock: 100 },
  { id: "roof-2", name: "Bac de toiture", category: "Matériaux de toiture", price: 5500, priceType: "fixed", emoji: "🏗️", description: "Bac de toiture. Dimensions et prix à confirmer.", stock: 100 },
  { id: "roof-3", name: "Faîtière", category: "Matériaux de toiture", price: 4500, priceType: "fixed", emoji: "🧱", description: "Accessoire de finition pour toiture. Prix à confirmer.", stock: 60 }
];

// --------------------------------------------------
// CONNEXIONS AUX BASES DE DONNÉES
// --------------------------------------------------

let mongoClient = null;
let db = null;
let imageBucket = null;
let profileBucket = null;
let mongoReady = Promise.resolve(false);

if (process.env.MONGODB_URI) {
  mongoClient = new MongoClient(process.env.MONGODB_URI);

  mongoReady = mongoClient.connect().then(async () => {
    db = mongoClient.db(process.env.MONGODB_DB || "ntv_boutique");
    imageBucket = new GridFSBucket(db, { bucketName: "productImages" });
    profileBucket = new GridFSBucket(db, { bucketName: "profileImages" });

    const count = await db.collection("products").countDocuments();

    if (count === 0) {
      await db.collection("products").insertMany(
        demoProducts.map(product => ({
          ...product,
          vendorId: null,
          createdAt: new Date(),
          updatedAt: new Date()
        }))
      );
    }

    await db.collection("products").createIndex({ id: 1 }, { unique: true });
    await db.collection("products").createIndex({ vendorId: 1, createdAt: -1 });
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("users").createIndex({ role: 1, status: 1 });
    await db.collection("users").createIndex({ storeSlug: 1 }, { unique: true, sparse: true });
    await db.collection("orders").createIndex({ createdAt: -1 });
    await db.collection("orders").createIndex({ orderId: 1 }, { unique: true });
    await db.collection("orders").createIndex({ deliveryStatus: 1, createdAt: -1 });
    await db.collection("conversations").createIndex({ participants: 1, lastMessageAt: -1 });
    await db.collection("conversations").createIndex({ type: 1, orderId: 1 });
    await db.collection("messages").createIndex({ conversationId: 1, createdAt: 1 });
    await db.collection("calls").createIndex({ status: 1, createdAt: -1 });
    await db.collection("publicReviews").createIndex({ status: 1, createdAt: -1 });
    await db.collection("calls").createIndex({ callerId: 1, calleeId: 1, status: 1 });
    await db.collection("passwordRecoveryRequests").createIndex({ userId: 1, status: 1, requestedAt: -1 });
    await db.collection("complaints").createIndex({ userId: 1, createdAt: -1 });
    await db.collection("complaints").createIndex({ status: 1, createdAt: -1 });
    await db.collection("complaints").createIndex({ reference: 1 }, { unique: true });

    console.log("MongoDB connecté; catalogue, comptes et boutiques prêts.");
    return true;
  }).catch(error => {
    console.error("Connexion MongoDB impossible:", error.message);
    return false;
  });
}

let pool = null;
let postgresReady = Promise.resolve(false);

if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false }
  });

  postgresReady = pool.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      country TEXT NOT NULL,
      address TEXT NOT NULL,
      items JSONB NOT NULL,
      total BIGINT NOT NULL,
      payment_method TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'À confirmer',
      status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).then(async () => {
    await pool.query(`
      ALTER TABLE orders
      ADD COLUMN IF NOT EXISTS stock_policy TEXT,
      ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS terms_version TEXT,
      ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS delivery_id TEXT,
      ADD COLUMN IF NOT EXISTS delivery_name TEXT,
      ADD COLUMN IF NOT EXISTS delivery_status TEXT NOT NULL DEFAULT 'unassigned',
      ADD COLUMN IF NOT EXISTS delivery_assigned_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS delivery_updated_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS seller_confirmations JSONB NOT NULL DEFAULT '{}'::jsonb
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS orders_delivery_status_created_idx ON orders (delivery_status, created_at DESC)`);
    console.log("PostgreSQL connecté; commandes prêtes.");
    return true;
  }).catch(error => {
    console.error("Initialisation PostgreSQL:", error.message);
    return false;
  });
}

// --------------------------------------------------
// OUTILS ET SÉCURITÉ
// --------------------------------------------------

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    callback(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype));
  }
});

const announcementMediaUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
  fileFilter: (_req, file, callback) => {
    callback(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype) || /^video\/(mp4|webm|quicktime)$/.test(file.mimetype));
  }
});

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function adminAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Basic\s+(.+)$/i);

  let username = "";
  let password = "";

  if (match) {
    try {
      [username, password] = Buffer
        .from(match[1], "base64")
        .toString()
        .split(/:(.*)/s)
        .slice(0, 2);
    } catch {}
  }

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return res.status(503).json({
      error: "L'administration n'est pas configurée. Ajoutez ADMIN_USERNAME et ADMIN_PASSWORD dans Render."
    });
  }

  if (
    !safeEqual(username, process.env.ADMIN_USERNAME) ||
    !safeEqual(password, process.env.ADMIN_PASSWORD)
  ) {
    return res.status(401).json({
      error: "Identifiant ou mot de passe incorrect."
    });
  }

  next();
}

function requireMongo(_req, res, next) {
  if (!db || !imageBucket) {
    return res.status(503).json({
      error: "La base de données n'est pas encore connectée. Vérifiez MONGODB_URI dans Render."
    });
  }
  next();
}

function requireUsersDb(_req, res, next) {
  if (!db) {
    return res.status(503).json({
      error: "Le service de comptes nécessite une connexion MongoDB."
    });
  }
  next();
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 70);
}

function cleanProduct(input, existing = {}) {
  const name = String(input.name || "").trim().slice(0, 160);
  const category = String(input.category || "").trim().slice(0, 100);
  const priceType = input.priceType === "quote" ? "quote" : "fixed";
  const price = priceType === "quote" ? 0 : Number(input.price);

  if (
    !name ||
    !category ||
    (priceType === "fixed" && (!Number.isFinite(price) || price < 0))
  ) {
    throw new Error("Nom, catégorie et prix valide obligatoires.");
  }

  return {
    ...existing,
    name,
    category,
    price,
    priceType,
    description: String(input.description || "").trim().slice(0, 1000),
    emoji: String(input.emoji || "📦").slice(0, 12),
    badge: String(input.badge || "").trim().slice(0, 60),
    stock: Math.max(0, Number.parseInt(input.stock || "0", 10) || 0),
    imageUrls: (() => {
      const supplied = Array.isArray(input.imageUrls)
        ? input.imageUrls
        : (input.imageUrl ? [input.imageUrl] : (Array.isArray(existing.imageUrls) ? existing.imageUrls : (existing.imageUrl ? [existing.imageUrl] : [])));
      return supplied.filter(url => typeof url === "string" && url.trim()).slice(0, 2).map(url => url.slice(0, 500));
    })(),
    imageUrl: String((Array.isArray(input.imageUrls) && input.imageUrls[0]) || input.imageUrl || (Array.isArray(existing.imageUrls) && existing.imageUrls[0]) || existing.imageUrl || "").slice(0, 500),
    updatedAt: new Date()
  };
}

// --------------------------------------------------
// AUTHENTIFICATION DES UTILISATEURS
// --------------------------------------------------

const tokenSecret = process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD;

function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");

    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) return reject(error);
      resolve(`${salt}:${key.toString("hex")}`);
    });
  });
}

function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [salt, keyHex] = String(stored || "").split(":");

    if (!salt || !keyHex) return resolve(false);

    crypto.scrypt(password, salt, 64, (error, key) => {
      if (error) return reject(error);
      resolve(safeEqual(key.toString("hex"), keyHex));
    });
  });
}

function signToken(user) {
  if (!tokenSecret || tokenSecret.length < 16) {
    throw new Error("AUTH_SECRET doit contenir au moins 16 caractères.");
  }

  const payload = Buffer.from(JSON.stringify({
    sub: user._id.toString(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000
  })).toString("base64url");

  const signature = crypto
    .createHmac("sha256", tokenSecret)
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

async function authenticate(req, res, next) {
  try {
    if (!db) {
      return res.status(503).json({
        error: "La base de données des comptes est indisponible."
      });
    }

    const token = String(req.headers.authorization || "")
      .replace(/^Bearer\s+/i, "");

    const [payload, signature] = token.split(".");

    if (!payload || !signature || !tokenSecret) {
      return res.status(401).json({
        error: "Veuillez vous connecter."
      });
    }

    const expected = crypto
      .createHmac("sha256", tokenSecret)
      .update(payload)
      .digest("base64url");

    if (!safeEqual(signature, expected)) {
      return res.status(401).json({
        error: "Session invalide. Reconnectez-vous."
      });
    }

    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8")
    );

    if (!data.exp || data.exp < Date.now() || !ObjectId.isValid(data.sub)) {
      return res.status(401).json({
        error: "Session expirée ou invalide. Reconnectez-vous."
      });
    }

    // On recharge le compte à chaque requête protégée.
    // Un compte suspendu ou refusé perd donc immédiatement son accès.
    const user = await db.collection("users").findOne({
      _id: new ObjectId(data.sub)
    });

    if (!user || user.status !== "active") {
      return res.status(401).json({
        error: "Compte introuvable ou inactif."
      });
    }

    req.user = user;
    req.auth = {
      sub: user._id.toString(),
      role: user.role
    };

    next();
  } catch (error) {
    console.error("Authentification:", error.message);
    return res.status(401).json({
      error: "Session invalide."
    });
  }
}

const publicUser = user => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  phone: user.phone,
  country: user.country,
  role: user.role,
  status: user.status,
  businessName: user.businessName || "",
  businessDescription: user.businessDescription || "",
  storeSlug: user.storeSlug || "",
  plan: user.plan || "commission",
  subscriptionStatus: user.subscriptionStatus || (user.plan === "commission" ? "not_required" : "pending_payment"),
  subscriptionStartedAt: user.subscriptionStartedAt || null,
  subscriptionExpiresAt: user.subscriptionExpiresAt || null,
  subscriptionPaidAt: user.subscriptionPaidAt || null,
  subscriptionPayments: user.subscriptionPayments || [],
  notifications: (user.notifications || []).slice(-10).reverse(),
  deliveryZones: user.deliveryZones || "",
  createdAt: user.createdAt,
  profileImageUrl: user.profileImageUrl || "",
  termsAccepted: user.termsAccepted === true,
  termsVersion: user.termsVersion || ""
});

// --------------------------------------------------
// PROFILS ET PHOTOS DE PROFIL
// --------------------------------------------------

app.post("/api/profile/avatar", authenticate, upload.single("image"), async (req, res) => {
  try {
    if (!db || !req.file) return res.status(400).json({ error: "Choisissez une image JPG, PNG, WEBP ou GIF (6 Mo maximum)." });
    const previous = await db.collection("users").findOne({ _id: req.user._id }, { projection: { profileImagePublicId: 1 } });
    const media = await uploadOptimizedMedia(req.file.buffer, { folder: "ntv-mall/profiles" });
    await db.collection("users").updateOne(
      { _id: req.user._id },
      { $set: { profileImageUrl: media.url, profileImagePublicId: media.publicId, updatedAt: new Date() } }
    );
    if (previous?.profileImagePublicId && previous.profileImagePublicId !== media.publicId) {
      await deleteCloudinaryAsset("image", previous.profileImagePublicId).catch(error => console.warn("Ancienne photo vendeur non supprimée:", error.message));
    }
    const updated = await db.collection("users").findOne({ _id: req.user._id });
    res.json({ ok: true, user: publicUser(updated), media: { bytes: media.bytes, format: media.format } });
  } catch (error) {
    console.error("Upload avatar Cloudinary:", error.message);
    res.status(500).json({ error: "Impossible d'optimiser ou d'enregistrer la photo. Vérifiez Cloudinary dans Render." });
  }
});

app.get("/api/profile-images/:id", async (req, res) => {
  try {
    if (!profileBucket || !ObjectId.isValid(req.params.id)) return res.status(404).end();
    const id = new ObjectId(req.params.id);
    const file = await db.collection("profileImages.files").findOne({ _id: id });
    if (!file) return res.status(404).end();
    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Cache-Control", "public, max-age=86400");
    profileBucket.openDownloadStream(id).on("error", () => {
      if (!res.headersSent) res.status(404).end();
    }).pipe(res);
  } catch { if (!res.headersSent) res.status(500).end(); }
});

app.get("/api/admin/profile", adminAuth, async (_req, res) => {
  try {
    const profile = db ? await db.collection("settings").findOne({ _id: "admin-profile" }) : null;
    res.json({ profileImageUrl: profile?.profileImageUrl || "" });
  } catch { res.status(500).json({ error: "Impossible de charger le profil administrateur." }); }
});

// Nettoyage volontaire des anciens médias NTV : aucun produit, compte ou commande
// n'est supprimé. L'administrateur doit envoyer une confirmation explicite.
app.post("/api/admin/maintenance/clear-media", adminAuth, requireMongo, async (req, res) => {
  if (req.body?.confirmation !== "SUPPRIMER_LES_MEDIAS_NTV") {
    return res.status(400).json({ error: "Confirmation requise : SUPPRIMER_LES_MEDIAS_NTV" });
  }
  if (!cloudinaryReady()) return res.status(503).json({ error: "Cloudinary n'est pas configuré : aucun média n'a été supprimé." });
  try {
    const [cloudImages, cloudVideos, cloudRaw] = await Promise.all([
      deleteCloudinaryPrefix("image", "ntv-mall/").then(async count => count + await deleteCloudinaryTag("image", "ntv-mall")),
      deleteCloudinaryPrefix("video", "ntv-mall/").then(async count => count + await deleteCloudinaryTag("video", "ntv-mall")),
      deleteCloudinaryPrefix("raw", "ntv-mall/").then(async count => count + await deleteCloudinaryTag("raw", "ntv-mall"))
    ]);

    const productFiles = await db.collection("productImages.files").countDocuments();
    const profileFiles = await db.collection("profileImages.files").countDocuments();
    await Promise.all([
      db.collection("productImages.files").deleteMany({}),
      db.collection("productImages.chunks").deleteMany({}),
      db.collection("profileImages.files").deleteMany({}),
      db.collection("profileImages.chunks").deleteMany({}),
      db.collection("products").updateMany({}, { $set: { imageUrls: [], imageUrl: "" } }),
      db.collection("users").updateMany({}, { $unset: { profileImageUrl: "", profileImagePublicId: "" } }),
      db.collection("settings").updateOne({ _id: "admin-profile" }, { $unset: { profileImageUrl: "", profileImagePublicId: "" } }),
      db.collection("siteSettings").updateOne({ _id: "catalogAnnouncements" }, { $set: { items: [], updatedAt: new Date() } })
    ]);
    res.json({
      ok: true,
      message: "Nettoyage des médias terminé. Les produits, comptes, commandes et historiques sont conservés.",
      deleted: { cloudinaryImages: cloudImages, cloudinaryVideos: cloudVideos, cloudinaryRaw: cloudRaw, mongoProductFiles: productFiles, mongoProfileFiles: profileFiles }
    });
  } catch (error) {
    console.error("Nettoyage médias NTV:", error);
    res.status(500).json({ error: "Nettoyage incomplet. Consultez les journaux Render avant de relancer l'opération." });
  }
});

app.post("/api/admin/profile/avatar", adminAuth, upload.single("image"), async (req, res) => {
  try {
    if (!db || !req.file) return res.status(400).json({ error: "Choisissez une image JPG, PNG, WEBP ou GIF (6 Mo maximum)." });
    const previous = await db.collection("settings").findOne({ _id: "admin-profile" }, { projection: { profileImagePublicId: 1 } });
    const media = await uploadOptimizedMedia(req.file.buffer, { folder: "ntv-mall/admin" });
    await db.collection("settings").updateOne(
      { _id: "admin-profile" },
      { $set: { profileImageUrl: media.url, profileImagePublicId: media.publicId, updatedAt: new Date() } },
      { upsert: true }
    );
    if (previous?.profileImagePublicId && previous.profileImagePublicId !== media.publicId) {
      await deleteCloudinaryAsset("image", previous.profileImagePublicId).catch(error => console.warn("Ancienne photo admin non supprimée:", error.message));
    }
    res.json({ ok: true, profileImageUrl: media.url, media: { bytes: media.bytes, format: media.format } });
  } catch (error) {
    console.error("Upload avatar admin Cloudinary:", error.message);
    res.status(500).json({ error: "Impossible d'optimiser ou d'enregistrer la photo. Vérifiez Cloudinary dans Render." });
  }
});

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user?.role)) {
      return res.status(403).json({
        error: "Vous n'avez pas l'autorisation d'accéder à cette ressource."
      });
    }
    next();
  };
}

function sellerSubscriptionIsValid(user) {
  if (!user || user.role !== "seller") return true;
  if (!user.plan || user.plan === "commission") return true;
  return user.subscriptionStatus === "active" &&
    user.subscriptionExpiresAt &&
    new Date(user.subscriptionExpiresAt).getTime() > Date.now();
}

function requireSellerCommercialAccess(req, res, next) {
  if (!sellerSubscriptionIsValid(req.user)) {
    return res.status(403).json({
      code: "SUBSCRIPTION_REQUIRED",
      error: "Votre abonnement NTV doit être payé ou renouvelé pour utiliser cette fonctionnalité. Vous pouvez consulter votre formule dans votre espace vendeur et contacter l'administration NTV."
    });
  }
  next();
}

const sellerPlanDetails = plan => ({
  commission: { label: "Vendeur à commission", monthlyPrice: 0, commissionRate: 0.05 },
  limited: { label: "Vendeur – accès limité", monthlyPrice: 2500, commissionRate: 0 },
  vip: { label: "Vendeur VIP", monthlyPrice: 5000, commissionRate: 0 }
}[plan] || null);

// --------------------------------------------------
// ROUTES PUBLIQUES
// --------------------------------------------------

app.get("/api/health", async (_req, res) => {
  res.json({
    ok: true,
    service: "ntv-mall",
    brand: "NTV Mall",
    domain: "ntvmall.com",
    professionalEmail: process.env.PROFESSIONAL_EMAIL || "contact@ntvmall.com",
    database: Boolean(db),
    accounts: Boolean(db),
    postgres: Boolean(pool),
    cloudinary: cloudinaryReady()
  });
});

app.get("/api/config", (_req, res) => {
  const iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
  if (process.env.TURN_URL && process.env.TURN_USERNAME && process.env.TURN_CREDENTIAL) {
    iceServers.push({ urls: process.env.TURN_URL, username: process.env.TURN_USERNAME, credential: process.env.TURN_CREDENTIAL });
  }
  res.json({
    whatsappNumber: "2294222197",
    currency: "XOF",
    iceServers
  });
});

// Avis publics NTVMall : ouverts à tous les visiteurs.
app.get("/api/public-reviews", async (_req, res) => {
  try {
    if (!db) return res.json({ reviews: [] });
    const reviews = await db.collection("publicReviews")
      .find({ status: "published" })
      .sort({ createdAt: -1 })
      .limit(30)
      .project({ _id: 0, id: 1, name: 1, rating: 1, comment: 1, createdAt: 1 })
      .toArray();
    res.json({ reviews });
  } catch (error) {
    console.error("Avis publics:", error);
    res.status(500).json({ error: "Impossible de charger les avis." });
  }
});

app.post("/api/public-reviews", async (req, res) => {
  try {
    if (!db) return res.status(503).json({ error: "Le service des avis est temporairement indisponible." });
    const name = String(req.body?.name || "").trim().replace(/\\s+/g, " ").slice(0, 60);
    const comment = String(req.body?.comment || "").trim().slice(0, 1000);
    const rating = Number(req.body?.rating);
    if (name.length < 2) return res.status(400).json({ error: "Veuillez saisir un nom (2 caractères minimum)." });
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return res.status(400).json({ error: "Choisissez une note entre 1 et 5 étoiles." });
    if (comment.length < 5) return res.status(400).json({ error: "Votre commentaire doit contenir au moins 5 caractères." });
    const review = {
      id: crypto.randomUUID(),
      name,
      rating,
      comment,
      status: "published",
      createdAt: new Date()
    };
    await db.collection("publicReviews").insertOne(review);
    res.status(201).json({
      ok: true,
      review: {
        id: review.id,
        name: review.name,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString()
      }
    });
  } catch (error) {
    console.error("Publication avis:", error);
    res.status(500).json({ error: "Impossible de publier votre avis pour le moment." });
  }
});

// Annonces du catalogue : configuration conservée dans MongoDB.
app.get("/api/announcements", async (_req, res) => {
  try {
    const doc = db ? await db.collection("siteSettings").findOne({ _id: "catalogAnnouncements" }) : null;
    res.json(Array.isArray(doc?.items) ? doc.items.filter(x => x && x.active !== false) : []);
  } catch (error) {
    console.error("Annonces publiques:", error);
    res.json([]);
  }
});

app.post("/api/admin/announcement-media", adminAuth, requireMongo, announcementMediaUpload.single("media"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "Choisissez une image ou une vidéo MP4/WEBM (40 Mo maximum)." });
    const isVideo = req.file.mimetype.startsWith("video/");
    const media = await uploadOptimizedMedia(req.file.buffer, {
      folder: isVideo ? "ntv-mall/announcements/videos" : "ntv-mall/announcements/images",
      resourceType: isVideo ? "video" : "image"
    });
    res.status(201).json({ mediaUrl: media.url, mediaType: isVideo ? "video" : "image", publicId: media.publicId, bytes: media.bytes, format: media.format });
  } catch (error) {
    console.error("Upload publicité Cloudinary:", error);
    res.status(500).json({ error: "Échec de l'optimisation ou du téléversement. Vérifiez Cloudinary dans Render." });
  }
});

app.put("/api/admin/announcements", adminAuth, requireUsersDb, async (req, res) => {
  try {
    const items = Array.isArray(req.body?.items) ? req.body.items.slice(0, 10).map((item, index) => ({
      id: String(item.id || `ad-${Date.now()}-${index}`).slice(0, 100),
      title: String(item.title || "").trim().slice(0, 120),
      description: String(item.description || "").trim().slice(0, 300),
      mediaUrl: String(item.mediaUrl || "").trim().slice(0, 1500),
      mediaType: item.mediaType === "video" ? "video" : "image",
      link: String(item.link || "").trim().slice(0, 1500),
      active: item.active !== false
    })).filter(item => item.title && item.mediaUrl) : [];
    await db.collection("siteSettings").updateOne(
      { _id: "catalogAnnouncements" },
      { $set: { items, updatedAt: new Date() } },
      { upsert: true }
    );
    res.json({ ok: true, items });
  } catch (error) {
    console.error("Enregistrement annonces:", error);
    res.status(500).json({ error: "Impossible d'enregistrer les annonces." });
  }
});

// --------------------------------------------------
// INSCRIPTION ET CONNEXION
// --------------------------------------------------

app.post("/api/auth/register", authRegisterLimit, requireUsersDb, async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      phone,
      country,
      role,
      businessName,
      businessDescription,
      deliveryZones,
      plan,
      termsAccepted,
      termsVersion
    } = req.body || {};

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanName = String(name || "").trim();

    if (
      cleanName.length < 2 ||
      cleanEmail.length > 190 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)
    ) {
      return res.status(400).json({
        error: "Nom et adresse e-mail valides obligatoires."
      });
    }

    if (
      typeof password !== "string" ||
      password.length < 10 ||
      password.length > 200
    ) {
      return res.status(400).json({
        error: "Le mot de passe doit contenir au moins 10 caractères."
      });
    }

    if (!phone || !country) {
      return res.status(400).json({
        error: "Téléphone et pays obligatoires."
      });
    }

    const requiredTermsVersion = "NTV-UTILISATION-2026-11-01";
    if (termsAccepted !== true || termsVersion !== requiredTermsVersion) {
      return res.status(400).json({ error: "Vous devez lire et accepter les conditions NTV correspondant à votre type de compte." });
    }

    if (!["seller", "delivery", "customer"].includes(role)) {
      return res.status(400).json({
        error: "Type de compte invalide."
      });
    }

    if (
      role === "seller" &&
      String(businessName || "").trim().length < 2
    ) {
      return res.status(400).json({
        error: "Le nom de votre commerce est obligatoire."
      });
    }

    if (role === "seller" && !["commission", "limited", "vip"].includes(String(plan || ""))) {
      return res.status(400).json({
        error: "Choisissez obligatoirement une formule : commission 5 %, accès limité 2 500 F/mois ou VIP 5 000 F/mois."
      });
    }

    const exists = await db.collection("users").findOne({
      email: cleanEmail
    });

    if (exists) {
      return res.status(409).json({
        error: "Cette adresse e-mail possède déjà un compte."
      });
    }

    let storeSlug = "";

    if (role === "seller") {
      const baseSlug = slugify(businessName) || "boutique";
      storeSlug = baseSlug;

      let suffix = 2;

      while (await db.collection("users").findOne({
        storeSlug,
        role: "seller"
      })) {
        storeSlug = `${baseSlug}-${suffix++}`;
      }
    }

    const user = {
      name: cleanName.slice(0, 120),
      email: cleanEmail,
      passwordHash: await hashPassword(password),
      phone: String(phone).trim().slice(0, 40),
      country: String(country).trim().slice(0, 80),
      role,
      status: role === "customer" ? "active" : "pending",
      businessName: role === "seller"
        ? String(businessName).trim().slice(0, 160)
        : "",
      businessDescription: role === "seller"
        ? String(businessDescription || "").trim().slice(0, 1000)
        : "",
      ...(role === "seller" ? { storeSlug } : {}),
      deliveryZones: role === "delivery"
        ? String(deliveryZones || "").trim().slice(0, 500)
        : "",
      plan: role === "seller" ? String(plan) : null,
      termsAccepted: true,
      termsVersion: requiredTermsVersion,
      termsAcceptedRole: role,
      termsAcceptedAt: new Date(),
      subscriptionStatus: role !== "seller" || plan === "commission" ? "not_required" : "pending_payment",
      subscriptionStartedAt: null,
      subscriptionExpiresAt: null,
      subscriptionPaidAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection("users").insertOne(user);
    user._id = result.insertedId;

    res.status(201).json({
      ok: true,
      user: publicUser(user),
      message: role === "seller" && plan !== "commission"
        ? "Demande enregistrée. Après validation de votre candidature, votre abonnement devra être payé et validé par NTV avant l'activation de votre boutique."
        : "Demande enregistrée. Votre compte sera activé après vérification par NTV."
    });
  } catch (error) {
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern || {})[0] || "";
      const message = duplicateField === "email"
        ? "Cette adresse e-mail possède déjà un compte."
        : duplicateField === "storeSlug"
          ? "Ce nom de boutique est déjà utilisé."
          : "Un élément unique de ce compte existe déjà. Vérifiez les informations saisies.";
      return res.status(409).json({ error: message });
    }

    console.error("Inscription:", error);

    res.status(500).json({
      error: "Impossible de créer le compte pour le moment."
    });
  }
});

// --------------------------------------------------
// RÉCUPÉRATION SÉCURISÉE DES MOTS DE PASSE CLIENT / VENDEUR / LIVREUR
// L'administration valide manuellement l'identité et remet le code par téléphone/WhatsApp.
// Aucun parcours de récupération n'est disponible pour le compte administrateur.
// --------------------------------------------------
app.post("/api/auth/password-recovery", passwordRecoveryRequestLimit, requireUsersDb, async (req, res) => {
  try {
    const name = String(req.body?.name || "").trim().slice(0, 120);
    const email = String(req.body?.email || "").trim().toLowerCase();
    const phone = String(req.body?.phone || "").trim().slice(0, 40);
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || phone.length < 6) {
      return res.status(400).json({ error: "Renseignez votre nom, votre adresse e-mail et votre téléphone." });
    }
    const user = await db.collection("users").findOne({ email, phone, role: { $in: ["customer", "seller", "delivery"] } });
    // Réponse volontairement identique pour éviter de révéler l'existence d'un compte.
    if (user && user.status === "active" && String(user.name || "").trim().toLocaleLowerCase() === name.toLocaleLowerCase()) {
      const pending = await db.collection("passwordRecoveryRequests").findOne({ userId: user._id.toString(), status: "pending" });
      if (!pending) {
        await db.collection("passwordRecoveryRequests").insertOne({
          userId: user._id.toString(), userName: user.name, email: user.email, phone: user.phone,
          role: user.role, status: "pending", requestedAt: new Date(),
          identityCheck: "À vérifier manuellement par l'administration"
        });
        publishRealtime("admin", { type: "password-recovery-request", message: "Nouvelle demande de récupération de mot de passe." });
      }
    }
    return res.json({ ok: true, message: "Si les informations correspondent à un compte actif, la demande a été transmise à l'administration NTV." });
  } catch (error) {
    console.error("Demande de récupération:", error.message);
    return res.status(500).json({ error: "Impossible d'enregistrer la demande pour le moment." });
  }
});

app.post("/api/auth/password-recovery/reset", passwordRecoveryResetLimit, requireUsersDb, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = String(req.body?.code || "").trim();
    const newPassword = String(req.body?.newPassword || "");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !/^\d{6}$/.test(code) || newPassword.length < 10 || newPassword.length > 200) {
      return res.status(400).json({ error: "Vérifiez l'e-mail, le code à 6 chiffres et le nouveau mot de passe (10 caractères minimum)." });
    }
    const user = await db.collection("users").findOne({ email, role: { $in: ["customer", "seller", "delivery"] }, status: "active" });
    if (!user) return res.status(400).json({ error: "Code invalide ou expiré. Contactez l'administration NTV." });
    const now = new Date();
    const recovery = await db.collection("passwordRecoveryRequests").findOne({
      userId: user._id.toString(), status: "approved", codeExpiresAt: { $gt: now }
    }, { sort: { approvedAt: -1 } });
    if (!recovery || !recovery.codeHash || !safeEqual(crypto.createHmac("sha256", tokenSecret || "ntv-recovery-fallback").update(code).digest("hex"), recovery.codeHash)) {
      return res.status(400).json({ error: "Code invalide ou expiré. Contactez l'administration NTV." });
    }
    const passwordHash = await hashPassword(newPassword);
    await db.collection("users").updateOne({ _id: user._id }, { $set: { passwordHash, updatedAt: now } });
    await db.collection("passwordRecoveryRequests").updateOne({ _id: recovery._id }, { $set: { status: "used", usedAt: now }, $unset: { codeHash: "", codeExpiresAt: "" } });
    return res.json({ ok: true, message: "Votre mot de passe a été modifié. Vous pouvez maintenant vous connecter." });
  } catch (error) {
    console.error("Réinitialisation mot de passe:", error.message);
    return res.status(500).json({ error: "Impossible de modifier le mot de passe." });
  }
});

app.get("/api/admin/password-recovery", adminAuth, requireUsersDb, async (_req, res) => {
  try {
    const rows = await db.collection("passwordRecoveryRequests").find({ status: { $in: ["pending", "approved", "rejected"] } }).sort({ requestedAt: -1 }).limit(100).toArray();
    res.json({ requests: rows.map(row => ({ id: row._id.toString(), userName: row.userName, email: row.email, phone: row.phone, role: row.role, status: row.status, requestedAt: row.requestedAt, reviewedAt: row.reviewedAt, rejectionReason: row.rejectionReason })) });
  } catch (error) { res.status(500).json({ error: "Impossible de charger les demandes." }); }
});

app.patch("/api/admin/password-recovery/:id", adminAuth, requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Demande introuvable." });
    const action = String(req.body?.action || "");
    if (!["approve", "reject"].includes(action)) return res.status(400).json({ error: "Action invalide." });
    if (action === "approve" && req.body?.identityVerified !== true) return res.status(400).json({ error: "Confirmez la vérification de l'identité avant l'autorisation." });
    const collection = db.collection("passwordRecoveryRequests");
    const request = await collection.findOne({ _id: new ObjectId(req.params.id), status: "pending" });
    if (!request) return res.status(404).json({ error: "Cette demande n'est plus en attente." });
    const user = await db.collection("users").findOne({ _id: new ObjectId(request.userId), role: { $in: ["customer", "seller", "delivery"] }, status: "active" });
    if (!user) return res.status(404).json({ error: "Compte utilisateur introuvable ou inactif." });
    const now = new Date();
    if (action === "reject") {
      const rejected = await collection.updateOne({ _id: request._id, status: "pending" }, { $set: { status: "rejected", reviewedAt: now, rejectionReason: String(req.body?.reason || "Identité non vérifiée").slice(0, 300) } });
      if (!rejected.modifiedCount) return res.status(409).json({ error: "Cette demande a déjà été traitée." });
      publishRealtime(request.userId, { type: "notification", message: "Votre demande de récupération a été refusée. Contactez le service client NTV." });
      return res.json({ ok: true, status: "rejected" });
    }
    // Code à usage unique, valable 15 minutes. Il est remis manuellement par téléphone/WhatsApp.
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, "0");
    const expiresAt = new Date(now.getTime() + 15 * 60 * 1000);
    const codeHash = crypto.createHmac("sha256", tokenSecret || "ntv-recovery-fallback").update(code).digest("hex");
    const approved = await collection.updateOne({ _id: request._id, status: "pending" }, { $set: { status: "approved", reviewedAt: now, approvedAt: now, codeHash, codeExpiresAt: expiresAt } });
    if (!approved.modifiedCount) return res.status(409).json({ error: "Cette demande a déjà été traitée." });
    publishRealtime(request.userId, { type: "notification", message: "Votre demande de récupération est autorisée. Le code temporaire vous sera communiqué par NTV." });
    return res.json({ ok: true, status: "approved", code, phone: user.phone, email: user.email, expiresAt });
  } catch (error) {
    console.error("Validation récupération:", error.message);
    return res.status(500).json({ error: "Impossible de traiter cette demande." });
  }
});

app.post("/api/auth/login", authLoginLimit, requireUsersDb, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const user = await db.collection("users").findOne({ email });

    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      return res.status(401).json({
        error: "Adresse e-mail ou mot de passe incorrect."
      });
    }

    if (!["seller", "delivery", "customer", "admin"].includes(user.role)) {
      return res.status(403).json({
        error: "Type de compte non autorisé."
      });
    }

    if (user.status === "pending") {
      return res.status(403).json({
        error: "Votre demande est en attente de validation par NTV."
      });
    }

    if (user.status === "rejected" || user.status === "suspended") {
      return res.status(403).json({
        error: "Ce compte n'est pas autorisé à accéder à la plateforme. Contactez NTV."
      });
    }

    if (user.status !== "active") {
      return res.status(403).json({
        error: "Ce compte n'est pas actif."
      });
    }

    await db.collection("users").updateOne(
      { _id: user._id },
      { $set: { lastActivityAt: new Date(), updatedAt: new Date() } }
    );
    user.lastActivityAt = new Date();
    res.json({
      ok: true,
      token: signToken(user),
      user: publicUser(user)
    });
  } catch (error) {
    console.error("Connexion:", error);

    res.status(500).json({
      error: "Connexion impossible pour le moment."
    });
  }
});

app.patch("/api/legal/accept", authenticate, requireRole("customer", "seller", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const requiredVersion = "NTV-UTILISATION-2026-11-01";
    if (req.body?.termsAccepted !== true || req.body?.termsVersion !== requiredVersion) {
      return res.status(400).json({ error: "Veuillez confirmer l'acceptation de la version actuelle du règlement NTV." });
    }
    await db.collection("users").updateOne({ _id: req.user._id }, { $set: {
      termsAccepted: true, termsVersion: requiredVersion, termsAcceptedRole: req.user.role,
      termsAcceptedAt: new Date(), updatedAt: new Date()
    } });
    const updated = await db.collection("users").findOne({ _id: req.user._id });
    res.json({ ok: true, user: publicUser(updated) });
  } catch (error) {
    console.error("Acceptation règlement:", error);
    res.status(500).json({ error: "Impossible d'enregistrer votre acceptation." });
  }
});

app.get("/api/auth/me", authenticate, async (req, res) => {
  res.json({
    user: publicUser(req.user)
  });
});

app.patch("/api/seller/notifications/read", authenticate, requireRole("seller"), async (req, res) => {
  try {
    const notifications = (req.user.notifications || []).map(item => ({ ...item, read: true }));
    await db.collection("users").updateOne({ _id: req.user._id }, { $set: { notifications, updatedAt: new Date() } });
    const updated = await db.collection("users").findOne({ _id: req.user._id });
    res.json({ ok: true, user: publicUser(updated) });
  } catch (error) {
    console.error("Notifications vendeur:", error);
    res.status(500).json({ error: "Impossible de mettre à jour les notifications." });
  }
});

app.get("/api/communications/events", authenticate, requireRole("seller", "customer", "delivery"), (req, res) => openRealtimeStream(req, res, req.user._id.toString()));
app.get("/api/admin/communications/events", adminAuth, (_req, res) => openRealtimeStream(_req, res, "admin"));

// --------------------------------------------------
// MESSAGERIE, SERVICE CLIENT, NOTIFICATIONS ET APPELS WEBRTC
// Les conversations et signaux sont stockés dans MongoDB; aucune donnée
// de commande ou de compte existante n'est remplacée.
// --------------------------------------------------

function cleanMessage(value) {
  return String(value || "").trim().slice(0, 4000);
}

function conversationView(row) {
  return {
    id: row._id.toString(), type: row.type, orderId: row.orderId || "",
    subject: row.subject || "", participants: row.participants || [],
    customerName: row.customerName || "", sellerName: row.sellerName || "",
    lastMessage: row.lastMessage || "", lastMessageAt: row.lastMessageAt || row.createdAt,
    createdAt: row.createdAt
  };
}

async function notifyUser(userId, message, type = "message", conversationId = "") {
  if (!db || !ObjectId.isValid(String(userId))) return;
  const notification = { type, message: String(message).slice(0, 300), conversationId, read: false, createdAt: new Date() };
  await db.collection("users").updateOne(
    { _id: new ObjectId(String(userId)) },
    { $push: { notifications: { $each: [notification], $slice: -50 } }, $set: { updatedAt: new Date() } }
  );
}

app.post("/api/admin/communications/notifications", adminAuth, requireUsersDb, async (req, res) => {
  try {
    const roles = Array.isArray(req.body?.roles) ? [...new Set(req.body.roles.map(String))] : [];
    const allowedRoles = ["seller", "customer", "delivery"];
    const message = String(req.body?.message || "").trim().slice(0, 500);
    if (!message) return res.status(400).json({ error: "Saisissez le texte de la notification." });
    if (!roles.length || roles.some(role => !allowedRoles.includes(role))) return res.status(400).json({ error: "Sélectionnez au moins une catégorie autorisée." });
    const recipients = await db.collection("users").find({ role: { $in: roles }, status: "active" }).project({ _id: 1 }).toArray();
    for (const recipient of recipients) {
      const id = recipient._id.toString();
      await notifyUser(id, message, "official");
      publishRealtime(id, { type: "notification", message, senderName: "Administration NTV" });
    }
    res.json({ ok: true, sent: recipients.length });
  } catch (error) { res.status(500).json({ error: "Impossible d'envoyer les notifications officielles." }); }
});

async function getConversationForUser(id, userId) {
  if (!ObjectId.isValid(String(id))) return null;
  return db.collection("conversations").findOne({ _id: new ObjectId(String(id)), participants: String(userId) });
}

async function ensureOrderBelongsToSeller(orderId, sellerId) {
  const raw = String(orderId || "").replace(/^NTV-/, "");
  if (db) {
    const row = await db.collection("orders").findOne({ $or: [{ id: raw }, { orderId: String(orderId) }, ...(ObjectId.isValid(raw) ? [{ _id: new ObjectId(raw) }] : [])] });
    if (row && (row.items || []).some(item => String(item.vendorId || "") === String(sellerId))) return true;
  }
  if (pool && /^\d+$/.test(raw)) {
    const row = await pool.query("SELECT items FROM orders WHERE id = $1", [Number(raw)]);
    if (row.rowCount && (row.rows[0].items || []).some(item => String(item.vendorId || "") === String(sellerId))) return true;
  }
  return false;
}

async function ensureOrderBelongsToCustomer(orderId, user) {
  const raw = String(orderId || "").replace(/^NTV-/, "");
  const phone = String(user?.phone || "").replace(/\D/g, "");
  if (!phone) return false;
  if (db) {
    const row = await db.collection("orders").findOne({ $or: [{ orderId: String(orderId) }, ...(ObjectId.isValid(raw) ? [{ _id: new ObjectId(raw) }] : [])] });
    const orderPhone = String(row?.customer?.phone || row?.phone || "").replace(/\D/g, "");
    if (row && orderPhone && orderPhone === phone) return true;
  }
  if (pool && /^\d+$/.test(raw)) {
    const row = await pool.query("SELECT phone FROM orders WHERE id = $1", [Number(raw)]);
    if (row.rowCount && String(row.rows[0].phone || "").replace(/\D/g, "") === phone) return true;
  }
  return false;
}

app.get("/api/communications/conversations", authenticate, requireRole("seller", "customer", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const rows = await db.collection("conversations").find({ participants: req.user._id.toString() }).sort({ lastMessageAt: -1, createdAt: -1 }).limit(100).toArray();
    res.json({ conversations: rows.map(conversationView) });
  } catch (error) { console.error("Conversations:", error); res.status(500).json({ error: "Impossible de charger les conversations." }); }
});

app.post("/api/communications/conversations", authenticate, requireRole("seller", "customer", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const type = req.user.role === "seller" ? "seller-admin" : req.user.role === "delivery" ? "delivery-admin" : "customer-support";
    const orderId = String(req.body?.orderId || "").trim().slice(0, 80);
    if (req.user.role === "seller" && orderId && !(await ensureOrderBelongsToSeller(orderId, req.user._id.toString()))) {
      return res.status(403).json({ error: "Cette commande n'est pas associée à votre boutique." });
    }
    if (req.user.role === "customer" && orderId && !(await ensureOrderBelongsToCustomer(orderId, req.user))) {
      return res.status(403).json({ error: "Cette commande ne correspond pas au numéro de téléphone de votre compte." });
    }
    const participants = [req.user._id.toString(), "admin"];
    let row = await db.collection("conversations").findOne({ type, participants: { $all: participants }, orderId });
    if (!row) {
      const doc = { type, orderId, subject: String(req.body?.subject || (orderId ? `Commande ${orderId}` : type === "seller-admin" ? "Échange avec NTV" : "Service client NTV")).trim().slice(0, 160), participants, customerName: req.user.role === "customer" ? req.user.name : "", sellerName: req.user.role === "seller" ? (req.user.businessName || req.user.name) : "", createdAt: new Date(), lastMessageAt: new Date(), lastMessage: "" };
      const result = await db.collection("conversations").insertOne(doc);
      row = { ...doc, _id: result.insertedId };
    }
    res.status(201).json({ conversation: conversationView(row) });
  } catch (error) { console.error("Création conversation:", error); res.status(500).json({ error: "Impossible de créer la conversation." }); }
});

app.get("/api/communications/conversations/:id/messages", authenticate, requireRole("seller", "customer", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user._id.toString());
    if (!conversation) return res.status(404).json({ error: "Conversation introuvable." });
    const messages = await db.collection("messages").find({ conversationId: conversation._id.toString() }).sort({ createdAt: 1 }).limit(300).toArray();
    res.json({ messages: messages.map(m => ({ id: m._id.toString(), senderId: m.senderId, senderRole: m.senderRole, senderName: m.senderName, body: m.body, createdAt: m.createdAt })) });
  } catch (error) { console.error("Lecture messages:", error); res.status(500).json({ error: "Impossible de charger les messages." }); }
});

app.post("/api/communications/conversations/:id/messages", authenticate, requireRole("seller", "customer", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const conversation = await getConversationForUser(req.params.id, req.user._id.toString());
    if (!conversation) return res.status(404).json({ error: "Conversation introuvable." });
    const body = cleanMessage(req.body?.body);
    if (!body) return res.status(400).json({ error: "Le message ne peut pas être vide." });
    const now = new Date();
    const doc = { conversationId: conversation._id.toString(), senderId: req.user._id.toString(), senderRole: req.user.role, senderName: req.user.businessName || req.user.name, body, createdAt: now };
    const result = await db.collection("messages").insertOne(doc);
    await db.collection("conversations").updateOne({ _id: conversation._id }, { $set: { lastMessage: body.slice(0, 180), lastMessageAt: now } });
    await notifyUser("admin", `${doc.senderName} : ${body}`, "message", conversation._id.toString());
    publishRealtime("admin", { type: "message", conversationId: conversation._id.toString(), senderName: doc.senderName });
    res.status(201).json({ message: { id: result.insertedId.toString(), ...doc } });
  } catch (error) { console.error("Envoi message:", error); res.status(500).json({ error: "Impossible d'envoyer le message." }); }
});

app.patch("/api/communications/notifications/read", authenticate, requireRole("seller", "customer", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const notifications = (req.user.notifications || []).map(item => ({ ...item, read: true }));
    await db.collection("users").updateOne({ _id: req.user._id }, { $set: { notifications, updatedAt: new Date() } });
    res.json({ ok: true, notifications });
  } catch (error) { res.status(500).json({ error: "Impossible de mettre à jour les notifications." }); }
});

// Administration : boîte de réception unifiée vendeurs + service client.
app.get("/api/admin/communications/conversations", adminAuth, requireUsersDb, async (_req, res) => {
  try {
    const rows = await db.collection("conversations").find({}).sort({ lastMessageAt: -1 }).limit(200).toArray();
    res.json({ conversations: rows.map(conversationView) });
  } catch (error) { res.status(500).json({ error: "Impossible de charger la messagerie." }); }
});

app.get("/api/admin/communications/conversations/:id/messages", adminAuth, requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Conversation introuvable." });
    const id = new ObjectId(req.params.id);
    const conversation = await db.collection("conversations").findOne({ _id: id });
    if (!conversation) return res.status(404).json({ error: "Conversation introuvable." });
    const messages = await db.collection("messages").find({ conversationId: id.toString() }).sort({ createdAt: 1 }).limit(300).toArray();
    res.json({ messages: messages.map(m => ({ id: m._id.toString(), senderId: m.senderId, senderRole: m.senderRole, senderName: m.senderName, body: m.body, createdAt: m.createdAt })) });
  } catch (error) { res.status(500).json({ error: "Impossible de charger les messages." }); }
});

app.post("/api/admin/communications/conversations/:id/messages", adminAuth, requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Conversation introuvable." });
    const conversation = await db.collection("conversations").findOne({ _id: new ObjectId(req.params.id) });
    if (!conversation) return res.status(404).json({ error: "Conversation introuvable." });
    const body = cleanMessage(req.body?.body);
    if (!body) return res.status(400).json({ error: "Le message ne peut pas être vide." });
    const now = new Date();
    const doc = { conversationId: conversation._id.toString(), senderId: "admin", senderRole: "admin", senderName: "Service NTV", body, createdAt: now };
    const result = await db.collection("messages").insertOne(doc);
    await db.collection("conversations").updateOne({ _id: conversation._id }, { $set: { lastMessage: body.slice(0, 180), lastMessageAt: now } });
    for (const participant of (conversation.participants || []).filter(id => id !== "admin")) {
      await notifyUser(participant, `NTV : ${body}`, "message", conversation._id.toString());
      publishRealtime(participant, { type: "message", conversationId: conversation._id.toString(), senderName: doc.senderName });
    }
    res.status(201).json({ message: { id: result.insertedId.toString(), ...doc } });
  } catch (error) { console.error("Réponse admin:", error); res.status(500).json({ error: "Impossible d'envoyer la réponse." }); }
});

// Signalisation WebRTC (offre/réponse SDP). Les médias restent de pair à pair.
const CALL_RULES = {
  admin: ["seller", "customer", "delivery"],
  seller: ["admin", "delivery"],
  customer: ["admin", "delivery"],
  delivery: ["admin", "seller", "customer"]
};

app.get("/api/communications/call-targets", authenticate, requireRole("seller", "customer", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const allowed = CALL_RULES[req.user.role] || [];
    const roles = allowed.filter(role => role !== "admin");
    const users = roles.length ? await db.collection("users").find({ role: { $in: roles }, status: "active" }).project({ name: 1, businessName: 1, role: 1 }).sort({ name: 1 }).limit(300).toArray() : [];
    res.json({ targets: [{ id: "admin", name: "Administration NTV", role: "admin" }, ...users.map(user => ({ id: user._id.toString(), name: user.businessName || user.name || "Utilisateur NTV", role: user.role }))] });
  } catch (error) { res.status(500).json({ error: "Impossible de charger les destinataires autorisés." }); }
});

app.get("/api/admin/communications/call-targets", adminAuth, requireUsersDb, async (_req, res) => {
  try {
    const users = await db.collection("users").find({ role: { $in: CALL_RULES.admin }, status: "active" }).project({ name: 1, businessName: 1, role: 1 }).sort({ name: 1 }).limit(500).toArray();
    res.json({ targets: users.map(user => ({ id: user._id.toString(), name: user.businessName || user.name || "Utilisateur NTV", role: user.role })) });
  } catch (error) { res.status(500).json({ error: "Impossible de charger les destinataires autorisés." }); }
});

app.post("/api/communications/calls", authenticate, requireRole("seller", "customer", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const callerRole = req.user.role;
    const targetId = String(req.body?.targetId || "admin");
    const kind = req.body?.kind === "video" ? "video" : "audio";
    if (!(CALL_RULES[callerRole] || []).length) return res.status(403).json({ error: "Votre rôle n'est pas autorisé à passer des appels." });
    let target = null;
    if (targetId === "admin") {
      if (!CALL_RULES[callerRole].includes("admin")) return res.status(403).json({ error: "Vous n'êtes pas autorisé à appeler l'administration." });
    } else {
      if (!ObjectId.isValid(targetId)) return res.status(400).json({ error: "Destinataire invalide." });
      target = await db.collection("users").findOne({ _id: new ObjectId(targetId), status: "active" });
      if (!target || !CALL_RULES[callerRole].includes(target.role)) return res.status(403).json({ error: "Cet appel n'est pas autorisé pour votre rôle." });
    }
    const offer = req.body?.offer;
    if (!offer || typeof offer.sdp !== "string" || offer.sdp.length > 200000) return res.status(400).json({ error: "Offre d'appel invalide." });
    const calleeId = targetId;
    const calleeRole = target?.role || "admin";
    const doc = { callerId: req.user._id.toString(), callerRole, callerName: req.user.businessName || req.user.name, calleeId, calleeRole, calleeName: target ? (target.businessName || target.name) : "Administration NTV", kind, status: "ringing", offer, answer: null, createdAt: new Date(), updatedAt: new Date() };
    const result = await db.collection("calls").insertOne(doc);
    publishRealtime(calleeId, { type: "incoming-call", callId: result.insertedId.toString(), callerName: doc.callerName, kind, status: "ringing" });
    if (calleeId !== "admin") await notifyUser(calleeId, `Appel ${kind === "video" ? "vidéo" : "audio"} de ${doc.callerName}.`, "call");
    res.status(201).json({ call: { id: result.insertedId.toString(), ...doc } });
  } catch (error) { res.status(500).json({ error: "Impossible de lancer l'appel." }); }
});

app.get("/api/communications/calls", authenticate, requireRole("seller", "customer", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const id = req.user._id.toString();
    const rows = await db.collection("calls").find({ $or: [{ callerId: id }, { calleeId: id }], status: { $in: ["ringing", "accepted"] } }).sort({ createdAt: -1 }).limit(20).toArray();
    res.json({ calls: rows.map(c => ({ id: c._id.toString(), callerId: c.callerId, callerRole: c.callerRole, callerName: c.callerName, calleeId: c.calleeId, calleeRole: c.calleeRole, calleeName: c.calleeName, kind: c.kind, status: c.status, offer: c.offer, answer: c.answer, updatedAt: c.updatedAt })) });
  } catch (error) { res.status(500).json({ error: "Impossible de consulter les appels." }); }
});

app.patch("/api/communications/calls/:id", authenticate, requireRole("seller", "customer", "delivery"), requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Appel introuvable." });
    const id = req.user._id.toString();
    const call = await db.collection("calls").findOne({ _id: new ObjectId(req.params.id), $or: [{ callerId: id }, { calleeId: id }] });
    if (!call) return res.status(404).json({ error: "Appel introuvable." });
    if (call.callerId === id && req.body?.answer) return res.status(403).json({ error: "Seul le destinataire peut accepter l'appel." });
    const update = { updatedAt: new Date() };
    if (req.body?.status === "ended" || req.body?.status === "rejected") update.status = req.body.status;
    if (req.body?.answer && typeof req.body.answer.sdp === "string" && req.body.answer.sdp.length < 200000) { update.answer = req.body.answer; update.status = "accepted"; }
    await db.collection("calls").updateOne({ _id: call._id }, { $set: update });
    const peerId = call.callerId === id ? call.calleeId : call.callerId;
    publishRealtime(peerId, { type: "call-updated", callId: call._id.toString(), status: update.status || call.status });
    if (call.calleeId === "admin" || call.callerId === "admin") publishRealtime("admin", { type: "call-updated", callId: call._id.toString(), status: update.status || call.status });
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: "Impossible de mettre à jour l'appel." }); }
});

app.post("/api/admin/communications/calls", adminAuth, requireUsersDb, async (req, res) => {
  try {
    const targetId = String(req.body?.targetId || req.body?.sellerId || "");
    const target = ObjectId.isValid(targetId) ? await db.collection("users").findOne({ _id: new ObjectId(targetId), role: { $in: CALL_RULES.admin }, status: "active" }) : null;
    const kind = req.body?.kind === "video" ? "video" : "audio";
    const offer = req.body?.offer;
    if (!target) return res.status(404).json({ error: "Utilisateur actif introuvable ou rôle non autorisé." });
    if (!offer || typeof offer.sdp !== "string" || offer.sdp.length > 200000) return res.status(400).json({ error: "Offre d'appel invalide." });
    const doc = { callerId: "admin", callerRole: "admin", callerName: "Administration NTV", calleeId: targetId, calleeRole: target.role, calleeName: target.businessName || target.name, kind, status: "ringing", offer, answer: null, createdAt: new Date(), updatedAt: new Date() };
    const result = await db.collection("calls").insertOne(doc);
    await notifyUser(targetId, `Appel ${kind === "video" ? "vidéo" : "audio"} de l'administration NTV.`, "call");
    publishRealtime(targetId, { type: "incoming-call", callId: result.insertedId.toString(), callerName: doc.callerName, kind, status: "ringing" });
    res.status(201).json({ call: { id: result.insertedId.toString(), ...doc } });
  } catch (error) { res.status(500).json({ error: "Impossible de lancer l'appel." }); }
});

app.get("/api/admin/communications/calls", adminAuth, requireUsersDb, async (_req, res) => {
  try {
    const rows = await db.collection("calls").find({ $or: [{ callerId: "admin" }, { calleeId: "admin" }], status: { $in: ["ringing", "accepted"] } }).sort({ createdAt: -1 }).limit(30).toArray();
    res.json({ calls: rows.map(c => ({ id: c._id.toString(), callerId: c.callerId, callerRole: c.callerRole, callerName: c.callerName, calleeId: c.calleeId, calleeRole: c.calleeRole, calleeName: c.calleeName, kind: c.kind, status: c.status, offer: c.offer, answer: c.answer, updatedAt: c.updatedAt })) });
  } catch (error) { res.status(500).json({ error: "Impossible de consulter les appels." }); }
});

app.patch("/api/admin/communications/calls/:id", adminAuth, requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Appel introuvable." });
    const call = await db.collection("calls").findOne({ _id: new ObjectId(req.params.id), $or: [{ callerId: "admin" }, { calleeId: "admin" }] });
    if (!call) return res.status(404).json({ error: "Appel introuvable." });
    if (call.callerId === "admin" && req.body?.answer) return res.status(403).json({ error: "Seul le destinataire peut accepter l'appel." });
    const update = { updatedAt: new Date() };
    if (req.body?.status === "ended" || req.body?.status === "rejected") update.status = req.body.status;
    if (req.body?.answer && typeof req.body.answer.sdp === "string" && req.body.answer.sdp.length < 200000) { update.answer = req.body.answer; update.status = "accepted"; }
    await db.collection("calls").updateOne({ _id: call._id }, { $set: update });
    const peerId = call.callerId === "admin" ? call.calleeId : call.callerId;
    publishRealtime(peerId, { type: "call-updated", callId: call._id.toString(), status: update.status || call.status });
    res.json({ ok: true });
  } catch (error) { res.status(500).json({ error: "Impossible de mettre à jour l'appel." }); }
});

// --------------------------------------------------
// ESPACE RÉCLAMATIONS CLIENTS, VENDEURS ET LIVREURS
// --------------------------------------------------
function complaintView(row) {
  return {
    id: row._id.toString(), reference: row.reference, userId: row.userId,
    userRole: row.userRole, userName: row.userName, userEmail: row.userEmail,
    category: row.category, subject: row.subject, orderId: row.orderId || "",
    description: row.description, status: row.status, adminReply: row.adminReply || "",
    history: row.history || [], createdAt: row.createdAt, updatedAt: row.updatedAt
  };
}

app.post("/api/complaints", authenticate, requireRole("customer", "seller", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const category = String(req.body?.category || "Autre").trim().slice(0, 60);
    const subject = String(req.body?.subject || "").trim().slice(0, 140);
    const orderId = String(req.body?.orderId || "").trim().slice(0, 80);
    const description = String(req.body?.description || "").trim().slice(0, 4000);
    if (subject.length < 4 || description.length < 10) return res.status(400).json({ error: "Précisez un objet (4 caractères minimum) et une description (10 caractères minimum)." });
    const now = new Date();
    const reference = `NTV-REC-${now.toISOString().slice(0,10).replace(/-/g,"")}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const doc = {
      reference, userId: req.user._id.toString(), userRole: req.user.role,
      userName: req.user.name || "Utilisateur NTV", userEmail: req.user.email || "",
      userPhone: req.user.phone || "", category, subject, orderId, description,
      status: "received", adminReply: "", history: [{ status: "received", at: now, actor: req.user.name || req.user.role }],
      createdAt: now, updatedAt: now
    };
    const result = await db.collection("complaints").insertOne(doc);
    doc._id = result.insertedId;
    res.status(201).json({ ok: true, complaint: complaintView(doc) });
  } catch (error) {
    console.error("Création réclamation:", error);
    res.status(500).json({ error: "Impossible d'enregistrer votre réclamation." });
  }
});

app.get("/api/complaints", authenticate, requireRole("customer", "seller", "delivery"), requireUsersDb, async (req, res) => {
  try {
    const rows = await db.collection("complaints").find({ userId: req.user._id.toString() }).sort({ createdAt: -1 }).limit(100).toArray();
    res.json({ complaints: rows.map(complaintView) });
  } catch (error) { res.status(500).json({ error: "Impossible de charger vos réclamations." }); }
});

app.get("/api/admin/complaints", adminAuth, requireUsersDb, async (_req, res) => {
  try {
    const rows = await db.collection("complaints").find({}).sort({ createdAt: -1 }).limit(500).toArray();
    res.json({ complaints: rows.map(complaintView) });
  } catch (error) { res.status(500).json({ error: "Impossible de charger les réclamations." }); }
});

app.patch("/api/admin/complaints/:id", adminAuth, requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Dossier introuvable." });
    const complaint = await db.collection("complaints").findOne({ _id: new ObjectId(req.params.id) });
    if (!complaint) return res.status(404).json({ error: "Dossier introuvable." });
    const allowed = ["received", "in_review", "resolved", "rejected"];
    const status = String(req.body?.status || complaint.status);
    if (!allowed.includes(status)) return res.status(400).json({ error: "Statut de réclamation invalide." });
    const adminReply = String(req.body?.adminReply || "").trim().slice(0, 4000);
    const now = new Date();
    const event = { status, at: now, actor: "Administration NTV", note: adminReply.slice(0, 300) };
    await db.collection("complaints").updateOne({ _id: complaint._id }, {
      $set: { status, adminReply, updatedAt: now }, $push: { history: event }
    });
    if (adminReply || status !== complaint.status) {
      const statusText = ({ received: "reçue", in_review: "en cours d'examen", resolved: "résolue", rejected: "clôturée" })[status];
      await notifyUser(complaint.userId, `Votre réclamation ${complaint.reference} est ${statusText}.${adminReply ? ` Réponse NTV : ${adminReply}` : ""}`, "complaint");
    }
    const updated = await db.collection("complaints").findOne({ _id: complaint._id });
    res.json({ ok: true, complaint: complaintView(updated) });
  } catch (error) {
    console.error("Mise à jour réclamation:", error);
    res.status(500).json({ error: "Impossible de mettre à jour ce dossier." });
  }
});

// --------------------------------------------------
// ADMINISTRATION DES COMPTES
// --------------------------------------------------

app.get("/api/admin/accounts", adminAuth, requireUsersDb, async (_req, res) => {
  try {
    const users = await db.collection("users")
      .find(
        { role: { $in: ["seller", "delivery", "customer"] } },
        { projection: { passwordHash: 0 } }
      )
      .sort({ createdAt: -1 })
      .limit(500)
      .toArray();

    const now = Date.now();
    res.json(users.map(user => ({
      ...publicUser(user),
      lastActivityAt: user.lastActivityAt || user.updatedAt || user.createdAt || null,
      inactiveForThreeMonths: user.role === "customer" && now - new Date(user.lastActivityAt || user.updatedAt || user.createdAt || now).getTime() >= 90 * 24 * 60 * 60 * 1000
    })));
  } catch (error) {
    console.error("Comptes administration:", error);
    res.status(500).json({
      error: "Impossible de charger les comptes."
    });
  }
});

app.patch("/api/admin/accounts/:id/status", adminAuth, requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        error: "Identifiant invalide."
      });
    }

    const status = String(req.body?.status || "");

    if (!["active", "rejected", "suspended", "pending"].includes(status)) {
      return res.status(400).json({
        error: "Statut invalide."
      });
    }

    const filter = {
      _id: new ObjectId(req.params.id),
      role: { $in: ["seller", "delivery"] }
    };

    const result = await db.collection("users").updateOne(
      filter,
      { $set: { status, updatedAt: new Date() } }
    );

    if (!result.matchedCount) {
      return res.status(404).json({
        error: "Compte introuvable."
      });
    }

    const user = await db.collection("users").findOne(filter, {
      projection: { passwordHash: 0 }
    });

    res.json({
      ok: true,
      user: publicUser(user)
    });
  } catch (error) {
    console.error("Modification compte:", error);
    res.status(500).json({
      error: "Impossible de modifier ce compte."
    });
  }
});

app.patch("/api/admin/accounts/:id/subscription", adminAuth, requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Identifiant invalide." });
    const seller = await db.collection("users").findOne({ _id: new ObjectId(req.params.id), role: "seller" });
    if (!seller) return res.status(404).json({ error: "Vendeur introuvable." });
    if (!["limited", "vip"].includes(seller.plan)) return res.status(400).json({ error: "Ce vendeur utilise la formule à commission, sans abonnement mensuel." });
    const action = String(req.body?.action || "");
    const now = new Date();
    let update = { $set: { updatedAt: now } };
    if (action === "activate" || action === "renew") {
      const currentExpiry = seller.subscriptionExpiresAt ? new Date(seller.subscriptionExpiresAt) : now;
      const start = currentExpiry > now ? currentExpiry : now;
      const expires = new Date(start);
      const targetDay = expires.getDate();
      expires.setDate(1);
      expires.setMonth(expires.getMonth() + 1);
      const lastDay = new Date(expires.getFullYear(), expires.getMonth() + 1, 0).getDate();
      expires.setDate(Math.min(targetDay, lastDay));
      const payment = { amount: seller.plan === "vip" ? 5000 : 2500, plan: seller.plan, paidAt: now, periodStartsAt: start, periodEndsAt: expires, validatedBy: "Administration NTV" };
      update.$set = { subscriptionStatus: "active", subscriptionStartedAt: seller.subscriptionStartedAt || now, subscriptionPaidAt: now, subscriptionExpiresAt: expires, updatedAt: now };
      update.$push = {
        subscriptionPayments: payment,
        notifications: { type: "subscription_active", message: `Votre abonnement ${seller.plan === "vip" ? "VIP" : "accès limité"} est validé jusqu'au ${expires.toLocaleDateString("fr-FR")}.`, at: now, read: false }
      };
    } else if (action === "suspend") {
      update.$set.subscriptionStatus = "suspended";
    } else if (action === "remind") {
      update.$push = { notifications: { type: "subscription_reminder", message: `Rappel NTV : votre abonnement ${seller.plan === "vip" ? "VIP (5 000 FCFA/mois)" : "accès limité (2 500 FCFA/mois)"} doit être réglé ou renouvelé. Merci de contacter l'administration NTV.`, at: now, read: false } };
    } else {
      return res.status(400).json({ error: "Action d'abonnement invalide." });
    }
    await db.collection("users").updateOne({ _id: seller._id }, update);
    const updated = await db.collection("users").findOne({ _id: seller._id }, { projection: { passwordHash: 0 } });
    res.json({ ok: true, user: publicUser(updated) });
  } catch (error) {
    console.error("Abonnement vendeur:", error);
    res.status(500).json({ error: "Impossible de mettre à jour l'abonnement." });
  }
});

app.post("/api/admin/accounts/:id/clear-media", adminAuth, requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Identifiant invalide." });
    const userId = new ObjectId(req.params.id);
    const user = await db.collection("users").findOne({ _id: userId, role: { $in: ["seller", "delivery", "customer"] } });
    if (!user) return res.status(404).json({ error: "Compte introuvable." });
    if (user.profileImagePublicId) await deleteCloudinaryAsset("image", user.profileImagePublicId).catch(err => console.warn("Suppression photo profil:", err.message));
    await db.collection("users").updateOne({ _id: userId }, { $unset: { profileImageUrl: "", profileImagePublicId: "" }, $set: { updatedAt: new Date() } });
    let productsUpdated = 0;
    if (user.role === "seller") {
      const result = await db.collection("products").updateMany({ $or: [{ sellerId: String(userId) }, { vendorId: String(userId) }] }, { $set: { imageUrls: [], imageUrl: "", updatedAt: new Date() } });
      productsUpdated = result.modifiedCount || 0;
    }
    res.json({ ok: true, message: "Références des médias du compte effacées.", productsUpdated });
  } catch (error) {
    console.error("Nettoyage médias compte:", error);
    res.status(500).json({ error: "Impossible de nettoyer les médias de ce compte." });
  }
});

app.delete("/api/admin/accounts/:id", adminAuth, requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Identifiant invalide." });
    const userId = new ObjectId(req.params.id);
    // Autoriser la suppression des trois types de comptes gérés dans cet écran.
    // Les commandes historiques restent conservées, même pour un client supprimé.
    const user = await db.collection("users").findOne({
      _id: userId,
      role: { $in: ["seller", "delivery", "customer"] }
    });
    if (!user) return res.status(404).json({ error: "Compte introuvable." });

    // Preserve order history and financial records; detach account references only.
    if (user.role === "seller") {
      await db.collection("products").updateMany({
        $or: [{ sellerId: String(userId) }, { vendorId: String(userId) }]
      }, { $set: { sellerStatus: "seller_deleted", updatedAt: new Date() } });
      await db.collection("orders").updateMany(
        { [`sellerConfirmations.${String(userId)}`]: { $exists: true } },
        { $set: { [`sellerConfirmations.${String(userId)}.sellerName`]: "Vendeur supprimé" } }
      ).catch(() => {});
    }
    await db.collection("users").deleteOne({ _id: userId });
    res.json({ ok: true, deletedId: String(userId), role: user.role });
  } catch (error) {
    console.error("Suppression définitive compte:", error);
    res.status(500).json({ error: "Impossible de supprimer ce compte." });
  }
});

// --------------------------------------------------
// CATALOGUE PUBLIC ET BOUTIQUES VENDEURS
// --------------------------------------------------

app.get("/api/products", async (_req, res) => {
  try {
    if (!db) return res.json(demoProducts);
    const sellers = await db.collection("users").find({ role: "seller", status: "active" }).toArray();
    const activeSellerIds = sellers.filter(sellerSubscriptionIsValid).map(user => user._id.toString());
    const products = await db.collection("products")
      .find({
        sellerStatus: { $ne: "seller_deleted" },
        $or: [
          { vendorId: null },
          { vendorId: { $exists: false } },
          { vendorId: { $in: activeSellerIds } }
        ]
      })
      .project({ _id: 0 })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(products);
  } catch (error) {
    console.error("Catalogue:", error);
    res.status(500).json({ error: "Impossible de charger les produits." });
  }
});

app.get("/api/stores", requireUsersDb, async (_req, res) => {
  try {
    const sellers = await db.collection("users").find({ role: "seller", status: "active" }).sort({ businessName: 1 }).toArray();
    const active = sellers.filter(sellerSubscriptionIsValid);
    const storeRows = await Promise.all(active.map(async seller => ({
      id: seller._id.toString(),
      name: seller.businessName || seller.name,
      description: seller.businessDescription || "Découvrez les produits de cette boutique sur NTV.",
      slug: seller.storeSlug,
      profileImageUrl: seller.profileImageUrl || "",
      plan: seller.plan || "commission",
      productCount: await db.collection("products").countDocuments({ vendorId: seller._id.toString() })
    })));
    res.json({ ok: true, stores: storeRows.filter(store => store.slug) });
  } catch (error) {
    console.error("Boutiques publiques:", error);
    res.status(500).json({ error: "Impossible de charger les boutiques." });
  }
});

// Informations publiques d'une boutique et ses produits.
app.get("/api/stores/:slug", requireUsersDb, async (req, res) => {
  try {
    const slug = String(req.params.slug || "").toLowerCase();

    const seller = await db.collection("users").findOne({
      storeSlug: slug,
      role: "seller",
      status: "active"
    });

    if (!seller || !sellerSubscriptionIsValid(seller)) {
      return res.status(404).json({
        error: "Boutique introuvable ou temporairement indisponible."
      });
    }

    const products = await db.collection("products")
      .find({
        vendorId: seller._id.toString()
      })
      .project({ _id: 0 })
      .sort({ createdAt: -1 })
      .toArray();

    res.json({
      store: {
        name: seller.businessName,
        description: seller.businessDescription || "",
        slug: seller.storeSlug,
        profileImageUrl: seller.profileImageUrl || ""
      },
      products
    });
  } catch (error) {
    console.error("Boutique publique:", error);
    res.status(500).json({
      error: "Impossible de charger cette boutique."
    });
  }
});

// --------------------------------------------------
// IMAGES DES PRODUITS
// --------------------------------------------------

app.post(
  "/api/seller/product-images",
  authenticate,
  requireRole("seller"),
  requireSellerCommercialAccess,
  requireMongo,
  upload.array("images", 2),
  async (req, res) => {
    try {
      const files = req.files || [];
      if (files.length < 1 || files.length > 2) {
        return res.status(400).json({ error: "Sélectionnez une ou deux images au maximum (JPG, PNG, WEBP ou GIF, 6 Mo maximum chacune)." });
      }
      const uploaded = await Promise.all(files.map(file => uploadOptimizedMedia(file.buffer, { folder: `ntv-mall/products/sellers/${req.user._id}` })));
      const imageUrls = uploaded.map(media => media.url);
      res.status(201).json({ ok: true, imageUrls, imageUrl: imageUrls[0], media: uploaded.map(({ publicId, bytes, format }) => ({ publicId, bytes, format })) });
    } catch (error) {
      console.error("Téléversement images produit vendeur:", error);
      res.status(500).json({ error: "Impossible d'enregistrer les images du produit." });
    }
  }
);

app.get("/api/images/:id", async (req, res) => {
  try {
    if (!imageBucket || !ObjectId.isValid(req.params.id)) {
      return res.status(404).end();
    }

    const fileId = new ObjectId(req.params.id);

    const file = await db.collection("productImages.files").findOne({
      _id: fileId
    });

    if (!file) return res.status(404).end();

    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Cache-Control", "public, max-age=31536000, immutable");

    imageBucket.openDownloadStream(fileId)
      .on("error", () => {
        if (!res.headersSent) res.status(404).end();
      })
      .pipe(res);
  } catch {
    if (!res.headersSent) res.status(500).end();
  }
});

// --------------------------------------------------
// PRODUITS GÉRÉS PAR LES VENDEURS
// --------------------------------------------------

app.get(
  "/api/seller/products",
  authenticate,
  requireRole("seller"),
  requireMongo,
  async (req, res) => {
    try {
      const products = await db.collection("products")
        .find({ vendorId: req.user._id.toString() })
        .project({ _id: 0 })
        .sort({ createdAt: -1 })
        .toArray();

      res.json(products);
    } catch (error) {
      console.error("Produits vendeur:", error);
      res.status(500).json({
        error: "Impossible de charger vos produits."
      });
    }
  }
);

app.post(
  "/api/seller/products",
  authenticate,
  requireRole("seller"),
  requireSellerCommercialAccess,
  requireMongo,
  async (req, res) => {
    try {
      const product = cleanProduct(req.body);

      product.id = `seller-${crypto.randomUUID()}`;
      product.vendorId = req.user._id.toString();
      product.vendorName = req.user.businessName || req.user.name;
      product.storeSlug = req.user.storeSlug || "";
      product.createdAt = new Date();

      await db.collection("products").insertOne(product);

      const output = { ...product };
      delete output._id;

      res.status(201).json(output);
    } catch (error) {
      res.status(400).json({
        error: error.message || "Impossible d'ajouter le produit."
      });
    }
  }
);

app.put(
  "/api/seller/products/:id",
  authenticate,
  requireRole("seller"),
  requireSellerCommercialAccess,
  requireMongo,
  async (req, res) => {
    try {
      const filter = {
        id: req.params.id,
        vendorId: req.user._id.toString()
      };

      const oldProduct = await db.collection("products").findOne(filter);

      if (!oldProduct) {
        return res.status(404).json({
          error: "Produit introuvable dans votre boutique."
        });
      }

      const product = cleanProduct(req.body, oldProduct);

      // Le vendeur ne peut jamais modifier le propriétaire du produit.
      product.vendorId = req.user._id.toString();
      product.vendorName = req.user.businessName || req.user.name;
      product.storeSlug = req.user.storeSlug || "";

      await db.collection("products").replaceOne(filter, product);

      const output = { ...product };
      delete output._id;

      res.json(output);
    } catch (error) {
      res.status(400).json({
        error: error.message || "Impossible de modifier le produit."
      });
    }
  }
);

app.delete(
  "/api/seller/products/:id",
  authenticate,
  requireRole("seller"),
  requireSellerCommercialAccess,
  requireMongo,
  async (req, res) => {
    try {
      const result = await db.collection("products").deleteOne({
        id: req.params.id,
        vendorId: req.user._id.toString()
      });

      if (!result.deletedCount) {
        return res.status(404).json({
          error: "Produit introuvable dans votre boutique."
        });
      }

      res.json({ ok: true });
    } catch (error) {
      console.error("Suppression produit vendeur:", error);
      res.status(500).json({
        error: "Impossible de supprimer le produit."
      });
    }
  }
);

// --------------------------------------------------
// TABLEAU DE BORD CENTRAL NTV
// --------------------------------------------------

app.get("/api/admin/dashboard", adminAuth, async (_req, res) => {
  try {
    const [
      productsCount,
      pendingSellers,
      pendingDelivery,
      activeSellers,
      activeDelivery
    ] = await Promise.all([
      db ? db.collection("products").countDocuments() : Promise.resolve(demoProducts.length),
      db ? db.collection("users").countDocuments({ role: "seller", status: "pending" }) : 0,
      db ? db.collection("users").countDocuments({ role: "delivery", status: "pending" }) : 0,
      db ? db.collection("users").countDocuments({ role: "seller", status: "active" }) : 0,
      db ? db.collection("users").countDocuments({ role: "delivery", status: "active" }) : 0
    ]);

    let orderCount = 0;
    let pendingOrders = 0;
    let totalSales = 0;

    // Les commandes PostgreSQL sont conservées.
    if (pool) {
      const result = await pool.query(`
        SELECT
          COUNT(*)::int AS count,
          COUNT(*) FILTER (
            WHERE status IN ('À confirmer', 'En attente', 'Nouvelle')
          )::int AS pending,
          COALESCE(SUM(total), 0)::bigint AS total
        FROM orders
      `);

      orderCount += Number(result.rows[0].count || 0);
      pendingOrders += Number(result.rows[0].pending || 0);
      totalSales += Number(result.rows[0].total || 0);
    }

    // Les éventuelles anciennes commandes MongoDB restent visibles.
    if (db) {
      const result = await db.collection("orders").aggregate([
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            pending: {
              $sum: {
                $cond: [
                  { $in: ["$status", ["À confirmer", "En attente", "Nouvelle"]] },
                  1,
                  0
                ]
              }
            },
            total: { $sum: "$total" }
          }
        }
      ]).toArray();

      if (result[0]) {
        orderCount += result[0].count || 0;
        pendingOrders += result[0].pending || 0;
        totalSales += result[0].total || 0;
      }
    }

    res.json({
      ok: true,
      database: {
        mongo: Boolean(db),
        postgres: Boolean(pool),
        cloudinary: cloudinaryReady()
      },
      productsCount,
      pendingSellers,
      pendingDelivery,
      activeSellers,
      activeDelivery,
      orderCount,
      pendingOrders,
      totalSales
    });
  } catch (error) {
    console.error("Dashboard:", error);
    res.status(500).json({
      error: "Impossible de charger les indicateurs."
    });
  }
});

// --------------------------------------------------
// COMMANDES : LECTURE ADMINISTRATION
// --------------------------------------------------

function formatMongoOrder(order) {
  return {
    id: order._id.toString(),
    orderId: order.orderId,
    customer: order.customer,
    items: order.items || [],
    total: Number(order.total || 0),
    paymentMethod: order.paymentMethod,
    status: order.status,
    history: order.history || [],
    sellerConfirmations: order.sellerConfirmations || {},
    delivery: {
      id: order.deliveryId || null,
      name: order.deliveryName || null,
      status: order.deliveryStatus || "unassigned",
      assignedAt: order.deliveryAssignedAt || null,
      updatedAt: order.deliveryUpdatedAt || null
    },
    createdAt: order.createdAt
  };
}

function formatPostgresOrder(order) {
  return {
    id: String(order.id),
    orderId: `NTV-${order.id}`,
    customer: {
      name: order.customer_name,
      phone: order.phone,
      country: order.country,
      address: order.address
    },
    items: order.items || [],
    total: Number(order.total || 0),
    paymentMethod: order.payment_method,
    status: order.status,
    history: order.status_history || [],
    sellerConfirmations: order.seller_confirmations || {},
    delivery: {
      id: order.delivery_id || null,
      name: order.delivery_name || null,
      status: order.delivery_status || "unassigned",
      assignedAt: order.delivery_assigned_at || null,
      updatedAt: order.delivery_updated_at || null
    },
    createdAt: order.created_at
  };
}

app.get("/api/admin/orders", adminAuth, async (_req, res) => {
  try {
    const orders = [];

    if (pool) {
      const result = await pool.query(`
        SELECT
          id, customer_name, phone, country, address,
          items, total, payment_method, status,
          status_history, seller_confirmations, created_at,
          delivery_id, delivery_name, delivery_status,
          delivery_assigned_at, delivery_updated_at
        FROM orders
        ORDER BY created_at DESC
        LIMIT 500
      `);

      orders.push(...result.rows.map(formatPostgresOrder));
    }

    if (db) {
      const mongoOrders = await db.collection("orders")
        .find({})
        .sort({ createdAt: -1 })
        .limit(500)
        .toArray();

      orders.push(...mongoOrders.map(formatMongoOrder));
    }

    orders.sort((a, b) =>
      new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );

    res.json(orders.slice(0, 500));
  } catch (error) {
    console.error("Liste commandes:", error);
    res.status(500).json({
      error: "Impossible de charger les commandes."
    });
  }
});

// --------------------------------------------------
// MODIFICATION DU STATUT DES COMMANDES PAR NTV
// --------------------------------------------------

app.delete("/api/admin/orders/:id", adminAuth, async (req, res) => {
  const id = String(req.params.id || "");
  if (!id || id.length > 128) return res.status(400).json({ error: "Identifiant invalide." });
  try {
    let deleted = 0;
    if (pool) {
      const result = await pool.query("DELETE FROM orders WHERE id::text = $1", [id]);
      deleted += result.rowCount || 0;
    }
    if (db && ObjectId.isValid(id)) {
      const result = await db.collection("orders").deleteOne({ _id: new ObjectId(id) });
      deleted += result.deletedCount || 0;
    }
    if (!deleted) return res.status(404).json({ error: "Historique/commande introuvable." });
    res.json({ ok: true, deleted });
  } catch (error) {
    console.error("Suppression historique commande:", error);
    res.status(500).json({ error: "Impossible de supprimer cet historique." });
  }
});

app.patch("/api/admin/orders/:id/status", adminAuth, async (req, res) => {
  const allowed = [
    "À confirmer",
    "Confirmée",
    "En préparation",
    "Prête à expédier",
    "Expédiée",
    "En livraison",
    "Livrée",
    "Annulée"
  ];

  const status = String(req.body?.status || "");

  if (!allowed.includes(status)) {
    return res.status(400).json({
      error: "Statut de commande invalide."
    });
  }

  const at = new Date();
  const note = String(req.body?.note || "").trim().slice(0, 300);

  const event = {
    status,
    at,
    actor: "Administration NTV",
    note
  };

  try {
    const rawId = String(req.params.id).replace(/^NTV-/, "");

    // Commandes PostgreSQL.
    if (pool && /^\d+$/.test(rawId)) {
      const numericId = Number(rawId);

      if (!Number.isSafeInteger(numericId) || numericId < 1) {
        return res.status(400).json({
          error: "Identifiant de commande invalide."
        });
      }

      const result = await pool.query(`
        UPDATE orders
        SET
          status = $1,
          status_history = status_history || $2::jsonb
        WHERE id = $3
        RETURNING status_history
      `, [status, JSON.stringify([event]), numericId]);

      if (result.rowCount) {
        return res.json({
          ok: true,
          status,
          history: result.rows[0].status_history || []
        });
      }
    }

    // Commandes MongoDB.
    if (db && ObjectId.isValid(req.params.id)) {
      const result = await db.collection("orders").updateOne(
        { _id: new ObjectId(req.params.id) },
        {
          $set: { status, updatedAt: at },
          $push: { history: event }
        }
      );

      if (result.matchedCount) {
        const updated = await db.collection("orders").findOne({
          _id: new ObjectId(req.params.id)
        });

        return res.json({
          ok: true,
          status,
          history: updated.history || []
        });
      }
    }

    return res.status(404).json({
      error: "Commande introuvable."
    });
  } catch (error) {
    console.error("Statut commande:", error);
    res.status(500).json({
      error: "Impossible de modifier la commande."
    });
  }
});

// --------------------------------------------------
// MISSIONS DE LIVRAISON
// --------------------------------------------------

app.post("/api/admin/orders/:id/dispatch", adminAuth, async (req, res) => {
  const at = new Date();
  const event = {
    status: "Mission proposée aux livreurs",
    at: at.toISOString(),
    actor: "Administration NTV",
    note: "Mission publiée dans les espaces des livreurs actifs."
  };
  try {
    const rawId = String(req.params.id).replace(/^NTV-/, "");
    if (pool && /^\d+$/.test(rawId)) {
      const result = await pool.query(`
        UPDATE orders
        SET delivery_status = 'available', delivery_id = NULL,
            delivery_name = NULL, delivery_assigned_at = NULL,
            delivery_updated_at = $1,
            status_history = status_history || $2::jsonb
        WHERE id = $3 AND status IN ('Prête à expédier', 'Expédiée')
        RETURNING id
      `, [at, JSON.stringify([event]), Number(rawId)]);
      if (result.rowCount) return res.json({ ok: true, deliveryStatus: "available" });
    }
    if (db && ObjectId.isValid(req.params.id)) {
      const result = await db.collection("orders").updateOne(
        { _id: new ObjectId(req.params.id), status: { $in: ["Prête à expédier", "Expédiée"] } },
        { $set: { deliveryId: null, deliveryName: null, deliveryStatus: "available", deliveryAssignedAt: null, deliveryUpdatedAt: at, updatedAt: at }, $push: { history: event } }
      );
      if (result.matchedCount) return res.json({ ok: true, deliveryStatus: "available" });
    }
    return res.status(404).json({ error: "Commande introuvable ou déjà clôturée." });
  } catch (error) {
    console.error("Publication mission:", error);
    return res.status(500).json({ error: "Impossible de publier la mission." });
  }
});

app.get("/api/delivery/missions", authenticate, requireRole("delivery"), async (req, res) => {
  try {
    const deliveryId = req.user._id.toString();
    const missions = [];
    if (pool) {
      const result = await pool.query(`
        SELECT id, customer_name, phone, country, address, items, total,
          payment_method, status, status_history, seller_confirmations, created_at,
          delivery_id, delivery_name, delivery_status, delivery_assigned_at, delivery_updated_at
        FROM orders
        WHERE delivery_status = 'available' OR delivery_id = $1
        ORDER BY created_at DESC LIMIT 500
      `, [deliveryId]);
      missions.push(...result.rows.map(formatPostgresOrder));
    }
    if (db) {
      const rows = await db.collection("orders").find({
        $or: [{ deliveryStatus: "available" }, { deliveryId }]
      }).sort({ createdAt: -1 }).limit(500).toArray();
      missions.push(...rows.map(formatMongoOrder));
    }
    missions.sort((a,b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    res.json({ ok: true, missions: missions.slice(0, 500) });
  } catch (error) {
    console.error("Missions livreur:", error);
    res.status(500).json({ error: "Impossible de charger les missions." });
  }
});

app.post("/api/delivery/missions/:id/accept", authenticate, requireRole("delivery"), async (req, res) => {
  const deliveryId = req.user._id.toString();
  const deliveryName = req.user.name || req.user.email;
  const at = new Date();
  const event = { status: "Mission acceptée", at: at.toISOString(), actor: deliveryName, note: "Le livreur a accepté la mission." };
  try {
    const rawId = String(req.params.id).replace(/^NTV-/, "");
    if (pool && /^\d+$/.test(rawId)) {
      const result = await pool.query(`
        UPDATE orders SET delivery_id = $1, delivery_name = $2,
          delivery_status = 'accepted', delivery_assigned_at = $3,
          delivery_updated_at = $3,
          status_history = status_history || $4::jsonb
        WHERE id = $5 AND delivery_status = 'available'
        RETURNING id
      `, [deliveryId, deliveryName, at, JSON.stringify([event]), Number(rawId)]);
      if (result.rowCount) return res.json({ ok: true, deliveryStatus: "accepted" });
    }
    if (db && ObjectId.isValid(req.params.id)) {
      const result = await db.collection("orders").updateOne(
        { _id: new ObjectId(req.params.id), deliveryStatus: "available" },
        { $set: { deliveryId, deliveryName, deliveryStatus: "accepted", deliveryAssignedAt: at, deliveryUpdatedAt: at, updatedAt: at }, $push: { history: event } }
      );
      if (result.modifiedCount) return res.json({ ok: true, deliveryStatus: "accepted" });
    }
    return res.status(409).json({ error: "Cette mission a déjà été acceptée ou n'est plus disponible." });
  } catch (error) {
    console.error("Acceptation mission:", error);
    res.status(500).json({ error: "Impossible d'accepter la mission." });
  }
});

app.patch("/api/delivery/missions/:id/status", authenticate, requireRole("delivery"), async (req, res) => {
  const steps = {
    picked_up: { deliveryStatus: "picked_up", orderStatus: "Expédiée", label: "Colis récupéré" },
    in_transit: { deliveryStatus: "in_transit", orderStatus: "En livraison", label: "En cours de livraison" },
    delivered: { deliveryStatus: "delivered", orderStatus: "Livrée", label: "Livraison terminée" }
  };
  const step = steps[String(req.body?.step || "")];
  if (!step) return res.status(400).json({ error: "Étape de livraison invalide." });
  const deliveryId = req.user._id.toString();
  const at = new Date();
  const event = { status: step.orderStatus, at: at.toISOString(), actor: req.user.name || req.user.email, note: step.label };
  try {
    const rawId = String(req.params.id).replace(/^NTV-/, "");
    if (pool && /^\d+$/.test(rawId)) {
      const result = await pool.query(`
        UPDATE orders SET delivery_status = $1, status = $2,
          delivery_updated_at = $3,
          status_history = status_history || $4::jsonb
        WHERE id = $5 AND delivery_id = $6
        RETURNING id
      `, [step.deliveryStatus, step.orderStatus, at, JSON.stringify([event]), Number(rawId), deliveryId]);
      if (result.rowCount) return res.json({ ok: true, deliveryStatus: step.deliveryStatus, status: step.orderStatus });
    }
    if (db && ObjectId.isValid(req.params.id)) {
      const result = await db.collection("orders").updateOne(
        { _id: new ObjectId(req.params.id), deliveryId },
        { $set: { deliveryStatus: step.deliveryStatus, status: step.orderStatus, deliveryUpdatedAt: at, updatedAt: at }, $push: { history: event } }
      );
      if (result.matchedCount) return res.json({ ok: true, deliveryStatus: step.deliveryStatus, status: step.orderStatus });
    }
    return res.status(404).json({ error: "Mission introuvable ou non attribuée à votre compte." });
  } catch (error) {
    console.error("Progression livraison:", error);
    res.status(500).json({ error: "Impossible de mettre à jour la livraison." });
  }
});

// --------------------------------------------------
// COMMANDES VISIBLES PAR UN VENDEUR
// --------------------------------------------------

function maskPhone(phone) {
  const value = String(phone || "");

  if (value.length < 5) return "Coordonnées disponibles auprès de NTV";

  return `${value.slice(0, 3)}••••${value.slice(-2)}`;
}

function sellerOrderView(order, sellerId) {
  const ownItems = (order.items || []).filter(
    item => String(item.vendorId || "") === sellerId
  );

  if (!ownItems.length) return null;

  return {
    id: order.id,
    orderId: order.orderId,
    items: ownItems.map(item => ({
      id: item.id,
      name: item.name,
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0),
      vendorId: item.vendorId
    })),
    status: order.status,
    sellerConfirmation: order.sellerConfirmations?.[sellerId] || { status: "pending", note: "En attente de votre confirmation." },
    createdAt: order.createdAt,
    totalSellerItems: ownItems.reduce(
      (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
      0
    ),
    customer: {
      name: order.customer?.name || order.customer_name || "Client NTV",
      phone: maskPhone(order.customer?.phone || order.phone),
      country: order.customer?.country || order.country || "",
      address: "Les coordonnées complètes du client sont gérées par NTV."
    },
    message: "Confirmez la disponibilité des articles ou indiquez le motif du rejet. Les coordonnées complètes du client restent protégées."
  };
}

app.get(
  "/api/seller/orders",
  authenticate,
  requireRole("seller"),
  async (req, res) => {
    try {
      const sellerId = req.user._id.toString();
      const orders = [];

      // Commandes PostgreSQL.
      if (pool) {
        const result = await pool.query(`
          SELECT
            id, customer_name, phone, country, address,
            items, total, payment_method, status,
            status_history, seller_confirmations, created_at,
            delivery_id, delivery_name, delivery_status,
            delivery_assigned_at, delivery_updated_at
          FROM orders
          WHERE EXISTS (
            SELECT 1
            FROM jsonb_array_elements(items) AS item
            WHERE item->>'vendorId' = $1
          )
          ORDER BY created_at DESC
          LIMIT 500
        `, [sellerId]);

        for (const row of result.rows) {
          const order = formatPostgresOrder(row);
          const view = sellerOrderView(order, sellerId);
          if (view) orders.push(view);
        }
      }

      // Commandes MongoDB éventuellement présentes.
      if (db) {
        const mongoOrders = await db.collection("orders")
          .find({ "items.vendorId": sellerId })
          .sort({ createdAt: -1 })
          .limit(500)
          .toArray();

        for (const row of mongoOrders) {
          const view = sellerOrderView(formatMongoOrder(row), sellerId);
          if (view) orders.push(view);
        }
      }

      orders.sort((a, b) =>
        new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
      );

      res.json({
        ok: true,
        orders: orders.slice(0, 500),
        permissions: {
          canView: true,
          canConfirm: true,
          canManagePreparation: req.user.plan === "vip",
          canManageCustomer: false,
          canCancelOrder: false
        }
      });
    } catch (error) {
      console.error("Commandes vendeur:", error);
      res.status(500).json({
        error: "Impossible de charger les commandes de votre boutique."
      });
    }
  }
);

app.patch("/api/seller/orders/:id/confirmation", authenticate, requireRole("seller"), requireSellerCommercialAccess, async (req, res) => {
  const sellerId = req.user._id.toString();
  const decision = String(req.body?.decision || "");
  const note = String(req.body?.note || "").trim().slice(0, 300);
  if (!["accepted", "rejected"].includes(decision)) return res.status(400).json({ error: "Choisissez Accepter ou Rejeter." });
  if (decision === "rejected" && note.length < 3) return res.status(400).json({ error: "Veuillez préciser pourquoi vous rejetez cette commande." });
  const at = new Date();
  const confirmation = { status: decision, at: at.toISOString(), sellerId, sellerName: req.user.businessName || req.user.name, note: note || "Disponibilité confirmée par le vendeur." };
  try {
    const rawId = String(req.params.id).replace(/^NTV-/, "");
    if (pool && /^\d+$/.test(rawId)) {
      const found = await pool.query("SELECT items, seller_confirmations, stock_policy FROM orders WHERE id = $1", [Number(rawId)]);
      if (found.rowCount) {
        const ownItems = (found.rows[0].items || []).filter(item => String(item.vendorId || "") === sellerId);
        if (!ownItems.length) return res.status(403).json({ error: "Cette commande ne contient aucun article de votre boutique." });
        const current = found.rows[0].seller_confirmations || {};
        if (current[sellerId]?.status && current[sellerId].status !== "pending") return res.status(409).json({ error: "Vous avez déjà répondu à cette commande. Contactez NTV pour demander une modification." });
        const legacyOrder = found.rows[0].stock_policy !== "seller-confirmation-v2";
        const reserved = [];
        try {
          if (decision === "accepted" && !legacyOrder && db) {
            const quantities = new Map();
            for (const item of ownItems) quantities.set(String(item.id), (quantities.get(String(item.id)) || 0) + Number(item.quantity || 0));
            for (const [productId, quantity] of quantities) {
              const product = await db.collection("products").findOne({ id: productId });
              if (!product) throw new Error(`Le produit ${productId} n'existe plus dans le catalogue.`);
              if (product.stock === undefined || product.stock === null) continue;
              const result = await db.collection("products").updateOne(
                { id: productId, stock: { $gte: quantity } },
                { $inc: { stock: -quantity }, $set: { updatedAt: new Date() } }
              );
              if (!result.modifiedCount) throw new Error(`Stock insuffisant pour ${product.name || productId}.`);
              reserved.push({ id: productId, quantity });
            }
          }
          const savedConfirmation = { ...confirmation, stockApplied: decision === "accepted" && !legacyOrder };
          const saved = await pool.query(
            `UPDATE orders
             SET seller_confirmations = jsonb_set(COALESCE(seller_confirmations, '{}'::jsonb), ARRAY[$1]::text[], $2::jsonb, TRUE)
             WHERE id = $3 AND COALESCE(seller_confirmations -> $1 ->> 'status', 'pending') = 'pending'
             RETURNING id`,
            [sellerId, JSON.stringify(savedConfirmation), Number(rawId)]
          );
          if (!saved.rowCount) throw new Error("Cette commande vient d'être traitée. Actualisez la page.");
          return res.json({ ok: true, confirmation: savedConfirmation, stockUpdated: reserved.length > 0 });
        } catch (saveError) {
          if (reserved.length && db) await db.collection("products").bulkWrite(reserved.map(item => ({
            updateOne: { filter: { id: item.id }, update: { $inc: { stock: item.quantity }, $set: { updatedAt: new Date() } } }
          }))).catch(rollbackError => console.error("Annulation réservation stock:", rollbackError.message));
          if (saveError.message?.includes("Stock insuffisant") || saveError.message?.includes("n'existe plus") || saveError.message?.includes("vient d'être traitée")) return res.status(409).json({ error: saveError.message });
          throw saveError;
        }
      }
    }
    if (db && ObjectId.isValid(req.params.id)) {
      const order = await db.collection("orders").findOne({ _id: new ObjectId(req.params.id), "items.vendorId": sellerId });
      if (order) {
        const ownItems = (order.items || []).filter(item => String(item.vendorId || "") === sellerId);
        const current = order.sellerConfirmations || {};
        if (current[sellerId]?.status && current[sellerId].status !== "pending") return res.status(409).json({ error: "Vous avez déjà répondu à cette commande. Contactez NTV pour demander une modification." });
        const legacyOrder = order.stockPolicy !== "seller-confirmation-v2";
        const reserved = [];
        try {
          if (decision === "accepted" && !legacyOrder) {
            const quantities = new Map();
            for (const item of ownItems) quantities.set(String(item.id), (quantities.get(String(item.id)) || 0) + Number(item.quantity || 0));
            for (const [productId, quantity] of quantities) {
              const product = await db.collection("products").findOne({ id: productId });
              if (!product) throw new Error(`Le produit ${productId} n'existe plus dans le catalogue.`);
              if (product.stock === undefined || product.stock === null) continue;
              const result = await db.collection("products").updateOne(
                { id: productId, stock: { $gte: quantity } },
                { $inc: { stock: -quantity }, $set: { updatedAt: new Date() } }
              );
              if (!result.modifiedCount) throw new Error(`Stock insuffisant pour ${product.name || productId}.`);
              reserved.push({ id: productId, quantity });
            }
          }
          const nextConfirmation = { ...confirmation, stockApplied: decision === "accepted" && !legacyOrder };
          const saved = await db.collection("orders").updateOne(
            { _id: order._id, [`sellerConfirmations.${sellerId}.status`]: { $in: [null, "pending"] } },
            { $set: { [`sellerConfirmations.${sellerId}`]: nextConfirmation, updatedAt: at } }
          );
          if (!saved.modifiedCount) throw new Error("Cette commande vient d'être traitée. Actualisez la page.");
          return res.json({ ok: true, confirmation: nextConfirmation, stockUpdated: reserved.length > 0 });
        } catch (saveError) {
          if (reserved.length) await db.collection("products").bulkWrite(reserved.map(item => ({
            updateOne: { filter: { id: item.id }, update: { $inc: { stock: item.quantity }, $set: { updatedAt: new Date() } } }
          }))).catch(rollbackError => console.error("Annulation réservation stock:", rollbackError.message));
          if (saveError.message?.includes("Stock insuffisant") || saveError.message?.includes("n'existe plus") || saveError.message?.includes("vient d'être traitée")) return res.status(409).json({ error: saveError.message });
          throw saveError;
        }
      }
    }
    return res.status(404).json({ error: "Commande introuvable pour votre boutique." });
  } catch (error) {
    console.error("Confirmation vendeur:", error);
    res.status(500).json({ error: "Impossible d'enregistrer votre réponse." });
  }
});

app.patch("/api/seller/orders/:id/preparation", authenticate, requireRole("seller"), requireSellerCommercialAccess, async (req, res) => {
  if (req.user.plan !== "vip") return res.status(403).json({ error: "Cette fonction est réservée aux vendeurs VIP." });
  const status = String(req.body?.status || "");
  if (!["En préparation", "Prête à expédier"].includes(status)) return res.status(400).json({ error: "Étape de préparation invalide." });
  const sellerId = req.user._id.toString();
  const at = new Date();
  const preparation = { status, at: at.toISOString(), actor: req.user.businessName || req.user.name };
  try {
    const rawId = String(req.params.id).replace(/^NTV-/, "");
    if (pool && /^\d+$/.test(rawId)) {
      const found = await pool.query("SELECT items, seller_confirmations FROM orders WHERE id = $1", [Number(rawId)]);
      if (found.rowCount && (found.rows[0].items || []).some(item => String(item.vendorId || "") === sellerId)) {
        const current = found.rows[0].seller_confirmations || {};
        if (current[sellerId]?.status !== "accepted") return res.status(409).json({ error: "Vous devez d'abord accepter la disponibilité de cette commande." });
        const next = { ...current, [sellerId]: { ...current[sellerId], preparation } };
        const sellerCount = new Set((found.rows[0].items || []).map(item => String(item.vendorId || "")).filter(Boolean)).size;
        if (sellerCount === 1) {
          const event = { status, at: at.toISOString(), actor: preparation.actor, note: "Étape de préparation confirmée par le vendeur VIP." };
          await pool.query("UPDATE orders SET seller_confirmations = $1::jsonb, status = $2, status_history = status_history || $3::jsonb WHERE id = $4", [JSON.stringify(next), status, JSON.stringify([event]), Number(rawId)]);
        } else {
          await pool.query("UPDATE orders SET seller_confirmations = $1::jsonb WHERE id = $2", [JSON.stringify(next), Number(rawId)]);
        }
        return res.json({ ok: true, preparation, globalStatusUpdated: sellerCount === 1 });
      }
    }
    if (db && ObjectId.isValid(req.params.id)) {
      const order = await db.collection("orders").findOne({ _id: new ObjectId(req.params.id), "items.vendorId": sellerId });
      if (order) {
        if (order.sellerConfirmations?.[sellerId]?.status !== "accepted") return res.status(409).json({ error: "Vous devez d'abord accepter la disponibilité de cette commande." });
        const sellerCount = new Set((order.items || []).map(item => String(item.vendorId || "")).filter(Boolean)).size;
        const update = { $set: { [`sellerConfirmations.${sellerId}.preparation`]: preparation, updatedAt: at } };
        if (sellerCount === 1) {
          const event = { status, at: at.toISOString(), actor: preparation.actor, note: "Étape de préparation confirmée par le vendeur VIP." };
          update.$set.status = status;
          update.$push = { history: event };
        }
        await db.collection("orders").updateOne({ _id: order._id }, update);
        return res.json({ ok: true, preparation, globalStatusUpdated: sellerCount === 1 });
      }
    }
    return res.status(404).json({ error: "Commande introuvable pour votre boutique." });
  } catch (error) {
    console.error("Préparation vendeur VIP:", error);
    res.status(500).json({ error: "Impossible de mettre à jour la préparation." });
  }
});

app.get("/api/admin/seller-billing", adminAuth, requireUsersDb, async (_req, res) => {
  try {
    const sellers = await db.collection("users").find({ role: "seller" }).sort({ businessName: 1 }).toArray();
    const totals = new Map();
    const addItems = items => {
      for (const item of items || []) {
        if (!item.vendorId) continue;
        const current = totals.get(String(item.vendorId)) || { sales: 0, commission: 0, orders: 0 };
        const lineTotal = Number(item.price || 0) * Number(item.quantity || 0);
        current.sales += lineTotal;
        current.commission += lineTotal * Number(item.commissionRate || 0);
        current.orders += 1;
        totals.set(String(item.vendorId), current);
      }
    };
    if (pool) {
      const rows = await pool.query("SELECT items FROM orders WHERE status NOT IN ('À confirmer', 'Annulée')");
      rows.rows.forEach(row => addItems(row.items));
    }
    if (db) {
      const rows = await db.collection("orders").find({ status: { $nin: ["À confirmer", "Annulée"] } }, { projection: { items: 1 } }).toArray();
      rows.forEach(row => addItems(row.items));
    }
    const now = Date.now();
    const output = sellers.map(seller => {
      const plan = sellerPlanDetails(seller.plan || "commission");
      const expiry = seller.subscriptionExpiresAt ? new Date(seller.subscriptionExpiresAt).getTime() : 0;
      const alert = seller.plan === "commission" ? "none" : !expiry || seller.subscriptionStatus !== "active" ? "payment_required" : expiry <= now ? "expired" : expiry - now <= 7 * 86400000 ? "renewal_due" : "ok";
      return { ...publicUser(seller), planLabel: plan?.label || "Formule non définie", monthlyPrice: plan?.monthlyPrice || 0, commissionRate: plan?.commissionRate || 0, sales: totals.get(seller._id.toString())?.sales || 0, commissionDue: totals.get(seller._id.toString())?.commission || 0, orderLines: totals.get(seller._id.toString())?.orders || 0, subscriptionAlert: alert };
    });
    res.json({ ok: true, sellers: output });
  } catch (error) {
    console.error("Facturation vendeurs:", error);
    res.status(500).json({ error: "Impossible de charger les abonnements et commissions." });
  }
});

// --------------------------------------------------
// PRODUITS GÉRÉS PAR L'ADMINISTRATION
// --------------------------------------------------

app.get("/api/admin/products", adminAuth, requireMongo, async (_req, res) => {
  try {
    const products = await db.collection("products")
      .find({})
      .project({ _id: 0 })
      .sort({ name: 1 })
      .toArray();

    res.json(products);
  } catch (error) {
    console.error("Produits admin:", error);
    res.status(500).json({
      error: "Impossible de charger les produits."
    });
  }
});

app.post("/api/admin/products", adminAuth, requireMongo, async (req, res) => {
  try {
    const product = cleanProduct(req.body);

    product.id = `ntv-${crypto.randomUUID()}`;
    product.vendorId = null;
    product.vendorName = "NEWS TECHNOLOGY VILLAGE";
    product.createdAt = new Date();

    await db.collection("products").insertOne(product);

    const output = { ...product };
    delete output._id;

    res.status(201).json(output);
  } catch (error) {
    res.status(400).json({
      error: error.message || "Impossible d'ajouter le produit."
    });
  }
});

app.put("/api/admin/products/:id", adminAuth, requireMongo, async (req, res) => {
  try {
    const oldProduct = await db.collection("products").findOne({
      id: req.params.id
    });

    if (!oldProduct) {
      return res.status(404).json({
        error: "Produit introuvable."
      });
    }

    const product = cleanProduct(req.body, oldProduct);

    // L'administration peut gérer le produit, mais cette route
    // ne change pas son propriétaire.
    product.vendorId = oldProduct.vendorId ?? null;
    product.vendorName = oldProduct.vendorName || "NEWS TECHNOLOGY VILLAGE";
    product.storeSlug = oldProduct.storeSlug || "";

    await db.collection("products").replaceOne(
      { id: req.params.id },
      product
    );

    const output = { ...product };
    delete output._id;

    res.json(output);
  } catch (error) {
    res.status(400).json({
      error: error.message || "Impossible de modifier le produit."
    });
  }
});

app.delete("/api/admin/products/:id", adminAuth, requireMongo, async (req, res) => {
  try {
    const result = await db.collection("products").deleteOne({
      id: req.params.id
    });

    if (!result.deletedCount) {
      return res.status(404).json({
        error: "Produit introuvable."
      });
    }

    res.json({ ok: true });
  } catch (error) {
    console.error("Suppression produit admin:", error);
    res.status(500).json({
      error: "Impossible de supprimer le produit."
    });
  }
});

// --------------------------------------------------
// TÉLÉVERSEMENT D'IMAGES
// --------------------------------------------------

app.post(
  "/api/admin/images",
  adminAuth,
  requireMongo,
  upload.array("images", 2),
  async (req, res) => {
    const files = req.files || [];
    if (!files.length || files.length > 2) {
      return res.status(400).json({
        error: "Ajoutez une ou deux images au maximum (JPG, PNG, WEBP ou GIF, 6 Mo maximum chacune)."
      });
    }

    try {
      const uploaded = await Promise.all(files.map(file => uploadOptimizedMedia(file.buffer, { folder: "ntv-mall/products/admin" })));
      const imageUrls = uploaded.map(media => media.url);
      res.status(201).json({ imageUrls, imageUrl: imageUrls[0], media: uploaded.map(({ publicId, bytes, format }) => ({ publicId, bytes, format })) });
    } catch (error) {
      console.error("Upload images admin:", error);
      res.status(500).json({ error: "Échec du téléchargement des images." });
    }
  }
);

// --------------------------------------------------
// CRÉATION DES COMMANDES CLIENTS
// --------------------------------------------------

// --------------------------------------------------
// SUIVI PUBLIC D'UNE COMMANDE (numéro + téléphone)
// --------------------------------------------------

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

// Commandes du client connecté : les anciennes commandes sont retrouvées
// avec le téléphone vérifié du compte, sans modifier les documents existants.
app.get("/api/customer/orders", authenticate, requireRole("customer"), async (req, res) => {
  try {
    const phone = normalizePhone(req.user.phone);
    if (!phone) return res.json({ orders: [] });
    let orders = [];
    if (pool) {
      const result = await pool.query(`
        SELECT id, customer_name, phone, country, address, items, total,
          payment_method, status, status_history, seller_confirmations,
          delivery_id, delivery_name, delivery_status, delivery_assigned_at,
          delivery_updated_at, created_at
        FROM orders
        WHERE regexp_replace(phone, '\\D', '', 'g') = $1
        ORDER BY created_at DESC LIMIT 100
      `, [phone]);
      orders = result.rows.map(formatPostgresOrder);
    } else if (db) {
      const rows = await db.collection("orders").find({}).sort({ createdAt: -1 }).limit(500).toArray();
      orders = rows.filter(row => normalizePhone(row.customer?.phone) === phone).map(formatMongoOrder).slice(0, 100);
    }
    res.json({ orders });
  } catch (error) {
    console.error("Commandes client:", error);
    res.status(500).json({ error: "Impossible de charger vos commandes pour le moment." });
  }
});

app.get("/api/orders/track", async (req, res) => {
  const orderId = String(req.query.orderId || "").trim().toUpperCase();
  const phone = normalizePhone(req.query.phone);

  if (!orderId || phone.length < 6) {
    return res.status(400).json({ error: "Saisissez le numéro de commande et le téléphone utilisé lors de l'achat." });
  }

  try {
    let order = null;
    const numericId = orderId.match(/^NTV-(\d+)$/);

    if (pool && numericId) {
      const result = await pool.query(`
        SELECT id, customer_name, phone, items, status, status_history, created_at,
          delivery_name, delivery_status, delivery_assigned_at, delivery_updated_at
        FROM orders WHERE id = $1 LIMIT 1
      `, [Number(numericId[1])]);
      if (result.rowCount) order = formatPostgresOrder(result.rows[0]);
    }

    if (!order && db) {
      const row = await db.collection("orders").findOne({ orderId });
      if (row) order = formatMongoOrder(row);
    }

    if (!order) return res.status(404).json({ error: "Commande introuvable. Vérifiez le numéro saisi." });

    const savedPhone = normalizePhone(order.customer?.phone);
    if (!savedPhone || savedPhone !== phone) {
      return res.status(404).json({ error: "Commande introuvable. Vérifiez le numéro de commande et le téléphone." });
    }

    return res.json({
      ok: true,
      order: {
        orderId: order.orderId,
        status: order.status || "À confirmer",
        createdAt: order.createdAt,
        items: (order.items || []).map(item => ({ name: item.name, quantity: Number(item.quantity || 0) })),
        delivery: {
          status: order.delivery?.status || "unassigned",
          updatedAt: order.delivery?.updatedAt || order.delivery?.assignedAt || null
        },
        history: (order.history || []).map(event => ({
          status: event.status,
          at: event.at,
          note: event.note || ""
        }))
      }
    });
  } catch (error) {
    console.error("Suivi public commande:", error);
    return res.status(500).json({ error: "Le suivi est momentanément indisponible. Réessayez plus tard." });
  }
});

app.post("/api/orders", orderCreateLimit, async (req, res) => {
  const { customer, items, paymentMethod, termsAccepted, termsVersion } = req.body || {};

  if (termsAccepted !== true || !termsVersion) {
    return res.status(400).json({ error: "Vous devez accepter le règlement intérieur de NTV avant de confirmer la commande." });
  }

  if (
    !customer?.name ||
    !customer?.phone ||
    !customer?.country ||
    !customer?.address
  ) {
    return res.status(400).json({
      error: "Veuillez remplir tous les champs client."
    });
  }

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({
      error: "Votre panier est vide."
    });
  }

  if (items.length > 50) {
    return res.status(400).json({
      error: "Votre panier contient trop de produits."
    });
  }

  const allowedMethods = [
    "Paiement à la livraison",
    "Mobile Money",
    "Carte bancaire",
    "Virement bancaire"
  ];

  if (!allowedMethods.includes(paymentMethod)) {
    return res.status(400).json({
      error: "Mode de paiement invalide."
    });
  }

  if (!pool && !db) {
    return res.status(503).json({
      error: "Les commandes ne peuvent pas être enregistrées : configurez MongoDB ou PostgreSQL sur Render."
    });
  }

  let reservedStock = [];
  try {
    // Regrouper les lignes identiques évite qu'un même produit soit commandé
    // plusieurs fois dans le panier en contournant le contrôle de quantité.
    const normalizedItems = [];
    const itemIndexes = new Map();
    for (const cartItem of items) {
      const productId = String(cartItem.id || "");
      if (!itemIndexes.has(productId)) {
        itemIndexes.set(productId, normalizedItems.length);
        normalizedItems.push({ ...cartItem });
      } else {
        const index = itemIndexes.get(productId);
        normalizedItems[index].quantity = Number(normalizedItems[index].quantity) + Number(cartItem.quantity);
      }
    }
    const ids = normalizedItems.map(item => String(item.id || ""));

    if (ids.some(id => !id)) {
      return res.status(400).json({
        error: "Un produit du panier est invalide."
      });
    }

    const uniqueIds = [...new Set(ids)];

    const currentProducts = db
      ? await db.collection("products")
          .find({ id: { $in: uniqueIds } })
          .toArray()
      : demoProducts.filter(product => uniqueIds.includes(product.id));

    const cleanItems = [];
    let total = 0;
    const sellerIds = [...new Set(currentProducts.map(product => product.vendorId).filter(Boolean).map(String))];
    const sellerRows = db && sellerIds.length
      ? await db.collection("users").find({ _id: { $in: sellerIds.filter(ObjectId.isValid).map(id => new ObjectId(id)) }, role: "seller" }).toArray()
      : [];
    const sellersById = new Map(sellerRows.map(seller => [seller._id.toString(), seller]));

    for (const item of normalizedItems) {
      const product = currentProducts.find(
        current => current.id === item.id
      );

      const quantity = Number(item.quantity);

      if (
        !product ||
        product.priceType === "quote" ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100
      ) {
        return res.status(400).json({
          error: "Un produit, son prix ou sa quantité est invalide."
        });
      }

      if (Number(product.stock) >= 0 && product.stock < quantity) {
        return res.status(400).json({
          error: `Stock insuffisant pour le produit : ${product.name}.`
        });
      }

      const line = {
        id: product.id,
        name: product.name,
        price: Number(product.price),
        quantity,
        vendorId: product.vendorId || null,
        vendorName: product.vendorName || "NEWS TECHNOLOGY VILLAGE",
        storeSlug: product.storeSlug || "",
        sellerPlan: product.vendorId ? (sellersById.get(String(product.vendorId))?.plan || "commission") : "ntv",
        commissionRate: product.vendorId && (sellersById.get(String(product.vendorId))?.plan || "commission") === "commission" ? 0.05 : 0
      };

      cleanItems.push(line);
      total += line.price * quantity;
    }

    // Le stock est contrôlé lors de la commande, mais n'est pas débité ici.
    // Le débit réel intervient à l'acceptation de la commande par chaque vendeur.
    reservedStock = [];

    const cleanCustomer = {
      name: String(customer.name).trim().slice(0, 120),
      phone: String(customer.phone).trim().slice(0, 40),
      country: String(customer.country).trim().slice(0, 80),
      address: String(customer.address).trim().slice(0, 500)
    };

    const createdAt = new Date();
    const initialHistory = [{
      status: "À confirmer",
      at: createdAt.toISOString(),
      actor: "Système NTV",
      note: "Commande reçue et enregistrée"
    }];

    let orderId;
    const sellerConfirmations = Object.fromEntries(
      sellerIds.map(sellerId => [sellerId, { status: "pending", at: createdAt.toISOString(), note: "En attente de confirmation de disponibilité par le vendeur." }])
    );

    // Avec les deux bases configurées, PostgreSQL reste la base
    // principale d'enregistrement des nouvelles commandes.
    if (pool) {
      const result = await pool.query(`
        INSERT INTO orders (
          customer_name,
          phone,
          country,
          address,
          items,
          total,
          payment_method,
          status,
          status_history,
          seller_confirmations,
          stock_policy,
          terms_accepted,
          terms_version,
          terms_accepted_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, $11, TRUE, $12, NOW())
        RETURNING id
      `, [
        cleanCustomer.name,
        cleanCustomer.phone,
        cleanCustomer.country,
        cleanCustomer.address,
        JSON.stringify(cleanItems),
        total,
        paymentMethod,
        "À confirmer",
        JSON.stringify(initialHistory),
        JSON.stringify(sellerConfirmations),
        "seller-confirmation-v2",
        String(termsVersion).slice(0, 40)
      ]);

      orderId = `NTV-${result.rows[0].id}`;
    } else {
      const _id = new ObjectId();

      orderId = `NTV-${_id.toString().slice(-8).toUpperCase()}`;

      await db.collection("orders").insertOne({
        _id,
        orderId,
        customer: cleanCustomer,
        items: cleanItems,
        total,
        paymentMethod,
        status: "À confirmer",
        history: initialHistory,
        sellerConfirmations,
        stockPolicy: "seller-confirmation-v2",
        termsAccepted: true,
        termsVersion: String(termsVersion).slice(0, 40),
        termsAcceptedAt: createdAt,
        deliveryId: null,
        deliveryName: null,
        deliveryStatus: "unassigned",
        deliveryAssignedAt: null,
        deliveryUpdatedAt: null,
        createdAt,
        updatedAt: createdAt
      });
    }

    res.status(201).json({
      ok: true,
      orderId,
      total,
      persisted: true
    });
  } catch (error) {
    console.error("Erreur création commande:", error);
    if (db && typeof reservedStock !== "undefined" && reservedStock.length) {
      await db.collection("products").bulkWrite(reservedStock.map(item => ({
        updateOne: { filter: { id: item.id }, update: { $inc: { stock: item.quantity } } }
      }))).catch(rollbackError => console.error("Restauration du stock:", rollbackError.message));
    }
    res.status(500).json({
      error: "Impossible d'enregistrer la commande pour le moment."
    });
  }
});

// --------------------------------------------------
// DÉMARRAGE DU SERVEUR
// --------------------------------------------------

app.use(express.static(clientDist));

app.get("*", (_req, res) => {
  res.sendFile(path.join(clientDist, "index.html"));
});

app.listen(port, async () => {
  console.log(`NTV Marketplace démarré sur le port ${port}`);

  await Promise.all([mongoReady, postgresReady]);
  console.log("Vérification des connexions aux bases terminée.");
});
