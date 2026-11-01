
import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Check,
  X,
  RefreshCw,
  Users,
  Store,
  Truck,
  Search,
  LogOut,
  Clock3,
  Trash2
} from "lucide-react";
import "./styles.css";

export default function AdminAccounts() {
  const [auth, setAuth] = useState(
    () => sessionStorage.getItem("ntv_admin_auth") || ""
  );

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");

  async function load(token = auth) {
    setError("");

    const response = await fetch("/api/admin/accounts", {
      headers: {
        Authorization: `Basic ${token}`
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(data.error || "Chargement impossible.");
    }

    const accounts = Array.isArray(data)
      ? data
      : data.accounts || data.users || [];

    setItems(accounts);
    setAuth(token);
    sessionStorage.setItem("ntv_admin_auth", token);
  }

  useEffect(() => {
    if (auth) {
      load(auth).catch(e => {
        setError(e.message);
        setAuth("");
        sessionStorage.removeItem("ntv_admin_auth");
      });
    }
  }, []);

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      await load(btoa(`${username}:${password}`));
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function update(user, status) {
    setBusy(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(
        `/api/admin/accounts/${encodeURIComponent(user.id)}/status`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ status })
        }
      );

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(data.error || "Modification impossible.");
      }

      if (!data.user) {
        throw new Error("La réponse du serveur ne contient pas le compte mis à jour.");
      }

      setItems(old =>
        old.map(u => u.id === user.id ? data.user : u)
      );

      setNotice(
        `${user.businessName || user.name} : ${
          status === "active" ? "compte approuvé" : "compte refusé"
        }.`
      );
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeAccount(user) {
    const label = user.businessName || user.name || user.email;
    if (!window.confirm(`Supprimer définitivement le compte « ${label} » ? Cette action est irréversible. Les commandes historiques seront conservées.`)) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/admin/accounts/${encodeURIComponent(user.id)}`, {
        method: "DELETE",
        headers: { Authorization: `Basic ${auth}` }
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Suppression impossible.");
      setItems(rows => rows.filter(row => row.id !== user.id));
      setNotice(`Compte « ${label} » supprimé. Les commandes historiques sont conservées.`);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  function logout() {
    sessionStorage.removeItem("ntv_admin_auth");
    setAuth("");
    setItems([]);
    setUsername("");
    setPassword("");
  }

  const sellers = useMemo(
    () => items.filter(u => u.role === "seller"),
    [items]
  );

  const deliveryPartners = useMemo(
    () => items.filter(u => u.role === "delivery"),
    [items]
  );
  const customers = useMemo(
    () => items.filter(u => u.role === "customer"),
    [items]
  );
  const inactiveCustomers = customers.filter(u => u.inactiveForThreeMonths);

  const pendingCount = items.filter(
    u => u.status === "pending"
  ).length;

  const filteredItems = useMemo(() => {
    let result = items;

    if (filter === "seller") {
      result = result.filter(u => u.role === "seller");
    } else if (filter === "delivery") {
      result = result.filter(u => u.role === "delivery");
    } else if (filter === "customer") {
      result = result.filter(u => u.role === "customer");
    } else if (filter === "inactive") {
      result = result.filter(u => u.role === "customer" && u.inactiveForThreeMonths);
    } else if (filter === "pending") {
      result = result.filter(u => u.status === "pending");
    } else if (filter === "active") {
      result = result.filter(u => u.status === "active");
    } else if (filter === "rejected") {
      result = result.filter(u => u.status === "rejected");
    }

    const query = search.trim().toLowerCase();

    if (query) {
      result = result.filter(u =>
        [
          u.name,
          u.businessName,
          u.email,
          u.phone,
          u.country,
          u.storeSlug
        ]
          .filter(Boolean)
          .some(value => String(value).toLowerCase().includes(query))
      );
    }

    return result;
  }, [items, filter, search]);

  function statusLabel(status) {
    if (status === "pending") return "En attente";
    if (status === "active") return "Actif";
    if (status === "rejected") return "Refusé";
    return status || "Non renseigné";
  }

  if (!auth) {
    return (
      <div className="admin-page">
        <section className="admin-login">
          <div className="admin-logo">
            <Users />
          </div>

          <p className="section-kicker">ESPACE PRIVÉ NTV</p>
          <h1>Gestion des comptes</h1>
          <p className="admin-sub">
            Administration des commerçants et livreurs
          </p>

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
              {busy ? "Connexion..." : "Se connecter"}
            </button>
          </form>

          <a className="admin-back" href="/">
            ← Retour à la boutique
          </a>
        </section>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <header className="admin-top">
        <a className="admin-back" href="/">
          <ArrowLeft size={16} /> Boutique
        </a>

        <div className="admin-brand">
          <Users size={20} />
          NEWS TECHNOLOGY VILLAGE
          <span>Gestion des comptes</span>
        </div>

        <a className="admin-back" href="/admin">
          <ArrowLeft size={16} /> Tableau de bord
        </a>

        <button className="admin-logout" onClick={logout}>
          <LogOut size={15} /> Déconnexion
        </button>
      </header>

      <main className="admin-main">
        <div className="admin-title">
          <div>
            <p className="section-kicker">
              CONTRÔLE DES INSCRIPTIONS
            </p>

            <h1>Vendeurs et livreurs</h1>

            <p>
              Examinez les candidatures et autorisez uniquement les
              professionnels approuvés à accéder à leur espace.
              Les comptes clients ne sont pas concernés par cette validation.
            </p>
          </div>

          <button
            className="secondary-admin"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              load()
                .catch(e => setError(e.message))
                .finally(() => setBusy(false));
            }}
          >
            <RefreshCw size={15} /> Actualiser
          </button>
        </div>

        {error && <p className="admin-error">{error}</p>}
        {notice && <p className="admin-success">{notice}</p>}

        <div className="ntv-stat-grid">
          <div className="ntv-stat">
            <span><Users /> Comptes professionnels</span>
            <strong>{sellers.length + deliveryPartners.length}</strong>
            <small>Commerçants et livreurs</small>
          </div>

          <div className="ntv-stat">
            <span><Store /> Commerçants</span>
            <strong>{sellers.length}</strong>
            <small>
              {sellers.filter(u => u.status === "active").length} actifs
            </small>
          </div>

          <div className="ntv-stat">
            <span><Truck /> Livreurs</span>
            <strong>{deliveryPartners.length}</strong>
            <small>
              {deliveryPartners.filter(u => u.status === "active").length} actifs
            </small>
          </div>

          <div className="ntv-stat">
            <span><Users /> Clients inscrits</span>
            <strong>{customers.length}</strong>
            <small>{inactiveCustomers.length} inactif(s) depuis 3 mois</small>
          </div>

          <div className="ntv-stat">
            <span><Clock3 /> En attente</span>
            <strong>{pendingCount}</strong>
            <small>Candidatures à examiner</small>
          </div>
        </div>

        <section className="admin-panel ntv-wide-panel">
          <div className="admin-list-head">
            <h2>Liste des comptes professionnels</h2>
            <span>{filteredItems.length} résultat(s)</span>
          </div>

          <div className="ntv-admin-tabs">
            <button
              className={filter === "all" ? "active" : ""}
              onClick={() => setFilter("all")}
            >
              Tous ({items.length})
            </button>

            <button
              className={filter === "pending" ? "active" : ""}
              onClick={() => setFilter("pending")}
            >
              En attente ({pendingCount})
            </button>

            <button
              className={filter === "seller" ? "active" : ""}
              onClick={() => setFilter("seller")}
            >
              <Store size={15} /> Commerçants
            </button>

            <button
              className={filter === "delivery" ? "active" : ""}
              onClick={() => setFilter("delivery")}
            >
              <Truck size={15} /> Livreurs
            </button>

            <button className={filter === "customer" ? "active" : ""} onClick={() => setFilter("customer")}>
              Clients ({customers.length})
            </button>

            <button className={filter === "inactive" ? "active" : ""} onClick={() => setFilter("inactive")}>
              Inactifs 3 mois ({inactiveCustomers.length})
            </button>

            <button
              className={filter === "active" ? "active" : ""}
              onClick={() => setFilter("active")}
            >
              Actifs
            </button>

            <button
              className={filter === "rejected" ? "active" : ""}
              onClick={() => setFilter("rejected")}
            >
              Refusés
            </button>
          </div>

          <div style={{ margin: "16px 0" }}>
            <label>
              Rechercher un compte
              <div style={{ position: "relative" }}>
                <Search
                  size={17}
                  style={{
                    position: "absolute",
                    left: 12,
                    top: 13,
                    opacity: 0.55
                  }}
                />

                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Nom, entreprise, email, téléphone..."
                  style={{ paddingLeft: 38, width: "100%" }}
                />
              </div>
            </label>
          </div>

          <div className="account-admin-list">
            {filteredItems.length === 0 ? (
              <p className="admin-empty">
                Aucun compte ne correspond à votre recherche.
              </p>
            ) : (
              filteredItems.map(u => (
                <article
                  className="account-admin-item"
                  key={u.id}
                >
                  <div>
                    <b>{u.businessName || u.name}</b>

                    <span>
                      {u.role === "seller" ? "Commerçant" : u.role === "delivery" ? "Livreur" : "Client"}
                      {" · "}
                      {u.country || "Pays non renseigné"}
                    </span>

                    <span>
                      {u.name}
                      {" · "}
                      {u.email}
                      {" · "}
                      {u.phone}
                    </span>

                    {u.businessDescription && (
                      <p>{u.businessDescription}</p>
                    )}

                    {u.deliveryZones && (
                      <p>Zones de livraison : {u.deliveryZones}</p>
                    )}

                    {u.storeSlug && (
                      <p>
                        Boutique publique :{" "}
                        <a href={`/boutique/${u.storeSlug}`} target="_blank" rel="noreferrer">
                          /boutique/{u.storeSlug}
                        </a>
                      </p>
                    )}

                    <small>
                      Statut : {statusLabel(u.status)}
                      {u.role === "customer" && u.inactiveForThreeMonths ? " · Inactif depuis au moins 3 mois" : ""}
                    </small>
                    {u.role === "customer" && u.lastActivityAt && (
                      <small>Dernière activité : {new Date(u.lastActivityAt).toLocaleDateString("fr-FR")}</small>
                    )}
                  </div>

                  <div className="account-admin-actions">
                    {u.status !== "active" && (
                      <button
                        disabled={busy}
                        onClick={() => update(u, "active")}
                      >
                        <Check size={15} /> Approuver
                      </button>
                    )}

                    {u.status !== "rejected" && (
                      <button
                        className="reject"
                        disabled={busy}
                        onClick={() => update(u, "rejected")}
                      >
                        <X size={15} /> Refuser
                      </button>
                    )}
                    <button className="reject" disabled={busy} onClick={() => removeAccount(u)}>
                      <Trash2 size={15} /> Supprimer définitivement
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <div className="ntv-admin-shortcuts">
          <a href="/admin">
            <ArrowLeft size={17} /> Tableau de bord central
          </a>

          <a href="/admin/produits">
            <Store size={17} /> Gestion des produits
          </a>

          <a href="/">
            <ArrowLeft size={17} /> Retour à la boutique
          </a>
        </div>

        <p className="admin-footnote">
          Les actions d'approbation et de refus sont réservées à
          l'administration NTV. Un commerçant approuvé peut ensuite
          gérer ses propres produits, sans accéder à la gestion centrale
          des clients et des commandes.
        </p>
      </main>
    </div>
  );
}
