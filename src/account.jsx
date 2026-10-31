
import React, { useEffect, useState } from "react";
import {
  ArrowLeft, UserRound, Store, Truck, ShieldCheck,
  ShoppingBag, Package, Plus, RefreshCw, LogOut,
  Eye, Pencil, Trash2, Clock, CheckCircle, XCircle
} from "lucide-react";
import "./styles.css";

const empty = {
  name: "",
  email: "",
  password: "",
  phone: "",
  country: "Bénin",
  role: "customer",
  businessName: "",
  businessDescription: "",
  deliveryZones: ""
};

const emptyProduct = {
  name: "",
  description: "",
  price: "",
  stock: "",
  category: "",
  imageUrl: ""
};

async function apiRequest(url, options = {}) {
  const token = localStorage.getItem("ntv_token");
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Une erreur est survenue.");
  }
  return data;
}

function money(value) {
  return `${Number(value || 0).toLocaleString("fr-FR")} FCFA`;
}

function statusLabel(status) {
  const labels = {
    pending: "En attente",
    active: "Actif",
    approved: "Approuvé",
    rejected: "Refusé",
    cancelled: "Annulé",
    preparing: "En préparation",
    processing: "En traitement",
    shipped: "Expédié",
    delivered: "Livré",
    paid: "Payé",
    unpaid: "Non payé"
  };
  return labels[status] || status || "Non renseigné";
}

export default function AccountApp() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ntv_user") || "null");
    } catch {
      return null;
    }
  });

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProduct, setEditingProduct] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productMessage, setProductMessage] = useState("");
  const [activeTab, setActiveTab] = useState("products");

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";

      const payload =
        mode === "login"
          ? { email: form.email, password: form.password }
          : form;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Une erreur est survenue.");
      }

      if (mode === "register") {
        if (form.role === "customer") {
          setMessage(
            "Votre compte client est créé. Vous pouvez maintenant vous connecter."
          );
        } else {
          setMessage(
            data.message ||
            "Votre demande a été envoyée à NTV. Votre compte sera activé après validation."
          );
        }

        setMode("login");
        setForm({ ...empty, email: form.email });
      } else {
        localStorage.setItem("ntv_token", data.token);
        localStorage.setItem("ntv_user", JSON.stringify(data.user));
        setUser(data.user);
        setMessage("Connexion réussie.");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    localStorage.removeItem("ntv_token");
    localStorage.removeItem("ntv_user");
    setUser(null);
    setProducts([]);
    setOrders([]);
    setMessage("Vous êtes déconnecté.");
    setError("");
  }

  async function loadSellerWorkspace() {
    setLoadingWorkspace(true);
    setWorkspaceError("");

    try {
      const [productData, orderData] = await Promise.all([
        apiRequest("/api/seller/products"),
        apiRequest("/api/seller/orders")
      ]);

      setProducts(
        Array.isArray(productData)
          ? productData
          : productData.products || []
      );

      setOrders(
        Array.isArray(orderData)
          ? orderData
          : orderData.orders || []
      );
    } catch (err) {
      setWorkspaceError(err.message);
    } finally {
      setLoadingWorkspace(false);
    }
  }

  useEffect(() => {
    if (user?.role === "seller" && user?.status === "active") {
      loadSellerWorkspace();
    }
  }, [user?.role, user?.status]);

  function startNewProduct() {
    setEditingProduct(null);
    setProductForm(emptyProduct);
    setProductMessage("");
    setActiveTab("products");
  }

  function startEditProduct(product) {
    setEditingProduct(product);
    setProductForm({
      name: product.name || "",
      description: product.description || "",
      price: product.price ?? "",
      stock: product.stock ?? "",
      category: product.category || "",
      imageUrl: product.imageUrl || ""
    });
    setProductMessage("");
    setActiveTab("products");
  }

  async function saveProduct(e) {
    e.preventDefault();
    setSavingProduct(true);
    setProductMessage("");
    setWorkspaceError("");

    try {
      const payload = {
        ...productForm,
        price: Number(productForm.price),
        stock: Number(productForm.stock || 0)
      };

      const isEditing = Boolean(editingProduct);
      const productId = editingProduct?.id || editingProduct?._id;

      const result = await apiRequest(
        isEditing
          ? `/api/seller/products/${encodeURIComponent(productId)}`
          : "/api/seller/products",
        {
          method: isEditing ? "PUT" : "POST",
          body: JSON.stringify(payload)
        }
      );

      setProductMessage(
        isEditing
          ? "Votre produit a été modifié."
          : "Votre produit a été ajouté."
      );

      setProductForm(emptyProduct);
      setEditingProduct(null);
      await loadSellerWorkspace();
    } catch (err) {
      setWorkspaceError(err.message);
    } finally {
      setSavingProduct(false);
    }
  }

  async function deleteProduct(product) {
    const productId = product.id || product._id;
    if (!window.confirm("Voulez-vous vraiment supprimer ce produit ?")) {
      return;
    }

    setWorkspaceError("");
    setProductMessage("");

    try {
      await apiRequest(
        `/api/seller/products/${encodeURIComponent(productId)}`,
        { method: "DELETE" }
      );
      setProductMessage("Le produit a été supprimé.");
      await loadSellerWorkspace();
    } catch (err) {
      setWorkspaceError(err.message);
    }
  }

  const roleName =
    user?.role === "customer"
      ? "Client"
      : user?.role === "seller"
        ? "Commerçant / vendeur"
        : user?.role === "delivery"
          ? "Livreur"
          : "Administrateur";

  const isActive = user?.status === "active";

  return (
    <div className="account-page">
      <header className="account-header">
        <a className="admin-back" href="/">
          <ArrowLeft size={16} /> Retour à la boutique
        </a>
        <div className="account-brand">
          NEWS TECHNOLOGY VILLAGE
          <span>ESPACE UTILISATEUR</span>
        </div>
      </header>

      <main className="account-wrap">
        {user ? (
          <section className="account-card account-workspace">
            <div className="account-icon">
              {user.role === "customer" ? (
                <ShoppingBag size={28} />
              ) : user.role === "delivery" ? (
                <Truck size={28} />
              ) : (
                <Store size={28} />
              )}
            </div>

            <p className="section-kicker">MON ESPACE NTV</p>
            <h1>Bienvenue, {user.name}</h1>
            <p className="account-lead">
              Votre espace {roleName.toLowerCase()}.
            </p>

            <div className="account-profile">
              <p>
                <b>Adresse e-mail</b>
                <span>{user.email}</span>
              </p>
              <p>
                <b>Type de compte</b>
                <span>{roleName}</span>
              </p>
              <p>
                <b>Statut du compte</b>
                <span>{statusLabel(user.status)}</span>
              </p>
              {user.storeSlug && (
                <p>
                  <b>Adresse de votre boutique</b>
                  <span>
                    <a href={`/boutique/${user.storeSlug}`}>
                      /boutique/{user.storeSlug}
                    </a>
                  </span>
                </p>
              )}
            </div>

            {!isActive && user.role !== "customer" && (
              <div className="account-note">
                <Clock size={18} />
                <span>
                  Votre compte professionnel est en attente de validation
                  par l'administration NTV. Vous pourrez accéder aux
                  fonctionnalités professionnelles après approbation.
                </span>
              </div>
            )}

            {user.role === "customer" && (
              <div className="account-note">
                <ShoppingBag size={18} />
                <span>
                  Vous pouvez consulter le catalogue, choisir vos produits
                  et passer vos commandes.
                </span>
              </div>
            )}

            {user.role === "seller" && isActive && (
              <div className="seller-workspace">
                <div className="seller-workspace-heading">
                  <div>
                    <p className="section-kicker">TABLEAU DE BORD VENDEUR</p>
                    <h2>Gestion de ma boutique</h2>
                  </div>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={loadSellerWorkspace}
                    disabled={loadingWorkspace}
                  >
                    <RefreshCw size={15} />
                    Actualiser
                  </button>
                </div>

                <div className="seller-stats">
                  <div>
                    <Package size={20} />
                    <strong>{products.length}</strong>
                    <span>Mes produits</span>
                  </div>
                  <div>
                    <ShoppingBag size={20} />
                    <strong>{orders.length}</strong>
                    <span>Commandes contenant mes articles</span>
                  </div>
                </div>

                <div className="account-tabs">
                  <button
                    className={activeTab === "products" ? "selected" : ""}
                    onClick={() => setActiveTab("products")}
                    type="button"
                  >
                    Mes produits
                  </button>
                  <button
                    className={activeTab === "orders" ? "selected" : ""}
                    onClick={() => setActiveTab("orders")}
                    type="button"
                  >
                    Mes commandes
                  </button>
                </div>

                {workspaceError && (
                  <p className="admin-error">{workspaceError}</p>
                )}
                {productMessage && (
                  <p className="admin-success">{productMessage}</p>
                )}

                {loadingWorkspace ? (
                  <p className="account-lead">Chargement de votre espace...</p>
                ) : activeTab === "products" ? (
                  <>
                    <div className="seller-section-heading">
                      <h3>Mes produits</h3>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={startNewProduct}
                      >
                        <Plus size={16} /> Ajouter un produit
                      </button>
                    </div>

                    <form className="account-form seller-product-form" onSubmit={saveProduct}>
                      <h3>
                        {editingProduct
                          ? "Modifier mon produit"
                          : "Ajouter un produit"}
                      </h3>

                      <label>
                        Nom du produit
                        <input
                          required
                          value={productForm.name}
                          onChange={e =>
                            setProductForm({
                              ...productForm,
                              name: e.target.value
                            })
                          }
                        />
                      </label>

                      <label>
                        Description
                        <textarea
                          rows="3"
                          value={productForm.description}
                          onChange={e =>
                            setProductForm({
                              ...productForm,
                              description: e.target.value
                            })
                          }
                        />
                      </label>

                      <div className="account-two">
                        <label>
                          Prix (FCFA)
                          <input
                            required
                            type="number"
                            min="0"
                            value={productForm.price}
                            onChange={e =>
                              setProductForm({
                                ...productForm,
                                price: e.target.value
                              })
                            }
                          />
                        </label>
                        <label>
                          Quantité en stock
                          <input
                            type="number"
                            min="0"
                            value={productForm.stock}
                            onChange={e =>
                              setProductForm({
                                ...productForm,
                                stock: e.target.value
                              })
                            }
                          />
                        </label>
                      </div>

                      <label>
                        Catégorie
                        <input
                          value={productForm.category}
                          onChange={e =>
                            setProductForm({
                              ...productForm,
                              category: e.target.value
                            })
                          }
                          placeholder="Exemple : Téléphones, vêtements..."
                        />
                      </label>

                      <label>
                        Adresse de l'image du produit
                        <input
                          type="url"
                          value={productForm.imageUrl}
                          onChange={e =>
                            setProductForm({
                              ...productForm,
                              imageUrl: e.target.value
                            })
                          }
                          placeholder="https://..."
                        />
                      </label>

                      <button
                        className="primary-button full-button"
                        type="submit"
                        disabled={savingProduct}
                      >
                        {savingProduct
                          ? "Enregistrement..."
                          : editingProduct
                            ? "Enregistrer les modifications"
                            : "Ajouter le produit"}
                      </button>

                      {editingProduct && (
                        <button
                          className="secondary-button full-button"
                          type="button"
                          onClick={startNewProduct}
                        >
                          Annuler la modification
                        </button>
                      )}
                    </form>

                    <div className="seller-product-list">
                      {products.length === 0 ? (
                        <p className="account-lead">
                          Vous n'avez pas encore ajouté de produit.
                        </p>
                      ) : (
                        products.map(product => (
                          <div
                            className="seller-product-row"
                            key={product.id || product._id}
                          >
                            {product.imageUrl ? (
                              <img
                                src={product.imageUrl}
                                alt={product.name}
                              />
                            ) : (
                              <div className="seller-product-placeholder">
                                <Package size={24} />
                              </div>
                            )}

                            <div className="seller-product-info">
                              <strong>{product.name}</strong>
                              <span>{money(product.price)}</span>
                              <small>
                                Stock : {product.stock ?? "Non renseigné"}
                              </small>
                            </div>

                            <div className="seller-product-actions">
                              <button
                                type="button"
                                title="Modifier"
                                onClick={() => startEditProduct(product)}
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                type="button"
                                title="Supprimer"
                                onClick={() => deleteProduct(product)}
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </>
                ) : (
                  <div className="seller-orders">
                    <h3>Commandes contenant mes produits</h3>
                    <p className="account-note">
                      <Eye size={17} />
                      Vous pouvez consulter les commandes qui concernent
                      vos articles. La gestion des clients, les paiements
                      et les changements de statut restent sous le contrôle
                      de l'administration NTV.
                    </p>

                    {orders.length === 0 ? (
                      <p className="account-lead">
                        Aucune commande concernant vos produits pour le moment.
                      </p>
                    ) : (
                      orders.map((order, index) => (
                        <div
                          className="seller-order-card"
                          key={order.orderId || order._id || index}
                        >
                          <div className="seller-order-heading">
                            <strong>
                              Commande {order.orderId || order._id || `#${index + 1}`}
                            </strong>
                            <span>{statusLabel(order.status)}</span>
                          </div>

                          <div className="seller-order-items">
                            {(order.items || []).map((item, itemIndex) => (
                              <p key={item.id || item._id || itemIndex}>
                                {item.name} × {item.quantity}
                                <span>{money(item.price * item.quantity)}</span>
                              </p>
                            ))}
                          </div>

                          <small>
                            Date :{" "}
                            {order.createdAt
                              ? new Date(order.createdAt).toLocaleString("fr-FR")
                              : "Non renseignée"}
                          </small>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}

            {user.role === "delivery" && isActive && (
              <div className="account-note">
                <Truck size={20} />
                <span>
                  Votre compte livreur est actif. Les missions de livraison
                  seront affichées dans cet espace lorsqu'elles seront
                  attribuées par NTV. Seules les missions qui vous sont
                  confiées pourront être consultées.
                </span>
              </div>
            )}

            <a className="primary-button full-button" href="/">
              Accéder au catalogue <ShoppingBag size={17} />
            </a>

            <button
              className="secondary-button full-button"
              type="button"
              onClick={logout}
            >
              <LogOut size={16} /> Se déconnecter
            </button>
          </section>
        ) : (
          <section className="account-card">
            <div className="account-icon">
              <UserRound size={28} />
            </div>

            <p className="section-kicker">REJOIGNEZ NOTRE MARKETPLACE</p>
            <h1>
              {mode === "login"
                ? "Connexion à votre espace"
                : "Créer un compte NTV"}
            </h1>

            <p className="account-lead">
              Les clients peuvent créer gratuitement un compte ou acheter
              directement comme invités. Les commerçants et livreurs doivent
              obtenir l'approbation de NTV avant d'accéder à leurs
              fonctionnalités professionnelles.
            </p>

            <div className="account-tabs">
              <button
                className={mode === "login" ? "selected" : ""}
                type="button"
                onClick={() => {
                  setMode("login");
                  setError("");
                  setMessage("");
                }}
              >
                Se connecter
              </button>
              <button
                className={mode === "register" ? "selected" : ""}
                type="button"
                onClick={() => {
                  setMode("register");
                  setError("");
                  setMessage("");
                }}
              >
                Créer un compte
              </button>
            </div>

            <form className="account-form" onSubmit={submit}>
              {mode === "register" && (
                <>
                  <label>
                    Type de compte
                    <select
                      value={form.role}
                      onChange={e =>
                        setForm({ ...form, role: e.target.value })
                      }
                    >
                      <option value="customer">Client (gratuit)</option>
                      <option value="seller">Commerçant / vendeur</option>
                      <option value="delivery">Livreur</option>
                    </select>
                  </label>

                  <label>
                    Nom complet
                    <input
                      required
                      minLength="2"
                      value={form.name}
                      onChange={e =>
                        setForm({ ...form, name: e.target.value })
                      }
                      autoComplete="name"
                    />
                  </label>

                  <div className="account-two">
                    <label>
                      Téléphone
                      <input
                        required
                        value={form.phone}
                        onChange={e =>
                          setForm({ ...form, phone: e.target.value })
                        }
                        autoComplete="tel"
                      />
                    </label>

                    <label>
                      Pays
                      <select
                        value={form.country}
                        onChange={e =>
                          setForm({ ...form, country: e.target.value })
                        }
                      >
                        {[
                          "Bénin",
                          "Togo",
                          "Nigeria",
                          "Burkina Faso",
                          "Niger",
                          "Côte d’Ivoire",
                          "Ghana",
                          "Sénégal",
                          "Autre"
                        ].map(country => (
                          <option key={country}>{country}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {form.role === "seller" && (
                    <>
                      <label>
                        Nom du commerce / entreprise
                        <input
                          required
                          value={form.businessName}
                          onChange={e =>
                            setForm({
                              ...form,
                              businessName: e.target.value
                            })
                          }
                          placeholder="Nom de votre boutique"
                        />
                      </label>

                      <label>
                        Activité et produits proposés
                        <textarea
                          rows="3"
                          value={form.businessDescription}
                          onChange={e =>
                            setForm({
                              ...form,
                              businessDescription: e.target.value
                            })
                          }
                          placeholder="Décrivez votre commerce et vos produits"
                        />
                      </label>
                    </>
                  )}

                  {form.role === "delivery" && (
                    <label>
                      Zones de livraison couvertes
                      <textarea
                        rows="3"
                        value={form.deliveryZones}
                        onChange={e =>
                          setForm({
                            ...form,
                            deliveryZones: e.target.value
                          })
                        }
                        placeholder="Villes, communes et quartiers desservis"
                      />
                    </label>
                  )}
                </>
              )}

              <label>
                Adresse e-mail
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e =>
                    setForm({ ...form, email: e.target.value })
                  }
                  autoComplete="email"
                />
              </label>

              <label>
                Mot de passe
                <input
                  required
                  type="password"
                  minLength="10"
                  value={form.password}
                  onChange={e =>
                    setForm({ ...form, password: e.target.value })
                  }
                  autoComplete={
                    mode === "login"
                      ? "current-password"
                      : "new-password"
                  }
                />
                {mode === "register" && (
                  <small>10 caractères minimum.</small>
                )}
              </label>

              {error && <p className="admin-error">{error}</p>}
              {message && <p className="admin-success">{message}</p>}

              <button
                className="primary-button full-button"
                disabled={busy}
                type="submit"
              >
                {busy
                  ? "Veuillez patienter..."
                  : mode === "login"
                    ? "Se connecter"
                    : form.role === "customer"
                      ? "Créer mon compte client"
                      : "Envoyer ma demande"}
              </button>
            </form>

            {mode === "register" && form.role !== "customer" && (
              <p className="account-note">
                <Store size={15} />
                Les demandes des commerçants et livreurs sont examinées
                par NTV avant activation.
                <Truck size={15} />
              </p>
            )}

            {mode === "register" && form.role === "customer" && (
              <p className="account-note">
                <ShoppingBag size={15} />
                Le compte client est gratuit et activé dès sa création.
              </p>
            )}
          </section>
        )}

        <p className="account-security">
          Vos mots de passe sont enregistrés sous forme hachée.
          Ne partagez jamais vos identifiants.
        </p>
      </main>
    </div>
  );
}
