
import React, { useEffect, useState } from "react";
import {
  LockKeyhole,
  Plus,
  Save,
  Trash2,
  Upload,
  ArrowLeft,
  LogOut,
  Package,
  Store,
  RefreshCw,
  Search
} from "lucide-react";
import "./styles.css";

const categories = [
  "Mobilité électrique",
  "Énergie solaire",
  "Équipements électriques",
  "Matériaux de toiture",
  "Équipements pour la maison",
  "Équipements professionnels"
];

const blank = {
  name: "",
  category: categories[0],
  price: "",
  priceType: "fixed",
  description: "",
  emoji: "📦",
  badge: "",
  stock: 0,
  imageUrl: "",
  imageUrls: []
};

const money = n =>
  new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0
  }).format(Number(n || 0)) + " FCFA";

function productId(product) {
  return String(product.id || product._id || "");
}

function AdminApp() {
  const [credentials, setCredentials] = useState(
    () => sessionStorage.getItem("ntv_admin_auth") || ""
  );

  const [user, setUser] = useState("");
  const [password, setPassword] = useState("");

  const [products, setProducts] = useState([]);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState(null);

  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");

  const authHeaders = () => ({
    Authorization: `Basic ${credentials}`
  });

  async function load(auth = credentials) {
    if (!auth) return;

    const response = await fetch("/api/admin/products", {
      headers: {
        Authorization: `Basic ${auth}`
      }
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || "Chargement du catalogue impossible.");
    }

    const list = Array.isArray(data)
      ? data
      : Array.isArray(data.products)
        ? data.products
        : [];

    setProducts(list);
    setCredentials(auth);
    sessionStorage.setItem("ntv_admin_auth", auth);
    setError("");
  }

  useEffect(() => {
    if (credentials) {
      load().catch(e => {
        setError(e.message);
        setCredentials("");
        sessionStorage.removeItem("ntv_admin_auth");
      });
    }
  }, []);

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    const token = btoa(`${user}:${password}`);

    try {
      await load(token);
      setPassword("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem("ntv_admin_auth");
    setCredentials("");
    setProducts([]);
    setPassword("");
    setUser("");
    setForm(blank);
    setEditing(null);
  }

  function edit(product) {
    setEditing(productId(product));

    setForm({
      ...blank,
      ...product,
      imageUrls: (Array.isArray(product.imageUrls) ? product.imageUrls : [product.imageUrl]).filter(Boolean).slice(0, 2),
      price:
        product.priceType === "quote"
          ? ""
          : product.price ?? ""
    });

    setMessage("");
    setError("");

    window.scrollTo({
      top: 0,
      behavior: "smooth"
    });
  }

  function newProduct() {
    setEditing(null);
    setForm({ ...blank });
    setMessage("");
    setError("");
  }

  async function uploadImages(files) {
    if (!files.length) return;
    if (files.length > 2) {
      setError("Deux images maximum par article.");
      return;
    }

    const body = new FormData();
    files.forEach(file => body.append("images", file));

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/images", {
        method: "POST",
        headers: authHeaders(),
        body
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Téléversement impossible.");
      }

      setForm(current => ({
        ...current,
        imageUrls: data.imageUrls || [data.imageUrl].filter(Boolean),
        imageUrl: (data.imageUrls || [data.imageUrl])[0] || ""
      }));

      setMessage(
        "Photo téléchargée. Enregistrez le produit pour confirmer."
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function save(e) {
    e.preventDefault();

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const url = editing
        ? `/api/admin/products/${encodeURIComponent(editing)}`
        : "/api/admin/products";

      const imageUrls = (form.imageUrls || (form.imageUrl ? [form.imageUrl] : [])).filter(Boolean).slice(0, 2);
      const payload = {
        ...form,
        imageUrls,
        imageUrl: imageUrls[0] || "",
        price:
          form.priceType === "quote"
            ? 0
            : Number(form.price || 0),
        stock: Number(form.stock || 0)
      };

      const response = await fetch(url, {
        method: editing ? "PUT" : "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Enregistrement impossible.");
      }

      await load();

      setForm({ ...blank });
      setEditing(null);
      setMessage("Produit enregistré avec succès.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(product) {
    const id = productId(product);

    if (!id) {
      setError("Identifiant du produit introuvable.");
      return;
    }

    const confirmed = window.confirm(
      `Supprimer « ${product.name} » du catalogue ?`
    );

    if (!confirmed) return;

    setError("");
    setMessage("");
    setBusy(true);

    try {
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(id)}`,
        {
          method: "DELETE",
          headers: authHeaders()
        }
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Suppression impossible.");
      }

      setProducts(current =>
        current.filter(item => productId(item) !== id)
      );

      if (editing === id) {
        newProduct();
      }

      setMessage("Produit supprimé du catalogue.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  const vendorProducts = products.filter(
    product => Boolean(product.vendorId)
  );

  const centralProducts = products.filter(
    product => !product.vendorId
  );

  const visibleProducts = products.filter(product => {
    const text = [
      product.name,
      product.category,
      product.vendorName,
      product.storeName
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    const matchesSearch = text.includes(search.toLowerCase());

    const matchesFilter =
      filter === "all" ||
      (filter === "central" && !product.vendorId) ||
      (filter === "vendors" && Boolean(product.vendorId));

    return matchesSearch && matchesFilter;
  });

  if (!credentials) {
    return (
      <div className="admin-page">
        <div className="admin-login">
          <div className="admin-logo"><img src="/ntv-mall-logo.png" alt="NTV Mall" /></div>

          <p className="section-kicker">ESPACE PRIVÉ</p>
          <h1>Administration</h1>
          <p className="admin-sub">
            NEWS TECHNOLOGY VILLAGE
          </p>

          <form onSubmit={login}>
            <label>
              Identifiant
              <input
                value={user}
                onChange={e => setUser(e.target.value)}
                autoComplete="username"
                required
              />
            </label>

            <label>
              Mot de passe
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete="current-password"
                required
              />
            </label>

            {error && (
              <p className="admin-error">{error}</p>
            )}

            <button
              className="primary-button full-button"
              disabled={busy}
            >
              <LockKeyhole size={17} />
              {busy ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <a className="admin-back" href="/">
            ← Retour à la boutique
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-top">
        <a className="admin-back" href="/">
          <ArrowLeft size={16} />
          Voir la boutique
        </a>

        <div className="admin-brand">
          <Package size={22} />
          NTV Mall
          <span>Administration</span>
        </div>

        <button
          className="admin-logout"
          onClick={logout}
        >
          <LogOut size={15} />
          Déconnexion
        </button>
      </header>

      <main className="admin-main">
        <div className="admin-title">
          <div>
            <p className="section-kicker">
              GESTION DU CATALOGUE
            </p>

            <h1>Catalogue général</h1>

            <p>
              Gérez les produits de NTV et consultez les produits
              proposés par les vendeurs.
            </p>
          </div>

          <button
            className="primary-button"
            onClick={newProduct}
          >
            <Plus size={17} />
            Nouveau produit NTV
          </button>
        </div>

        <div className="admin-stats">
          <div className="admin-panel">
            <span>Produits au total</span>
            <h2>{products.length}</h2>
          </div>

          <div className="admin-panel">
            <span>Produits NTV</span>
            <h2>{centralProducts.length}</h2>
          </div>

          <div className="admin-panel">
            <span>Produits vendeurs</span>
            <h2>{vendorProducts.length}</h2>
          </div>
        </div>

        <div className="admin-layout">
          <section className="admin-panel">
            <h2>
              {editing
                ? "Modifier le produit"
                : "Ajouter un produit NTV"}
            </h2>

            <p className="admin-hint">
              Les nouveaux produits créés ici appartiennent au
              catalogue central de NTV.
            </p>

            <form
              onSubmit={save}
              className="admin-form"
            >
              <label>
                Nom du produit
                <input
                  required
                  value={form.name}
                  onChange={e =>
                    setForm({
                      ...form,
                      name: e.target.value
                    })
                  }
                  placeholder="Ex. Panneau solaire 550 W"
                />
              </label>

              <label>
                Catégorie
                <select
                  value={form.category}
                  onChange={e =>
                    setForm({
                      ...form,
                      category: e.target.value
                    })
                  }
                >
                  {categories.map(category => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Type de prix
                <select
                  value={form.priceType}
                  onChange={e =>
                    setForm({
                      ...form,
                      priceType: e.target.value
                    })
                  }
                >
                  <option value="fixed">Prix fixe</option>
                  <option value="quote">Prix sur devis</option>
                </select>
              </label>

              {form.priceType === "fixed" && (
                <label>
                  Prix en FCFA
                  <input
                    required
                    type="number"
                    min="0"
                    step="1"
                    value={form.price}
                    onChange={e =>
                      setForm({
                        ...form,
                        price: e.target.value
                      })
                    }
                    placeholder="Ex. 125000"
                  />
                </label>
              )}

              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={e =>
                    setForm({
                      ...form,
                      description: e.target.value
                    })
                  }
                  rows="3"
                  placeholder="Caractéristiques du produit"
                />
              </label>

              <div className="admin-two">
                <label>
                  Stock
                  <input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={e =>
                      setForm({
                        ...form,
                        stock: e.target.value
                      })
                    }
                  />
                </label>

                <label>
                  Emoji
                  <input
                    value={form.emoji}
                    onChange={e =>
                      setForm({
                        ...form,
                        emoji: e.target.value
                      })
                    }
                  />
                </label>
              </div>

              <label>
                Photos du produit (2 maximum)
                <span className="admin-hint">
                  Une ou deux photos JPG, PNG, WEBP ou GIF · 6 Mo maximum chacune
                </span>
                <span className="admin-upload">
                  <Upload size={19} />
                  <b>Choisir jusqu'à 2 images sur mon appareil</b>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                    multiple
                    onChange={e => uploadImages(Array.from(e.target.files || []))}
                  />
                </span>
              </label>

              {(form.imageUrls || (form.imageUrl ? [form.imageUrl] : [])).filter(Boolean).length > 0 && (
                <div className="admin-preview">
                  {(form.imageUrls || [form.imageUrl]).filter(Boolean).slice(0, 2).map((url, index) => (
                    <div key={url}>
                      <img src={url} alt={`Aperçu ${index + 1} du produit`} />
                      <button type="button" onClick={() => {
                        const next = (form.imageUrls || [form.imageUrl]).filter(Boolean).filter((_, i) => i !== index);
                        setForm({ ...form, imageUrls: next, imageUrl: next[0] || "" });
                      }}>Retirer</button>
                    </div>
                  ))}
                </div>
              )}

              {message && (
                <p className="admin-success">{message}</p>
              )}

              {error && (
                <p className="admin-error">{error}</p>
              )}

              <div className="admin-form-actions">
                <button
                  className="primary-button"
                  disabled={busy}
                >
                  <Save size={16} />
                  {busy
                    ? "Enregistrement..."
                    : "Enregistrer le produit"}
                </button>

                <button
                  className="secondary-admin"
                  type="button"
                  onClick={newProduct}
                >
                  Annuler
                </button>
              </div>
            </form>
          </section>

          <section className="admin-panel admin-list-panel">
            <div className="admin-list-head">
              <h2>
                Catalogue ({visibleProducts.length})
              </h2>

              <button
                className="secondary-admin"
                onClick={() =>
                  load().catch(e => setError(e.message))
                }
                disabled={busy}
              >
                <RefreshCw size={14} />
                Actualiser
              </button>
            </div>

            <div className="admin-catalog-filters">
              <button
                type="button"
                className={filter === "all" ? "active" : ""}
                onClick={() => setFilter("all")}
              >
                Tous ({products.length})
              </button>

              <button
                type="button"
                className={filter === "central" ? "active" : ""}
                onClick={() => setFilter("central")}
              >
                NTV ({centralProducts.length})
              </button>

              <button
                type="button"
                className={filter === "vendors" ? "active" : ""}
                onClick={() => setFilter("vendors")}
              >
                Vendeurs ({vendorProducts.length})
              </button>
            </div>

            <label className="admin-search">
              <Search size={17} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher un produit ou un vendeur..."
              />
            </label>

            {visibleProducts.length === 0 ? (
              <p className="admin-empty">
                Aucun produit trouvé.
              </p>
            ) : (
              <div className="admin-product-list">
                {visibleProducts.map(product => {
                  const id = productId(product);
                  const isVendorProduct = Boolean(product.vendorId);

                  return (
                    <article
                      className="admin-product"
                      key={id}
                    >
                      <div className="admin-product-image">
                        {(product.imageUrls?.[0] || product.imageUrl) ? (
                          <img
                            src={product.imageUrls?.[0] || product.imageUrl}
                            alt=""
                          />
                        ) : (
                          <span>
                            {product.emoji || "📦"}
                          </span>
                        )}
                      </div>

                      <div className="admin-product-details">
                        <b>{product.name}</b>

                        <small>{product.category}</small>

                        <strong>
                          {product.priceType === "quote"
                            ? "Prix sur devis"
                            : money(product.price)}
                        </strong>

                        <small>
                          {isVendorProduct ? (
                            <>
                              <Store size={12} />
                              Vendeur :{" "}
                              {product.vendorName ||
                                product.storeName ||
                                "Vendeur"}
                            </>
                          ) : (
                            "Catalogue central NTV"
                          )}
                        </small>
                      </div>

                      <div className="admin-product-actions">
                        <button
                          type="button"
                          onClick={() => edit(product)}
                        >
                          Modifier
                        </button>

                        <button
                          type="button"
                          className="delete-admin"
                          onClick={() => remove(product)}
                          aria-label={`Supprimer ${product.name}`}
                          disabled={busy}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <p className="admin-footnote">
          L'administration NTV dispose d'une vue globale du catalogue.
          Les produits vendeurs restent associés à leur propriétaire.
          Avant toute suppression ou modification d'un produit vendeur,
          vérifiez les conséquences pour sa boutique.
        </p>
      </main>
    </div>
  );
}

export default AdminApp;
