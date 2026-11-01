import React, { useCallback, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, RefreshCw, Phone, Video, PhoneOff, Inbox, Headphones } from "lucide-react";

export default function CommunicationCenter({ role = "customer", auth = "" }) {
  const admin = role === "admin";
  const base = admin ? "/api/admin/communications" : "/api/communications";
  const [threads, setThreads] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [orderId, setOrderId] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [calls, setCalls] = useState([]);
  const [callStatus, setCallStatus] = useState("");
  const [callKind, setCallKind] = useState("audio");
  const [currentCall, setCurrentCall] = useState(null);
  const peerRef = useRef(null);
  const localStreamRef = useRef(null);
  const remoteStreamRef = useRef(null);
  const remoteRef = useRef(null);
  const localRef = useRef(null);
  const activeRef = useRef(null);

  const headers = useCallback(() => admin
    ? { Authorization: `Basic ${auth}`, "Content-Type": "application/json" }
    : { Authorization: `Bearer ${localStorage.getItem("ntv_token") || ""}`, "Content-Type": "application/json" }, [admin, auth]);

  const request = useCallback(async (url, options = {}) => {
    const response = await fetch(url, { ...options, headers: { ...headers(), ...(options.headers || {}) } });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "Une erreur est survenue.");
    return data;
  }, [headers]);

  const loadThreads = useCallback(async () => {
    const data = await request(`${base}/conversations`);
    setThreads(data.conversations || []);
    if (activeRef.current) {
      const found = (data.conversations || []).find(x => x.id === activeRef.current.id);
      if (found) setActive(found);
    }
  }, [base, request]);

  const loadMessages = useCallback(async (thread) => {
    if (!thread) return;
    const data = await request(`${base}/conversations/${thread.id}/messages`);
    setMessages(data.messages || []);
  }, [base, request]);

  const loadCalls = useCallback(async () => {
    if (!admin && !["seller", "customer", "delivery"].includes(role)) return;
    const data = await request(`${base}/calls`);
    setCalls(data.calls || []);
  }, [base, request, role]);

  useEffect(() => {
    loadThreads().catch(e => setError(e.message));
    loadCalls().catch(e => setError(e.message));
    const timer = setInterval(() => {
      loadThreads().catch(() => {});
      if (activeRef.current) loadMessages(activeRef.current).catch(() => {});
    }, 5000);
    return () => clearInterval(timer);
  }, [loadThreads, loadCalls, loadMessages]);

  // Flux SSE authentifié : les appels entrants et changements d'état sont poussés
  // par le serveur dès leur enregistrement, sans attendre le prochain polling.
  useEffect(() => {
    let stopped = false;
    let reader;
    const streamUrl = admin ? `${base}/events` : "/api/communications/events";
    async function connect() {
      while (!stopped) {
        try {
          const response = await fetch(streamUrl, { headers: headers(), cache: "no-store" });
          if (!response.ok || !response.body) throw new Error("Flux temps réel indisponible");
          reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";
          while (!stopped) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const frames = buffer.split("\n\n");
            buffer = frames.pop() || "";
            for (const frame of frames) {
              const line = frame.split("\n").find(item => item.startsWith("data: "));
              if (!line) continue;
              let event;
              try { event = JSON.parse(line.slice(6)); } catch { continue; }
              if (event.type === "incoming-call" || event.type === "call-updated") {
                loadCalls().catch(() => {});
                if (event.type === "incoming-call" && typeof Notification !== "undefined" && Notification.permission === "granted") {
                  try { new Notification(`Appel ${event.kind === "video" ? "vidéo" : "audio"} entrant`, { body: event.callerName || "Un utilisateur vous appelle", tag: `ntv-call-${event.callId}`, requireInteraction: true }); } catch {}
                }
              } else if (event.type === "message" || event.type === "conversation-updated") {
                loadThreads().catch(() => {});
                if (activeRef.current) loadMessages(activeRef.current).catch(() => {});
              }
            }
          }
        } catch {}
        if (!stopped) await new Promise(resolve => setTimeout(resolve, 1200));
      }
    }
    connect();
    return () => { stopped = true; reader?.cancel().catch(() => {}); };
  }, [admin, base, headers, loadCalls, loadMessages, loadThreads]);

  useEffect(() => { activeRef.current = active; }, [active]);

  async function createThread() {
    setBusy(true); setError("");
    try {
      const data = await request("/api/communications/conversations", { method: "POST", body: JSON.stringify({ orderId }) });
      await loadThreads(); setActive(data.conversation); activeRef.current = data.conversation; setMessages([]); setOrderId("");
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function sendMessage(event) {
    event.preventDefault();
    if (!active || !draft.trim()) return;
    setBusy(true); setError("");
    try {
      await request(`${base}/conversations/${active.id}/messages`, { method: "POST", body: JSON.stringify({ body: draft }) });
      setDraft(""); await loadMessages(active); await loadThreads();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function waitIce(pc) {
    return new Promise(resolve => {
      if (pc.iceGatheringState === "complete") return resolve();
      const timeout = setTimeout(resolve, 7000);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") { clearTimeout(timeout); resolve(); }
      });
    });
  }

  async function prepareMedia(kind) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: kind === "video" });
    localStreamRef.current = stream;
    if (localRef.current) localRef.current.srcObject = stream;
    let iceServers = [{ urls: "stun:stun.l.google.com:19302" }];
    try { const configResponse = await fetch("/api/config"); const configData = await configResponse.json(); if (Array.isArray(configData.iceServers) && configData.iceServers.length) iceServers = configData.iceServers; } catch {}
    const pc = new RTCPeerConnection({ iceServers });
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
    pc.ontrack = event => { remoteStreamRef.current = event.streams[0]; if (remoteRef.current) remoteRef.current.srcObject = event.streams[0]; };
    pc.onconnectionstatechange = () => setCallStatus(`Connexion : ${pc.connectionState}`);
    peerRef.current = pc;
    return pc;
  }

  async function startCall(kind = "audio") {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
      setError(""); setCallStatus("Préparation de l'appel…"); setCallKind(kind);
      const pc = await prepareMedia(kind);
      const offer = await pc.createOffer(); await pc.setLocalDescription(offer); await waitIce(pc);
      const endpoint = admin ? `${base}/calls` : "/api/communications/calls";
      const sellerId = admin ? (active?.participants || []).find(id => id !== "admin") : undefined;
      const data = await request(endpoint, { method: "POST", body: JSON.stringify({ kind, offer: pc.localDescription, ...(admin ? { sellerId } : {}) }) });
      setCurrentCall(data.call); setCallStatus("Appel envoyé à l'administration NTV. En attente de réponse…");
    } catch (e) { setError(e.message || "Microphone/caméra inaccessible."); stopLocal(); }
  }

  async function acceptCall(call) {
    try {
      setError(""); setCallStatus("Connexion à l'appel…"); setCallKind(call.kind || "audio");
      const pc = await prepareMedia(call.kind || "audio");
      await pc.setRemoteDescription(new RTCSessionDescription(call.offer));
      const answer = await pc.createAnswer(); await pc.setLocalDescription(answer); await waitIce(pc);
      const url = `${base}/calls/${call.id}`;
      await request(url, { method: "PATCH", body: JSON.stringify({ answer: pc.localDescription }) });
      setCurrentCall(call); setCallStatus("Appel connecté.");
    } catch (e) { setError(e.message); stopLocal(); }
  }

  async function pollCallAnswer() {
    if (!currentCall || peerRef.current?.remoteDescription) return;
    try {
      const data = await request(`${base}/calls`);
      const call = (data.calls || []).find(c => c.id === currentCall.id);
      if (call?.answer && peerRef.current) {
        await peerRef.current.setRemoteDescription(new RTCSessionDescription(call.answer));
        setCallStatus("Appel connecté.");
      }
    } catch {}
  }

  async function endCall(call = currentCall) {
    if (call?.id) {
      try { await request(`${base}/calls/${call.id}`, { method: "PATCH", body: JSON.stringify({ status: "ended" }) }); } catch {}
    }
    stopLocal(); setCurrentCall(null); setCallStatus("Appel terminé."); loadCalls().catch(() => {});
  }

  function stopLocal() {
    if (peerRef.current) { peerRef.current.close(); peerRef.current = null; }
    if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null; }
    if (localRef.current) localRef.current.srcObject = null;
    if (remoteRef.current) remoteRef.current.srcObject = null;
    remoteStreamRef.current = null;
  }

  useEffect(() => {
    if (currentCall) {
      if (localRef.current && localStreamRef.current) localRef.current.srcObject = localStreamRef.current;
      if (remoteRef.current && remoteStreamRef.current) remoteRef.current.srcObject = remoteStreamRef.current;
      const timer = setInterval(pollCallAnswer, 1500);
      return () => clearInterval(timer);
    }
  }, [admin, currentCall]);

  useEffect(() => () => stopLocal(), []);

  const incoming = calls.filter(c => c.status === "ringing" && (admin ? c.calleeId === "admin" : c.calleeId === String(JSON.parse(localStorage.getItem("ntv_user") || "{}").id || JSON.parse(localStorage.getItem("ntv_user") || "{}")._id || "") && c.callerId === "admin"));

  return <section className="ntv-panel ntv-communication">
    <div className="ntv-panel-heading"><div><h2>{admin ? "Messagerie et appels NTV" : role === "seller" ? "Communication avec NTV" : "Service client NTV"}</h2><p>{admin ? "Échangez avec les vendeurs et répondez aux demandes des clients." : "Vos échanges et notifications avec l'équipe NTV sont regroupés ici."}</p></div><button className="ntv-button ntv-button-light" onClick={() => { loadThreads().catch(e => setError(e.message)); loadCalls().catch(() => {}); }}><RefreshCw size={15}/> Actualiser</button></div>
    {error && <div className="ntv-alert ntv-alert-error">{error}</div>}
    {!admin && <div className="ntv-communication-start">
      <input value={orderId} onChange={e => setOrderId(e.target.value)} placeholder="N° de commande (facultatif)" />
      <button className="ntv-button" onClick={createThread} disabled={busy}><MessageCircle size={16}/> {role === "seller" ? "Écrire à l'administration" : "Contacter le service client"}</button>
      <div className="ntv-call-actions"><button className="ntv-button ntv-button-light" onClick={() => startCall("audio")}><Phone size={15}/> Appel audio</button><button className="ntv-button ntv-button-light" onClick={() => startCall("video")}><Video size={15}/> Appel vidéo</button></div>
    </div>}
    {incoming.map(call => <div className="ntv-call-incoming ntv-call-incoming-global" key={call.id}><div><b>Appel {call.kind === "video" ? "vidéo" : "audio"} de {call.callerName || (admin ? "un utilisateur NTV" : "l'administration NTV")}</b><p>{admin ? "Un utilisateur souhaite parler à l'administration." : "Vous êtes appelé par l'administration NTV."}</p></div><button className="ntv-button" onClick={() => acceptCall(call)}>Accepter</button><button className="ntv-button ntv-button-light" onClick={() => request(`${base}/calls/${call.id}`, { method: "PATCH", body: JSON.stringify({ status: "rejected" }) }).then(loadCalls)}>Refuser</button></div>)}
    <div className="ntv-communication-grid">
      <div className="ntv-communication-list"><strong><Inbox size={16}/> Conversations ({threads.length})</strong>
        {threads.length === 0 ? <p className="ntv-muted">Aucune conversation pour le moment.</p> : threads.map(thread => <button key={thread.id} className={`ntv-thread ${active?.id === thread.id ? "selected" : ""}`} onClick={() => { setActive(thread); activeRef.current = thread; loadMessages(thread).catch(e => setError(e.message)); }}><b>{thread.type === "customer-support" ? `Client : ${thread.customerName || "Demande client"}` : thread.type === "seller-admin" ? `Vendeur : ${thread.sellerName || "Boutique"}` : "Conversation"}</b>{thread.orderId && <small>Commande {thread.orderId}</small>}<span>{thread.lastMessage || "Nouvelle conversation"}</span><small>{thread.lastMessageAt ? new Date(thread.lastMessageAt).toLocaleString("fr-FR") : ""}</small></button>)}
      </div>
      <div className="ntv-communication-chat">{active ? <><div className="ntv-chat-title"><b>{active.subject || (active.orderId ? `Commande ${active.orderId}` : "Conversation NTV")}</b>{active.orderId && <small>Liée à la commande {active.orderId}</small>}{admin && active.type !== "" && <div className="ntv-call-actions"><button className="ntv-button ntv-button-light" onClick={() => startCall("audio")}><Phone size={15}/> Appeler en audio</button><button className="ntv-button ntv-button-light" onClick={() => startCall("video")}><Video size={15}/> Appeler en vidéo</button></div>}</div><div className="ntv-chat-messages">{messages.map(message => <div key={message.id} className={`ntv-chat-bubble ${message.senderRole === (admin ? "admin" : role) ? "mine" : "theirs"}`}><small>{message.senderName} · {new Date(message.createdAt).toLocaleString("fr-FR")}</small><p>{message.body}</p></div>)}</div><form className="ntv-chat-form" onSubmit={sendMessage}><input value={draft} onChange={e => setDraft(e.target.value)} placeholder="Écrire votre message…" maxLength={4000}/><button className="ntv-button" disabled={busy || !draft.trim()}><Send size={15}/> Envoyer</button></form></> : <div className="ntv-empty"><MessageCircle size={30}/><strong>Sélectionnez une conversation</strong><p>Les messages apparaîtront dans cet espace.</p></div>}</div>
    </div>
    {currentCall && <div className="ntv-call-stage"><div><b>{callKind === "video" ? "Appel vidéo" : "Appel audio"}</b><span>{callStatus}</span></div><div className="ntv-call-videos"><video ref={remoteRef} autoPlay playsInline/><video ref={localRef} autoPlay muted playsInline/></div><button className="ntv-button ntv-button-danger" onClick={() => endCall()}><PhoneOff size={16}/> Raccrocher</button></div>}
    {!currentCall && callStatus && <p className="ntv-muted">{callStatus}</p>}
  </section>;
}
