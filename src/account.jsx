
import React, { useEffect, useState } from "react";
import {
  ArrowLeft, UserRound, Store, Truck, ShoppingBag, Package,
  Plus, RefreshCw, LogOut, Eye, Pencil, Trash2, Clock,
  LayoutDashboard, Menu, X, ExternalLink, Search, Bell,
  ChevronRight, TrendingUp, ShieldCheck, CircleCheck,
  AlertCircle, ImagePlus, Boxes, Globe, ArrowUpRight
} from "lucide-react";
import "./styles.css";

const empty = {
  name: "", email: "", password: "", phone: "",
  country: "Bénin", role: "customer",
  businessName: "", businessDescription: "", deliveryZones: ""
};

const emptyProduct = {
  name: "", description: "", price: "", stock: "",
  category: "", imageUrl: ""
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
  const [activeTab, setActiveTab] = useState("dashboard");
  const [mobileNav, setMobileNav] = useState(false);
  const [productSearch, setProductSearch] = useState("");

  const isSeller = user?.role === "seller";
  const isActive = user?.status === "active";
  const isSellerActive = isSeller && isActive;

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
        setMessage(
          form.role === "customer"
            ? "Votre compte client est créé. Vous pouvez maintenant vous connecter."
            : data.message || "Votre demande a été envoyée à NTV. Elle sera examinée par notre équipe."
        );
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
    setActiveTab("dashboard");
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
    if (isSellerActive) {
      loadSellerWorkspace();
    }
  }, [user?.role, user?.status]);

  function startNewProduct() {
    setEditingProduct(null);
    setProductForm(emptyProduct);
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
      imageUrl: product.imageUrl || ""
    });
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
      const payload = {
        ...productForm,
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
    { id: "orders", label: "Mes commandes", icon: ShoppingBag }
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
        }
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
          {storeUrl && isSellerActive && (
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
                onClick={() => { setMode("login"); setError(""); setMessage(""); }}
              >
                Connexion
              </button>
              <button
                type="button"
                className={mode === "register" ? "selected" : ""}
                onClick={() => { setMode("register"); setError(""); setMessage(""); }}
              >
                Inscription
              </button>
            </div>

            <form className="ntv-auth-form" onSubmit={submit}>
              {mode === "register" && (
                <>
                  <label className="ntv-field">
                    Type de compte
                    <select
                      value={form.role}
                      onChange={e => setForm({ ...form, role: e.target.value })}
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
            </form>

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
                {(user.name || user.email || "N").charAt(0).toUpperCase()}
              </div>
              <strong>{user.name || "Utilisateur NTV"}</strong>
              <span>{roleName} · {statusLabel(user.status)}</span>
            </div>

            {isSellerActive ? (
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
            ) : (
              <>
                <p className="ntv-side-label">Mon compte</p>
                <a className="ntv-nav-button" href="/">
                  <ShoppingBag size={18} /> Catalogue général
                </a>
              </>
            )}

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
            {!isActive && user.role !== "customer" ? (
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
            ) : user.role === "customer" ? (
              <>
                <div className="ntv-page-heading">
                  <div>
                    <div className="ntv-eyebrow">Espace client</div>
                    <h1>Bonjour, {user.name}.</h1>
                    <p>Bienvenue dans votre espace NEWS TECHNOLOGY VILLAGE.</p>
                  </div>
                </div>
                <div className="ntv-panel">
                  <div className="ntv-notice">
                    <ShoppingBag size={19} />
                    Votre compte client est actif. Vous pouvez consulter le catalogue
                    et passer vos commandes sur NTV.
                  </div>
                  <a className="ntv-button" href="/">
                    Découvrir le catalogue <ArrowUpRight size={16} />
                  </a>
                </div>
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
                    <div className="ntv-store-banner">
                      <div>
                        <small>VOTRE BOUTIQUE SUR NTV</small>
                        <h2>{user.businessName || user.name}</h2>
                        <p>Votre vitrine est accessible aux clients de la marketplace.</p>
                      </div>
                      {storeUrl ? (
                        <a className="ntv-button" href={storeUrl} target="_blank" rel="noreferrer">
                          Voir ma boutique <ExternalLink size={15} />
                        </a>
                      ) : (
                        <span>Adresse boutique indisponible</span>
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
                        <label className="ntv-field ntv-field-full">
                          Adresse URL de l'image
                          <input
                            type="url"
                            value={productForm.imageUrl}
                            onChange={e => setProductForm({ ...productForm, imageUrl: e.target.value })}
                            placeholder="https://..."
                          />
                        </label>
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
                              onClick={() => { setEditingProduct(null); setProductForm(emptyProduct); }}
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
                      Vous pouvez consulter les commandes concernant vos produits.
                      La gestion des clients, les paiements et les changements de statut
                      restent sous le contrôle de l'administration NTV.
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
