import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import pg from "pg";

dotenv.config();
const { Pool } = pg;
const app = express();
const port = process.env.PORT || 10000;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../dist");

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const products = [
  { id: "moto-1", name: "Scooter électrique urbain", category: "Mobilité électrique", price: 650000, oldPrice: 720000, emoji: "🛵", description: "Scooter électrique pour les déplacements quotidiens.", badge: "Populaire", stock: 8 },
  { id: "helmet-1", name: "Casque de protection", category: "Mobilité électrique", price: 25000, emoji: "🪖", description: "Casque de protection pour vos déplacements.", stock: 25 },
  { id: "battery-1", name: "Batterie solaire", category: "Énergie solaire", price: 185000, emoji: "🔋", description: "Batterie pour installation solaire. Capacité à confirmer selon le modèle.", stock: 10 },
  { id: "panel-1", name: "Panneau solaire", category: "Énergie solaire", price: 85000, emoji: "☀️", description: "Panneau photovoltaïque. Puissance à confirmer selon le modèle.", stock: 15 },
  { id: "inverter-1", name: "Onduleur solaire", category: "Énergie solaire", price: 145000, emoji: "⚡", description: "Onduleur pour système solaire. Caractéristiques à confirmer.", stock: 6 },
  { id: "fridge-1", name: "Réfrigérateur", category: "Équipements électriques", price: 275000, emoji: "🧊", description: "Réfrigérateur domestique. Modèle et capacité à confirmer.", stock: 4 },
  { id: "ac-1", name: "Climatiseur", category: "Équipements électriques", price: 220000, emoji: "❄️", description: "Climatiseur. Puissance et modèle à confirmer.", stock: 5 },
  { id: "generator-1", name: "Groupe électrogène", category: "Équipements électriques", price: 480000, emoji: "🔌", description: "Groupe électrogène. Puissance à confirmer selon le modèle.", stock: 3 },
  { id: "roof-1", name: "Métro tuile", category: "Matériaux de toiture", price: 6500, emoji: "🏠", description: "Élément de toiture. Prix indicatif par unité, à confirmer.", stock: 100 },
  { id: "roof-2", name: "Bac de toiture", category: "Matériaux de toiture", price: 5500, emoji: "🏗️", description: "Bac de toiture. Dimensions et prix à confirmer.", stock: 100 },
  { id: "roof-3", name: "Faîtière", category: "Matériaux de toiture", price: 4500, emoji: "🧱", description: "Accessoire de finition pour toiture. Prix à confirmer.", stock: 60 }
];

let pool = null;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") ? false : { rejectUnauthorized: false }
  });
  pool.query(`
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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `).catch(err => console.error("Initialisation de la table orders:", err.message));
}

app.get("/api/health", (_req, res) => res.json({ ok: true, service: "ntv-boutique" }));
app.get("/api/products", (_req, res) => res.json(products));
app.get("/api/config", (_req, res) => res.json({
  whatsappNumber: process.env.WHATSAPP_NUMBER || "229014222197",
  currency: "XOF"
}));

app.post("/api/orders", async (req, res) => {
  const { customer, items, paymentMethod } = req.body || {};
  if (!customer?.name || !customer?.phone || !customer?.country || !customer?.address) {
    return res.status(400).json({ error: "Veuillez remplir tous les champs client." });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Votre panier est vide." });
  }
  const allowedMethods = ["Paiement à la livraison", "Mobile Money", "Carte bancaire"];
  if (!allowedMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: "Mode de paiement invalide." });
  }

  const cleanItems = [];
  let total = 0;
  for (const item of items) {
    const product = products.find(p => p.id === item.id);
    const quantity = Number(item.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
      return res.status(400).json({ error: "Un produit ou une quantité est invalide." });
    }
    cleanItems.push({ id: product.id, name: product.name, price: product.price, quantity });
    total += product.price * quantity;
  }
  try {
    let orderId = `NTV-${Date.now().toString().slice(-8)}`;
    if (pool) {
      const result = await pool.query(
        `INSERT INTO orders (customer_name, phone, country, address, items, total, payment_method)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
        [String(customer.name).slice(0,120), String(customer.phone).slice(0,40), String(customer.country).slice(0,80),
         String(customer.address).slice(0,500), JSON.stringify(cleanItems), total, paymentMethod]
      );
      orderId = `NTV-${result.rows[0].id}`;
    }
    return res.status(201).json({ ok: true, orderId, total, persisted: Boolean(pool) });
  } catch (err) {
    console.error("Erreur création commande:", err.message);
    return res.status(500).json({ error: "Impossible d'enregistrer la commande pour le moment." });
  }
});

app.use(express.static(clientDist));
app.get("*", (_req, res) => res.sendFile(path.join(clientDist, "index.html")));

app.listen(port, () => console.log(`NTV Boutique démarré sur le port ${port}`));
