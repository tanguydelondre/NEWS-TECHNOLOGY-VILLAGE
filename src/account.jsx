
import React, { useEffect, useState } from "react";
import {
  ArrowLeft, UserRound, Store, Truck, ShoppingBag, Package, MessageCircle,
  Plus, RefreshCw, LogOut, Eye, Pencil, Trash2, Clock,
  LayoutDashboard, Menu, X, ExternalLink, Search, Bell,
  ChevronRight, TrendingUp, ShieldCheck, CircleCheck, AlertCircle, ImagePlus, Boxes, Globe, ArrowUpRight, MapPin, CheckCircle2
} from "lucide-react";
import "./styles.css";
import CommunicationCenter from "./communications";
import ComplaintsCenter from "./complaints";
import PasswordRecoveryRequest from "./password-recovery-request";
import { LEGAL_VERSION, legalDocuments } from "./legal";

const empty = {
  name: "", email: "", password: "", phone: "",
  country: "Bénin", role: "customer",
  businessName: "", businessDescription: "", deliveryZones: "", plan: ""
};

const emptyProduct = {
  name: "", description: "", price: "", stock: "",
  category: "", imageUrl: "", imageUrls: []
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

function getProductId(product) {
  return product?.id || product?._id;
}

export default function AccountApp() {
  const [mode, setMode] = useState("login");
  const [showPasswordRecovery, setShowPasswordRecovery] = useState(false);
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [legalAccepted, setLegalAccepted] = useState(false);
  const [legalGateAccepted, setLegalGateAccepted] = useState(false);
  const [acceptingTerms, setAcceptingTerms] = useState(false);

  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("ntv_user") || "null");
    } catch {
      return null;
    }
  });

  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [customerOrdersBusy, setCustomerOrdersBusy] = useState(false);
  const [deliveryMissions, setDeliveryMissions] = useState([]);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [workspaceError, setWorkspaceError] = useState("");
  const [productForm, setProductForm] = useState(emptyProduct);
  const [editingProduct, setEditingProduct] = useState(null);
  const [savingProduct, setSavingProduct] = useState(false);
  const [productMessage, setProductMessage] = useState("");
  const [productImageFiles, setProductImageFiles] = useState([]);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [productSearch, setProductSearch] = useState("");
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState("");
  const [avatarError, setAvatarError] = useState("");
  const [sellerActionBusy, setSellerActionBusy] = useState("");

  const isSeller = user?.role === "seller";
  const isDelivery = user?.role === "delivery";
  const isActive = user?.status === "active";
  const isSellerActive = isSeller && isActive;
  const sellerPlanName = user?.plan === "vip" ? "Vendeur VIP" : user?.plan === "limited" ? "Vendeur – accès limité" : "Vendeur à commission";
  const sellerPlanPrice = user?.plan === "vip" ? 5000 : user?.plan === "limited" ? 2500 : 0;
  const sellerSubscriptionValid = user?.plan === "commission" || (user?.subscriptionStatus === "active" && user?.subscriptionExpiresAt && new Date(user.subscriptionExpiresAt).getTime() > Date.now());
  const sellerSubscriptionDaysLeft = user?.subscriptionExpiresAt ? Math.ceil((new Date(user.subscriptionExpiresAt).getTime() - Date.now()) / 86400000) : null;
  const canVisitStore = isSellerActive && sellerSubscriptionValid;
  const isDeliveryActive = isDelivery && isActive;

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");

    try {
      const endpoint =
        mode === "login" ? "/api/auth/login" : "/api/auth/register";

      const payload = mode === "login"
        ? { email: form.email, password: form.password }
        : { ...form, termsAccepted: legalAccepted, termsVersion: LEGAL_VERSION };

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
        setMessage(
          form.role === "customer"
            ? "Votre compte client est créé. Vous pouvez maintenant vous connecter."
            : data.message || "Votre demande a été envoyée à NTV. Elle sera examinée par notre équipe."
        );
        setMode("login");
        setForm({ ...empty, email: form.email });
        setLegalAccepted(false);
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

  async function markSellerNotificationsRead() {
    try {
      const data = await apiRequest("/api/seller/notifications/read", { method: "PATCH" });
      if (data.user) {
        setUser(data.user);
        localStorage.setItem("ntv_user", JSON.stringify(data.user));
      }
    } catch (err) {
      setWorkspaceError(err.message);
    }
  }

  async function uploadProfilePhoto(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 6 * 1024 * 1024) {
      setAvatarError("Choisissez une image JPG, PNG, WEBP ou GIF de 6 Mo maximum.");
      return;
    }
    setAvatarBusy(true);
    setAvatarError("");
    setAvatarMessage("");
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { Authorization: `Bearer ${localStorage.getItem("ntv_token") || ""}` },
        body: formData
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "La photo n'a pas pu être enregistrée.");
      setUser(data.user);
      localStorage.setItem("ntv_user", JSON.stringify(data.user));
      setAvatarMessage("Votre photo de profil a été mise à jour.");
    } catch (err) {
      setAvatarError(err.message);
    } finally {
      setAvatarBusy(false);
    }
  }

  async function acceptUpdatedTerms() {
    setAcceptingTerms(true); setWorkspaceError("");
    try {
      const data = await apiRequest("/api/legal/accept", { method: "PATCH", body: JSON.stringify({ termsAccepted: true, termsVersion: LEGAL_VERSION }) });
      const updated = { ...user, ...(data.user || {}), termsVersion: LEGAL_VERSION, termsAccepted: true };
      setUser(updated); localStorage.setItem("ntv_user", JSON.stringify(updated)); setLegalGateAccepted(false);
    } catch (e) { setWorkspaceError(e.message); }
    finally { setAcceptingTerms(false); }
  }

  function logout() {
    localStorage.removeItem("ntv_token");
    localStorage.removeItem("ntv_user");
    setUser(null);
    setProducts([]);
    setOrders([]);
    setActiveTab("dashboard");
    setMessage("Vous êtes déconnecté.");
    setError("");
  }

  async function loadSellerWorkspace() {
    setLoadingWorkspace(true);
    setWorkspaceError("");

    try {
      const [productData, orderData, profileData] = await Promise.all([
        apiRequest("/api/seller/products"),
        apiRequest("/api/seller/orders"),
        apiRequest("/api/auth/me")
      ]);
      if (profileData?.user) {
        setUser(profileData.user);
        localStorage.setItem("ntv_user", JSON.stringify(profileData.user));
      }

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

  async function respondToSellerOrder(order, decision) {
    let note = "";
    if (decision === "rejected") {
      note = window.prompt("Indiquez pourquoi vous ne pouvez pas confirmer cette commande (ex. article indisponible).", "");
      if (note === null) return;
      if (note.trim().length < 3) {
        setWorkspaceError("Veuillez préciser le motif du rejet.");
        return;
      }
    }
    setSellerActionBusy(`${order.id}-${decision}`);
    setWorkspaceError("");
    setProductMessage("");
    try {
      await apiRequest(`/api/seller/orders/${encodeURIComponent(order.id)}/confirmation`, {
        method: "PATCH",
        body: JSON.stringify({ decision, note })
      });
      setProductMessage(decision === "accepted" ? `Commande ${order.orderId} acceptée : disponibilité confirmée.` : `Commande ${order.orderId} rejetée. NTV pourra prendre le relais.`);
      await loadSellerWorkspace();
    } catch (err) {
      setWorkspaceError(err.message);
    } finally {
      setSellerActionBusy("");
    }
  }

  async function updateVipPreparation(order, status) {
    setSellerActionBusy(`${order.id}-${status}`);
    setWorkspaceError("");
    setProductMessage("");
    try {
      await apiRequest(`/api/seller/orders/${encodeURIComponent(order.id)}/preparation`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setProductMessage(`Commande ${order.orderId} : ${status.toLowerCase()}.`);
      await loadSellerWorkspace();
    } catch (err) {
      setWorkspaceError(err.message);
    } finally {
      setSellerActionBusy("");
    }
  }

  async function loadCustomerOrders() {
    setCustomerOrdersBusy(true);
    setWorkspaceError("");
    try {
      const data = await apiRequest("/api/customer/orders");
      setOrders(Array.isArray(data.orders) ? data.orders : []);
    } catch (err) {
      setWorkspaceError(err.message);
    } finally {
      setCustomerOrdersBusy(false);
    }
  }

  useEffect(() => {
    if (isSellerActive) loadSellerWorkspace();
    if (user?.role === "customer") loadCustomerOrders();
    if (isDeliveryActive) {
      loadDeliveryWorkspace();
      const refreshId = window.setInterval(loadDeliveryWorkspace, 20000);
      return () => window.clearInterval(refreshId);
    }
  }, [user?.role, user?.status]);

  async function loadDeliveryWorkspace() {
    setLoadingWorkspace(true);
    setWorkspaceError("");
    try {
      const data = await apiRequest("/api/delivery/missions");
      setDeliveryMissions(Array.isArray(data.missions) ? data.missions : []);
    } catch (err) {
      setWorkspaceError(err.message);
    } finally {
      setLoadingWorkspace(false);
    }
  }

  async function deliveryAction(mission, action, step) {
    setLoadingWorkspace(true);
    setWorkspaceError("");
    setProductMessage("");
    try {
      await apiRequest(`/api/delivery/missions/${encodeURIComponent(mission.id)}/${action}`, {
        method: action === "accept" ? "POST" : "PATCH",
        body: action === "status" ? JSON.stringify({ step }) : undefined
      });
      setProductMessage(action === "accept" ? `Mission ${mission.orderId} acceptée.` : `Mission ${mission.orderId} mise à jour.`);
      await loadDeliveryWorkspace();
    } catch (err) {
      setWorkspaceError(err.message);
    } finally {
      setLoadingWorkspace(false);
    }
  }

  function startNewProduct() {
    setEditingProduct(null);
    setProductForm(emptyProduct);
    setProductImageFiles([]);
    setProductMessage("");
    setWorkspaceError("");
    setActiveTab("products");
    setMobileNav(false);
  }

  function startEditProduct(product) {
    setEditingProduct(product);
    setProductForm({
      name: product.name || "",
      description: product.description || "",
      price: product.price ?? "",
      stock: product.stock ?? "",
      category: product.category || "",
      imageUrl: product.imageUrl || "",
      imageUrls: (Array.isArray(product.imageUrls) ? product.imageUrls : [product.imageUrl]).filter(Boolean).slice(0, 2)
    });
    setProductImageFiles([]);
    setProductMessage("");
    setWorkspaceError("");
    setActiveTab("products");
  }

  async function saveProduct(event) {
    event.preventDefault();
    setSavingProduct(true);
    setProductMessage("");
    setWorkspaceError("");

    try {
      let imageUrls = productForm.imageUrls || (productForm.imageUrl ? [productForm.imageUrl] : []);
      if (productImageFiles.length) {
        if (productImageFiles.length !== 2) throw new Error("Choisissez exactement 2 images pour cet article.");
        const formData = new FormData();
        productImageFiles.forEach(file => formData.append("images", file));
        const token = localStorage.getItem("ntv_token");
        const uploadResponse = await fetch("/api/seller/product-images", {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData
        });
        const uploadData = await uploadResponse.json().catch(() => ({}));
        if (!uploadResponse.ok) throw new Error(uploadData.error || "Le téléchargement des photos a échoué.");
        imageUrls = uploadData.imageUrls || [];
      }
      if (imageUrls.length !== 2) throw new Error("Chaque article doit avoir exactement 2 photos. Sélectionnez les deux images avant l'enregistrement.");
      const payload = {
        ...productForm,
        imageUrls,
        imageUrl: imageUrls[0],
        price: Number(productForm.price),
        stock: Number(productForm.stock || 0)
      };

      const isEditing = Boolean(editingProduct);
      const productId = getProductId(editingProduct);

      await apiRequest(
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
          ? "Votre produit a été modifié avec succès."
          : "Votre produit a été ajouté avec succès."
      );

      setProductForm(emptyProduct);
      setProductImageFiles([]);
      setEditingProduct(null);
      await loadSellerWorkspace();
    } catch (err) {
      setWorkspaceError(err.message);
    } finally {
      setSavingProduct(false);
    }
  }

  async function deleteProduct(product) {
    const productId = getProductId(product);
    if (!productId) {
      setWorkspaceError("Identifiant du produit introuvable.");
      return;
    }

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
    user?.role === "customer" ? "Client" :
    user?.role === "seller" ? "Commerçant / vendeur" :
    user?.role === "delivery" ? "Livreur" : "Administrateur";

  const storeUrl = user?.storeSlug
    ? `/boutique/${user.storeSlug}`
    : null;

  const filteredProducts = products.filter(product =>
    `${product.name || ""} ${product.category || ""}`
      .toLowerCase()
      .includes(productSearch.toLowerCase())
  );

  const totalStock = products.reduce(
    (sum, product) => sum + Number(product.stock || 0), 0
  );

  const orderCount = orders.length;

  const navigation = [
    { id: "dashboard", label: "Vue d'ensemble", icon: LayoutDashboard },
    { id: "products", label: "Mes produits", icon: Package },
    { id: "orders", label: "Mes commandes", icon: ShoppingBag },
    { id: "communications", label: "Messages NTV", icon: MessageCircle },
    { id: "complaints", label: "Réclamations", icon: AlertCircle },
    { id: "rules", label: "Règlement NTV", icon: ShieldCheck }
  ];

  return (
    <div className="ntv-account">
      <style>{`
        .ntv-account {
          min-height: 100vh;
          background: #f4f6fa;
          color: #182230;
          font-family: Inter, system-ui, sans-serif;
        }
        .ntv-topbar {
          height: 72px;
          padding: 0 34px;
          background: #fff;
          border-bottom: 1px solid #e8edf3;
          display: flex;
          align-items: center;
          justify-content: space-between;
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .ntv-logo {
          display: flex;
          align-items: center;
          gap: 11px;
          text-decoration: none;
          color: #17243a;
          font-weight: 850;
          letter-spacing: -.5px;
        }
        .ntv-logo-mark {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: #e9f1ff;
          color: #2463d3;
        }
        .ntv-logo small {
          display: block;
          font-size: 9px;
          letter-spacing: 3px;
          color: #7a8798;
          margin-top: 3px;
        }
        .ntv-top-actions {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .ntv-top-link, .ntv-icon-button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #e5eaf1;
          background: #fff;
          color: #435168;
          padding: 10px 13px;
          border-radius: 10px;
          text-decoration: none;
          font-size: 13px;
          font-weight: 650;
          cursor: pointer;
        }
        .ntv-icon-button { display: none; }
        .ntv-layout {
          display: grid;
          grid-template-columns: 250px minmax(0, 1fr);
          min-height: calc(100vh - 72px);
        }
        .ntv-sidebar {
          background: #fff;
          border-right: 1px solid #e8edf3;
          padding: 26px 17px;
          display: flex;
          flex-direction: column;
        }
        .ntv-user-mini {
          padding: 14px 12px 22px;
          border-bottom: 1px solid #edf0f5;
          margin-bottom: 20px;
        }
        .ntv-avatar {
          width: 43px;
          height: 43px;
          border-radius: 13px;
          background: #eaf1ff;
          color: #2864d7;
          display: grid;
          place-items: center;
          font-size: 17px;
          font-weight: 800;
          margin-bottom: 12px;
          overflow: hidden;
        }
        .ntv-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
        .ntv-user-mini strong {
          display: block;
          font-size: 14px;
          overflow-wrap: anywhere;
        }
        .ntv-user-mini span {
          display: block;
          color: #8994a5;
          font-size: 11px;
          margin-top: 5px;
        }
        .ntv-side-label {
          padding: 0 12px;
          margin: 0 0 10px;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: #a0a9b7;
          text-transform: uppercase;
        }
        .ntv-nav-button {
          width: 100%;
          border: 0;
          background: transparent;
          color: #687589;
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 13px;
          border-radius: 10px;
          margin: 3px 0;
          font-size: 13px;
          font-weight: 650;
          text-align: left;
          cursor: pointer;
          transition: .2s;
        }
        .ntv-nav-button:hover { background: #f3f6fb; color: #225dca; }
        .ntv-nav-button.selected {
          background: #eaf1ff;
          color: #205dce;
        }
        .ntv-sidebar-bottom {
          margin-top: auto;
          padding-top: 24px;
        }
        .ntv-sidebar-note {
          background: #f5f8fd;
          border: 1px solid #e7edf6;
          border-radius: 12px;
          padding: 13px;
          font-size: 11px;
          line-height: 1.6;
          color: #6e7b8e;
        }
        .ntv-sidebar-note svg { color: #2864d7; margin-bottom: 7px; }
        .ntv-main {
          padding: 34px clamp(18px, 4vw, 54px);
          min-width: 0;
          max-width: 1500px;
          width: 100%;
          margin: 0 auto;
        }
        .ntv-page-heading {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 18px;
          margin-bottom: 28px;
        }
        .ntv-eyebrow {
          color: #2864d7;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 1.8px;
          text-transform: uppercase;
          margin-bottom: 9px;
        }
        .ntv-page-heading h1 {
          font-size: clamp(24px, 3vw, 32px);
          line-height: 1.2;
          letter-spacing: -1px;
          margin: 0;
          color: #17243a;
        }
        .ntv-page-heading p {
          margin: 9px 0 0;
          color: #7d8999;
          font-size: 13px;
        }
        .ntv-button {
          border: 0;
          border-radius: 10px;
          background: #2864d7;
          color: #fff;
          padding: 11px 16px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          font-weight: 700;
          font-size: 12px;
          cursor: pointer;
          text-decoration: none;
          transition: .2s;
        }
        .ntv-button:hover { background: #174fb9; transform: translateY(-1px); }
        .ntv-button:disabled { opacity: .55; cursor: wait; transform: none; }
        .ntv-button-light {
          background: #fff;
          border: 1px solid #e2e8f0;
          color: #45536a;
        }
        .ntv-button-light:hover { background: #f5f8fc; color: #205dce; }
        .ntv-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
          margin-bottom: 26px;
        }
        .ntv-stat {
          background: #fff;
          border: 1px solid #e9edf3;
          border-radius: 15px;
          padding: 21px;
          box-shadow: 0 3px 12px rgba(25,45,75,.025);
        }
        .ntv-stat-top {
          display: flex;
          justify-content: space-between;
          align-items: center;
          color: #8490a1;
          font-size: 12px;
          font-weight: 650;
        }
        .ntv-stat-icon {
          width: 37px;
          height: 37px;
          display: grid;
          place-items: center;
          background: #edf3ff;
          color: #2864d7;
          border-radius: 11px;
        }
        .ntv-stat strong {
          display: block;
          font-size: 29px;
          letter-spacing: -1px;
          margin-top: 15px;
          color: #17243a;
        }
        .ntv-stat small {
          display: block;
          color: #9aa4b2;
          font-size: 11px;
          margin-top: 5px;
        }
        .ntv-panel {
          background: #fff;
          border: 1px solid #e8edf3;
          border-radius: 15px;
          padding: 23px;
          margin-bottom: 20px;
          box-shadow: 0 3px 12px rgba(25,45,75,.025);
          min-width: 0;
        }
        .ntv-panel-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 19px;
        }
        .ntv-panel-heading h2, .ntv-panel-heading h3 {
          margin: 0;
          font-size: 16px;
          color: #1c2a40;
        }
        .ntv-panel-heading p {
          margin: 5px 0 0;
          color: #8a96a6;
          font-size: 11px;
        }
        .ntv-store-banner {
          border-radius: 16px;
          padding: 24px;
          background: linear-gradient(115deg, #172e55, #2864d7);
          color: white;
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 20px;
          margin-bottom: 24px;
          overflow: hidden;
        }
        .ntv-store-banner small {
          color: #c8d9fa;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.5px;
        }
        .ntv-store-banner h2 {
          margin: 8px 0 5px;
          font-size: 20px;
        }
        .ntv-store-banner p {
          color: #d5e1f7;
          margin: 0;
          font-size: 12px;
        }
        .ntv-store-banner .ntv-button {
          background: #fff;
          color: #205dce;
          white-space: nowrap;
        }
        .ntv-product-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 14px;
        }
        .ntv-field {
          display: flex;
          flex-direction: column;
          gap: 7px;
          color: #59677b;
          font-size: 11px;
          font-weight: 700;
          min-width: 0;
        }
        .ntv-field input, .ntv-field textarea, .ntv-field select {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #e1e7ef;
          border-radius: 9px;
          padding: 11px 12px;
          background: #fbfcfe;
          outline: none;
          color: #24334a;
          font: inherit;
          font-weight: 450;
          font-size: 13px;
        }
        .ntv-field input:focus, .ntv-field textarea:focus {
          border-color: #6e9bea;
          box-shadow: 0 0 0 3px #eaf1ff;
        }
        .ntv-field textarea { resize: vertical; min-height: 75px; }
        .ntv-field-full { grid-column: 1 / -1; }
        .ntv-form-actions {
          grid-column: 1 / -1;
          display: flex;
          gap: 10px;
          flex-wrap: wrap;
        }
        .ntv-search {
          display: flex;
          align-items: center;
          gap: 8px;
          background: #f8fafd;
          border: 1px solid #e5eaf1;
          border-radius: 9px;
          padding: 0 11px;
          color: #8995a6;
          min-width: 210px;
        }
        .ntv-search input {
          border: 0;
          background: transparent;
          outline: 0;
          padding: 10px 0;
          width: 100%;
          min-width: 0;
          font-size: 12px;
        }
        .ntv-product-list { display: grid; gap: 10px; }
        .ntv-product-row {
          display: grid;
          grid-template-columns: 62px minmax(0,1fr) auto;
          gap: 14px;
          align-items: center;
          padding: 12px;
          border: 1px solid #edf0f5;
          border-radius: 12px;
        }
        .ntv-product-row img, .ntv-product-placeholder {
          width: 62px;
          height: 62px;
          object-fit: cover;
          border-radius: 9px;
          background: #f0f4fa;
          display: grid;
          place-items: center;
          color: #93a1b4;
        }
        .ntv-product-info { min-width: 0; }
        .ntv-product-info strong {
          display: block;
          font-size: 13px;
          color: #25334a;
          overflow-wrap: anywhere;
        }
        .ntv-product-info span {
          display: block;
          margin-top: 5px;
          color: #2864d7;
          font-weight: 800;
          font-size: 12px;
        }
        .ntv-product-info small {
          display: block;
          margin-top: 4px;
          color: #96a0ae;
          font-size: 10px;
        }
        .ntv-row-actions { display: flex; gap: 7px; }
        .ntv-row-actions button {
          width: 34px;
          height: 34px;
          border: 1px solid #e5eaf1;
          border-radius: 9px;
          background: white;
          color: #65748a;
          cursor: pointer;
          display: grid;
          place-items: center;
        }
        .ntv-row-actions button:hover { color: #2864d7; background: #f1f5ff; }
        .ntv-row-actions button.delete:hover { color: #d34b4b; background: #fff3f3; }
        .ntv-order-card {
          border: 1px solid #e9edf3;
          border-radius: 12px;
          padding: 16px;
          margin-bottom: 11px;
        }
        .ntv-order-head {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .ntv-order-head strong { font-size: 13px; }
        .ntv-order-status {
          background: #fff6e6;
          color: #a66b0b;
          padding: 6px 9px;
          border-radius: 20px;
          font-size: 10px;
          font-weight: 800;
        }
        .ntv-order-line {
          display: flex;
          justify-content: space-between;
          gap: 12px;
          padding: 8px 0;
          border-top: 1px solid #f0f2f6;
          color: #647186;
          font-size: 12px;
        }
        .ntv-order-line strong { color: #26364e; }
        .ntv-order-date {
          display: block;
          color: #9aa4b2;
          font-size: 10px;
          margin-top: 10px;
        }
        .ntv-notice {
          display: flex;
          gap: 10px;
          align-items: flex-start;
          padding: 13px 15px;
          border-radius: 10px;
          background: #eff5ff;
          color: #47648f;
          font-size: 11px;
          line-height: 1.6;
          margin-bottom: 18px;
        }
        .ntv-notice svg { flex: 0 0 auto; margin-top: 1px; }
        .ntv-alert {
          padding: 12px 14px;
          border-radius: 9px;
          margin-bottom: 14px;
          font-size: 12px;
        }
        .ntv-alert-error { background: #fff0f0; color: #b43e3e; }
        .ntv-alert-success { background: #edf9f1; color: #28794b; }
        .ntv-empty {
          padding: 35px 15px;
          text-align: center;
          color: #94a0af;
        }
        .ntv-empty svg { margin-bottom: 10px; color: #a9b8ce; }
        .ntv-empty strong { display: block; color: #59677b; font-size: 13px; }
        .ntv-empty p { font-size: 11px; }
        .ntv-auth-wrap {
          min-height: calc(100vh - 72px);
          display: grid;
          place-items: center;
          padding: 35px 16px;
        }
        .ntv-auth-card {
          width: min(100%, 510px);
          background: #fff;
          border: 1px solid #e8edf3;
          border-radius: 18px;
          padding: clamp(22px, 5vw, 38px);
          box-shadow: 0 12px 40px rgba(28,45,75,.06);
        }
        .ntv-auth-card h1 { margin: 9px 0; font-size: 25px; color: #1a2940; }
        .ntv-auth-card > p { color: #8490a1; font-size: 12px; line-height: 1.7; }
        .ntv-auth-icon {
          width: 48px; height: 48px; border-radius: 14px;
          display: grid; place-items: center; background: #eaf1ff; color: #2864d7;
        }
        .ntv-auth-tabs { display: flex; background: #f3f6fa; padding: 4px; border-radius: 10px; margin: 20px 0; }
        .ntv-auth-tabs button {
          flex: 1; border: 0; padding: 10px; border-radius: 8px;
          background: transparent; color: #78869a; font-size: 12px; font-weight: 700; cursor: pointer;
        }
        .ntv-auth-tabs button.selected { background: white; color: #2864d7; box-shadow: 0 2px 7px #18223012; }
        .ntv-auth-form { display: grid; gap: 13px; }
        .ntv-auth-form .ntv-button { width: 100%; padding: 13px; margin-top: 5px; }
        .ntv-auth-foot { text-align: center; font-size: 10px; color: #a0aab8; margin-top: 20px; }
        .ntv-pending {
          padding: 22px;
          border: 1px solid #f1dfb9;
          border-radius: 13px;
          background: #fffaf0;
          color: #866522;
          display: flex;
          gap: 13px;
          line-height: 1.6;
          font-size: 12px;
        }
        .ntv-pending svg { flex: 0 0 auto; }
        .ntv-footer {
          border-top: 1px solid #e8edf3;
          padding: 17px 25px;
          text-align: center;
          color: #9ba5b2;
          font-size: 10px;
          background: #fff;
        }
        @media(max-width: 900px) {
          .ntv-layout { grid-template-columns: 215px minmax(0,1fr); }
          .ntv-sidebar { padding: 20px 12px; }
          .ntv-main { padding: 25px 20px; }
        }
        @media(max-width: 680px) {
          .ntv-topbar { height: 64px; padding: 0 15px; }
          .ntv-logo-mark { width: 35px; height: 35px; }
          .ntv-top-link span { display: none; }
          .ntv-icon-button { display: inline-flex; padding: 9px; }
          .ntv-layout { display: block; min-height: calc(100vh - 64px); }
          .ntv-sidebar {
            display: none;
            position: fixed;
            z-index: 30;
            top: 64px;
            bottom: 0;
            left: 0;
            width: 270px;
            max-width: 85vw;
            box-shadow: 12px 0 30px #18223018;
          }
          .ntv-sidebar.open { display: flex; }
          .ntv-main { padding: 23px 14px; }
          .ntv-page-heading { flex-direction: column; }
          .ntv-stats { grid-template-columns: 1fr; gap: 10px; }
          .ntv-stat { padding: 16px; }
          .ntv-stat strong { font-size: 25px; margin-top: 9px; }
          .ntv-store-banner { align-items: flex-start; flex-direction: column; padding: 19px; }
          .ntv-panel { padding: 16px; }
          .ntv-product-form { grid-template-columns: 1fr; }
          .ntv-field-full, .ntv-form-actions { grid-column: auto; }
          .ntv-product-row { grid-template-columns: 49px minmax(0,1fr); }
          .ntv-product-row img, .ntv-product-placeholder { width: 49px; height: 49px; }
          .ntv-row-actions { grid-column: 2; }
          .ntv-panel-heading { align-items: flex-start; flex-direction: column; }
          .ntv-search { width: 100%; box-sizing: border-box; }
        }
      `}</style>

      <header className="ntv-topbar">
        <a href="/" className="ntv-logo">
          <span className="ntv-logo-mark"><Store size={21} /></span>
          <span>
            NEWS TECHNOLOGY
            <small>V I L L A G E</small>
          </span>
        </a>

        <div className="ntv-top-actions">
          {storeUrl && canVisitStore && (
            <a className="ntv-top-link" href={storeUrl} target="_blank" rel="noreferrer">
              <Globe size={16} />
              <span>Voir ma boutique</span>
              <ExternalLink size={13} />
            </a>
          )}
          <a className="ntv-top-link" href="/">
            <ShoppingBag size={16} />
            <span>Catalogue général</span>
          </a>
          {user && (
            <button
              className="ntv-icon-button"
              onClick={() => setMobileNav(!mobileNav)}
              aria-label="Ouvrir le menu"
            >
              {mobileNav ? <X size={19} /> : <Menu size={19} />}
            </button>
          )}
        </div>
      </header>

      {!user ? (
        <div className="ntv-auth-wrap">
          <section className="ntv-auth-card">
            <div className="ntv-auth-icon"><UserRound size={25} /></div>
            <div className="ntv-eyebrow" style={{ marginTop: 22 }}>Espace NTV</div>
            <h1>{mode === "login" ? "Heureux de vous revoir." : "Créer votre compte."}</h1>
            <p>
              Connectez-vous à votre espace ou rejoignez la marketplace
              NEWS TECHNOLOGY VILLAGE.
            </p>

            <div className="ntv-auth-tabs">
              <button
                type="button"
                className={mode === "login" ? "selected" : ""}
                onClick={() => { setMode("login"); setShowPasswordRecovery(false); setError(""); setMessage(""); }}
              >
                Connexion
              </button>
              <button
                type="button"
                className={mode === "register" ? "selected" : ""}
                onClick={() => { setMode("register"); setShowPasswordRecovery(false); setError(""); setMessage(""); }}
              >
                Inscription
              </button>
            </div>

            {!showPasswordRecovery && <form className="ntv-auth-form" onSubmit={submit}>
              {mode === "register" && (
                <>
                  <label className="ntv-field">
                    Type de compte
                    <select
                      value={form.role}
                      onChange={e => { setForm({ ...form, role: e.target.value }); setLegalAccepted(false); }}
                    >
                      <option value="customer">Client (gratuit)</option>
                      <option value="seller">Commerçant / vendeur</option>
                      <option value="delivery">Livreur</option>
                    </select>
                  </label>

                  <label className="ntv-field">
                    Nom complet
                    <input
                      required
                      minLength="2"
                      value={form.name}
                      onChange={e => setForm({ ...form, name: e.target.value })}
                      autoComplete="name"
                    />
                  </label>

                  <div className="ntv-product-form">
                    <label className="ntv-field">
                      Téléphone
                      <input
                        required
                        value={form.phone}
                        onChange={e => setForm({ ...form, phone: e.target.value })}
                        autoComplete="tel"
                      />
                    </label>
                    <label className="ntv-field">
                      Pays
                      <select
                        value={form.country}
                        onChange={e => setForm({ ...form, country: e.target.value })}
                      >
                        {["Bénin", "Togo", "Nigeria", "Burkina Faso", "Niger", "Côte d’Ivoire", "Ghana", "Sénégal", "Autre"].map(country => (
                          <option key={country}>{country}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {form.role === "seller" && (
                    <>
                      <label className="ntv-field">
                        Nom du commerce / entreprise
                        <input
                          required
                          value={form.businessName}
                          onChange={e => setForm({ ...form, businessName: e.target.value })}
                          placeholder="Nom de votre boutique"
                        />
                      </label>
                      <label className="ntv-field">
                        Formule commerciale obligatoire
                        <select required value={form.plan} onChange={e => setForm({ ...form, plan: e.target.value })}>
                          <option value="">Choisir une formule</option>
                          <option value="commission">Vendeur à commission – 5 % sur chaque vente, sans abonnement</option>
                          <option value="limited">Vendeur accès limité – 2 500 FCFA / mois, sans commission</option>
                          <option value="vip">Vendeur VIP – 5 000 FCFA / mois, sans commission</option>
                        </select>
                      </label>
                      {form.plan && <div className="ntv-notice"><ShieldCheck size={17}/>{form.plan === "commission" ? "NTV prélèvera une commission de 5 % sur chaque vente. Aucun abonnement mensuel." : `Abonnement de ${form.plan === "vip" ? "5 000" : "2 500"} FCFA par mois. Aucune commission sur vos ventes. L'accès à la boutique sera activé après validation du paiement par NTV.`}</div>}
                      <label className="ntv-field">
                        Présentation de votre activité
                        <textarea
                          value={form.businessDescription}
                          onChange={e => setForm({ ...form, businessDescription: e.target.value })}
                          placeholder="Décrivez votre commerce et vos produits..."
                        />
                      </label>
                    </>
                  )}

                  {form.role === "delivery" && (
                    <label className="ntv-field">
                      Zones de livraison couvertes
                      <textarea
                        value={form.deliveryZones}
                        onChange={e => setForm({ ...form, deliveryZones: e.target.value })}
                        placeholder="Villes, communes et quartiers desservis"
                      />
                    </label>
                  )}
                  <div className="ntv-panel" style={{ padding: 14, display: "grid", gap: 10 }}>
                    <strong>{legalDocuments[form.role].title}</strong>
                    <p style={{ margin: 0, color: "#667085" }}>{legalDocuments[form.role].intro}</p>
                    <details>
                      <summary style={{ cursor: "pointer", fontWeight: 700 }}>Lire le règlement complet</summary>
                      <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                        {legalDocuments[form.role].sections.map(([heading, body]) => <div key={heading}><b>{heading}</b><p style={{ margin: "4px 0 0", color: "#667085" }}>{body}</p></div>)}
                      </div>
                    </details>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13, lineHeight: 1.5 }}>
                      <input type="checkbox" required checked={legalAccepted} onChange={e => setLegalAccepted(e.target.checked)} style={{ marginTop: 3 }} />
                      <span>J'ai lu et j'accepte le règlement et les conditions d'utilisation NTV applicables à mon compte.</span>
                    </label>
                    <small style={{ color: "#778397" }}>Version {LEGAL_VERSION}. L'acceptation et sa date sont enregistrées pour le suivi du compte.</small>
                  </div>
                </>
              )}

              <label className="ntv-field">
                Adresse e-mail
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  autoComplete="email"
                />
              </label>

              <label className="ntv-field">
                Mot de passe
                <input
                  required
                  type="password"
                  minLength="10"
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                />
                {mode === "register" && <small>10 caractères minimum.</small>}
              </label>

              {error && <div className="ntv-alert ntv-alert-error">{error}</div>}
              {message && <div className="ntv-alert ntv-alert-success">{message}</div>}

              <button className="ntv-button" type="submit" disabled={busy}>
                {busy ? "Veuillez patienter..." :
                  mode === "login" ? "Se connecter" :
                  form.role === "customer" ? "Créer mon compte client" : "Envoyer ma demande"}
                <ChevronRight size={16} />
              </button>
            </form>}

            {mode === "login" && !showPasswordRecovery && <button type="button" className="ntv-button ntv-button-light" style={{ width: "100%", marginTop: 12 }} onClick={() => { setShowPasswordRecovery(true); setError(""); setMessage(""); }}>Mot de passe oublié ?</button>}
            {showPasswordRecovery && <PasswordRecoveryRequest onBack={() => { setShowPasswordRecovery(false); setMode("login"); setError(""); setMessage(""); }} />}

            <div className="ntv-auth-foot">
              <ShieldCheck size={13} style={{ verticalAlign: "middle" }} />
              {" "}Vos identifiants restent confidentiels.
            </div>
          </section>
        </div>
      ) : (
        <div className="ntv-layout">
          <aside className={`ntv-sidebar ${mobileNav ? "open" : ""}`}>
            <div className="ntv-user-mini">
              <div className="ntv-avatar">
                {user.profileImageUrl ? <img src={user.profileImageUrl} alt="Photo de profil" /> : (user.name || user.email || "N").charAt(0).toUpperCase()}
              </div>
              <strong>{user.name || "Utilisateur NTV"}</strong>
              <span>{roleName} · {statusLabel(user.status)}</span>
            </div>

            {isDeliveryActive ? (
              <>
                <p className="ntv-side-label">Espace livreur</p>
                <button className={`ntv-nav-button ${activeTab === "dashboard" ? "selected" : ""}`} onClick={() => { setActiveTab("dashboard"); loadDeliveryWorkspace(); }}><Truck size={18} /> Mes missions</button>
                <button className={`ntv-nav-button ${activeTab === "communications" ? "selected" : ""}`} onClick={() => { setActiveTab("communications"); setMobileNav(false); }}><MessageCircle size={18} /> Communication</button>
                <button className={`ntv-nav-button ${activeTab === "complaints" ? "selected" : ""}`} onClick={() => { setActiveTab("complaints"); setMobileNav(false); }}><AlertCircle size={18} /> Réclamations</button>
                <button className={`ntv-nav-button ${activeTab === "rules" ? "selected" : ""}`} onClick={() => { setActiveTab("rules"); setMobileNav(false); }}><ShieldCheck size={18} /> Règlement NTV</button>
              </>
            ) : isSellerActive ? (
              <>
                <p className="ntv-side-label">Espace vendeur</p>
                {navigation.map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={`ntv-nav-button ${activeTab === item.id ? "selected" : ""}`}
                      onClick={() => { setActiveTab(item.id); setMobileNav(false); }}
                    >
                      <Icon size={18} />
                      {item.label}
                      {activeTab === item.id && <ChevronRight size={15} style={{ marginLeft: "auto" }} />}
                    </button>
                  );
                })}
                <a
                  className="ntv-nav-button"
                  href={storeUrl || "/"}
                  target={storeUrl ? "_blank" : undefined}
                  rel="noreferrer"
                >
                  <Globe size={18} /> Ma boutique publique
                  <ArrowUpRight size={14} style={{ marginLeft: "auto" }} />
                </a>
              </>
            ) : user?.role === "customer" ? (
              <>
                <p className="ntv-side-label">Mon espace client</p>
                <button className={`ntv-nav-button ${activeTab === "dashboard" ? "selected" : ""}`} onClick={() => { setActiveTab("dashboard"); setMobileNav(false); }}><LayoutDashboard size={18}/> Tableau de bord</button>
                <button className={`ntv-nav-button ${activeTab === "orders" ? "selected" : ""}`} onClick={() => { setActiveTab("orders"); setMobileNav(false); }}><ShoppingBag size={18}/> Mes commandes <span style={{ marginLeft: "auto", fontSize: 11 }}>{orders.length || ""}</span></button>
                <a className="ntv-nav-button" href="/"><Store size={18}/> Faire mes achats <ArrowUpRight size={14} style={{ marginLeft: "auto" }}/></a>
                <button className={`ntv-nav-button ${activeTab === "communications" ? "selected" : ""}`} onClick={() => { setActiveTab("communications"); setMobileNav(false); }}><MessageCircle size={18}/> Service client NTV</button>
                <button className={`ntv-nav-button ${activeTab === "complaints" ? "selected" : ""}`} onClick={() => { setActiveTab("complaints"); setMobileNav(false); }}><AlertCircle size={18}/> Réclamations</button>
                <button className={`ntv-nav-button ${activeTab === "rules" ? "selected" : ""}`} onClick={() => { setActiveTab("rules"); setMobileNav(false); }}><ShieldCheck size={18}/> Règlement NTV</button>
              </>
            ) : (
              <>
                <p className="ntv-side-label">Mon compte</p>
                <a className="ntv-nav-button" href="/"><ShoppingBag size={18} /> Catalogue général</a>
              </>
            )}

            <button className={`ntv-nav-button ${activeTab === "profile" ? "selected" : ""}`} onClick={() => { setActiveTab("profile"); setMobileNav(false); }}>
              <UserRound size={18} /> Mon profil
            </button>
            <div className="ntv-sidebar-bottom">
              <div className="ntv-sidebar-note">
                <ShieldCheck size={19} />
                <strong>Plateforme NTV</strong>
                <br />
                Les commandes et les paiements sont suivis par l'administration centrale.
              </div>
              <button className="ntv-nav-button" onClick={logout} style={{ marginTop: 15 }}>
                <LogOut size={18} /> Se déconnecter
              </button>
            </div>
          </aside>

          <main className="ntv-main">
            <CommunicationCenter role={user.role} globalOnly />
            {user.termsVersion !== LEGAL_VERSION ? (
              <section className="ntv-panel" style={{ maxWidth: 850, margin: "30px auto", display: "grid", gap: 14 }}>
                <div className="ntv-eyebrow">Mise à jour obligatoire</div>
                <h1 style={{ margin: 0 }}>Veuillez accepter le règlement NTV</h1>
                <p>Les conditions d'utilisation ont été mises à jour. Vous devez les lire et les accepter avant de continuer à utiliser votre espace.</p>
                <h2>{legalDocuments[user.role]?.title || "Conditions d'utilisation NTV"}</h2>
                {legalDocuments[user.role]?.sections.map(([heading, body]) => <div key={heading}><b>{heading}</b><p style={{ margin: "4px 0 0", color: "#667085" }}>{body}</p></div>)}
                <label style={{ display: "flex", alignItems: "flex-start", gap: 9 }}><input type="checkbox" checked={legalGateAccepted} onChange={e => setLegalGateAccepted(e.target.checked)} style={{ marginTop: 4 }}/><span>J'ai lu et j'accepte les conditions d'utilisation NTV applicables à mon compte.</span></label>
                {workspaceError && <div className="ntv-alert ntv-alert-error">{workspaceError}</div>}
                <button className="ntv-button" disabled={!legalGateAccepted || acceptingTerms} onClick={acceptUpdatedTerms}>{acceptingTerms ? "Enregistrement…" : "Accepter et continuer"}</button>
              </section>
            ) : activeTab === "rules" ? (
              <><div className="ntv-page-heading"><div><div className="ntv-eyebrow">Documents NTV</div><h1>{legalDocuments[user.role]?.title}</h1><p>Version {LEGAL_VERSION} · Acceptation enregistrée dans votre compte.</p></div></div><section className="ntv-panel" style={{ display: "grid", gap: 16 }}>{legalDocuments[user.role]?.sections.map(([heading, body]) => <div key={heading}><h3>{heading}</h3><p>{body}</p></div>)}</section></>
            ) : activeTab === "complaints" ? (
              <>
                <div className="ntv-page-heading"><div><div className="ntv-eyebrow">Assistance NTV</div><h1>Réclamations et plaintes</h1><p>Déposez une demande et suivez son traitement par l'administration.</p></div></div>
                <ComplaintsCenter role={user.role} />
              </>
            ) : activeTab === "communications" && (user.role === "customer" || user.role === "delivery" || isSellerActive) ? (
              <>
                <div className="ntv-page-heading"><div><div className="ntv-eyebrow">Centre de communication</div><h1>{user.role === "customer" ? "Service client NTV" : user.role === "delivery" ? "Communication livreur NTV" : "Messagerie avec NTV"}</h1><p>Retrouvez vos échanges, les réponses de l'équipe et vos notifications.</p></div></div>
                {(user.notifications || []).filter(item => !item.read).length > 0 && <div className="ntv-notice" style={{ marginBottom: 16 }}><Bell size={17}/><div><b>Notifications non lues</b>{user.notifications.filter(item => !item.read).map((item, i) => <p key={i}>{item.message}</p>)}<button className="ntv-button ntv-button-light" onClick={async () => { try { const data = await apiRequest("/api/communications/notifications/read", { method: "PATCH" }); const updated = { ...user, notifications: data.notifications || [] }; setUser(updated); localStorage.setItem("ntv_user", JSON.stringify(updated)); } catch (e) { setWorkspaceError(e.message); } }}>Marquer comme lues</button></div></div>}
                <CommunicationCenter role={user.role} />
              </>
            ) : activeTab === "profile" ? (
              <>
                <div className="ntv-page-heading"><div><div className="ntv-eyebrow">Compte personnel</div><h1>Mon profil</h1><p>Personnalisez votre espace NTV avec une photo de profil.</p></div></div>
                <section className="ntv-panel" style={{ maxWidth: 760 }}>
                  <div className="ntv-panel-heading"><div><h2>Photo de profil</h2><p>Cette photo apparaîtra dans votre espace {roleName.toLowerCase()}.</p></div></div>
                  <div style={{ display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
                    <div className="ntv-avatar" style={{ width: 96, height: 96, borderRadius: 24, fontSize: 32, margin: 0 }}>
                      {user.profileImageUrl ? <img src={user.profileImageUrl} alt="Votre photo de profil" /> : (user.name || user.email || "N").charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: "1 1 250px" }}>
                      <strong>{user.name}</strong><p style={{ color: "#7c8798", margin: "6px 0 14px" }}>{user.email}</p>
                      <label className="ntv-button" style={{ display: "inline-flex", cursor: avatarBusy ? "wait" : "pointer" }}>
                        <ImagePlus size={16} /> {avatarBusy ? "Enregistrement..." : "Choisir une photo"}
                        <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadProfilePhoto} disabled={avatarBusy} style={{ display: "none" }} />
                      </label>
                      <small style={{ display: "block", color: "#8a94a4", marginTop: 9 }}>JPG, PNG, WEBP ou GIF · 6 Mo maximum</small>
                    </div>
                  </div>
                  {avatarError && <div className="ntv-alert ntv-alert-error" style={{ marginTop: 18 }}>{avatarError}</div>}
                  {avatarMessage && <div className="ntv-alert ntv-alert-success" style={{ marginTop: 18 }}>{avatarMessage}</div>}
                </section>
              </>
            ) : !isActive && user.role !== "customer" ? (
              <>
                <div className="ntv-page-heading">
                  <div>
                    <div className="ntv-eyebrow">Validation du compte</div>
                    <h1>Bienvenue, {user.name}</h1>
                    <p>Votre demande d'accès professionnel est en cours d'examen.</p>
                  </div>
                  <a className="ntv-button ntv-button-light" href="/">
                    <ArrowLeft size={15} /> Retour au catalogue
                  </a>
                </div>
                <div className="ntv-pending">
                  <Clock size={23} />
                  <div>
                    <strong>Votre compte est en attente de validation.</strong>
                    <br />
                    L'équipe NTV doit approuver votre compte avant que vous puissiez
                    accéder aux fonctionnalités professionnelles. Vous pourrez
                    revenir dans cet espace après validation.
                  </div>
                </div>
              </>
            ) : isDeliveryActive ? (
              <>
                <div className="ntv-page-heading">
                  <div>
                    <div className="ntv-eyebrow">Espace livreur</div>
                    <h1>Mes missions de livraison</h1>
                    <p>Consultez les missions disponibles, acceptez-en une et actualisez son avancement.</p>
                  </div>
                  <button className="ntv-button ntv-button-light" onClick={loadDeliveryWorkspace} disabled={loadingWorkspace}><RefreshCw size={15} /> Actualiser</button>
                </div>
                {workspaceError && <div className="ntv-alert ntv-alert-error"><AlertCircle size={15} /> {workspaceError}</div>}
                {productMessage && <div className="ntv-alert ntv-alert-success"><CircleCheck size={15} /> {productMessage}</div>}
                <div className="ntv-panel">
                  <div className="ntv-panel-heading"><div><h2>Liste des missions</h2><p>{deliveryMissions.length} mission(s) disponible(s) ou attribuée(s) à votre compte.</p></div></div>
                  {deliveryMissions.length === 0 ? <div className="ntv-empty"><Truck size={30} /><strong>Aucune mission pour le moment</strong><p>Les nouvelles missions apparaîtront ici après publication par NTV.</p></div> : deliveryMissions.map(mission => (
                    <article className="ntv-order-card" key={mission.id}>
                      <div className="ntv-order-head"><div><b>{mission.orderId}</b><span>{mission.delivery?.status === "available" ? "Mission disponible" : "Mission acceptée"}</span></div><strong>{money(mission.total)}</strong></div>
                      <div className="ntv-order-customer"><b>{mission.customer?.name || "Client"}</b><p>{mission.customer?.address || "Adresse non renseignée"}</p><span>{mission.customer?.phone || "Téléphone non renseigné"}</span></div>
                      <div className="ntv-order-items">{(mission.items || []).map((item,i)=><span key={i}>{item.name} × {item.quantity}</span>)}</div>
                      <div className="ntv-order-workflow"><div className="ntv-order-current"><b>Statut : {mission.delivery?.status || "available"}</b><p>{mission.delivery?.name ? `Attribuée à ${mission.delivery.name}` : "Cette mission attend un livreur."}</p></div><div className="ntv-order-actions">
                        {mission.delivery?.status === "available" ? <button className="ntv-button" disabled={loadingWorkspace} onClick={()=>deliveryAction(mission,"accept")}>Accepter la mission</button> : <>
                          {mission.delivery?.status === "accepted" && <button className="ntv-button" disabled={loadingWorkspace} onClick={()=>deliveryAction(mission,"status","picked_up")}>Confirmer la récupération</button>}
                          {mission.delivery?.status === "picked_up" && <button className="ntv-button" disabled={loadingWorkspace} onClick={()=>deliveryAction(mission,"status","in_transit")}>Démarrer la livraison</button>}
                          {mission.delivery?.status === "in_transit" && <button className="ntv-button" disabled={loadingWorkspace} onClick={()=>deliveryAction(mission,"status","delivered")}>Confirmer la livraison</button>}
                          {mission.delivery?.status === "delivered" && <strong>Livraison terminée</strong>}
                        </>}
                      </div></div>
                    </article>
                  ))}
                </div>
              </>
            ) : user.role === "customer" ? (
              <>
                <div className="ntv-page-heading">
                  <div>
                    <div className="ntv-eyebrow">Espace client NTV</div>
                    <h1>{activeTab === "orders" ? "Mes commandes" : `Bonjour, ${user.name || "cher client"}.`}</h1>
                    <p>{activeTab === "orders" ? "Retrouvez vos achats et suivez chaque étape de livraison." : "Achetez plus facilement et gardez toutes vos commandes au même endroit."}</p>
                  </div>
                  <button className="ntv-button ntv-button-light" onClick={loadCustomerOrders} disabled={customerOrdersBusy}><RefreshCw size={15}/> {customerOrdersBusy ? "Actualisation..." : "Actualiser"}</button>
                </div>
                {workspaceError && <div className="ntv-alert ntv-alert-error"><AlertCircle size={15}/> {workspaceError}</div>}
                {activeTab === "orders" ? (
                  <section className="ntv-panel">
                    <div className="ntv-panel-heading"><div><h2>Historique de mes achats</h2><p>{orders.length} commande(s) retrouvée(s) avec le téléphone de votre compte.</p></div><ShoppingBag size={20}/></div>
                    {customerOrdersBusy && orders.length === 0 ? <div className="ntv-empty"><RefreshCw size={28}/><strong>Chargement de vos commandes...</strong></div> : orders.length === 0 ? (
                      <div className="ntv-empty"><ShoppingBag size={32}/><strong>Vous n'avez pas encore de commande associée à ce compte.</strong><p>Vos achats effectués avec le numéro de téléphone enregistré dans votre compte apparaîtront ici.</p><a className="ntv-button" href="/">Commencer mes achats <ArrowUpRight size={15}/></a></div>
                    ) : orders.map((order, index) => (
                      <article className="ntv-order-card" key={order.orderId || order.id || index}>
                        <div className="ntv-order-head"><div><strong>{order.orderId || `Commande ${index + 1}`}</strong><small className="ntv-order-date">{order.createdAt ? new Date(order.createdAt).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" }) : "Date non renseignée"}</small></div><span className="ntv-order-status">{statusLabel(order.status)}</span></div>
                        {(order.items || []).map((item, itemIndex) => <div className="ntv-order-line" key={`${item.id || item.name}-${itemIndex}`}><span>{item.name} × {item.quantity}</span><strong>{money(Number(item.price || 0) * Number(item.quantity || 0))}</strong></div>)}
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", borderTop: "1px solid #edf0f5", paddingTop: 12, marginTop: 10 }}><span style={{ color: "#667085", fontSize: 13 }}>Paiement : {order.paymentMethod || "À confirmer"}</span><strong>Total : {money(order.total)}</strong></div>
                        <div style={{ marginTop: 15, padding: 14, borderRadius: 12, background: "#f7f9fc" }}>
                          <strong style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}><Truck size={16}/> Suivi de la commande</strong>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(125px,1fr))", gap: 9, marginTop: 12 }}>
                            {(order.history || []).slice(-4).map((event, eventIndex) => <div key={`${event.status}-${eventIndex}`} style={{ background: "#fff", border: "1px solid #e7ecf3", borderRadius: 9, padding: 10 }}><span style={{ display: "block", color: "#2463d3", marginBottom: 5 }}><CheckCircle2 size={16}/></span><b style={{ display: "block", fontSize: 12 }}>{event.status}</b><small style={{ color: "#7b8798", fontSize: 10 }}>{event.at ? new Date(event.at).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : ""}</small>{event.note && <small style={{ display: "block", color: "#7b8798", marginTop: 4 }}>{event.note}</small>}</div>)}
                            {(!order.history || order.history.length === 0) && <p style={{ margin: 0, color: "#667085", fontSize: 12 }}>Commande enregistrée. Les prochaines étapes apparaîtront ici.</p>}
                          </div>
                          <div style={{ marginTop: 10, color: "#667085", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}><MapPin size={14}/> Livraison : {statusLabel(order.delivery?.status || "unassigned")}{order.delivery?.name ? ` · ${order.delivery.name}` : ""}</div>
                        </div>
                        <div style={{ display: "flex", gap: 9, flexWrap: "wrap", marginTop: 13 }}><button className="ntv-button ntv-button-light" onClick={() => { setActiveTab("communications"); setMobileNav(false); }}> <MessageCircle size={15}/> Contacter NTV</button><a className="ntv-button ntv-button-light" href="/">Commander à nouveau <ArrowUpRight size={15}/></a></div>
                      </article>
                    ))}
                  </section>
                ) : (
                  <>
                    <section className="ntv-store-banner" style={{ marginBottom: 18 }}><div><small>VOTRE ESPACE PERSONNEL</small><h2>Vos achats, simplement.</h2><p>Retrouvez vos commandes, suivez vos livraisons et contactez notre équipe depuis un seul endroit.</p></div><a className="ntv-button" href="/">Voir le catalogue <ArrowUpRight size={15}/></a></section>
                    <div className="ntv-stats">
                      <div className="ntv-stat"><div className="ntv-stat-top">Mes commandes <span className="ntv-stat-icon"><ShoppingBag size={19}/></span></div><strong>{orders.length}</strong><small>Achats enregistrés avec ce compte</small></div>
                      <div className="ntv-stat"><div className="ntv-stat-top">En cours <span className="ntv-stat-icon"><Truck size={19}/></span></div><strong>{orders.filter(order => !["Livrée", "Livré", "Annulée", "Annulé", "delivered", "cancelled"].includes(order.status)).length}</strong><small>Commandes à suivre</small></div>
                      <div className="ntv-stat"><div className="ntv-stat-top">Notifications <span className="ntv-stat-icon"><Bell size={19}/></span></div><strong>{(user.notifications || []).filter(item => !item.read).length}</strong><small>Informations non lues</small></div>
                    </div>
                    <section className="ntv-panel"><div className="ntv-panel-heading"><div><h2>Accès rapides</h2><p>Les actions les plus utiles pour votre compte.</p></div></div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><a className="ntv-button" href="/"> <ShoppingBag size={16}/> Faire un achat</a><button className="ntv-button ntv-button-light" onClick={() => setActiveTab("orders")}><Truck size={16}/> Suivre mes commandes</button><button className="ntv-button ntv-button-light" onClick={() => setActiveTab("communications")}><MessageCircle size={16}/> Écrire au service client</button></div></section>
                    <section className="ntv-panel"><div className="ntv-panel-heading"><div><h2>Mes dernières commandes</h2><p>Consultez rapidement l'avancement de vos achats.</p></div><button className="ntv-button ntv-button-light" onClick={() => setActiveTab("orders")}>Tout voir <ChevronRight size={15}/></button></div>{orders.length === 0 ? <div className="ntv-empty"><ShoppingBag size={28}/><strong>Aucun achat pour le moment</strong><p>Lorsque vous passerez une commande avec le numéro de votre compte, elle apparaîtra ici.</p><a className="ntv-button" href="/">Découvrir les produits <ArrowUpRight size={15}/></a></div> : orders.slice(0, 3).map((order, index) => <div className="ntv-order-card" key={order.orderId || index}><div className="ntv-order-head"><strong>{order.orderId}</strong><span className="ntv-order-status">{statusLabel(order.status)}</span></div><div className="ntv-order-line"><span>{(order.items || []).length} article(s)</span><strong>{money(order.total)}</strong></div><small className="ntv-order-date">{order.createdAt ? new Date(order.createdAt).toLocaleDateString("fr-FR") : ""}</small></div>)}</section>
                  </>
                )}
              </>
            ) : isSellerActive ? (
              <>
                <div className="ntv-page-heading">
                  <div>
                    <div className="ntv-eyebrow">Tableau de bord professionnel</div>
                    <h1>
                      {activeTab === "products" ? "Gestion de mes produits" :
                       activeTab === "orders" ? "Mes commandes" :
                       `Bonjour, ${user.name || "vendeur"}.`}
                    </h1>
                    <p>
                      {activeTab === "orders"
                        ? "Consultez les commandes contenant vos articles."
                        : activeTab === "products"
                          ? "Gérez le catalogue de votre boutique."
                          : "Suivez l'activité de votre boutique sur NTV."}
                    </p>
                  </div>
                  <button
                    className="ntv-button ntv-button-light"
                    onClick={loadSellerWorkspace}
                    disabled={loadingWorkspace}
                  >
                    <RefreshCw size={15} /> Actualiser
                  </button>
                </div>

                {workspaceError && (
                  <div className="ntv-alert ntv-alert-error">
                    <AlertCircle size={15} style={{ verticalAlign: "middle" }} /> {workspaceError}
                  </div>
                )}
                {productMessage && (
                  <div className="ntv-alert ntv-alert-success">
                    <CircleCheck size={15} style={{ verticalAlign: "middle" }} /> {productMessage}
                  </div>
                )}

                {activeTab === "dashboard" && (
                  <>
                    <div className={`ntv-plan-banner ${sellerSubscriptionValid ? "is-valid" : "is-pending"}`}>
                      <div><strong>{sellerPlanName}</strong><span>{user?.plan === "commission" ? "Commission NTV : 5 % sur chaque vente · Aucun abonnement mensuel" : `${sellerPlanPrice.toLocaleString("fr-FR")} FCFA / mois · 0 % de commission`}</span></div>
                      {user?.plan !== "commission" && <small>{sellerSubscriptionValid ? (sellerSubscriptionDaysLeft <= 7 ? `Rappel : renouvellement à prévoir dans ${Math.max(0, sellerSubscriptionDaysLeft)} jour(s).` : `Abonnement valable jusqu'au ${new Date(user.subscriptionExpiresAt).toLocaleDateString("fr-FR")}`) : "Abonnement en attente de paiement ou de renouvellement. Contactez NTV pour faire valider votre règlement."}</small>}
                    </div>
                    {(user?.notifications || []).filter(item => !item.read).length > 0 && <div className="ntv-notice ntv-seller-notifications"><Bell size={17}/><div><strong>Notifications NTV</strong>{user.notifications.filter(item => !item.read).map((item, index) => <p key={`${item.type}-${index}`}>{item.message}</p>)}<button type="button" onClick={markSellerNotificationsRead}>Marquer comme lues</button></div></div>}
                    <div className="ntv-store-banner">
                      <div>
                        <small>VOTRE BOUTIQUE SUR NTV</small>
                        <h2>{user.businessName || user.name}</h2>
                        <p>{canVisitStore ? "Votre vitrine est accessible aux clients de la marketplace." : "Votre vitrine sera visible après validation de votre abonnement par NTV."}</p>
                      </div>
                      {storeUrl && canVisitStore ? (
                        <a className="ntv-button" href={storeUrl} target="_blank" rel="noreferrer">
                          Voir ma boutique <ExternalLink size={15} />
                        </a>
                      ) : (
                        <span>{storeUrl ? "Boutique en attente d'activation" : "Adresse boutique indisponible"}</span>
                      )}
                    </div>

                    <div className="ntv-stats">
                      <div className="ntv-stat">
                        <div className="ntv-stat-top">
                          Mes produits
                          <span className="ntv-stat-icon"><Package size={19} /></span>
                        </div>
                        <strong>{products.length}</strong>
                        <small>Produits enregistrés dans ma boutique</small>
                      </div>
                      <div className="ntv-stat">
                        <div className="ntv-stat-top">
                          Mes commandes
                          <span className="ntv-stat-icon"><ShoppingBag size={19} /></span>
                        </div>
                        <strong>{orderCount}</strong>
                        <small>Commandes contenant mes articles</small>
                      </div>
                      <div className="ntv-stat">
                        <div className="ntv-stat-top">
                          Stock total
                          <span className="ntv-stat-icon"><Boxes size={19} /></span>
                        </div>
                        <strong>{totalStock}</strong>
                        <small>Unités déclarées en stock</small>
                      </div>
                    </div>

                    <div className="ntv-panel">
                      <div className="ntv-panel-heading">
                        <div>
                          <h2>Accès rapides</h2>
                          <p>Les principales actions de votre espace vendeur.</p>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                        <button className="ntv-button" onClick={startNewProduct}>
                          <Plus size={16} /> Ajouter un produit
                        </button>
                        <button
                          className="ntv-button ntv-button-light"
                          onClick={() => setActiveTab("orders")}
                        >
                          <Eye size={16} /> Consulter mes commandes
                        </button>
                        <a className="ntv-button ntv-button-light" href="/">
                          <Globe size={16} /> Catalogue général
                        </a>
                      </div>
                    </div>

                    <div className="ntv-panel">
                      <div className="ntv-panel-heading">
                        <div>
                          <h2>Activité récente</h2>
                          <p>Les dernières commandes contenant vos articles.</p>
                        </div>
                        <button className="ntv-button ntv-button-light" onClick={() => setActiveTab("orders")}>
                          Tout voir <ChevronRight size={15} />
                        </button>
                      </div>
                      {orders.length === 0 ? (
                        <div className="ntv-empty">
                          <ShoppingBag size={30} />
                          <strong>Aucune commande pour le moment</strong>
                          <p>Les commandes concernant vos produits apparaîtront ici.</p>
                        </div>
                      ) : (
                        orders.slice(0, 3).map((order, index) => (
                          <div className="ntv-order-card" key={order.orderId || order._id || index}>
                            <div className="ntv-order-head">
                              <strong>Commande {order.orderId || order._id || `#${index + 1}`}</strong>
                              <span className="ntv-order-status">{statusLabel(order.status)}</span>
                            </div>
                            {(order.items || []).map((item, itemIndex) => (
                              <div className="ntv-order-line" key={item.id || item._id || itemIndex}>
                                <span>{item.name} × {item.quantity}</span>
                                <strong>{money(Number(item.price || 0) * Number(item.quantity || 0))}</strong>
                              </div>
                            ))}
                          </div>
                        ))
                      )}
                    </div>
                  </>
                )}

                {activeTab === "products" && (
                  <>
                    <div className="ntv-panel">
                      <div className="ntv-panel-heading">
                        <div>
                          <h2>{editingProduct ? "Modifier le produit" : "Ajouter un produit"}</h2>
                          <p>Les informations seront visibles dans votre boutique après enregistrement.</p>
                        </div>
                        <span className="ntv-stat-icon"><ImagePlus size={19} /></span>
                      </div>

                      <form className="ntv-product-form" onSubmit={saveProduct}>
                        <label className="ntv-field">
                          Nom du produit
                          <input
                            required
                            value={productForm.name}
                            onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                            placeholder="Ex. : Panneau solaire"
                          />
                        </label>
                        <label className="ntv-field">
                          Catégorie
                          <input
                            value={productForm.category}
                            onChange={e => setProductForm({ ...productForm, category: e.target.value })}
                            placeholder="Ex. : Énergie solaire"
                          />
                        </label>
                        <label className="ntv-field">
                          Prix (FCFA)
                          <input
                            required
                            type="number"
                            min="0"
                            value={productForm.price}
                            onChange={e => setProductForm({ ...productForm, price: e.target.value })}
                          />
                        </label>
                        <label className="ntv-field">
                          Quantité en stock
                          <input
                            type="number"
                            min="0"
                            value={productForm.stock}
                            onChange={e => setProductForm({ ...productForm, stock: e.target.value })}
                          />
                        </label>
                        <label className="ntv-field ntv-field-full">
                          Description
                          <textarea
                            rows="3"
                            value={productForm.description}
                            onChange={e => setProductForm({ ...productForm, description: e.target.value })}
                            placeholder="Présentez les caractéristiques du produit..."
                          />
                        </label>
                        <div className="ntv-field ntv-field-full">
                          <label htmlFor="ntv-product-images">Photos de l'article <small>Obligatoire : exactement 2 images · JPG, PNG ou WEBP · 6 Mo maximum par image</small></label>
                          {(productForm.imageUrls || []).length > 0 && productImageFiles.length === 0 && (
                            <div className="ntv-product-image-previews">
                              {productForm.imageUrls.map((url, index) => <img key={url} src={url} alt={`Photo actuelle ${index + 1}`} />)}
                            </div>
                          )}
                          <input id="ntv-product-images" type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple onChange={event => {
                            const files = Array.from(event.target.files || []);
                            if (files.length > 2) { setWorkspaceError("Vous pouvez sélectionner 2 images au maximum."); event.target.value = ""; setProductImageFiles([]); return; }
                            setWorkspaceError(""); setProductImageFiles(files);
                          }} />
                          {productImageFiles.length > 0 && <div className="ntv-product-image-previews">{productImageFiles.map((file, index) => <img key={`${file.name}-${index}`} src={URL.createObjectURL(file)} alt={`Nouvelle photo ${index + 1}`} />)}</div>}
                          <small className="ntv-image-help">{productImageFiles.length ? `${productImageFiles.length} image(s) sélectionnée(s)` : "Sélectionnez deux photos depuis votre téléphone ou ordinateur. Elles seront envoyées sur NTV."}</small>
                        </div>
                        <div className="ntv-form-actions">
                          <button className="ntv-button" type="submit" disabled={savingProduct}>
                            {savingProduct ? "Enregistrement..." :
                              editingProduct ? "Enregistrer les modifications" : "Ajouter le produit"}
                            <ChevronRight size={16} />
                          </button>
                          {editingProduct && (
                            <button
                              className="ntv-button ntv-button-light"
                              type="button"
                              onClick={() => { setEditingProduct(null); setProductForm(emptyProduct); setProductImageFiles([]); }}
                            >
                              Annuler
                            </button>
                          )}
                        </div>
                      </form>
                    </div>

                    <div className="ntv-panel">
                      <div className="ntv-panel-heading">
                        <div>
                          <h2>Mon catalogue</h2>
                          <p>{products.length} produit(s) dans votre boutique.</p>
                        </div>
                        <div className="ntv-search">
                          <Search size={15} />
                          <input
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            placeholder="Rechercher..."
                          />
                        </div>
                      </div>

                      {loadingWorkspace ? (
                        <div className="ntv-empty"><RefreshCw size={24} /><p>Chargement des produits...</p></div>
                      ) : filteredProducts.length === 0 ? (
                        <div className="ntv-empty">
                          <Package size={30} />
                          <strong>Aucun produit trouvé</strong>
                          <p>Ajoutez un produit ou modifiez votre recherche.</p>
                        </div>
                      ) : (
                        <div className="ntv-product-list">
                          {filteredProducts.map(product => (
                            <div className="ntv-product-row" key={getProductId(product)}>
                              {product.imageUrl ? (
                                <img src={product.imageUrl} alt={product.name} />
                              ) : (
                                <div className="ntv-product-placeholder"><Package size={22} /></div>
                              )}
                              <div className="ntv-product-info">
                                <strong>{product.name}</strong>
                                <span>{money(product.price)}</span>
                                <small>
                                  {product.category || "Sans catégorie"} · Stock : {product.stock ?? 0}
                                </small>
                              </div>
                              <div className="ntv-row-actions">
                                <button title="Modifier" onClick={() => startEditProduct(product)}>
                                  <Pencil size={15} />
                                </button>
                                <button className="delete" title="Supprimer" onClick={() => deleteProduct(product)}>
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </>
                )}

                {activeTab === "orders" && (
                  <div className="ntv-panel">
                    <div className="ntv-panel-heading">
                      <div>
                        <h2>Commandes contenant mes articles</h2>
                        <p>Consultation des commandes associées à votre boutique.</p>
                      </div>
                      <span className="ntv-stat-icon"><ShoppingBag size={19} /></span>
                    </div>

                    <div className="ntv-notice">
                      <ShieldCheck size={18} />
                      Confirmez chaque commande pour attester que vos articles sont disponibles. En cas d'indisponibilité, rejetez la commande en indiquant le motif. NTV conserve le contrôle général et VIP peut aussi gérer la préparation.
                    </div>

                    {orders.length === 0 ? (
                      <div className="ntv-empty">
                        <ShoppingBag size={30} />
                        <strong>Aucune commande pour le moment</strong>
                        <p>Les commandes concernant vos articles seront affichées ici.</p>
                      </div>
                    ) : (
                      orders.map((order, index) => (
                        <div className="ntv-order-card" key={order.orderId || order._id || index}>
                          <div className="ntv-order-head">
                            <strong>Commande {order.orderId || order._id || `#${index + 1}`}</strong>
                            <span className="ntv-order-status">{statusLabel(order.status)}</span>
                          </div>
                          {(order.items || []).map((item, itemIndex) => (
                            <div className="ntv-order-line" key={item.id || item._id || itemIndex}>
                              <span>{item.name} × {item.quantity}</span>
                              <strong>{money(Number(item.price || 0) * Number(item.quantity || 0))}</strong>
                            </div>
                          ))}
                          <small className="ntv-order-date">
                            Date : {order.createdAt
                              ? new Date(order.createdAt).toLocaleString("fr-FR")
                              : "Non renseignée"}
                          </small>
                          <div className={`ntv-seller-decision ${order.sellerConfirmation?.status || "pending"}`}>
                            <strong>{order.sellerConfirmation?.status === "accepted" ? "Disponibilité confirmée" : order.sellerConfirmation?.status === "rejected" ? "Commande rejetée" : "Votre confirmation est attendue"}</strong>
                            {order.sellerConfirmation?.note && <small>{order.sellerConfirmation.note}</small>}
                            {order.sellerConfirmation?.preparation && <small>Préparation : {order.sellerConfirmation.preparation.status} · {new Date(order.sellerConfirmation.preparation.at).toLocaleString("fr-FR")}</small>}
                            {order.sellerConfirmation?.status === "pending" && (
                              <div className="ntv-seller-decision-actions">
                                <button disabled={!!sellerActionBusy || !sellerSubscriptionValid} onClick={() => respondToSellerOrder(order, "accepted")}>{sellerActionBusy === `${order.id}-accepted` ? "Enregistrement..." : "Accepter la commande"}</button>
                                <button className="reject" disabled={!!sellerActionBusy || !sellerSubscriptionValid} onClick={() => respondToSellerOrder(order, "rejected")}>{sellerActionBusy === `${order.id}-rejected` ? "Enregistrement..." : "Rejeter"}</button>
                              </div>
                            )}
                            {user?.plan === "vip" && order.sellerConfirmation?.status === "accepted" && order.status !== "Livrée" && order.status !== "Annulée" && (
                              <div className="ntv-seller-decision-actions">
                                <button disabled={!!sellerActionBusy || !sellerSubscriptionValid} onClick={() => updateVipPreparation(order, "En préparation")}>En préparation</button>
                                <button disabled={!!sellerActionBusy || !sellerSubscriptionValid} onClick={() => updateVipPreparation(order, "Prête à expédier")}>Prête à expédier</button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            ) : user.role === "delivery" ? (
              <>
                <div className="ntv-page-heading">
                  <div>
                    <div className="ntv-eyebrow">Espace livreur</div>
                    <h1>Bonjour, {user.name}.</h1>
                    <p>Votre compte livreur est actif sur la plateforme NTV.</p>
                  </div>
                </div>
                <div className="ntv-notice">
                  <Truck size={20} />
                  Les missions de livraison seront affichées ici lorsqu'elles seront
                  attribuées par l'administration NTV. Seules les missions qui vous
                  sont confiées pourront être consultées.
                </div>
              </>
            ) : (
              <div className="ntv-panel">
                <h2>Votre espace</h2>
                <p>Votre compte est connecté.</p>
              </div>
            )}

            <div style={{ marginTop: 30 }}>
              <button className="ntv-nav-button" onClick={logout}>
                <LogOut size={17} /> Se déconnecter
              </button>
            </div>
          </main>
        </div>
      )}

      <footer className="ntv-footer">
        © {new Date().getFullYear()} NEWS TECHNOLOGY VILLAGE · Plateforme marketplace
      </footer>
    </div>
  );
}
