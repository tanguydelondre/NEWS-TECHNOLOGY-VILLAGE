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
    await db.collection("users").createIndex({ email: 1 }, { unique: true });
    await db.collection("users").createIndex({ role: 1, status: 1 });
    await db.collection("orders").createIndex({ createdAt: -1 });
    await db.collection("orders").createIndex({ orderId: 1 }, { unique: true });
    console.log("MongoDB connecté; catalogue et comptes prêts.");
  }).catch(err => console.error("Connexion MongoDB impossible:", err.message));
}

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false } });
  pool.query(`CREATE TABLE IF NOT EXISTS orders (id BIGSERIAL PRIMARY KEY, customer_name TEXT NOT NULL, phone TEXT NOT NULL, country TEXT NOT NULL, address TEXT NOT NULL, items JSONB NOT NULL, total BIGINT NOT NULL, payment_method TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'À confirmer', status_history JSONB NOT NULL DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW())`).then(() => pool.query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS status_history JSONB NOT NULL DEFAULT '[]'::jsonb`)).catch(err => console.error("Initialisation de la table orders:", err.message));
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
function requireUsersDb(_req, res, next) { if (!db) return res.status(503).json({ error: "Le service de comptes nécessite une connexion MongoDB. Vérifiez MONGODB_URI dans Render." }); next(); }
function cleanProduct(input, existing = {}) {
  const name = String(input.name || "").trim().slice(0, 160);
  const category = String(input.category || "").trim().slice(0, 100);
  const priceType = input.priceType === "quote" ? "quote" : "fixed";
  const price = priceType === "quote" ? 0 : Number(input.price);
  if (!name || !category || (priceType === "fixed" && (!Number.isFinite(price) || price < 0))) throw new Error("Nom, catégorie et prix valide obligatoires.");
  return { ...existing, name, category, price, priceType, description: String(input.description || "").trim().slice(0, 1000), emoji: String(input.emoji || "📦").slice(0, 12), badge: String(input.badge || "").trim().slice(0, 60), stock: Math.max(0, Number.parseInt(input.stock || "0", 10) || 0), imageUrl: String(input.imageUrl || existing.imageUrl || "").slice(0, 500), updatedAt: new Date() };
}

// Authentification : mots de passe hachés avec scrypt et jetons HMAC signés.
const tokenSecret = process.env.AUTH_SECRET || process.env.ADMIN_PASSWORD;
function hashPassword(password) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString("hex");
    crypto.scrypt(password, salt, 64, (err, key) => err ? reject(err) : resolve(`${salt}:${key.toString("hex")}`));
  });
}
function verifyPassword(password, stored) {
  return new Promise((resolve, reject) => {
    const [salt, keyHex] = String(stored || "").split(":");
    if (!salt || !keyHex) return resolve(false);
    crypto.scrypt(password, salt, 64, (err, key) => {
      if (err) return reject(err);
      resolve(safeEqual(key.toString("hex"), keyHex));
    });
  });
}
function signToken(user) {
  if (!tokenSecret || tokenSecret.length < 16) throw new Error("AUTH_SECRET doit contenir au moins 16 caractères.");
  const payload = Buffer.from(JSON.stringify({ sub: user._id.toString(), role: user.role, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString("base64url");
  const signature = crypto.createHmac("sha256", tokenSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}
function authenticate(req, res, next) {
  try {
    const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
    const [payload, signature] = token.split(".");
    if (!payload || !signature || !tokenSecret) return res.status(401).json({ error: "Veuillez vous connecter." });
    const expected = crypto.createHmac("sha256", tokenSecret).update(payload).digest("base64url");
    if (!safeEqual(signature, expected)) return res.status(401).json({ error: "Session invalide. Reconnectez-vous." });
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.exp || data.exp < Date.now()) return res.status(401).json({ error: "Session expirée. Reconnectez-vous." });
    req.auth = data; next();
  } catch { return res.status(401).json({ error: "Session invalide." }); }
}
const publicUser = user => ({ id: user._id.toString(), name: user.name, email: user.email, phone: user.phone, country: user.country, role: user.role, status: user.status, businessName: user.businessName || "", createdAt: user.createdAt });
function requireRole(...roles) { return (req, res, next) => roles.includes(req.auth?.role) ? next() : res.status(403).json({ error: "Vous n'avez pas l'autorisation d'accéder à cette ressource." }); }

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "ntv-marketplace", database: Boolean(db), accounts: Boolean(db) }));
app.get("/api/config", (_req, res) => res.json({ whatsappNumber: process.env.WHATSAPP_NUMBER || "229014222197", currency: "XOF" }));

app.post("/api/auth/register", requireUsersDb, async (req, res) => {
  try {
    const { name, email, password, phone, country, role, businessName, businessDescription, deliveryZones } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanName = String(name || "").trim();
    if (cleanName.length < 2 || cleanEmail.length > 190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) return res.status(400).json({ error: "Nom et adresse e-mail valides obligatoires." });
    if (typeof password !== "string" || password.length < 10 || password.length > 200) return res.status(400).json({ error: "Le mot de passe doit contenir au moins 10 caractères." });
    if (!phone || !country) return res.status(400).json({ error: "Téléphone et pays obligatoires." });
    if (!["seller", "delivery", "customer"].includes(role)) return res.status(400).json({ error: "Type de compte invalide." });
    if (role === "seller" && String(businessName || "").trim().length < 2) return res.status(400).json({ error: "Le nom de votre commerce est obligatoire." });
    const exists = await db.collection("users").findOne({ email: cleanEmail });
    if (exists) return res.status(409).json({ error: "Cette adresse e-mail possède déjà un compte." });
    const user = {
      name: cleanName.slice(0, 120), email: cleanEmail, passwordHash: await hashPassword(password),
      phone: String(phone).trim().slice(0, 40), country: String(country).trim().slice(0, 80),
      role, status: role === "customer" ? "active" : "pending",
      businessName: role === "seller" ? String(businessName).trim().slice(0, 160) : "",
      businessDescription: role === "seller" ? String(businessDescription || "").trim().slice(0, 1000) : "",
      deliveryZones: role === "delivery" ? String(deliveryZones || "").trim().slice(0, 500) : "",
      plan: role === "seller" ? "commission" : null, createdAt: new Date(), updatedAt: new Date()
    };
    const result = await db.collection("users").insertOne(user); user._id = result.insertedId;
    res.status(201).json({ ok: true, user: publicUser(user), message: "Demande enregistrée. Votre compte sera activé après vérification par NTV." });
  } catch (err) { if (err.code === 11000) return res.status(409).json({ error: "Cette adresse e-mail est déjà utilisée." }); console.error("Inscription:", err); res.status(500).json({ error: "Impossible de créer le compte pour le moment." }); }
});
app.post("/api/auth/login", requireUsersDb, async (req, res) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");
    const user = await db.collection("users").findOne({ email });
    if (!user || !(await verifyPassword(password, user.passwordHash))) return res.status(401).json({ error: "Adresse e-mail ou mot de passe incorrect." });
    if (!["seller", "delivery", "customer", "admin"].includes(user.role)) return res.status(403).json({ error: "Type de compte non autorisé." });
    if (user.status === "pending") return res.status(403).json({ error: "Votre demande est en attente de validation par NTV." });
    if (user.status === "rejected" || user.status === "suspended") return res.status(403).json({ error: "Ce compte n'est pas autorisé à accéder à la plateforme. Contactez NTV." });
    res.json({ ok: true, token: signToken(user), user: publicUser(user) });
  } catch (err) { console.error("Connexion:", err); res.status(500).json({ error: "Connexion impossible pour le moment." }); }
});
app.get("/api/auth/me", requireUsersDb, authenticate, async (req, res) => {
  const user = await db.collection("users").findOne({ _id: new ObjectId(req.auth.sub) });
  if (!user || user.status !== "active") return res.status(401).json({ error: "Compte introuvable ou inactif." });
  res.json({ user: publicUser(user) });
});

// Administration des candidatures vendeurs et livreurs (authentification Basic existante).
app.get("/api/admin/accounts", adminAuth, requireUsersDb, async (_req, res) => {
  const users = await db.collection("users").find({ role: { $in: ["seller", "delivery"] } }, { projection: { passwordHash: 0 } }).sort({ createdAt: -1 }).limit(500).toArray();
  res.json(users.map(publicUser));
});
app.patch("/api/admin/accounts/:id/status", adminAuth, requireUsersDb, async (req, res) => {
  if (!ObjectId.isValid(req.params.id)) return res.status(400).json({ error: "Identifiant invalide." });
  const status = String(req.body?.status || "");
  if (!["active", "rejected", "suspended", "pending"].includes(status)) return res.status(400).json({ error: "Statut invalide." });
  const result = await db.collection("users").findOneAndUpdate({ _id: new ObjectId(req.params.id), role: { $in: ["seller", "delivery"] } }, { $set: { status, updatedAt: new Date() } }, { returnDocument: "after", projection: { passwordHash: 0 } });
  if (!result) return res.status(404).json({ error: "Compte introuvable." });
  res.json({ ok: true, user: publicUser(result) });
});

app.get("/api/products", async (_req, res) => {
  try { const products = db ? await db.collection("products").find({}, { projection: { _id: 0 } }).toArray() : demoProducts; res.json(products); }
  catch (err) { console.error(err); res.status(500).json({ error: "Impossible de charger les produits." }); }
});
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

// Tableau de bord central NTV : indicateurs, commandes et suivi des opérations.
app.get("/api/admin/dashboard", adminAuth, async (_req, res) => {
  try {
    const [productsCount, pendingSellers, pendingDelivery, activeSellers, activeDelivery] = await Promise.all([
      db ? db.collection("products").countDocuments() : Promise.resolve(demoProducts.length),
      db ? db.collection("users").countDocuments({ role: "seller", status: "pending" }) : 0,
      db ? db.collection("users").countDocuments({ role: "delivery", status: "pending" }) : 0,
      db ? db.collection("users").countDocuments({ role: "seller", status: "active" }) : 0,
      db ? db.collection("users").countDocuments({ role: "delivery", status: "active" }) : 0
    ]);
    let orderCount = 0, pendingOrders = 0, totalSales = 0;
    if (pool) {
      const r = await pool.query("SELECT COUNT(*)::int AS count, COUNT(*) FILTER (WHERE status IN ('À confirmer','En attente','Nouvelle'))::int AS pending, COALESCE(SUM(total),0)::bigint AS total FROM orders");
      orderCount = r.rows[0].count; pendingOrders = r.rows[0].pending; totalSales = Number(r.rows[0].total);
    } else if (db) {
      const r = await db.collection("orders").aggregate([{ $group: { _id: null, count: { $sum: 1 }, pending: { $sum: { $cond: [{ $in: ["$status", ["À confirmer","En attente","Nouvelle"]] }, 1, 0] } }, total: { $sum: "$total" } } }]).toArray();
      if (r[0]) { orderCount = r[0].count; pendingOrders = r[0].pending; totalSales = r[0].total || 0; }
    }
    res.json({ ok: true, database: { mongo: Boolean(db), postgres: Boolean(pool) }, productsCount, pendingSellers, pendingDelivery, activeSellers, activeDelivery, orderCount, pendingOrders, totalSales });
  } catch (err) { console.error("Dashboard:", err); res.status(500).json({ error: "Impossible de charger les indicateurs." }); }
});

app.get("/api/admin/orders", adminAuth, async (_req, res) => {
  try {
    if (pool) {
      const r = await pool.query("SELECT id, customer_name, phone, country, address, items, total, payment_method, status, status_history, created_at FROM orders ORDER BY created_at DESC LIMIT 500");
      return res.json(r.rows.map(o => ({ id: String(o.id), orderId: `NTV-${o.id}`, customer: { name: o.customer_name, phone: o.phone, country: o.country, address: o.address }, items: o.items, total: Number(o.total), paymentMethod: o.payment_method, status: o.status, history: o.status_history || [], createdAt: o.created_at })));
    }
    if (!db) return res.status(503).json({ error: "Configurez MongoDB ou PostgreSQL pour conserver et suivre les commandes." });
    const rows = await db.collection("orders").find({}).sort({ createdAt: -1 }).limit(500).toArray();
    return res.json(rows.map(o => ({ id: o._id.toString(), orderId: o.orderId, customer: o.customer, items: o.items, total: o.total, paymentMethod: o.paymentMethod, status: o.status, history: o.history || [], createdAt: o.createdAt })));
  } catch (err) { console.error("Liste commandes:", err); res.status(500).json({ error: "Impossible de charger les commandes." }); }
});

app.patch("/api/admin/orders/:id/status", adminAuth, async (req, res) => {
  const allowed = ["À confirmer", "Confirmée", "En préparation", "Prête à expédier", "Expédiée", "En livraison", "Livrée", "Annulée"];
  const status = String(req.body?.status || "");
  if (!allowed.includes(status)) return res.status(400).json({ error: "Statut de commande invalide." });
  const at = new Date();
  const note = String(req.body?.note || "").trim().slice(0, 300);
  const event = { status, at, actor: "Administration NTV", note };
  try {
    if (pool) {
      const numericId = Number(String(req.params.id).replace(/^NTV-/, ""));
      if (!Number.isInteger(numericId) || numericId < 1) return res.status(400).json({ error: "Identifiant de commande invalide." });
      const r = await pool.query("UPDATE orders SET status=$1, status_history=status_history || $2::jsonb WHERE id=$3 RETURNING status_history", [status, JSON.stringify([event]), numericId]);
      if (!r.rowCount) return res.status(404).json({ error: "Commande introuvable." });
      return res.json({ ok: true, status, history: r.rows[0].status_history || [] });
    }
    if (!db || !ObjectId.isValid(req.params.id)) return res.status(404).json({ error: "Commande introuvable." });
    const r = await db.collection("orders").findOneAndUpdate({ _id: new ObjectId(req.params.id) }, { $set: { status, updatedAt: at }, $push: { history: event } }, { returnDocument: "after" });
    if (!r) return res.status(404).json({ error: "Commande introuvable." });
    return res.json({ ok: true, status, history: r.history || [] });
  } catch (err) { console.error("Statut commande:", err); res.status(500).json({ error: "Impossible de modifier la commande." }); }
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
  if (!pool && !db) return res.status(503).json({ error: "Les commandes ne peuvent pas être enregistrées : configurez MongoDB ou PostgreSQL sur Render." });
  try {
    const currentProducts = db ? await db.collection("products").find({ id: { $in: items.map(i => i.id) } }).toArray() : demoProducts;
    const cleanItems = []; let total = 0;
    for (const item of items) {
      const product = currentProducts.find(p => p.id === item.id);
      const quantity = Number(item.quantity);
      if (!product || product.priceType === "quote" || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) return res.status(400).json({ error: "Un produit, son prix ou sa quantité est invalide." });
      cleanItems.push({ id: product.id, name: product.name, price: product.price, quantity });
      total += product.price * quantity;
    }
    let orderId;
    if (pool) {
      const initialHistory = [{ status: "À confirmer", at: new Date().toISOString(), actor: "Système NTV", note: "Commande reçue et enregistrée" }];
      const result = await pool.query(`INSERT INTO orders (customer_name, phone, country, address, items, total, payment_method, status_history) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id`, [String(customer.name).slice(0,120), String(customer.phone).slice(0,40), String(customer.country).slice(0,80), String(customer.address).slice(0,500), JSON.stringify(cleanItems), total, paymentMethod, JSON.stringify(initialHistory)]);
      orderId = `NTV-${result.rows[0].id}`;
    } else {
      const _id = new ObjectId();
      orderId = `NTV-${_id.toString().slice(-8).toUpperCase()}`;
      const createdAt = new Date();
      await db.collection("orders").insertOne({ _id, orderId, customer: { name: String(customer.name).slice(0,120), phone: String(customer.phone).slice(0,40), country: String(customer.country).slice(0,80), address: String(customer.address).slice(0,500) }, items: cleanItems, total, paymentMethod, status: "À confirmer", history: [{ status: "À confirmer", at: createdAt, actor: "Système NTV", note: "Commande reçue et enregistrée" }], createdAt, updatedAt: createdAt });
    }
    res.status(201).json({ ok: true, orderId, total, persisted: true });
  } catch (err) { console.error("Erreur création commande:", err.message); res.status(500).json({ error: "Impossible d'enregistrer la commande pour le moment." }); }
});

app.use(express.static(clientDist));
app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));
app.listen(port, () => console.log(`NTV Marketplace démarré sur le port ${port}`));
