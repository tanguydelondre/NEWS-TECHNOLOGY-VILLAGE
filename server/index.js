
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

const { Pool } = pg;
const app = express();
const port = process.env.PORT || 10000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../dist");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

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
    imageUrl: String(input.imageUrl || existing.imageUrl || "").slice(0, 500),
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
  profileImageUrl: user.profileImageUrl || ""
});

// --------------------------------------------------
// PROFILS ET PHOTOS DE PROFIL
// --------------------------------------------------

app.post("/api/profile/avatar", authenticate, upload.single("image"), async (req, res) => {
  try {
    if (!profileBucket || !req.file) {
      return res.status(400).json({ error: "Choisissez une image JPG, PNG, WEBP ou GIF (6 Mo maximum)." });
    }
    const stream = profileBucket.openUploadStream(`profile-${req.user._id}-${Date.now()}`, {
      contentType: req.file.mimetype,
      metadata: { userId: req.user._id.toString(), kind: "user-avatar" }
    });
    stream.end(req.file.buffer);
    stream.on("error", error => {
      console.error("Upload avatar:", error.message);
      if (!res.headersSent) res.status(500).json({ error: "Impossible d'enregistrer la photo." });
    });
    stream.on("finish", async () => {
      const profileImageUrl = `/api/profile-images/${stream.id.toString()}`;
      await db.collection("users").updateOne(
        { _id: req.user._id },
        { $set: { profileImageUrl, updatedAt: new Date() } }
      );
      const updated = await db.collection("users").findOne({ _id: req.user._id });
      res.json({ ok: true, user: publicUser(updated) });
    });
  } catch (error) {
    console.error("Profil utilisateur:", error.message);
    res.status(500).json({ error: "Impossible de mettre à jour le profil." });
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

app.post("/api/admin/profile/avatar", adminAuth, upload.single("image"), async (req, res) => {
  try {
    if (!db || !profileBucket || !req.file) {
      return res.status(400).json({ error: "Choisissez une image JPG, PNG, WEBP ou GIF (6 Mo maximum)." });
    }
    const stream = profileBucket.openUploadStream(`admin-profile-${Date.now()}`, {
      contentType: req.file.mimetype,
      metadata: { kind: "admin-avatar" }
    });
    stream.end(req.file.buffer);
    stream.on("error", error => {
      console.error("Upload avatar admin:", error.message);
      if (!res.headersSent) res.status(500).json({ error: "Impossible d'enregistrer la photo." });
    });
    stream.on("finish", async () => {
      const profileImageUrl = `/api/profile-images/${stream.id.toString()}`;
      await db.collection("settings").updateOne(
        { _id: "admin-profile" },
        { $set: { profileImageUrl, updatedAt: new Date() } },
        { upsert: true }
      );
      res.json({ ok: true, profileImageUrl });
    });
  } catch (error) {
    console.error("Profil administrateur:", error.message);
    res.status(500).json({ error: "Impossible de mettre à jour le profil administrateur." });
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
    service: "ntv-marketplace",
    database: Boolean(db),
    accounts: Boolean(db),
    postgres: Boolean(pool)
  });
});

app.get("/api/config", (_req, res) => {
  res.json({
    whatsappNumber: process.env.WHATSAPP_NUMBER || "229014222197",
    currency: "XOF"
  });
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

app.post("/api/auth/register", requireUsersDb, async (req, res) => {
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
      plan
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

app.post("/api/auth/login", requireUsersDb, async (req, res) => {
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

app.delete("/api/admin/accounts/:id", adminAuth, requireUsersDb, async (req, res) => {
  try {
    if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Identifiant invalide." });
    const userId = new ObjectId(req.params.id);
    const user = await db.collection("users").findOne({ _id: userId, role: { $in: ["seller", "delivery"] } });
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
        postgres: Boolean(pool)
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
      const found = await pool.query("SELECT items, seller_confirmations FROM orders WHERE id = $1", [Number(rawId)]);
      if (found.rowCount) {
        const ownItems = (found.rows[0].items || []).filter(item => String(item.vendorId || "") === sellerId);
        if (!ownItems.length) return res.status(403).json({ error: "Cette commande ne contient aucun article de votre boutique." });
        const current = found.rows[0].seller_confirmations || {};
        if (current[sellerId]?.status && current[sellerId].status !== "pending") return res.status(409).json({ error: "Vous avez déjà répondu à cette commande. Contactez NTV pour demander une modification." });
        const next = { ...current, [sellerId]: confirmation };
        await pool.query("UPDATE orders SET seller_confirmations = $1::jsonb WHERE id = $2", [JSON.stringify(next), Number(rawId)]);
        return res.json({ ok: true, confirmation });
      }
    }
    if (db && ObjectId.isValid(req.params.id)) {
      const order = await db.collection("orders").findOne({ _id: new ObjectId(req.params.id), "items.vendorId": sellerId });
      if (order) {
        const current = order.sellerConfirmations || {};
        if (current[sellerId]?.status && current[sellerId].status !== "pending") return res.status(409).json({ error: "Vous avez déjà répondu à cette commande. Contactez NTV pour demander une modification." });
        await db.collection("orders").updateOne({ _id: order._id }, { $set: { [`sellerConfirmations.${sellerId}`]: confirmation, updatedAt: at } });
        return res.json({ ok: true, confirmation });
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
  upload.single("image"),
  async (req, res) => {
    if (!req.file) {
      return res.status(400).json({
        error: "Choisissez une image JPG, PNG, WEBP ou GIF de 6 Mo maximum."
      });
    }

    try {
      const filename = req.file.originalname
        .replace(/[^\w.-]/g, "_")
        .slice(0, 100);

      const stream = imageBucket.openUploadStream(filename, {
        contentType: req.file.mimetype
      });

      stream.end(req.file.buffer);

      stream.on("finish", () => {
        res.status(201).json({
          imageUrl: `/api/images/${stream.id.toString()}`
        });
      });

      stream.on("error", error => {
        console.error("Image:", error);
        if (!res.headersSent) {
          res.status(500).json({
            error: "Échec du téléchargement de l'image."
          });
        }
      });
    } catch (error) {
      console.error("Upload image:", error);
      res.status(500).json({
        error: "Échec du téléchargement de l'image."
      });
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

app.post("/api/orders", async (req, res) => {
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
    const ids = items.map(item => String(item.id || ""));

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

    for (const item of items) {
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

    // Réservation atomique du stock dans MongoDB : chaque produit est décrémenté
    // une seule fois au moment de l'enregistrement de la commande.
    reservedStock = [];
    if (db) {
      try {
        for (const line of cleanItems) {
          const product = currentProducts.find(current => current.id === line.id);
          if (!product || product.stock === undefined || product.stock === null) continue;
          const updated = await db.collection("products").findOneAndUpdate(
            { id: line.id, stock: { $gte: line.quantity } },
            { $inc: { stock: -line.quantity }, $set: { updatedAt: new Date() } },
            { returnDocument: "after" }
          );
          if (!updated) {
            throw new Error(`Stock insuffisant pour le produit : ${line.name}.`);
          }
          reservedStock.push({ id: line.id, quantity: line.quantity });
        }
      } catch (stockError) {
        if (reservedStock.length) {
          await db.collection("products").bulkWrite(reservedStock.map(item => ({
            updateOne: { filter: { id: item.id }, update: { $inc: { stock: item.quantity } } }
          }))).catch(() => {});
        }
        return res.status(409).json({ error: stockError.message || "Stock insuffisant." });
      }
    }

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
          terms_accepted,
          terms_version,
          terms_accepted_at
        )
        VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7, $8, $9::jsonb, $10::jsonb, TRUE, $11, NOW())
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
