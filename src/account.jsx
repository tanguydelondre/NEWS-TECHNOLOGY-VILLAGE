import React, { useState } from "react";
import { ArrowLeft, UserRound, Store, Truck, ShieldCheck } from "lucide-react";
import "./styles.css";

const empty = { name: "", email: "", password: "", phone: "", country: "Bénin", role: "client", businessName: "", businessDescription: "", deliveryZones: "" };

export default function AccountApp() {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem("ntv_user") || "null"); } catch { return null; } });
  const token = () => localStorage.getItem("ntv_token") || "";
  async function submit(e) {
    e.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";
      const payload = mode === "login" ? { email: form.email, password: form.password } : form;
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
      if (mode === "register") { setMessage(data.message); setMode("login"); setForm({ ...empty, email: form.email }); }
      else { localStorage.setItem("ntv_token", data.token); localStorage.setItem("ntv_user", JSON.stringify(data.user)); setUser(data.user); setMessage("Connexion réussie."); }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function logout() { localStorage.removeItem("ntv_token"); localStorage.removeItem("ntv_user"); setUser(null); setMessage("Vous êtes déconnecté."); }
  return <div className="account-page">
    <header className="account-header"><a className="admin-back" href="/"><ArrowLeft size={16}/> Retour à la boutique</a><div className="account-brand">NEWS TECHNOLOGY VILLAGE <span>ESPACE UTILISATEUR</span></div></header>
    <main className="account-wrap">
      {user ? <section className="account-card"><div className="account-icon"><ShieldCheck size={28}/></div><p className="section-kicker">MON ESPACE</p><h1>Bienvenue, {user.name}</h1><p className="account-lead">Votre compte NTV est connecté.</p><div className="account-profile"><p><b>Adresse e-mail</b><span>{user.email}</span></p><p><b>Type de compte</b><span>{user.role === "seller" ? "Commerçant" : user.role === "delivery" ? "Livreur" : "Client"}</span></p><p><b>Statut</b><span>{user.status === "active" ? "Actif" : user.status === "pending" ? "En attente" : user.status}</span></p></div><button className="primary-button full-button" onClick={logout}>Se déconnecter</button></section> : <section className="account-card">
        <div className="account-icon"><UserRound size={28}/></div><p className="section-kicker">REJOIGNEZ NOTRE MARKETPLACE</p><h1>{mode === "login" ? "Connexion" : "Créer un compte"}</h1><p className="account-lead">Accédez à votre espace NEWS TECHNOLOGY VILLAGE.</p>
        <div className="account-tabs"><button className={mode === "login" ? "selected" : ""} onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Se connecter</button><button className={mode === "register" ? "selected" : ""} onClick={() => { setMode("register"); setError(""); setMessage(""); }}>S'inscrire</button></div>
        <form className="account-form" onSubmit={submit}>
          {mode === "register" && <>
            <label>Type de compte<select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}><option value="client">Client</option><option value="seller">Commerçant / vendeur</option><option value="delivery">Livreur</option></select></label>
            <label>Nom complet<input required minLength="2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name"/></label>
            <div className="account-two"><label>Téléphone<input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="tel"/></label><label>Pays<select value={form.country} onChange={e => setForm({ ...form, country: e.target.value })}>{["Bénin","Togo","Nigeria","Burkina Faso","Niger","Côte d’Ivoire","Ghana","Sénégal","Autre"].map(c => <option key={c}>{c}</option>)}</select></label></div>
            {form.role === "seller" && <><label>Nom du commerce / entreprise<input required value={form.businessName} onChange={e => setForm({ ...form, businessName: e.target.value })} placeholder="Nom de votre boutique"/></label><label>Activité et produits proposés<textarea rows="3" value={form.businessDescription} onChange={e => setForm({ ...form, businessDescription: e.target.value })} placeholder="Décrivez votre commerce et vos produits"/></label></>}
            {form.role === "delivery" && <label>Zones de livraison couvertes<textarea rows="3" value={form.deliveryZones} onChange={e => setForm({ ...form, deliveryZones: e.target.value })} placeholder="Villes, communes et quartiers desservis"/></label>}
          </>}
          <label>Adresse e-mail<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email"/></label>
          <label>Mot de passe<input required type="password" minLength="10" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} autoComplete={mode === "login" ? "current-password" : "new-password"}/>{mode === "register" && <small>10 caractères minimum.</small>}</label>
          {error && <p className="admin-error">{error}</p>}{message && <p className="admin-success">{message}</p>}
          <button className="primary-button full-button" disabled={busy}>{busy ? "Veuillez patienter..." : mode === "login" ? "Se connecter" : "Envoyer ma demande"}</button>
        </form>
        {mode === "register" && <p className="account-note"><Store size={15}/> Les demandes des vendeurs et livreurs sont examinées par NTV avant activation. <Truck size={15}/></p>}
      </section>}
      <p className="account-security">Vos mots de passe sont enregistrés sous forme hachée. Ne partagez jamais vos identifiants.</p>
    </main>
  </div>;
}
