import React, { useEffect, useState } from "react";
import { RefreshCw, ShieldCheck, CheckCircle2, XCircle, KeyRound, Copy } from "lucide-react";

export default function PasswordRecoveryAdmin({ auth = "" }) {
  const [requests, setRequests] = useState([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [issuedCode, setIssuedCode] = useState(null);
  const [identityVerified, setIdentityVerified] = useState({});

  const headers = { Authorization: `Basic ${auth}`, "Content-Type": "application/json" };
  async function load() {
    setError("");
    const response = await fetch("/api/admin/password-recovery", { headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Chargement impossible.");
    setRequests(data.requests || []);
  }
  useEffect(() => { load().catch(e => setError(e.message)); }, [auth]);

  async function decide(item, action) {
    setBusy(item.id); setError(""); setNotice(""); setIssuedCode(null);
    try {
      const response = await fetch(`/api/admin/password-recovery/${encodeURIComponent(item.id)}`, {
        method: "PATCH", headers, body: JSON.stringify({ action, identityVerified: action === "approve" })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Action impossible.");
      if (action === "approve") {
        setIssuedCode({ code: data.code, phone: data.phone, email: data.email, expiresAt: data.expiresAt });
        setNotice("Identité vérifiée et demande autorisée. Communiquez ce code à l'utilisateur par téléphone ou WhatsApp.");
      } else setNotice("Demande refusée.");
      await load();
    } catch (e) { setError(e.message); }
    finally { setBusy(""); }
  }

  const roleName = role => role === "seller" ? "Vendeur" : role === "delivery" ? "Livreur" : "Client";
  return <section className="admin-panel" style={{ display: "grid", gap: 16 }}>
    <div className="admin-list-head">
      <div><h2><KeyRound size={19} style={{ verticalAlign: "middle" }}/> Récupération des mots de passe</h2><p>Vérifiez l'identité de l'utilisateur avant toute autorisation. Le code n'est affiché qu'une seule fois.</p></div>
      <button onClick={() => load().catch(e => setError(e.message))}><RefreshCw size={15}/> Actualiser</button>
    </div>
    {error && <p className="admin-error">{error}</p>}
    {notice && <p className="admin-success">{notice}</p>}
    {issuedCode && <div className="admin-order-card" style={{ border: "2px solid #16a34a", display: "grid", gap: 8 }}>
      <b>Code temporaire à communiquer immédiatement</b>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <strong style={{ fontSize: 28, letterSpacing: 5 }}>{issuedCode.code}</strong>
        <button onClick={() => navigator.clipboard?.writeText(issuedCode.code)}><Copy size={14}/> Copier</button>
      </div>
      <span>Téléphone : {issuedCode.phone} · E-mail : {issuedCode.email}</span>
      <small>Expire le {new Date(issuedCode.expiresAt).toLocaleString("fr-FR")} (15 minutes).</small>
      <small>Transmettez ce code uniquement après vérification de l'identité par téléphone ou WhatsApp. NTV ne l'envoie pas automatiquement.</small>
    </div>}
    {requests.length === 0 ? <p>Aucune demande enregistrée.</p> : requests.map(item => <article className="admin-order-card" key={item.id} style={{ display: "flex", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
      <div style={{ display: "grid", gap: 5 }}>
        <b>{item.userName || "Utilisateur"} · {roleName(item.role)}</b>
        <span>{item.email} · {item.phone}</span>
        <small>Demande : {item.requestedAt ? new Date(item.requestedAt).toLocaleString("fr-FR") : "—"}</small>
        <small>Statut : {item.status === "pending" ? "En attente de vérification" : item.status === "approved" ? "Autorisée — code émis" : "Refusée"}</small>
        {item.status === "pending" && <label style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 7 }}><input type="checkbox" checked={!!identityVerified[item.id]} onChange={e => setIdentityVerified(current => ({ ...current, [item.id]: e.target.checked }))}/> Identité vérifiée par téléphone / WhatsApp</label>}
      </div>
      {item.status === "pending" && <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button disabled={!!busy || !identityVerified[item.id]} onClick={() => decide(item, "approve")}><CheckCircle2 size={15}/> Autoriser</button>
        <button className="reject" disabled={!!busy} onClick={() => decide(item, "reject")}><XCircle size={15}/> Refuser</button>
      </div>}
    </article>)}
    <p className="admin-footnote"><ShieldCheck size={15}/> Les demandes de récupération du compte administrateur ne sont pas acceptées ici : elles doivent être traitées exclusivement par le développeur.</p>
  </section>;
}
