import React, { useState } from "react";
import { ArrowLeft, KeyRound, ShieldCheck } from "lucide-react";

export default function PasswordRecoveryRequest({ onBack }) {
  const [step, setStep] = useState("request");
  const [form, setForm] = useState({ name: "", email: "", phone: "", code: "", newPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function submitRequest(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/password-recovery", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Impossible d'envoyer la demande.");
      setMessage(data.message || "Demande transmise à l'administration NTV.");
      setStep("reset");
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  async function submitReset(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/auth/password-recovery/reset", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, code: form.code, newPassword: form.newPassword })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Impossible de modifier le mot de passe.");
      setMessage(data.message || "Mot de passe modifié.");
      setForm(current => ({ ...current, code: "", newPassword: "" }));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return <section className="ntv-panel" style={{ display: "grid", gap: 14, marginTop: 16 }}>
    <div className="ntv-panel-heading"><div><h2><KeyRound size={19} style={{ verticalAlign: "middle" }}/> Récupérer mon mot de passe</h2><p>Réservé aux comptes clients, vendeurs et livreurs. L'administrateur doit contacter le développeur.</p></div></div>
    {step === "request" ? <form className="ntv-auth-form" onSubmit={submitRequest}>
      <label className="ntv-field">Nom complet enregistré sur le compte<input required minLength="2" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} autoComplete="name" /></label>
      <label className="ntv-field">Adresse e-mail du compte<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>
      <label className="ntv-field">Téléphone associé au compte<input required value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} autoComplete="tel" /></label>
      <p className="ntv-muted"><ShieldCheck size={15}/> L'administration vérifiera votre identité avant toute autorisation. Le code sera communiqué manuellement par téléphone ou WhatsApp.</p>
      {error && <div className="ntv-alert ntv-alert-error">{error}</div>}
      {message && <div className="ntv-alert ntv-alert-success">{message}</div>}
      <button className="ntv-button" disabled={busy}>{busy ? "Envoi…" : "Envoyer ma demande"}</button>
    </form> : <form className="ntv-auth-form" onSubmit={submitReset}>
      <p className="ntv-muted">Après vérification, l'administration vous communiquera un code temporaire à 6 chiffres par téléphone ou WhatsApp. Il expire après 15 minutes.</p>
      <label className="ntv-field">Adresse e-mail du compte<input required type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} autoComplete="email" /></label>
      <label className="ntv-field">Code temporaire<input required inputMode="numeric" pattern="[0-9]{6}" maxLength="6" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.replace(/\D/g, "").slice(0, 6) })} placeholder="6 chiffres" /></label>
      <label className="ntv-field">Nouveau mot de passe<input required type="password" minLength="10" maxLength="200" value={form.newPassword} onChange={e => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" /><small>10 caractères minimum.</small></label>
      {error && <div className="ntv-alert ntv-alert-error">{error}</div>}
      {message && <div className="ntv-alert ntv-alert-success">{message}</div>}
      <button className="ntv-button" disabled={busy || form.code.length !== 6}>{busy ? "Vérification…" : "Valider le code et changer le mot de passe"}</button>
    </form>}
    <button type="button" className="ntv-button ntv-button-light" onClick={onBack}><ArrowLeft size={15}/> Retour à la connexion</button>
  </section>;
}
