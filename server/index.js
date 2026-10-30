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
  { id: "moto-1", name: "Scooter électrique urbain", category: "Motos et scooters électriques", price: 650000, oldPrice: 720000, image: "https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=85", emoji: "🛵", description: "Scooter électrique pour les déplacements quotidiens.", badge: "Populaire", stock: 8 },
  { id: "helmet-1", name: "Casque de protection", category: "Motos et scooters électriques", price: 25000, image: "https://images.unsplash.com/photo-1558981403-c5f9899a28bc?auto=format&fit=crop&w=900&q=85", emoji: "🪖", description: "Casque de protection pour vos déplacements.", stock: 25 },
  { id: "battery-1", name: "Batterie solaire", category: "Panneaux et équipements solaires", price: 185000, image: "https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=900&q=85", emoji: "🔋", description: "Batterie pour installation solaire. Capacité à confirmer selon le modèle.", stock: 10 },
  { id: "panel-1", name: "Panneau solaire", category: "Panneaux et équipements solaires", price: 85000, image: "https://images.unsplash.com/photo-1508514177221-188b1cf16e9d?auto=format&fit=crop&w=900&q=85", emoji: "☀️", description: "Panneau photovoltaïque. Puissance à confirmer selon le modèle.", stock: 15 },
  { id: "inverter-1", name: "Onduleur solaire", category: "Panneaux et équipements solaires", price: 145000, image: "https://images.unsplash.com/photo-1473341304170-971563e1e9a8?auto=format&fit=crop&w=900&q=85", emoji: "⚡", description: "Onduleur pour système solaire. Caractéristiques à confirmer.", stock: 6 },
  { id: "fridge-1", name: "Réfrigérateur", category: "Électroménager et équipements électriques", price: 275000, image: "https://images.unsplash.com/photo-1571175443880-49e1d25b2bc5?auto=format&fit=crop&w=900&q=85", emoji: "🧊", description: "Réfrigérateur domestique. Modèle et capacité à confirmer.", stock: 4 },
  { id: "ac-1", name: "Climatiseur", category: "Électroménager et équipements électriques", price: 220000, image: "https://images.unsplash.com/photo-1631545806609-6d6b8c8f4f0d?auto=format&fit=crop&w=900&q=85", emoji: "❄️", description: "Climatiseur. Puissance et modèle à confirmer.", stock: 5 },
  { id: "generator-1", name: "Groupe électrogène", category: "Électroménager et équipements électriques", price: 480000, image: "https://images.unsplash.com/photo-1473341304170-971563e1e9a8?auto=format&fit=crop&w=900&q=85", emoji: "🔌", description: "Groupe électrogène. Puissance à confirmer selon le modèle.", stock: 3 },
  { id: "roof-1", name: "Métro tuile", category: "Toiture et matériaux de construction", price: 6500, image: "https://images.unsplash.com/photo-1635424710928-3f5c1c4c6e2b?auto=format&fit=crop&w=900&q=85", emoji: "🏠", description: "Élément de toiture. Prix indicatif par unité, à confirmer.", stock: 100 },
  { id: "roof-2", name: "Bac de toiture", category: "Toiture et matériaux de construction", price: null, quoteOnly: true, image: "https://images.unsplash.com/photo-1632778149955-e80f8ceca2e8?auto=format&fit=crop&w=900&q=85", emoji: "🏗️", description: "Bacs de toiture : dimensions, finition et quantité à préciser.", stock: 100 },
  { id: "roof-3", name: "Faîtière", category: "Toiture et matériaux de construction", price: null, quoteOnly: true, image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=900&q=85", emoji: "🧱", description: "Accessoire de finition pour toiture. Prix selon modèle et quantité.", stock: 60 },
  { id: "kit-solar", name: "Kit solaire pour habitation", category: "Panneaux et équipements solaires", price: null, quoteOnly: true, image: "https://images.unsplash.com/photo-1497435334941-8c899ee9e8e9?auto=format&fit=crop&w=900&q=85", emoji: "☀️", description: "Solution solaire à dimensionner selon vos besoins et votre consommation.", stock: 10 },
  { id: "electrical-kit", name: "Matériel électrique professionnel", category: "Matériel électrique", price: null, quoteOnly: true, image: "https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&w=900&q=85", emoji: "⚡", description: "Matériel électrique pour installations et projets professionnels.", stock: 20 }
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
  const allowedMethods = ["Paiement à la livraison", "MTN Mobile Money", "Moov Money", "Carte bancaire", "Virement bancaire"];
  if (!allowedMethods.includes(paymentMethod)) {
    return res.status(400).json({ error: "Mode de paiement invalide." });
  }

  const cleanItems = [];
  let total = 0;
  for (const item of items) {
    const product = products.find(p => p.id === item.id);
    const quantity = Number(item.quantity);
    if (!product || product.quoteOnly || !Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
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
