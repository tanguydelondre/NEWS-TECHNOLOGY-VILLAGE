import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { LayoutDashboard, ShoppingCart, Users, Truck, Package, RefreshCw, LogOut, ArrowLeft, Check, X, ExternalLink, Clock3, CircleDollarSign } from "lucide-react";
import "./styles.css";

const money = n => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Number(n || 0)) + " FCFA";
const statuses = ["À confirmer", "Confirmée", "En préparation", "Prête à expédier", "Expédiée", "En livraison", "Livrée", "Annulée"];
const stageTasks = {
  "À confirmer": "NTV : vérifier les coordonnées, la disponibilité et le prix avec le client.",
  "Confirmée": "NTV : confirmer la commande et transmettre les articles au vendeur concerné.",
  "En préparation": "Vendeur : préparer les articles. Si le vendeur ne se connecte pas, NTV peut mettre à jour cette étape après vérification par téléphone.",
  "Prête à expédier": "Vendeur / NTV : vérifier que le colis est prêt et emballé.",
  "Expédiée": "NTV : remettre le colis au livreur et organiser le départ.",
  "En livraison": "Livreur / NTV : suivre l'acheminement et contacter le client si nécessaire.",
  "Livrée": "NTV : confirmer la remise au client et clôturer la commande.",
  "Annulée": "NTV : noter le motif de l'annulation et prévenir le client."
};
const nextStage = status => { const i = statuses.indexOf(status); return i >= 0 && i < statuses.length - 2 ? statuses[i + 1] : null; };

function AdminDashboard() {
  const [auth, setAuth] = useState(() => sessionStorage.getItem("ntv_admin_auth") || "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [stats, setStats] = useState(null);
  const [orders, setOrders] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [tab, setTab] = useState("overview");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const headers = token => ({ Authorization: `Basic ${token || auth}` });
  async function api(url, options = {}, token = auth) {
    const response = await fetch(url, { ...options, headers: { ...headers(token), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
    return data;
  }
  async function loadAll(token = auth) {
    setError("");
    const [summary, orderRows, users] = await Promise.all([
      api("/api/admin/dashboard", {}, token),
      api("/api/admin/orders", {}, token),
      api("/api/admin/accounts", {}, token)
    ]);
    setStats(summary); setOrders(orderRows); setAccounts(users); setAuth(token);
    sessionStorage.setItem("ntv_admin_auth", token);
  }
  useEffect(() => {
    if (auth) loadAll(auth).catch(e => { setError(e.message); setAuth(""); sessionStorage.removeItem("ntv_admin_auth"); });
  }, []);
  async function login(e) {
    e.preventDefault(); setBusy(true); setError("");
    try { await loadAll(btoa(`${username}:${password}`)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  function logout() {
    sessionStorage.removeItem("ntv_admin_auth"); setAuth(""); setStats(null); setOrders([]); setAccounts([]);
  }
  async function refresh() {
    setBusy(true); setError("");
    try { await loadAll(); setNotice("Tableau de bord actualisé."); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function changeOrder(order, status) {
    setBusy(true); setError(""); setNotice("");
    try {
      const updatedOrder = await api(`/api/admin/orders/${encodeURIComponent(order.id)}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note: "Mise à jour effectuée depuis le tableau de bord administrateur." }) });
      setOrders(rows => rows.map(o => o.id === order.id ? { ...o, status, history: updatedOrder.history || [...(o.history || []), { status, at: new Date().toISOString(), actor: "Administration NTV" }] } : o));
      setNotice(`Commande ${order.orderId} : ${status}.`);
      const updated = await api("/api/admin/dashboard");
      setStats(updated);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function changeAccount(user, status) {
    setBusy(true); setError(""); setNotice("");
    try {
      const data = await api(`/api/admin/accounts/${user.id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
      setAccounts(rows => rows.map(u => u.id === user.id ? data.user : u));
      setNotice(`${user.role === "seller" ? "Commerçant" : "Livreur"} ${status === "active" ? "approuvé" : status === "rejected" ? "refusé" : "mis à jour"}.`);
      const updated = await api("/api/admin/dashboard"); setStats(updated);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  if (!auth) return <div className="admin-page"><section className="admin-login"><div className="admin-logo"><LayoutDashboard/></div><p className="section-kicker">ESPACE PRIVÉ NTV</p><h1>Tableau de bord</h1><p className="admin-sub">Administration centrale</p><form onSubmit={login}><label>Identifiant<input required autoComplete="username" value={username} onChange={e => setUsername(e.target.value)}/></label><label>Mot de passe<input required type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}/></label>{error && <p className="admin-error">{error}</p>}<button className="primary-button full-button" disabled={busy}>{busy ? "Connexion..." : "Accéder au tableau de bord"}</button></form><a className="admin-back" href="/">← Retour à la boutique</a></section></div>;

  const pendingAccounts = accounts.filter(u => u.status === "pending");
  const pendingOrders = orders.filter(o => ["À confirmer", "En attente", "Nouvelle"].includes(o.status));
  const currency = money;
  return <div className="admin-page">
    <header className="admin-top">
      <a className="admin-back" href="/"><ArrowLeft size={16}/> Boutique</a>
      <div className="admin-brand"><LayoutDashboard size={21}/> NEWS TECHNOLOGY VILLAGE <span>Tableau de bord</span></div>
      <button className="admin-logout" onClick={logout}><LogOut size={15}/> Déconnexion</button>
    </header>
    <main className="admin-main ntv-dashboard">
      <div className="admin-title">
        <div><p className="section-kicker">PILOTAGE DE LA MARKETPLACE</p><h1>Tableau de bord NTV</h1><p>Suivez les commandes, les candidatures et l'activité de la plateforme. Vous pouvez faire avancer chaque commande vous-même, même si le vendeur ou le livreur ne se connecte pas.</p></div>
        <button className="secondary-admin" onClick={refresh} disabled={busy}><RefreshCw size={15}/> Actualiser</button>
      </div>
      {error && <p className="admin-error">{error}</p>}{notice && <p className="admin-success">{notice}</p>}
      {stats && <div className="ntv-stat-grid">
        <button className="ntv-stat" onClick={() => setTab("orders")}><span><ShoppingCart/> Commandes</span><strong>{stats.orderCount}</strong><small>{stats.pendingOrders} à traiter</small></button>
        <button className="ntv-stat" onClick={() => setTab("orders")}><span><Clock3/> Commandes en attente</span><strong>{stats.pendingOrders}</strong><small>À confirmer ou traiter</small></button>
        <button className="ntv-stat" onClick={() => setTab("sellers")}><span><Users/> Vendeurs à valider</span><strong>{stats.pendingSellers}</strong><small>{stats.activeSellers} vendeurs actifs</small></button>
        <button className="ntv-stat" onClick={() => setTab("delivery")}><span><Truck/> Livreurs à valider</span><strong>{stats.pendingDelivery}</strong><small>{stats.activeDelivery} livreurs actifs</small></button>
        <div className="ntv-stat"><span><Package/> Produits au catalogue</span><strong>{stats.productsCount}</strong><small><a href="/admin/produits">Gérer les produits <ExternalLink size={12}/></a></small></div>
        <div className="ntv-stat"><span><CircleDollarSign/> Montant des commandes</span><strong>{currency(stats.totalSales)}</strong><small>Total enregistré, non assimilable aux sommes encaissées</small></div>
      </div>}
      <nav className="ntv-admin-tabs">
        <button className={tab === "overview" ? "active" : ""} onClick={() => setTab("overview")}><LayoutDashboard size={16}/> Vue générale</button>
        <button className={tab === "orders" ? "active" : ""} onClick={() => setTab("orders")}><ShoppingCart size={16}/> Commandes ({orders.length})</button>
        <button className={tab === "sellers" ? "active" : ""} onClick={() => setTab("sellers")}><Users size={16}/> Commerçants ({accounts.filter(u => u.role === "seller" && u.status === "pending").length})</button>
        <button className={tab === "delivery" ? "active" : ""} onClick={() => setTab("delivery")}><Truck size={16}/> Livreurs ({accounts.filter(u => u.role === "delivery" && u.status === "pending").length})</button>
      </nav>
      {tab === "overview" && <div className="ntv-dashboard-columns">
        <section className="admin-panel"><div className="admin-list-head"><h2>Commandes récentes</h2><button className="secondary-admin" onClick={() => setTab("orders")}>Tout voir</button></div>
          {orders.slice(0,5).length ? orders.slice(0,5).map(o => <div className="ntv-mini-row" key={o.id}><div><b>{o.orderId}</b><span>{o.customer?.name} · {new Date(o.createdAt).toLocaleString("fr-FR")}</span></div><div><strong>{currency(o.total)}</strong><small>{o.status}</small></div></div>) : <p className="admin-empty">Aucune commande enregistrée pour le moment.</p>}
        </section>
        <section className="admin-panel"><div className="admin-list-head"><h2>Candidatures à examiner</h2><span>{pendingAccounts.length} en attente</span></div>
          {pendingAccounts.slice(0,6).length ? pendingAccounts.slice(0,6).map(u => <div className="ntv-mini-row" key={u.id}><div><b>{u.businessName || u.name}</b><span>{u.role === "seller" ? "Commerçant" : "Livreur"} · {u.country}</span></div><button className="secondary-admin" onClick={() => setTab(u.role === "seller" ? "sellers" : "delivery")}>Examiner</button></div>) : <p className="admin-empty">Aucune candidature en attente.</p>}
        </section>
      </div>}
      {tab === "orders" && <section className="admin-panel ntv-wide-panel"><div className="admin-list-head"><h2>Suivi des commandes</h2><span>{orders.length} commande(s)</span></div>
        {orders.length ? <div className="ntv-order-list">{orders.map(o => <article className="ntv-order-card" key={o.id}>
          <div className="ntv-order-head"><div><b>{o.orderId}</b><span>{new Date(o.createdAt).toLocaleString("fr-FR")}</span></div><strong>{currency(o.total)}</strong></div>
          <div className="ntv-order-customer"><b>{o.customer?.name}</b> · {o.customer?.phone} · {o.customer?.country}<p>{o.customer?.address}</p></div>
          <div className="ntv-order-items">{(o.items || []).map((it,i) => <span key={i}>{it.name} × {it.quantity}</span>)}</div>
          <div className="ntv-order-workflow"><div className="ntv-order-current"><b>Étape actuelle : {o.status}</b><p>{stageTasks[o.status] || "Suivi de la commande par NTV."}</p></div><div className="ntv-order-actions"><label>Modifier le statut<select disabled={busy} value={o.status} onChange={e => changeOrder(o,e.target.value)}>{statuses.map(st => <option key={st}>{st}</option>)}</select></label>{nextStage(o.status) && <button className="primary-button" disabled={busy} onClick={() => changeOrder(o,nextStage(o.status))}>Passer à l’étape suivante : {nextStage(o.status)}</button>}</div></div>
          {o.history?.length > 0 && <div className="ntv-order-history"><b>Historique des étapes</b>{o.history.slice().reverse().map((h,i) => <div key={`${h.status}-${i}`}><span>{h.status}</span><small>{h.actor || "Administration NTV"} · {h.at ? new Date(h.at).toLocaleString("fr-FR") : "Date non précisée"}{h.note ? ` · ${h.note}` : ""}</small></div>)}</div>}
          <div className="ntv-order-footer"><span>Paiement souhaité : {o.paymentMethod}</span><span>Gestion centralisée par NTV</span></div>
        </article>)}</div> : <p className="admin-empty">Aucune commande disponible. Vérifiez que MongoDB ou PostgreSQL est configuré pour enregistrer les commandes.</p>}
      </section>}
      {(tab === "sellers" || tab === "delivery") && <section className="admin-panel ntv-wide-panel"><div className="admin-list-head"><h2>{tab === "sellers" ? "Candidatures des commerçants" : "Candidatures des livreurs"}</h2><span>{accounts.filter(u => u.role === (tab === "sellers" ? "seller" : "delivery")).length} dossier(s)</span></div>
        {accounts.filter(u => u.role === (tab === "sellers" ? "seller" : "delivery")).length ? accounts.filter(u => u.role === (tab === "sellers" ? "seller" : "delivery")).map(u => <article className="ntv-account-card" key={u.id}>
          <div><b>{u.businessName || u.name}</b><span>{u.name} · {u.country}</span><span>{u.email} · {u.phone}</span>{u.businessDescription && <p>{u.businessDescription}</p>}{u.deliveryZones && <p>Zones de livraison : {u.deliveryZones}</p>}<small>Statut : {u.status === "pending" ? "En attente" : u.status === "active" ? "Approuvé" : u.status === "rejected" ? "Refusé" : u.status}</small></div>
          <div className="ntv-account-actions">{u.status !== "active" && <button disabled={busy} onClick={() => changeAccount(u,"active")}><Check size={15}/> Approuver</button>}{u.status !== "rejected" && <button className="reject" disabled={busy} onClick={() => changeAccount(u,"rejected")}><X size={15}/> Refuser</button>}</div>
        </article>) : <p className="admin-empty">Aucune candidature dans cette catégorie.</p>}
      </section>}
      <div className="ntv-admin-shortcuts"><a href="/admin"><LayoutDashboard size={17}/> Accès administration</a><a href="/admin/produits"><Package size={17}/> Gestion des produits</a><a href="/admin/comptes"><Users size={17}/> Gestion des comptes détaillée</a><a href="/"><ArrowLeft size={17}/> Retour à la boutique</a></div>
      {stats && <p className="admin-footnote">Stockage des commandes : {stats.database.postgres ? "PostgreSQL" : stats.database.mongo ? "MongoDB" : "non configuré"}. Le montant affiché correspond aux commandes enregistrées, pas nécessairement aux paiements encaissés.</p>}
    </main>
  </div>;
}
export default AdminDashboard;
