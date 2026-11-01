import React, { useCallback, useEffect, useState } from "react";
import { AlertCircle, CheckCircle2, Clock3, FileText, RefreshCw, Send } from "lucide-react";

const categories = ["Commande", "Paiement", "Livraison", "Produit non conforme", "Vendeur", "Livreur", "Compte / accès", "Autre"];
const statusLabels = { received: "Reçue", in_review: "En cours d'examen", resolved: "Résolue", rejected: "Clôturée" };

export default function ComplaintsCenter({ admin = false, auth = "", role = "customer" }) {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ category: "Commande", subject: "", orderId: "", description: "" });
  const [replies, setReplies] = useState({});
  const [statuses, setStatuses] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const request = useCallback(async (url, options = {}) => {
    const response = await fetch(url, {
      ...options,
      headers: {
        ...(admin ? { Authorization: `Basic ${auth}` } : { Authorization: `Bearer ${localStorage.getItem("ntv_token") || ""}` }),
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
    return data;
  }, [admin, auth]);

  const load = useCallback(async () => {
    const data = await request(admin ? "/api/admin/complaints" : "/api/complaints");
    setItems(data.complaints || []);
  }, [admin, request]);

  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);

  async function submit(event) {
    event.preventDefault();
    setBusy(true); setError(""); setNotice("");
    try {
      await request("/api/complaints", { method: "POST", body: JSON.stringify(form) });
      setForm({ category: "Commande", subject: "", orderId: "", description: "" });
      setNotice("Votre réclamation a été transmise à l'administration NTV. Conservez son numéro de dossier pour le suivi.");
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function update(item) {
    setBusy(true); setError(""); setNotice("");
    try {
      await request(`/api/admin/complaints/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status: statuses[item.id] || item.status, adminReply: replies[item.id] ?? item.adminReply ?? "" })
      });
      setNotice(`Dossier ${item.reference} mis à jour.`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  return <section className="ntv-panel" style={{ display: "grid", gap: 18 }}>
    <div className="ntv-panel-heading"><div><h2>{admin ? "Réclamations et plaintes" : "Espace réclamations"}</h2><p>{admin ? "Consultez les dossiers, répondez et mettez à jour leur traitement." : "Signalez un problème et suivez les réponses de l'équipe NTV."}</p></div><button className="ntv-button ntv-button-light" onClick={() => load().catch(e => setError(e.message))}><RefreshCw size={15}/> Actualiser</button></div>
    {error && <div className="ntv-alert ntv-alert-error"><AlertCircle size={16}/> {error}</div>}
    {notice && <div className="ntv-alert ntv-alert-success"><CheckCircle2 size={16}/> {notice}</div>}
    {!admin && <form onSubmit={submit} style={{ display: "grid", gap: 12, padding: 16, border: "1px solid #e5eaf1", borderRadius: 14 }}>
      <h3 style={{ margin: 0 }}>Déposer une réclamation</h3>
      <div className="ntv-product-form">
        <label className="ntv-field">Motif<select value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>{categories.map(x => <option key={x}>{x}</option>)}</select></label>
        <label className="ntv-field">Numéro de commande (facultatif)<input value={form.orderId} onChange={e => setForm({ ...form, orderId: e.target.value })} placeholder="Ex. NTV-2026-0001" maxLength={80}/></label>
      </div>
      <label className="ntv-field">Objet<input required minLength={4} maxLength={140} value={form.subject} onChange={e => setForm({ ...form, subject: e.target.value })} placeholder="Résumez votre problème"/></label>
      <label className="ntv-field">Description détaillée<textarea required minLength={10} maxLength={4000} rows={5} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Expliquez les faits, les dates et la solution souhaitée…"/></label>
      <button className="ntv-button" disabled={busy || form.description.trim().length < 10}><Send size={15}/> {busy ? "Envoi…" : "Envoyer ma réclamation"}</button>
      <small style={{ color: "#778397" }}>N'indiquez jamais votre mot de passe ni vos informations bancaires complètes. Les pièces jointes pourront être ajoutées dans une prochaine évolution.</small>
    </form>}
    <div style={{ display: "grid", gap: 12 }}>
      <h3 style={{ margin: 0 }}>{admin ? `Dossiers reçus (${items.length})` : `Mes réclamations (${items.length})`}</h3>
      {items.length === 0 ? <div className="ntv-empty"><FileText size={28}/><strong>Aucune réclamation</strong><p>{admin ? "Les nouveaux dossiers apparaîtront ici." : "Vos demandes envoyées à NTV apparaîtront ici."}</p></div> : items.map(item => <article key={item.id} style={{ border: "1px solid #e5eaf1", borderRadius: 14, padding: 16, display: "grid", gap: 10 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}><div><b>{item.reference} · {item.subject}</b><div style={{ color: "#778397", fontSize: 13 }}>{item.category} {item.orderId ? `· Commande ${item.orderId}` : ""} · {new Date(item.createdAt).toLocaleString("fr-FR")}</div>{admin && <div style={{ color: "#778397", fontSize: 13 }}>{item.userName} · {item.userRole} · {item.userEmail}</div>}</div><span className="ntv-badge">{statusLabels[item.status] || item.status}</span></div>
        <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{item.description}</p>
        {item.adminReply && <div style={{ background: "#f5f8fc", padding: 12, borderRadius: 10 }}><b>Réponse NTV</b><p style={{ whiteSpace: "pre-wrap", margin: "6px 0 0" }}>{item.adminReply}</p></div>}
        {(item.history || []).length > 0 && <div style={{ display: "grid", gap: 5, color: "#778397", fontSize: 12 }}><b>Historique du dossier</b>{item.history.map((event, index) => <span key={`${event.status}-${index}`}>{statusLabels[event.status] || event.status} · {new Date(event.at).toLocaleString("fr-FR")}{event.note ? ` · ${event.note}` : ""}</span>)}</div>}
        {admin && <div style={{ display: "grid", gap: 9 }}><select value={statuses[item.id] || item.status} onChange={e => setStatuses({ ...statuses, [item.id]: e.target.value })}><option value="received">Reçue</option><option value="in_review">En cours d'examen</option><option value="resolved">Résolue</option><option value="rejected">Clôturée</option></select><textarea rows={3} maxLength={4000} value={replies[item.id] ?? item.adminReply ?? ""} onChange={e => setReplies({ ...replies, [item.id]: e.target.value })} placeholder="Réponse à transmettre au client, vendeur ou livreur…"/></div>}
        {admin && <button className="ntv-button" disabled={busy} onClick={() => update(item)}>Enregistrer le traitement</button>}
      </article>)}
    </div>
  </section>;
}
