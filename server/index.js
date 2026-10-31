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
let mongoReady = Promise.resolve(false);

if (process.env.MONGODB_URI) {
  mongoClient = new MongoClient(process.env.MONGODB_URI);
  mongoReady = mongoClient.connect().then(async () => {
    db = mongoClient.db(process.env.MONGODB_DB || "ntv_boutique");
    imageBucket = new GridFSBucket(db, { bucketName: "productImages" });

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
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
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
      ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb
    `);
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
      [username, password] = Buffer.from(match[1], "base64").toString().split(/:(.*)/s).slice(0, 2);
    } catch {}
  }

  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
    return res.status(503).json({ error: "L'administration n'est pas configurée." });
  }
  if (!safeEqual(username, process.env.ADMIN_USERNAME) || !safeEqual(password, process.env.ADMIN_PASSWORD)) {
    return res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  }
  next();
}

async function sellerAuth(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return res.status(401).json({ error: "Authentification requise." });

  const token = match[1];
  if (!db) return res.status(503).json({ error: "Base de données indisponible." });

  try {
    const user = await db.collection("users").findOne({ token: token });
    if (!user) return res.status(401).json({ error: "Session expirée." });
    if (user.role !== "seller") return res.status(403).json({ error: "Accès réservé aux vendeurs." });
    if (user.status !== "active") return res.status(403).json({ error: "Compte non activé par NTV." });

    req.user = user;
    next();
  } catch (error) {
    res.status(500).json({ error: "Erreur d'authentification." });
  }
}

function requireMongo(_req, res, next) {
  if (!db || !imageBucket) return res.status(503).json({ error: "MongoDB non connecté." });
  next();
}

function slugify(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);
}

// --------------------------------------------------
// ROUTES AUTHENTIFICATION SANS JWT (SIMPLIFIÉE)
// --------------------------------------------------
app.post("/api/auth/register", requireMongo, async (req, res) => {
  try {
    const { name, email, password, phone, country, role, businessName, businessDescription } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: "Champs obligatoires manquants." });

    const existing = await db.collection("users").findOne({ email: email.toLowerCase().trim() });
    if (existing) return res.status(400).json({ error: "Cet email est déjà utilisé." });

    const newUser = {
      _id: new ObjectId(),
      name,
      email: email.toLowerCase().trim(),
      password, // Note : Hacher avec bcrypt en production réelle
      phone,
      country,
      role: role || "customer",
      status: role === "seller" ? "pending" : "active",
      businessName: role === "seller" ? businessName : null,
      businessDescription: role === "seller" ? businessDescription : null,
      storeSlug: role === "seller" ? slugify(businessName) : null,
      createdAt: new Date()
    };

    await db.collection("users").insertOne(newUser);
    res.status(201).json({ message: "Compte créé avec succès." });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/auth/login", requireMongo, async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await db.collection("users").findOne({ email: email.toLowerCase().trim(), password });
    if (!user) return res.status(400).json({ error: "Identifiants incorrects." });

    const token = crypto.randomBytes(32).toString("hex");
    await db.collection("users").updateOne({ _id: user._id }, { $set: { token } });

