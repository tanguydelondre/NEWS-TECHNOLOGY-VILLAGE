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
let mongoClient = null, db = null, imageBucket = null;
if (process.env.MONGODB_URI) {
  mongoClient = new MongoClient(process.env.MONGODB_URI);
  mongoClient.connect().then(async () => {
    db = mongoClient.db(process.env.MONGODB_DB || "ntv_boutique");
    imageBucket = new GridFSBucket(db, { bucketName: "productImages" });
    const count = await db.collection("products").countDocuments();
    if (count === 0) await db.collection("products").insertMany(demoProducts.map(p => ({ ...p, createdAt: new Date(), updatedAt: new Date() })));
    await db.collection("products").createIndex({ id: 1 }, { unique: true });
    console.log("MongoDB connecté; catalogue prêt.");
  }).catch(err => console.error("Connexion MongoDB impossible:", err.message));
}

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false } });
  pool.query(`CREATE TABLE IF NOT EXISTS orders (id BIGSERIAL PRIMARY KEY, customer_name TEXT NOT NULL, phone TEXT NOT NULL, country TEXT NOT NULL, address TEXT NOT NULL, items JSONB NOT NULL, total BIGINT NOT NULL, payment_method TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'À confirmer', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).catch(err => console.error("Initialisation de la table orders:", err.message));
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024 }, fileFilter: (_req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype)) });
function safeEqual(a, b) { const aa = Buffer.from(String(a || "")); const bb = Buffer.from(String(b || "")); return aa.length === bb.length && crypto.timingSafeEqual(aa, bb); }
function adminAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const match = auth.match(/^Basic\s+(.+)$/i);
  let username = "", password = "";
  if (match) { try { [username, password] = Buffer.from(match[1], "base64").toString().split(/:(.*)/s).slice(0, 2); } catch {} }
  if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) return res.status(503).json({ error: "L'administration n'est pas configurée. Ajoutez ADMIN_USERNAME et ADMIN_PASSWORD dans Render." });
  if (!safeEqual(username, process.env.ADMIN_USERNAME) || !safeEqual(password, process.env.ADMIN_PASSWORD)) return res.status(401).json({ error: "Identifiant ou mot de passe incorrect." });
  next();
}
function requireMongo(_req, res, next) { if (!db || !imageBucket) return res.status(503).json({ error: "La base de données n'est pas encore connectée. Vérifiez MONGODB_URI dans Render." }); next(); }
function cleanProduct(input, existing = {}) {
  const name = String(input.name || "").trim().slice(0, 160);
  const category = String(input.category || "").trim().slice(0, 100);
  const priceType = input.priceType === "quote" ? "quote" : "fixed";
  const price = priceType === "quote" ? 0 : Number(input.price);
  if (!name || !category || (priceType === "fixed" && (!Number.isFinite(price) || price < 0))) throw new Error("Nom, catégorie et prix valide obligatoires.");
  return { ...existing, name, category, price, priceType, description: String(input.description || "").trim().slice(0, 1000), emoji: String(input.emoji || "📦").slice(0, 12), badge: String(input.badge || "").trim().slice(0, 60), stock: Math.max(0, Number.parseInt(input.stock || "0", 10) || 0), imageUrl: String(input.imageUrl || existing.imageUrl || "").slice(0, 500), updatedAt: new Date() };
}
app.get("/api/health", (_req, res) => res.json({ ok: true, service: "ntv-boutique", database: Boolean(db) }));
app.get("/api/products", async (_req, res) => {
  try { const products = db ? await db.collection("products").find({}, { projection: { _id: 0 } }).toArray() : demoProducts; res.json(products); }
  catch (err) { console.error(err); res.status(500).json({ error: "Impossible de charger les produits." }); }
});
app.get("/api/config", (_req, res) => res.json({ whatsappNumber: process.env.WHATSAPP_NUMBER || "229014222197", currency: "XOF" }));
app.get("/api/images/:id", async (req, res) => {
  try {
    if (!imageBucket || !ObjectId.isValid(req.params.id)) return res.status(404).end();
    const files = await db.collection("productImages.files").find({ _id: new ObjectId(req.params.id) }).toArray();
    if (!files.length) return res.status(404).end();
    res.set("Content-Type", files[0].contentType || "application/octet-stream");
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    imageBucket.openDownloadStream(new ObjectId(req.params.id)).on("error", () => res.status(404).end()).pipe(res);
  } catch { res.status(500).end(); }
});
app.get("/api/admin/products", adminAuth, requireMongo, async (_req, res) => res.json(await db.collection("products").find({}, { projection: { _id: 0 } }).sort({ name: 1 }).toArray()));
app.post("/api/admin/products", adminAuth, requireMongo, async (req, res) => {
  try { const product = cleanProduct(req.body); product.id = `ntv-${crypto.randomUUID()}`; product.createdAt = new Date(); await db.collection("products").insertOne(product); res.status(201).json(product); }
  catch (err) { res.status(400).json({ error: err.message || "Impossible d'ajouter le produit." }); }
});
app.put("/api/admin/products/:id", adminAuth, requireMongo, async (req, res) => {
  try { const old = await db.collection("products").findOne({ id: req.params.id }); if (!old) return res.status(404).json({ error: "Produit introuvable." }); const product = cleanProduct(req.body, old); await db.collection("products").replaceOne({ id: req.params.id }, product); delete product._id; res.json(product); }
  catch (err) { res.status(400).json({ error: err.message || "Impossible de modifier le produit." }); }
});
app.delete("/api/admin/products/:id", adminAuth, requireMongo, async (req, res) => { const result = await db.collection("products").deleteOne({ id: req.params.id }); if (!result.deletedCount) return res.status(404).json({ error: "Produit introuvable." }); res.json({ ok: true }); });
app.post("/api/admin/images", adminAuth, requireMongo, upload.single("image"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choisissez une image JPG, PNG, WEBP ou GIF de 6 Mo maximum." });
  try { const stream = imageBucket.openUploadStream(req.file.originalname.replace(/[^\w.-]/g, "_").slice(0, 100), { contentType: req.file.mimetype }); stream.end(req.file.buffer); stream.on("finish", () => res.status(201).json({ imageUrl: `/api/images/${stream.id.toString()}` })); stream.on("error", err => res.status(500).json({ error: err.message })); }
  catch (err) { res.status(500).json({ error: "Échec du téléchargement de l'image." }); }
});

app.post("/api/orders", async (req, res) => {
  const { customer, items, paymentMethod } = req.body || {};
  if (!customer?.name || !customer?.phone || !customer?.country || !customer?.address) return res.status(400).json({ error: "Veuillez remplir tous les champs client." });
  if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "Votre panier est vide." });
  const allowedMethods = ["Paiement à la livraison", "Mobile Money", "Carte bancaire", "Virement bancaire"];
  if (!allowedMethods.includes(paymentMethod)) return res.status(400).json({ error: "Mode de paiement invalide." });
  try {
    const currentProducts = db ? await db.collection("products").find({ id: { $in: items.map(i => i.id) } }).toArray() : demoProducts;
    const cleanItems = []; let total = 0;
    for (const item of items) { const product = currentProducts.find(p => p.id === item.id); const quantity = Number(item.quantity); if (!product || product.priceType === "quote" || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return res.status(400).json({ error: "Un produit, son prix ou sa quantité est invalide." }); cleanItems.push({ id: product.id, name: product.name, price: product.price, quantity }); total += product.price * quantity; }
    let orderId = `NTV-${Date.now().toString().slice(-8)}`;
    if (pool) { const result = await pool.query(`INSERT INTO orders (customer_name, phone, country, address, items, total, payment_method) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`, [String(customer.name).slice(0,120), String(customer.phone).slice(0,40), String(customer.country).slice(0,80), String(customer.address).slice(0,500), JSON.stringify(cleanItems), total, paymentMethod]); orderId = `NTV-${result.rows[0].id}`; }
    res.status(201).json({ ok: true, orderId, total, persisted: Boolean(pool) });
  } catch (err) { console.error("Erreur création commande:", err.message); res.status(500).json({ error: "Impossible d'enregistrer la commande pour le moment." }); }
});

app.use(express.static(clientDist));
app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
app.listen(port, () => console.log(`NTV Boutique démarré sur le port ${port}`));
