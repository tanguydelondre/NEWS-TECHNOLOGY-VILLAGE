
import React, { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Users,
  Truck,
  Package,
  RefreshCw,
  LogOut,
  ArrowLeft,
  Check,
  X,
  ExternalLink,
  Clock3,
  CircleDollarSign,
  CreditCard,
  Store,
  ClipboardList,
  ImagePlus,
  UserRound,
  MessageCircle,
  AlertCircle
} from "lucide-react";
import "./styles.css";
import CommunicationCenter from "./communications";
import ComplaintsCenter from "./complaints";

const money = n =>
  new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0
  }).format(Number(n || 0)) + " FCFA";

const statuses = [
  "À confirmer",
  "Confirmée",
  "En préparation",
  "Prête à expédier",
  "Expédiée",
  "En livraison",
  "Livrée",
  "Annulée"
];

const stageTasks = {
  "À confirmer": "NTV : vérifier les coordonnées, la disponibilité et le prix avec le client.",
  "Confirmée": "NTV : confirmer la commande et transmettre les articles au vendeur concerné.",
  "En préparation": "Vendeur : préparer les articles. NTV peut suivre cette étape et intervenir après vérification.",
  "Prête à expédier": "Vendeur / NTV : vérifier que le colis est prêt et emballé.",
  "Expédiée": "NTV : remettre le colis au livreur et organiser le départ.",
  "En livraison": "Livreur / NTV : suivre l'acheminement et contacter le client si nécessaire.",
  "Livrée": "NTV : confirmer la remise au client et clôturer la commande.",
  "Annulée": "NTV : noter le motif de l'annulation et prévenir le client."
};

const nextStage = status => {
  const index = statuses.indexOf(status);
  return index >= 0 && index < statuses.length - 2
    ? statuses[index + 1]
    : null;
};

const paymentStatusLabel = status => {
  const value = String(status || "").toLowerCase();

  if (["paid", "paid_verified", "verified", "validated", "confirmed"].includes(value)) {
    return "Paiement confirmé";
  }

  if (["pending", "waiting", "declared"].includes(value)) {
    return "En attente de vérification";
  }

  if (["rejected", "failed", "cancelled"].includes(value)) {
    return "Paiement refusé ou échoué";
  }

  return status || "Non renseigné";
};

function AdminDashboard() {
  const [auth, setAuth] = useState(
    () => sessionStorage.getItem("ntv_admin_auth") || ""
  );

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [billingSellers, setBillingSellers] = useState([]);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [adminAvatar, setAdminAvatar] = useState("");
  const [announcementDraft, setAnnouncementDraft] = useState([]);
  const [avatarBusy, setAvatarBusy] = useState(false);

  const headers = token => ({
    Authorization: `Basic ${token || auth}`
  });

  async function api(url, options = {}, token = auth) {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...headers(token),
        ...(options.headers || {})
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Une erreur est survenue.");
    }

    return data;
  }

  async function loadAll(token = auth) {
    setError("");

    const [summary, orderRows, users, ads, billing] = await Promise.all([
      api("/api/admin/dashboard", {}, token),
      api("/api/admin/orders", {}, token),
      api("/api/admin/accounts", {}, token),
      api("/api/announcements", {}, token).catch(() => []),
      api("/api/admin/seller-billing", {}, token).catch(() => ({ sellers: [] }))
    ]);

    setStats(summary);
    setOrders(Array.isArray(orderRows) ? orderRows : orderRows.orders || []);
    setAccounts(Array.isArray(users) ? users : users.accounts || []);
    setBillingSellers(Array.isArray(billing.sellers) ? billing.sellers : []);
    setAnnouncementDraft(Array.isArray(ads) ? ads : []);
    setAuth(token);

    sessionStorage.setItem("ntv_admin_auth", token);
  }

  useEffect(() => {
    if (auth) {
      loadAll(auth).then(() => loadAdminProfile(auth)).catch(e => {
        setError(e.message);
        setAuth("");
        sessionStorage.removeItem("ntv_admin_auth");
      });
    }
  }, []);

  async function saveAnnouncements() {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await api("/api/admin/announcements", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: announcementDraft })
      });
      setAnnouncementDraft(data.items || []);
      setNotice("Les annonces du catalogue ont été enregistrées.");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function updateAnnouncement(index, field, value) {
    setAnnouncementDraft(rows => rows.map((row, i) => i === index ? { ...row, [field]: value } : row));
  }

  async function loadAdminProfile(token = auth) {
    try {
      const data = await api("/api/admin/profile", {}, token);
      setAdminAvatar(data.profileImageUrl || "");
    } catch { /* Le profil peut être configuré ultérieurement. */ }
  }

  async function uploadAdminAvatar(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 6 * 1024 * 1024) {
      setError("Choisissez une image JPG, PNG, WEBP ou GIF de 6 Mo maximum.");
      return;
    }
    setAvatarBusy(true);
    setError("");
    setNotice("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/admin/profile/avatar", {
        method: "POST",
        headers: headers(auth),
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "La photo n'a pas pu être enregistrée.");
      setAdminAvatar(data.profileImageUrl || "");
      setNotice("Photo de profil administrateur mise à jour.");
    } catch (e) {
      setError(e.message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      const token = btoa(`${username}:${password}`);
      await loadAll(token);
      await loadAdminProfile(token);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    sessionStorage.removeItem("ntv_admin_auth");
    setAuth("");
    setStats(null);
    setOrders([]);
    setAccounts([]);
    setBillingSellers([]);
  }

  async function refresh() {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      await loadAll();
      setNotice("Tableau de bord actualisé.");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function updateSellerSubscription(seller, action) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const data = await api(`/api/admin/accounts/${seller.id}/subscription`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action })
      });
      setAccounts(rows => rows.map(row => row.id === seller.id ? data.user : row));
      const billing = await api("/api/admin/seller-billing");
      setBillingSellers(billing.sellers || []);
      setNotice(action === "suspend" ? `Abonnement de ${seller.businessName || seller.name} suspendu.` : action === "remind" ? `Rappel envoyé à ${seller.businessName || seller.name}.` : `Paiement/renouvellement de ${seller.businessName || seller.name} validé pour un mois.`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeOrder(order, status) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const updatedOrder = await api(
        `/api/admin/orders/${encodeURIComponent(order.id)}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            status,
            note: "Mise à jour effectuée depuis le tableau de bord administrateur NTV."
          })
        }
      );

      setOrders(rows =>
        rows.map(o =>
          o.id === order.id
            ? {
                ...o,
                status,
                history:
                  updatedOrder.history ||
                  [
                    ...(o.history || []),
                    {
                      status,
                      at: new Date().toISOString(),
                      actor: "Administration NTV"
                    }
                  ]
              }
            : o
        )
      );

      setNotice(`Commande ${order.orderId} : ${status}.`);

      const updatedStats = await api("/api/admin/dashboard");
      setStats(updatedStats);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function dispatchOrder(order) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await api(`/api/admin/orders/${encodeURIComponent(order.id)}/dispatch`, { method: "POST" });
      setOrders(rows => rows.map(o => o.id === order.id ? { ...o, delivery: { ...(o.delivery || {}), status: "available", id: null, name: null } } : o));
      setNotice(`Mission ${order.orderId} publiée pour les livreurs actifs.`);
      await loadAll();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function changeAccount(user, status) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const data = await api(
        `/api/admin/accounts/${user.id}/status`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ status })
        }
      );

      setAccounts(rows =>
        rows.map(u => u.id === user.id ? data.user : u)
      );

      setNotice(
        `${user.role === "seller" ? "Commerçant" : "Livreur"} ${
          status === "active"
            ? "approuvé"
            : status === "rejected"
              ? "refusé"
              : "mis à jour"
        }.`
      );

      const updatedStats = await api("/api/admin/dashboard");
      setStats(updatedStats);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!auth) {
    return (
      <div className="admin-page">
        <section className="admin-login">
          <div className="admin-logo">
            <LayoutDashboard />
          </div>

          <p className="section-kicker">ESPACE PRIVÉ NTV</p>
          <h1>Tableau de bord</h1>
          <p className="admin-sub">Administration centrale</p>

          <form onSubmit={login}>
            <label>
              Identifiant
              <input
                required
                autoComplete="username"
                value={username}
                onChange={e => setUsername(e.target.value)}
              />
            </label>

            <label>
              Mot de passe
              <input
                required
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
            </label>

            {error && <p className="admin-error">{error}</p>}

            <button
              className="primary-button full-button"
              disabled={busy}
            >
              {busy ? "Connexion..." : "Accéder au tableau de bord"}
            </button>
          </form>

          <a className="admin-back" href="/">
            ← Retour à la boutique
          </a>
        </section>
      </div>
    );
  }

  const pendingAccounts = accounts.filter(
    u => u.status === "pending"
  );

  const pendingOrders = orders.filter(o =>
    ["À confirmer", "En attente", "Nouvelle"].includes(o.status)
  );

  const pendingPayments = orders.filter(o => {
    const status = String(
      o.paymentStatus || o.payment?.status || ""
    ).toLowerCase();

    return ["pending", "waiting", "declared"].includes(status);
  });

  const sellerAccounts = accounts.filter(
    u => u.role === "seller"
  );

  const deliveryAccounts = accounts.filter(
    u => u.role === "delivery"
  );

  return (
    <div className="admin-page">
      <header className="admin-top">
        <a className="admin-back" href="/">
          <ArrowLeft size={16} /> Boutique
        </a>

        <div className="admin-brand">
          <LayoutDashboard size={21} />
          NEWS TECHNOLOGY VILLAGE
          <span>Tableau de bord</span>
        </div>

        <a className="admin-back" href="/admin">
          <LayoutDashboard size={16} />
          Administration
        </a>

        <button className="admin-logout" onClick={logout}>
          <LogOut size={15} /> Déconnexion
        </button>
      </header>

      <main className="admin-main ntv-dashboard">
        <div className="admin-title">
          <div>
            <p className="section-kicker">
              PILOTAGE DE LA MARKETPLACE
            </p>
            <h1>Tableau de bord NTV</h1>
            <p>
              Supervisez les commandes, les commerçants, les livreurs
              et les paiements. L'administration NTV conserve le
              contrôle central des commandes et de la relation client.
            </p>
          </div>

          <button
            className="secondary-admin"
            onClick={refresh}
            disabled={busy}
          >
            <RefreshCw size={15} /> Actualiser
          </button>
        </div>

        {error && <p className="admin-error">{error}</p>}
        {notice && <p className="admin-success">{notice}</p>}

        {stats && (
          <div className="ntv-stat-grid">
            <button
              className="ntv-stat"
              onClick={() => setTab("orders")}
            >
              <span><ShoppingCart /> Commandes</span>
              <strong>{stats.orderCount || 0}</strong>
              <small>{stats.pendingOrders || 0} à traiter</small>
            </button>

            <button
              className="ntv-stat"
              onClick={() => setTab("orders")}
            >
              <span><Clock3 /> Commandes en attente</span>
              <strong>{stats.pendingOrders || 0}</strong>
              <small>À confirmer ou traiter</small>
            </button>

            <button
              className="ntv-stat"
              onClick={() => setTab("sellers")}
            >
              <span><Users /> Vendeurs à valider</span>
              <strong>{stats.pendingSellers || 0}</strong>
              <small>{stats.activeSellers || 0} vendeurs actifs</small>
            </button>

            <button
              className="ntv-stat"
              onClick={() => setTab("delivery")}
            >
              <span><Truck /> Livreurs à valider</span>
              <strong>{stats.pendingDelivery || 0}</strong>
              <small>{stats.activeDelivery || 0} livreurs actifs</small>
            </button>

            <div className="ntv-stat">
              <span><Package /> Produits au catalogue</span>
              <strong>{stats.productsCount || 0}</strong>
              <small>
                <a href="/admin/produits">
                  Gérer les produits <ExternalLink size={12} />
                </a>
              </small>
            </div>

            <div className="ntv-stat">
              <span><CircleDollarSign /> Montant des commandes</span>
              <strong>{money(stats.totalSales)}</strong>
              <small>
                Total enregistré, non assimilable aux sommes encaissées
              </small>
            </div>
          </div>
        )}

        <nav className="ntv-admin-tabs">
          <button
            className={tab === "overview" ? "active" : ""}
            onClick={() => setTab("overview")}
          >
            <LayoutDashboard size={16} /> Vue générale
          </button>

          <button
            className={tab === "orders" ? "active" : ""}
            onClick={() => setTab("orders")}
          >
            <ShoppingCart size={16} /> Commandes ({orders.length})
          </button>

          <button
            className={tab === "sellers" ? "active" : ""}
            onClick={() => setTab("sellers")}
          >
            <Store size={16} /> Commerçants (
            {sellerAccounts.filter(u => u.status === "pending").length})
          </button>

          <button
            className={tab === "delivery" ? "active" : ""}
            onClick={() => setTab("delivery")}
          >
            <Truck size={16} /> Livreurs (
            {deliveryAccounts.filter(u => u.status === "pending").length})
          </button>

          <button
            className={tab === "billing" ? "active" : ""}
            onClick={() => setTab("billing")}
          >
            <CircleDollarSign size={16} /> Abonnements & commissions ({billingSellers.filter(s => ["payment_required", "expired", "renewal_due"].includes(s.subscriptionAlert)).length})
          </button>

          <button
            className={tab === "payments" ? "active" : ""}
            onClick={() => setTab("payments")}
          >
            <CreditCard size={16} /> Paiements ({pendingPayments.length})
          </button>
          <button className={tab === "communications" ? "active" : ""} onClick={() => setTab("communications")}>
            <MessageCircle size={16} /> Messagerie & appels
          </button>
          <button className={tab === "complaints" ? "active" : ""} onClick={() => setTab("complaints")}>
            <AlertCircle size={16} /> Réclamations
          </button>
          <button className={tab === "announcements" ? "active" : ""} onClick={() => setTab("announcements")}>
            <ImagePlus size={16} /> Publicités
          </button>
          <button
            className={tab === "profile" ? "active" : ""}
            onClick={() => setTab("profile")}
          >
            <UserRound size={16} /> Mon profil
          </button>
        </nav>

        {tab === "communications" && <CommunicationCenter role="admin" auth={auth} />}
        {tab === "complaints" && <ComplaintsCenter admin auth={auth} />}

        {tab === "announcements" && (
          <section className="admin-panel">
            <div className="admin-list-head">
              <div><h2>Publicités du catalogue</h2><p>Ajoutez des images ou vidéos d’arrivages. Utilisez une URL publique HTTPS pour le média.</p></div>
              <button onClick={() => setAnnouncementDraft(rows => [...rows, { id: `ad-${Date.now()}`, title: "", description: "", mediaUrl: "", mediaType: "image", link: "", active: true }])}>Ajouter une annonce</button>
            </div>
            {announcementDraft.map((ad, index) => (
              <article key={ad.id || index} className="admin-order-card" style={{ marginBottom: 14 }}>
                <div style={{ display: "grid", gap: 10 }}>
                  <input aria-label="Titre" placeholder="Titre de l’annonce" value={ad.title || ""} onChange={e => updateAnnouncement(index, "title", e.target.value)} />
                  <textarea aria-label="Description" placeholder="Description courte" value={ad.description || ""} onChange={e => updateAnnouncement(index, "description", e.target.value)} rows={2} />
                  <input aria-label="URL du média" placeholder="URL HTTPS de l’image ou vidéo" value={ad.mediaUrl || ""} onChange={e => updateAnnouncement(index, "mediaUrl", e.target.value)} />
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <select value={ad.mediaType || "image"} onChange={e => updateAnnouncement(index, "mediaType", e.target.value)}><option value="image">Image</option><option value="video">Vidéo</option></select>
                    <input placeholder="Lien de destination (facultatif)" value={ad.link || ""} onChange={e => updateAnnouncement(index, "link", e.target.value)} style={{ flex: "1 1 240px" }} />
                    <label><input type="checkbox" checked={ad.active !== false} onChange={e => updateAnnouncement(index, "active", e.target.checked)} /> Active</label>
                    <button className="reject" onClick={() => setAnnouncementDraft(rows => rows.filter((_, i) => i !== index))}>Retirer</button>
                  </div>
                </div>
              </article>
            ))}
            <button className="primary-button" disabled={busy} onClick={saveAnnouncements}>{busy ? "Enregistrement…" : "Enregistrer les annonces"}</button>
          </section>
        )}

        {tab === "profile" && (
          <section className="admin-panel" style={{ maxWidth: 760 }}>
            <div className="admin-list-head"><div><h2>Profil administrateur</h2><p>Personnalisez l'identité de votre espace de gestion.</p></div></div>
            <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap", padding: 8 }}>
              <div style={{ width: 100, height: 100, borderRadius: 24, overflow: "hidden", display: "grid", placeItems: "center", background: "#edf2fb", color: "#2864d7", fontSize: 32, fontWeight: 800 }}>
                {adminAvatar ? <img src={adminAvatar} alt="Photo administrateur" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <UserRound size={38} />}
              </div>
              <div style={{ flex: "1 1 250px" }}>
                <strong>Administrateur NTV</strong><p style={{ color: "#7c8798", margin: "6px 0 14px" }}>Photo visible dans votre espace d'administration.</p>
                <label className="primary-button" style={{ display: "inline-flex", cursor: avatarBusy ? "wait" : "pointer", alignItems: "center", gap: 8 }}>
                  <ImagePlus size={16} /> {avatarBusy ? "Enregistrement..." : "Choisir une photo"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadAdminAvatar} disabled={avatarBusy} style={{ display: "none" }} />
                </label>
                <small style={{ display: "block", color: "#8a94a4", marginTop: 9 }}>JPG, PNG, WEBP ou GIF · 6 Mo maximum</small>
              </div>
            </div>
          </section>
        )}

        {tab === "overview" && (
          <div className="ntv-dashboard-columns">
            <section className="admin-panel">
              <div className="admin-list-head">
                <h2>Commandes récentes</h2>
                <button
                  className="secondary-admin"
                  onClick={() => setTab("orders")}
                >
                  Tout voir
                </button>
              </div>

              {orders.slice(0, 5).length ? (
                orders.slice(0, 5).map(o => (
                  <div className="ntv-mini-row" key={o.id}>
                    <div>
                      <b>{o.orderId}</b>
                      <span>
                        {o.customer?.name || "Client"} ·{" "}
                        {o.createdAt
                          ? new Date(o.createdAt).toLocaleString("fr-FR")
                          : "Date non précisée"}
                      </span>
                    </div>

                    <div>
                      <strong>{money(o.total)}</strong>
                      <small>{o.status}</small>
                    </div>
                  </div>
                ))
              ) : (
                <p className="admin-empty">
                  Aucune commande enregistrée pour le moment.
                </p>
              )}
            </section>

            <section className="admin-panel">
              <div className="admin-list-head">
                <h2>Candidatures à examiner</h2>
                <span>{pendingAccounts.length} en attente</span>
              </div>

              {pendingAccounts.slice(0, 6).length ? (
                pendingAccounts.slice(0, 6).map(u => (
                  <div className="ntv-mini-row" key={u.id}>
                    <div>
                      <b>{u.businessName || u.name}</b>
                      <span>
                        {u.role === "seller" ? "Commerçant" : "Livreur"}
                        {" · "}
                        {u.country}
                      </span>
                    </div>

                    <button
                      className="secondary-admin"
                      onClick={() =>
                        setTab(u.role === "seller" ? "sellers" : "delivery")
                      }
                    >
                      Examiner
                    </button>
                  </div>
                ))
              ) : (
                <p className="admin-empty">
                  Aucune candidature en attente.
                </p>
              )}
            </section>

            <section className="admin-panel">
              <div className="admin-list-head">
                <h2>Situation des paiements</h2>
                <CreditCard size={18} />
              </div>

              <div className="ntv-mini-row">
                <div>
                  <b>Paiements à vérifier</b>
                  <span>Déclarations en attente de contrôle</span>
                </div>
                <strong>{pendingPayments.length}</strong>
              </div>

              <p className="admin-footnote">
                Les montants des commandes ne prouvent pas que les
                paiements ont été encaissés. Chaque paiement doit être
                contrôlé avant validation.
              </p>

              <button
                className="secondary-admin"
                onClick={() => setTab("payments")}
              >
                Consulter les informations de paiement
              </button>
            </section>
          </div>
        )}

        {tab === "orders" && (
          <section className="admin-panel ntv-wide-panel">
            <div className="admin-list-head">
              <h2>Suivi centralisé des commandes</h2>
              <span>{orders.length} commande(s)</span>
            </div>

            {orders.length ? (
              <div className="ntv-order-list">
                {orders.map(o => (
                  <article className="ntv-order-card" key={o.id}>
                    <div className="ntv-order-head">
                      <div>
                        <b>{o.orderId}</b>
                        <span>
                          {o.createdAt
                            ? new Date(o.createdAt).toLocaleString("fr-FR")
                            : "Date non précisée"}
                        </span>
                      </div>

                      <strong>{money(o.total)}</strong>
                    </div>

                    <div className="ntv-order-customer">
                      <b>{o.customer?.name || "Client"}</b>
                      {" · "}
                      {o.customer?.phone || "Téléphone non renseigné"}
                      {" · "}
                      {o.customer?.country || ""}
                      <p>{o.customer?.address || ""}</p>
                    </div>

                    <div className="ntv-order-items">
                      {(o.items || []).map((it, i) => (
                        <span key={i}>
                          {it.name} × {it.quantity}
                          {it.vendorName ? ` · ${it.vendorName}` : ""}
                        </span>
                      ))}
                    </div>
                    {Object.entries(o.sellerConfirmations || {}).length > 0 && (
                      <div className="ntv-seller-confirmations-admin">
                        <b>Réponses des vendeurs</b>
                        {Object.entries(o.sellerConfirmations || {}).map(([sellerId, decision]) => (
                          <span key={sellerId}>{decision.sellerName || "Vendeur"} : {decision.status === "accepted" ? "Disponibilité confirmée" : decision.status === "rejected" ? "Commande rejetée" : "En attente"}{decision.note ? ` — ${decision.note}` : ""}{decision.preparation?.status ? ` · ${decision.preparation.status}` : ""}</span>
                        ))}
                      </div>
                    )}

                    <div className="ntv-order-workflow">
                      <div className="ntv-order-current">
                        <b>Livraison : {o.delivery?.status === "available" ? "En attente d’un livreur" : o.delivery?.name ? `Acceptée par ${o.delivery.name}` : "Non attribuée"}</b>
                        <p>{o.delivery?.status === "available" ? "La mission est visible dans les espaces des livreurs actifs." : o.delivery?.name ? "Le livreur peut faire progresser les étapes de livraison." : "Publiez la mission lorsque la commande est prête à être expédiée."}</p>
                        {!o.delivery?.id && o.delivery?.status !== "available" && ["Prête à expédier", "Expédiée"].includes(o.status) && (
                          <button className="secondary-admin" disabled={busy} onClick={() => dispatchOrder(o)}>
                            <Truck size={15} /> Envoyer aux livreurs
                          </button>
                        )}
                      </div>
                      <div className="ntv-order-current">
                        <b>Étape actuelle : {o.status}</b>
                        <p>
                          {stageTasks[o.status] ||
                            "Suivi de la commande par NTV."}
                        </p>
                      </div>

                      {["À confirmer", "En attente", "Nouvelle"].includes(o.status) && (
                        <button className="primary-button" disabled={busy} onClick={() => changeOrder(o, "Confirmée")}>
                          <Check size={15} /> Confirmer la commande (administrateur)
                        </button>
                      )}
                      <div className="ntv-order-actions">
                        <label>
                          Modifier le statut
                          <select
                            disabled={busy}
                            value={o.status}
                            onChange={e =>
                              changeOrder(o, e.target.value)
                            }
                          >
                            {!statuses.includes(o.status) && (
                              <option value={o.status}>{o.status}</option>
                            )}

                            {statuses.map(st => (
                              <option key={st} value={st}>
                                {st}
                              </option>
                            ))}
                          </select>
                        </label>

                        {nextStage(o.status) && (
                          <button
                            className="primary-button"
                            disabled={busy}
                            onClick={() =>
                              changeOrder(o, nextStage(o.status))
                            }
                          >
                            Passer à l’étape suivante : {nextStage(o.status)}
                          </button>
                        )}
                      </div>
                    </div>

                    {o.history?.length > 0 && (
                      <div className="ntv-order-history">
                        <b>Historique des étapes</b>

                        {o.history.slice().reverse().map((h, i) => (
                          <div key={`${h.status}-${i}`}>
                            <span>{h.status}</span>
                            <small>
                              {h.actor || "Administration NTV"}
                              {" · "}
                              {h.at
                                ? new Date(h.at).toLocaleString("fr-FR")
                                : "Date non précisée"}
                              {h.note ? ` · ${h.note}` : ""}
                            </small>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="ntv-order-footer">
                      <span>
                        Paiement souhaité : {o.paymentMethod || "Non renseigné"}
                      </span>
                      <span>Gestion centralisée par NTV</span>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <p className="admin-empty">
                Aucune commande disponible. Vérifiez que la base de
                données est configurée pour enregistrer les commandes.
              </p>
            )}
          </section>
        )}

        {(tab === "sellers" || tab === "delivery") && (
          <section className="admin-panel ntv-wide-panel">
            <div className="admin-list-head">
              <h2>
                {tab === "sellers"
                  ? "Candidatures des commerçants"
                  : "Candidatures des livreurs"}
              </h2>

              <span>
                {accounts.filter(
                  u =>
                    u.role === (tab === "sellers" ? "seller" : "delivery")
                ).length} dossier(s)
              </span>
            </div>

            {accounts.filter(
              u => u.role === (tab === "sellers" ? "seller" : "delivery")
            ).length ? (
              accounts
                .filter(
                  u => u.role === (tab === "sellers" ? "seller" : "delivery")
                )
                .map(u => (
                  <article className="ntv-account-card" key={u.id}>
                    <div>
                      <b>{u.businessName || u.name}</b>
                      <span>{u.name} · {u.country}</span>
                      <span>{u.email} · {u.phone}</span>

                      {u.role === "seller" && <p>Formule : {u.plan === "vip" ? "Vendeur VIP – 5 000 FCFA/mois" : u.plan === "limited" ? "Vendeur accès limité – 2 500 FCFA/mois" : "Vendeur à commission – 5 % par vente"}</p>}
                      {u.role === "seller" && u.plan !== "commission" && <p>Abonnement : {u.subscriptionStatus === "active" ? "Actif" : "Paiement attendu"} · {u.subscriptionExpiresAt ? `Expire le ${new Date(u.subscriptionExpiresAt).toLocaleDateString("fr-FR")}` : "Aucune échéance enregistrée"}</p>}
                      {u.businessDescription && (
                        <p>{u.businessDescription}</p>
                      )}

                      {u.deliveryZones && (
                        <p>Zones de livraison : {u.deliveryZones}</p>
                      )}

                      {u.storeSlug && (
                        <p>
                          Boutique : /boutique/{u.storeSlug}
                        </p>
                      )}

                      <small>
                        Statut :{" "}
                        {u.status === "pending"
                          ? "En attente"
                          : u.status === "active"
                            ? "Approuvé"
                            : u.status === "rejected"
                              ? "Refusé"
                              : u.status}
                      </small>
                    </div>

                    <div className="ntv-account-actions">
                      {u.status !== "active" && (
                        <button
                          disabled={busy}
                          onClick={() => changeAccount(u, "active")}
                        >
                          <Check size={15} /> Approuver
                        </button>
                      )}

                      {u.status !== "rejected" && (
                        <button
                          className="reject"
                          disabled={busy}
                          onClick={() => changeAccount(u, "rejected")}
                        >
                          <X size={15} /> Refuser
                        </button>
                      )}
                    </div>
                  </article>
                ))
            ) : (
              <p className="admin-empty">
                Aucune candidature dans cette catégorie.
              </p>
            )}
          </section>
        )}

        {tab === "billing" && (
          <section className="admin-panel ntv-wide-panel">
            <div className="admin-list-head">
              <div><h2>Abonnements et commissions des vendeurs</h2><p>Validez manuellement les paiements reçus. Chaque validation prolonge l'accès d'un mois calendaire.</p></div>
              <strong>{billingSellers.length} vendeur(s)</strong>
            </div>
            <div className="ntv-billing-rules">
              <span><b>Commission</b> · 5 % sur chaque vente, sans abonnement</span>
              <span><b>Accès limité</b> · 2 500 FCFA / mois, 0 % de commission</span>
              <span><b>VIP</b> · 5 000 FCFA / mois, 0 % de commission</span>
            </div>
            {billingSellers.length ? billingSellers.map(seller => (
              <article className="ntv-account-card ntv-billing-card" key={seller.id}>
                <div>
                  <b>{seller.businessName || seller.name}</b>
                  <span>{seller.email} · {seller.phone}</span>
                  <span>Formule : {seller.planLabel}</span>
                  {seller.plan === "commission" ? (
                    <p>Ventes enregistrées : {money(seller.sales)} · Commission NTV estimée à percevoir : <strong>{money(seller.commissionDue)}</strong></p>
                  ) : (
                    <>
                      <p>Abonnement : {seller.subscriptionStatus === "active" ? "Payé / actif" : "Paiement attendu"} · Expiration : {seller.subscriptionExpiresAt ? new Date(seller.subscriptionExpiresAt).toLocaleDateString("fr-FR") : "Non définie"}</p>
                      <p>Dernier paiement : {seller.subscriptionPaidAt ? new Date(seller.subscriptionPaidAt).toLocaleDateString("fr-FR") : "Aucun paiement validé"} · Historique : {(seller.subscriptionPayments || []).length} paiement(s)</p>
                    </>
                  )}
                  {seller.subscriptionAlert === "payment_required" && <small className="ntv-billing-alert">Alerte : paiement initial à valider.</small>}
                  {seller.subscriptionAlert === "expired" && <small className="ntv-billing-alert">Alerte : abonnement expiré, boutique masquée du catalogue.</small>}
                  {seller.subscriptionAlert === "renewal_due" && <small className="ntv-billing-alert">Alerte : renouvellement à effectuer dans les 7 jours.</small>}
                </div>
                {seller.plan !== "commission" && <div className="ntv-account-actions">
                  <button disabled={busy} onClick={() => updateSellerSubscription(seller, seller.subscriptionAlert === "payment_required" ? "activate" : "renew")}>{seller.subscriptionAlert === "payment_required" ? "Valider le paiement" : "Valider le renouvellement"}</button>
                  <button className="ntv-remind-button" disabled={busy} onClick={() => updateSellerSubscription(seller, "remind")}>Envoyer un rappel</button>
                  {seller.subscriptionStatus === "active" && <button className="reject" disabled={busy} onClick={() => updateSellerSubscription(seller, "suspend")}>Suspendre</button>}
                </div>}
              </article>
            )) : <p className="admin-empty">Aucun vendeur enregistré.</p>}
          </section>
        )}

        {tab === "payments" && (
          <section className="admin-panel ntv-wide-panel">
            <div className="admin-list-head">
              <h2>Suivi des paiements</h2>
              <span>{orders.length} commande(s) examinée(s)</span>
            </div>

            <p className="admin-footnote">
              Cette vue présente les informations de paiement disponibles
              dans les commandes. Elle ne valide aucun paiement et ne
              déclenche aucun transfert d'argent.
            </p>

            {orders.length ? (
              <div className="ntv-order-list">
                {orders.map(o => {
                  const payment = o.payment || {};
                  const paymentStatus =
                    o.paymentStatus || payment.status || "";

                  return (
                    <article className="ntv-order-card" key={o.id}>
                      <div className="ntv-order-head">
                        <div>
                          <b>{o.orderId}</b>
                          <span>
                            Client : {o.customer?.name || "Non renseigné"}
                          </span>
                        </div>
                        <strong>{money(o.total)}</strong>
                      </div>

                      <div className="ntv-order-items">
                        <span>
                          Moyen de paiement :{" "}
                          {o.paymentMethod || payment.method || "Non renseigné"}
                        </span>

                        <span>
                          État : {paymentStatusLabel(paymentStatus)}
                        </span>

                        {payment.reference && (
                          <span>
                            Référence : {payment.reference}
                          </span>
                        )}

                        {payment.transactionReference && (
                          <span>
                            Référence de transaction :{" "}
                            {payment.transactionReference}
                          </span>
                        )}

                        {payment.declaredAt && (
                          <span>
                            Déclaration :{" "}
                            {new Date(payment.declaredAt).toLocaleString("fr-FR")}
                          </span>
                        )}
                      </div>

                      <div className="ntv-order-footer">
                        <span>Commande : {o.status}</span>
                        <span>Contrôle réservé à l'administration NTV</span>
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p className="admin-empty">
                Aucune information de paiement disponible.
              </p>
            )}
          </section>
        )}

        <div className="ntv-admin-shortcuts">
          <a href="/admin">
            <LayoutDashboard size={17} /> Accès administration
          </a>

          <a href="/admin/produits">
            <Package size={17} /> Gestion des produits
          </a>

          <a href="/admin/comptes">
            <Users size={17} /> Gestion des comptes détaillée
          </a>

          <a href="/">
            <ArrowLeft size={17} /> Retour à la boutique
          </a>
        </div>

        {stats && (
          <p className="admin-footnote">
            Stockage des commandes :{" "}
            {stats.database?.postgres
              ? "PostgreSQL"
              : stats.database?.mongo
                ? "MongoDB"
                : "non configuré"}.
            {" "}Le montant affiché correspond aux commandes enregistrées,
            pas nécessairement aux paiements encaissés.
          </p>
        )}
      </main>
    </div>
  );
}

export default AdminDashboard;
