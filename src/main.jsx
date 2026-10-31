
import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Search, ShoppingBag, Menu, X, ArrowRight, Zap, Sun, House,
  Truck, ShieldCheck, MessageCircle, Plus, Minus, Trash2,
  ChevronDown, UserRound, Store, CheckCircle2, Clock3, PackageCheck
} from "lucide-react";
import "./styles.css";
import AdminApp from "./admin.jsx";
import AccountApp from "./account.jsx";
import AdminAccounts from "./admin-accounts.jsx";
import AdminDashboard from "./admin-dashboard.jsx";

const formatPrice = value =>
  new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 })
    .format(Number(value || 0)) + " FCFA";

const categories = [
  { name: "Tout voir", icon: "✦" },
  { name: "Mobilité électrique", icon: "🛵" },
  { name: "Énergie solaire", icon: "☀️" },
  { name: "Équipements électriques", icon: "⚡" },
  { name: "Matériaux de toiture", icon: "🏠" }
];

function App({ storeSlug = null }) {
  const [products, setProducts] = useState([]);
  const [storeInfo, setStoreInfo] = useState(null);
  const [stores, setStores] = useState([]);
  const [selectedStore, setSelectedStore] = useState("all");
  const [config, setConfig] = useState({ whatsappNumber: "229014222197" });
  const [announcements, setAnnouncements] = useState([]);
  const [announcementIndex, setAnnouncementIndex] = useState(0);
  const [category, setCategory] = useState("Tout voir");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [customer, setCustomer] = useState({
    name: "",
    phone: "",
    country: "Bénin",
    address: ""
  });
  const [paymentMethod, setPaymentMethod] = useState("Paiement à la livraison");
  const [busy, setBusy] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [trackingOpen, setTrackingOpen] = useState(false);
  const [trackingInput, setTrackingInput] = useState({ orderId: "", phone: "" });
  const [trackingBusy, setTrackingBusy] = useState(false);
  const [trackingError, setTrackingError] = useState("");
  const [trackedOrder, setTrackedOrder] = useState(null);

  useEffect(() => {
    try {
      const account = JSON.parse(localStorage.getItem("ntv_user") || "null");
      if (account?.role === "customer") {
        setCustomer(current => ({
          ...current,
          name: current.name || account.name || "",
          phone: current.phone || account.phone || "",
          country: account.country || current.country
        }));
      }
    } catch { /* Les achats invités restent disponibles si aucun compte n'est enregistré. */ }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setPageError("");

      try {
        if (storeSlug) {
          const response = await fetch(
            `/api/stores/${encodeURIComponent(storeSlug)}`
          );
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Cette boutique est introuvable ou inactive.");
          }

          if (!cancelled) {
            setStoreInfo(data.store || data.seller || data.vendor || data);
            setProducts(Array.isArray(data.products) ? data.products : []);
          }
        } else {
          const [response, storesResponse] = await Promise.all([
            fetch("/api/products"),
            fetch("/api/stores").catch(() => null)
          ]);
          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.error || "Impossible de charger le catalogue.");
          }

          if (!cancelled) {
            setProducts(Array.isArray(data) ? data : data.products || []);
            if (storesResponse?.ok) {
              const storeData = await storesResponse.json();
              setStores(Array.isArray(storeData.stores) ? storeData.stores : []);
            } else {
              setStores([]);
            }
          }
        }
      } catch (error) {
        if (!cancelled) {
          setPageError(error.message);
          setProducts([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadPage();

    fetch("/api/announcements").then(response => response.json()).then(data => { if (!cancelled) setAnnouncements(Array.isArray(data) ? data : []); }).catch(() => {});

    fetch("/api/config")
      .then(response => response.json())
      .then(data => {
        if (!cancelled) setConfig(current => ({ ...current, ...data }));
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [storeSlug]);

  const filtered = useMemo(() => products.filter(product =>
    (category === "Tout voir" || product.category === category) &&
    (selectedStore === "all" || String(product.vendorId || "") === selectedStore) &&
    `${product.name || ""} ${product.category || ""} ${product.description || ""}`
      .toLowerCase()
      .includes(search.toLowerCase())
  ), [products, category, search, selectedStore]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce(
    (sum, item) => sum + Number(item.price || 0) * item.quantity,
    0
  );

  const storeName =
    storeInfo?.businessName ||
    storeInfo?.storeName ||
    storeInfo?.name ||
    "Boutique du vendeur";

  const storeDescription =
    storeInfo?.businessDescription ||
    storeInfo?.description ||
    "Découvrez les produits proposés par ce commerçant sur NEWS TECHNOLOGY VILLAGE.";

  async function trackOrder(event) {
    event.preventDefault();
    setTrackingBusy(true);
    setTrackingError("");
    setTrackedOrder(null);
    try {
      const params = new URLSearchParams({
        orderId: trackingInput.orderId.trim(),
        phone: trackingInput.phone.trim()
      });
      const response = await fetch(`/api/orders/track?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Impossible de retrouver la commande.");
      setTrackedOrder(data.order);
    } catch (error) {
      setTrackingError(error.message);
    } finally {
      setTrackingBusy(false);
    }
  }

  function showToast(text, duration = 2500) {
    setToast(text);
    window.setTimeout(() => setToast(""), duration);
  }

  const addToCart = product => {
    if (product.priceType === "quote") {
      showToast("Ce produit est disponible sur devis.");
      return;
    }

    setCart(current => {
      const existing = current.find(item => item.id === product.id);

      return existing
        ? current.map(item =>
            item.id === product.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          )
        : [...current, { ...product, quantity: 1 }];
    });

    showToast("Produit ajouté au panier");
  };

  const changeQty = (id, amount) => {
    setCart(current =>
      current
        .map(item =>
          item.id === id
            ? { ...item, quantity: item.quantity + amount }
            : item
        )
        .filter(item => item.quantity > 0)
    );
  };

  async function submitOrder(event) {
    event.preventDefault();
    if (!termsAccepted) { showToast("Veuillez accepter le règlement intérieur de NTV avant de commander.", 4000); return; }
    setBusy(true);

    try {
      const savedToken = localStorage.getItem("ntv_token") || "";

      const response = await fetch("/api/orders", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(savedToken
            ? { Authorization: `Bearer ${savedToken}` }
            : {})
        },
        body: JSON.stringify({
          customer,
          items: cart.map(({ id, quantity }) => ({ id, quantity })),
          paymentMethod,
          termsAccepted,
          termsVersion: "2026-10-31"
        })
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "La commande n'a pas pu être envoyée."
        );
      }

      const lines = cart
        .map(item =>
          `• ${item.name} x${item.quantity} — ${formatPrice(item.price * item.quantity)}`
        )
        .join("\n");

      const message =
        `Bonjour NEWS TECHNOLOGY VILLAGE, je souhaite confirmer la commande ${result.orderId}.\n\n` +
        `${lines}\n\n` +
        `Total indicatif : ${formatPrice(total)}\n` +
        `Mode de paiement souhaité : ${paymentMethod}\n\n` +
        `Nom : ${customer.name}\n` +
        `Téléphone : ${customer.phone}\n` +
        `Pays : ${customer.country}\n` +
        `Adresse : ${customer.address}\n\n` +
        `Merci de confirmer la disponibilité, le prix final et la livraison.`;

      window.open(
        `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`,
        "_blank",
        "noopener,noreferrer"
      );

      showToast(`Commande préparée : ${result.orderId}`, 4000);
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
    } catch (error) {
      showToast(error.message, 4000);
    } finally {
      setBusy(false);
    }
  }

  const whatsappQuote = product =>
    `https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(
      `Bonjour, je souhaite un devis pour ${product.name}.`
    )}`;

  return (
    <div className="app">
      <div className="announcement">
        <Zap size={14} />
        {storeSlug
          ? `Bienvenue dans la boutique ${storeName}`
          : "Votre partenaire en mobilité, énergie et équipements"}
        <span>•</span>
        Livraison selon destination
      </div>

      <header className="header">
        <a className="brand" href="/" aria-label="Accueil NTV">
          <div className="brand-mark">
            <Zap size={28} fill="currentColor" />
          </div>
          <div>
            <strong>NEWS <em>TECHNOLOGY</em></strong>
            <small>V I L L A G E</small>
          </div>
        </a>

        <div className="searchbar">
          <Search size={19} />
          <input
            value={search}
            onChange={event => setSearch(event.target.value)}
            placeholder="Rechercher un produit, une catégorie..."
          />
          <kbd>⌕</kbd>
        </div>

        <div className="header-actions">
          <button className="tracking-trigger" type="button" onClick={() => setTrackingOpen(true)}><Truck size={17} /><span>Suivre mon colis</span></button>
          <a className="account-link" href="/compte">
            <UserRound size={17} />
            <span>Mon compte / Espace professionnel</span>
          </a>

          <button
            className="icon-button mobile-menu-button"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Menu"
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>

          <button className="cart-button" onClick={() => setCartOpen(true)}>
            <ShoppingBag size={19} />
            <span>Panier</span>
            <b>{cartCount}</b>
          </button>
        </div>
      </header>

      <nav className={`nav ${mobileMenu ? "nav-open" : ""}`}>
        {categories.map(item => (
          <button
            key={item.name}
            className={category === item.name ? "active" : ""}
            onClick={() => {
              setCategory(item.name);
              setMobileMenu(false);
            }}
          >
            {item.name}
          </button>
        ))}

        {!storeSlug && <a href="#boutiques" className="nav-stores-link">
          Boutiques partenaires <Store size={15} />
        </a>}
        <a href="#contact" className="nav-contact">
          Nous contacter <ArrowRight size={15} />
        </a>
      </nav>

      {trackingOpen && <div className="tracking-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setTrackingOpen(false); }}>
        <section className="tracking-modal" role="dialog" aria-modal="true" aria-labelledby="tracking-modal-title">
          <button className="tracking-modal-close" type="button" onClick={() => setTrackingOpen(false)} aria-label="Fermer"><X size={20} /></button>
          <div className="tracking-modal-icon"><Truck size={24} /></div>
          <span className="section-kicker">SUIVI DE COMMANDE</span>
          <h2 id="tracking-modal-title">Où est <em>mon colis ?</em></h2>
          <p className="tracking-modal-intro">Saisissez votre numéro de commande et le téléphone utilisé lors de l'achat pour consulter l'avancement de votre livraison.</p>
          <form className="tracking-form" onSubmit={trackOrder}>
            <label>Numéro de commande<input required value={trackingInput.orderId} onChange={event => setTrackingInput(current => ({ ...current, orderId: event.target.value }))} placeholder="Ex. NTV-123" autoComplete="off" /></label>
            <label>Téléphone utilisé lors de l'achat<input required type="tel" value={trackingInput.phone} onChange={event => setTrackingInput(current => ({ ...current, phone: event.target.value }))} placeholder="Ex. 01 xx xx xx xx" autoComplete="tel" /></label>
            <button className="primary-button full-button" type="submit" disabled={trackingBusy}>{trackingBusy ? "Recherche..." : "Vérifier ma livraison"}<ArrowRight size={17} /></button>
          </form>
          {trackingError && <p className="tracking-error" role="alert">{trackingError}</p>}
          {trackedOrder && <div className="tracking-result" aria-live="polite">
            <div className="tracking-result-head"><div><small>COMMANDE</small><strong>{trackedOrder.orderId}</strong></div><span className="tracking-status">{trackedOrder.status}</span></div>
            <p className="tracking-items">{trackedOrder.items.map(item => `${item.name} × ${item.quantity}`).join(" · ")}</p>
            <ol className="tracking-timeline">{trackedOrder.history.map((event, index) => {
              const label = String(event.status || "").toLowerCase();
              const StepIcon = label.includes("en livraison") ? Truck : label.includes("livr") ? CheckCircle2 : label.includes("prépar") ? PackageCheck : label.includes("expédi") || label.includes("colis récup") ? Truck : label.includes("confirm") ? ShieldCheck : Clock3;
              return <li key={`${event.status}-${index}`} className={`tracking-event ${index === trackedOrder.history.length - 1 ? "is-current" : "is-done"}`}><span className="tracking-step-icon"><StepIcon size={17}/></span><div><strong>{event.status}</strong>{event.note && <small>{event.note}</small>}{event.at && <time>{new Date(event.at).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}</time>}</div></li>;
            })}</ol>
            {trackedOrder.history.length === 0 && <p className="tracking-muted">La commande est enregistrée. Les prochaines étapes apparaîtront ici.</p>}
          </div>}
          <div className="tracking-modal-security"><ShieldCheck size={16}/> Vos informations restent protégées.</div>
        </section>
      </div>}

      {storeSlug ? (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span></span> BOUTIQUE PARTENAIRE NTV
              </div>

              <h1>
                {storeName}
                <br />
                <em>sur NTV.</em>
              </h1>

              <p>{storeDescription}</p>

              <div className="hero-buttons">
                <a className="primary-button" href="#catalogue">
                  Découvrir les produits <ArrowRight size={17} />
                </a>
                <a className="secondary-button" href="/">
                  Catalogue général
                </a>
              </div>

              <div className="hero-trust">
                <span><ShieldCheck size={16} /> Boutique référencée NTV</span>
                <span><Truck size={16} /> Livraison à confirmer</span>
              </div>
            </div>

            <div className="hero-visual">
              <div className="hero-glow"></div>
              <div className="hero-card hero-card-main">
                <span className="visual-label">BOUTIQUE PARTENAIRE</span>
                <div className="scooter"><Store size={65} /></div>
                <strong>Découvrez nos articles.</strong>
                <small>Une vitrine indépendante sur NTV</small>
              </div>
              <div className="floating-card solar">
                <ShoppingBag size={22} />
                <div>
                  <b>Catalogue</b>
                  <small>Produits du vendeur</small>
                </div>
              </div>
              <div className="floating-card roof">
                <ShieldCheck size={22} />
                <div>
                  <b>Marketplace NTV</b>
                  <small>Commandes centralisées</small>
                </div>
              </div>
              <div className="hero-stamp">
                <Zap size={17} /> PARTENAIRE<br />NTV
              </div>
            </div>
            <div className="hero-bottom">
              <span>NTV / BOUTIQUE</span>
              <div className="hero-progress"><i></i></div>
              <span>Découvrez les produits de ce vendeur</span>
            </div>
          </section>

          <section className="section products-section" id="catalogue">
            <div className="section-heading product-heading">
              <div>
                <span className="section-kicker">BOUTIQUE DU VENDEUR</span>
                <h2>Nos produits <em>disponibles.</em></h2>
              </div>
              <div className="product-filters">
                <label>
                  Boutique <ChevronDown size={14} />
                  <select value={selectedStore} onChange={event => setSelectedStore(event.target.value)}>
                    <option value="all">Toutes les boutiques</option>
                    {stores.map(store => <option key={store.slug} value={store.id || ""}>{store.name}</option>)}
                  </select>
                </label>
                <label>
                  Catégorie <ChevronDown size={14} />
                  <select
                    value={category}
                    onChange={event => setCategory(event.target.value)}
                  >
                    {categories.map(item => (
                      <option key={item.name}>{item.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {pageError && <p className="admin-error">{pageError}</p>}

            {loading ? (
              <p className="account-lead">Chargement de la boutique...</p>
            ) : (
              <ProductGrid
                products={filtered}
                addToCart={addToCart}
                whatsappQuote={whatsappQuote}
                loading={loading}
                search={search}
                setSearch={setSearch}
                setCategory={setCategory}
              />
            )}

            <p className="catalog-note">
              Cette vitrine présente les produits du vendeur. Les commandes
              sont enregistrées et suivies par l'administration centrale NTV.
              La disponibilité, le prix final et la livraison doivent être
              confirmés.
            </p>
          </section>

          <section className="cta-band">
            <div className="cta-icon"><MessageCircle size={28} /></div>
            <div>
              <span>UN BESOIN PARTICULIER ?</span>
              <h2>Besoin d'informations sur un produit ?</h2>
              <p>Contactez l'équipe NTV pour être accompagné.</p>
            </div>
            <a href={`https://wa.me/${config.whatsappNumber}`} target="_blank" rel="noreferrer">
              Contacter NTV <ArrowRight size={17} />
            </a>
          </section>
        </main>
      ) : (
        <main>
          <section className="hero">
            <div className="hero-copy">
              <div className="eyebrow">
                <span></span> BOUTIQUE OFFICIELLE · BÉNIN
              </div>
              <h1>
                La technologie<br />
                qui fait <em>avancer</em><br />
                votre quotidien.
              </h1>
              <p>
                Mobilité électrique, solutions solaires et matériaux de toiture :
                trouvez les équipements adaptés à vos projets, au même endroit.
              </p>
              <div className="hero-buttons">
                <a className="primary-button" href="#catalogue">
                  Découvrir la boutique <ArrowRight size={17} />
                </a>
                <a className="secondary-button" href="#activites">
                  Nos activités
                </a>
              </div>
              <div className="hero-trust">
                <span><ShieldCheck size={16} /> Conseils personnalisés</span>
                <span><Truck size={16} /> Livraison à confirmer</span>
              </div>
            </div>

            <div className={`hero-visual ${announcements.length ? "hero-ad-visual" : ""}`}>
              {announcements.length > 0 ? (() => {
                const item = announcements[announcementIndex % announcements.length];
                return <div className="hero-ad-panel">
                  <div className="hero-ad-media">
                    {item.mediaType === "video"
                      ? <video src={item.mediaUrl} autoPlay muted loop playsInline controls />
                      : <img src={item.mediaUrl} alt={item.title} />}
                  </div>
                  <div className="hero-ad-copy">
                    <span className="visual-label">NOUVEAUTÉS · ARRIVAGES</span>
                    <strong>{item.title}</strong>
                    {item.description && <small>{item.description}</small>}
                    {item.link && <a href={item.link}>Découvrir <ArrowRight size={15}/></a>}
                    {announcements.length > 1 && <div className="hero-ad-controls">
                      <button type="button" onClick={() => setAnnouncementIndex(i => (i - 1 + announcements.length) % announcements.length)} aria-label="Publicité précédente">‹</button>
                      <span>{announcementIndex + 1} / {announcements.length}</span>
                      <button type="button" onClick={() => setAnnouncementIndex(i => (i + 1) % announcements.length)} aria-label="Publicité suivante">›</button>
                    </div>}
                  </div>
                </div>;
              })() : <>
              <div className="hero-glow"></div>
              <div className="hero-card hero-card-main">
                <span className="visual-label">MOBILITÉ ÉLECTRIQUE</span>
                <div className="scooter">🛵</div>
                <strong>Roulez vers demain.</strong>
                <small>Mobilité plus responsable</small>
              </div>
              <div className="floating-card solar">
                <Sun size={22} />
                <div>
                  <b>Énergie solaire</b>
                  <small>Des solutions pour vos besoins</small>
                </div>
              </div>
              <div className="floating-card roof">
                <House size={22} />
                <div>
                  <b>Toiture & bâtiment</b>
                  <small>Des matériaux pour vos projets</small>
                </div>
              </div>
              <div className="hero-stamp">
                <Zap size={17} /> INNOVATION<br />AU QUOTIDIEN
              </div>
              </>}
            </div>

            <div className="hero-bottom">
              <span>01 / 03</span>
              <div className="hero-progress"><i></i></div>
              <span>Des solutions pour particuliers & professionnels</span>
            </div>
          </section>


          <section className="benefits">
            <div>
              <span className="benefit-icon"><ShieldCheck /></span>
              <section><b>Conseils personnalisés</b><small>Choisissez avec plus de clarté</small></section>
            </div>
            <div>
              <span className="benefit-icon"><Truck /></span>
              <section><b>Livraison à organiser</b><small>Selon votre localité</small></section>
            </div>
            <div>
              <span className="benefit-icon"><MessageCircle /></span>
              <section><b>Contact direct</b><small>Échange avec notre équipe</small></section>
            </div>
            <div>
              <span className="benefit-icon"><Zap /></span>
              <section><b>Plusieurs univers</b><small>Vos besoins au même endroit</small></section>
            </div>
          </section>

          <section className="section categories-section" id="activites">
            <div className="section-heading">
              <div>
                <span className="section-kicker">EXPLOREZ NOS UNIVERS</span>
                <h2>Une boutique. <em>Trois expertises.</em></h2>
              </div>
              <p>
                Des équipements pour vos déplacements, votre autonomie
                énergétique et vos projets de construction.
              </p>
            </div>

            <div className="category-cards">
              <button className="category-card card-mobility" onClick={() => setCategory("Mobilité électrique")}>
                <div className="category-emoji">🛵</div>
                <span className="category-number">01 / MOBILITÉ</span>
                <h3>Mobilité électrique</h3>
                <p>Motos, scooters, batteries et accessoires.</p>
                <span className="category-link">Explorer <ArrowRight size={16} /></span>
              </button>

              <button className="category-card card-solar" onClick={() => setCategory("Énergie solaire")}>
                <div className="category-emoji">☀️</div>
                <span className="category-number">02 / ÉNERGIE</span>
                <h3>Énergie solaire</h3>
                <p>Panneaux, batteries et équipements solaires.</p>
                <span className="category-link">Explorer <ArrowRight size={16} /></span>
              </button>

              <button className="category-card card-roof" onClick={() => setCategory("Matériaux de toiture")}>
                <div className="category-emoji">🏠</div>
                <span className="category-number">03 / BÂTIMENT</span>
                <h3>Toiture & matériaux</h3>
                <p>Métro tuiles, bacs, faîtières et accessoires.</p>
                <span className="category-link">Explorer <ArrowRight size={16} /></span>
              </button>
            </div>
          </section>

          <section className="section ntv-stores-section" id="boutiques">
            <div className="section-heading">
              <div>
                <span className="section-kicker">LES COMMERÇANTS PARTENAIRES</span>
                <h2>Découvrez nos <em>boutiques.</em></h2>
              </div>
              <p>Parcourez toutes les boutiques NTV ou choisissez votre commerçant préféré pour découvrir son catalogue.</p>
            </div>
            {stores.length ? (
              <div className="ntv-store-directory">
                {stores.map(store => (
                  <a className="ntv-store-tile" href={`/boutique/${encodeURIComponent(store.slug)}`} key={store.slug}>
                    <span className="ntv-store-avatar">{store.profileImageUrl ? <img src={store.profileImageUrl} alt=""/> : <Store size={25}/>}</span>
                    <span className="ntv-store-tile-copy"><strong>{store.name}</strong><small>{store.productCount} produit(s) · Boutique partenaire NTV</small><span>{store.description}</span></span>
                    <ArrowRight size={18}/>
                  </a>
                ))}
              </div>
            ) : <p className="ntv-store-empty">Les boutiques partenaires apparaîtront ici dès leur activation par NTV.</p>}
          </section>

          <section className="section products-section" id="catalogue">
            <div className="section-heading product-heading">
              <div>
                <span className="section-kicker">SÉLECTION DU MOMENT</span>
                <h2>Nos produits <em>en vedette.</em></h2>
              </div>
              <div className="product-filters">
                <label>
                  Catégorie <ChevronDown size={14} />
                  <select
                    value={category}
                    onChange={event => setCategory(event.target.value)}
                  >
                    {categories.map(item => (
                      <option key={item.name}>{item.name}</option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            {pageError && <p className="admin-error">{pageError}</p>}

            {loading ? (
              <p className="account-lead">Chargement du catalogue...</p>
            ) : (
              <ProductGrid
                products={filtered}
                addToCart={addToCart}
                whatsappQuote={whatsappQuote}
                loading={loading}
                search={search}
                setSearch={setSearch}
                setCategory={setCategory}
              />
            )}

            <p className="catalog-note">
              Les produits et prix affichés sont des exemples de démarrage.
              Ils doivent être vérifiés et remplacés par les informations
              réelles de votre boutique avant la mise en ligne commerciale.
            </p>
          </section>

          <section className="cta-band">
            <div className="cta-icon"><MessageCircle size={28} /></div>
            <div>
              <span>UN PROJET SPÉCIFIQUE ?</span>
              <h2>Besoin d'un conseil ou d'un devis ?</h2>
              <p>Parlons de votre besoin en équipement, énergie solaire ou toiture.</p>
            </div>
            <a
              href={`https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent("Bonjour NEWS TECHNOLOGY VILLAGE, je souhaite obtenir des informations sur vos produits et services.")}`}
              target="_blank"
              rel="noreferrer"
            >
              Écrire sur WhatsApp <ArrowRight size={17} />
            </a>
          </section>
        </main>
      )}


      <footer id="contact" className="footer">
        <div className="footer-main">
          <div className="footer-brand">
            <a className="brand" href="/">
              <div className="brand-mark"><Zap size={27} fill="currentColor" /></div>
              <div>
                <strong>NEWS <em>TECHNOLOGY</em></strong>
                <small>V I L L A G E</small>
              </div>
            </a>
            <p>
              Des solutions pour la mobilité, l'énergie et l'habitat.
              Au service de vos projets au Bénin et dans les pays voisins.
            </p>
          </div>

          <div>
            <h4>Nos activités</h4>
            <a href="/#catalogue">Mobilité électrique</a>
            <a href="/#catalogue">Énergie solaire</a>
            <a href="/#catalogue">Matériaux de toiture</a>
          </div>

          <div>
            <h4>Informations</h4>
            <a href="#contact">Contact & conseils</a>
            <a href="/">Catalogue général</a>
            <a href="/compte">Mon compte</a>
          </div>

          <div className="footer-contact">
            <h4>Contact</h4>
            <p>Abomey-Calavi, Bénin</p>
            <a href={`https://wa.me/${config.whatsappNumber}`} target="_blank" rel="noreferrer">
              <MessageCircle size={16} /> +229 01 42 22 21 97
            </a>
            <small>Livraison à confirmer selon destination.</small>
          </div>
        </div>

        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} NEWS TECHNOLOGY VILLAGE. Tous droits réservés.</span>
          <span>Boutique officielle · Bénin</span>
          <a href="/admin" className="footer-admin">Administration</a>
        </div>
      </footer>

      {toast && <div className="toast">{toast}</div>}

      {cartOpen && (
        <div
          className="overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setCartOpen(false);
          }}
        >
          <aside className="drawer">
            <div className="drawer-head">
              <div>
                <span className="section-kicker">VOTRE SÉLECTION</span>
                <h2>Mon panier <small>({cartCount})</small></h2>
              </div>
              <button className="close-button" onClick={() => setCartOpen(false)} aria-label="Fermer">
                <X />
              </button>
            </div>

            {cart.length === 0 ? (
              <div className="cart-empty">
                <ShoppingBag size={44} />
                <h3>Votre panier est vide</h3>
                <p>Ajoutez les produits qui vous intéressent pour préparer votre commande.</p>
                <button className="primary-button" onClick={() => setCartOpen(false)}>
                  Continuer mes achats
                </button>
              </div>
            ) : (
              <>
                <div className="cart-items">
                  {cart.map(item => (
                    <div className="cart-item" key={item.id}>
                      <div className="cart-item-emoji">
                        {item.imageUrl
                          ? <img src={item.imageUrl} alt="" />
                          : item.emoji}
                      </div>
                      <div className="cart-item-info">
                        <b>{item.name}</b>
                        <strong>{formatPrice(item.price)}</strong>
                        <div className="qty">
                          <button onClick={() => changeQty(item.id, -1)} aria-label="Diminuer">
                            <Minus size={13} />
                          </button>
                          <span>{item.quantity}</span>
                          <button onClick={() => changeQty(item.id, 1)} aria-label="Augmenter">
                            <Plus size={13} />
                          </button>
                          <button
                            className="remove-item"
                            onClick={() => setCart(current => current.filter(product => product.id !== item.id))}
                            aria-label="Supprimer"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="cart-summary">
                  <div>
                    <span>Total indicatif</span>
                    <strong>{formatPrice(total)}</strong>
                  </div>
                  <small>
                    Le prix final, la disponibilité et la livraison seront confirmés par notre équipe.
                  </small>
                  <button
                    className="primary-button full-button"
                    onClick={() => {
                      setCartOpen(false);
                      setCheckoutOpen(true);
                    }}
                  >
                    Passer la commande <ArrowRight size={17} />
                  </button>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      {checkoutOpen && (
        <div
          className="overlay"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setCheckoutOpen(false);
          }}
        >
          <section className="checkout-modal">
            <div className="drawer-head">
              <div>
                <span className="section-kicker">DERNIÈRE ÉTAPE</span>
                <h2>Préparer ma commande</h2>
              </div>
              <button className="close-button" onClick={() => setCheckoutOpen(false)} aria-label="Fermer">
                <X />
              </button>
            </div>

            <p className="checkout-intro">
              {(() => { try { const account = JSON.parse(localStorage.getItem("ntv_user") || "null"); return account?.role === "customer" ? "Vos coordonnées de compte sont déjà renseignées. Vérifiez-les et indiquez votre adresse de livraison pour commander plus rapidement." : "Aucun compte n’est nécessaire pour acheter sur NTV. Renseignez simplement vos coordonnées pour préparer votre commande."; } catch { return "Aucun compte n’est nécessaire pour acheter sur NTV. Renseignez simplement vos coordonnées pour préparer votre commande."; } })()}
            </p>

            <form onSubmit={submitOrder}>
              <label>
                Nom complet
                <input
                  required
                  value={customer.name}
                  onChange={event => setCustomer({ ...customer, name: event.target.value })}
                  placeholder="Votre nom"
                />
              </label>

              <label>
                Téléphone / WhatsApp
                <input
                  required
                  value={customer.phone}
                  onChange={event => setCustomer({ ...customer, phone: event.target.value })}
                  placeholder="+229 ..."
                />
              </label>

              <label>
                Pays
                <select
                  value={customer.country}
                  onChange={event => setCustomer({ ...customer, country: event.target.value })}
                >
                  {["Bénin", "Togo", "Nigeria", "Burkina Faso", "Niger", "Côte d’Ivoire", "Ghana", "Autre"].map(country => (
                    <option key={country}>{country}</option>
                  ))}
                </select>
              </label>

              <label>
                Adresse ou ville de livraison
                <textarea
                  required
                  value={customer.address}
                  onChange={event => setCustomer({ ...customer, address: event.target.value })}
                  placeholder="Ville, quartier, précisions..."
                />
              </label>

              <label>
                Mode de paiement souhaité
                <select
                  value={paymentMethod}
                  onChange={event => setPaymentMethod(event.target.value)}
                >
                  <option>Paiement à la livraison</option>
                  <option>Mobile Money</option>
                  <option>Carte bancaire</option>
                  <option>Virement bancaire</option>
                </select>
              </label>

              <div className="ntv-terms-box" style={{ border: "1px solid #d8dee9", borderRadius: 12, padding: 14, margin: "14px 0", background: "#f8fafc" }}>
                <strong>Règlement intérieur et conditions de vente NTV</strong>
                <p style={{ margin: "8px 0", fontSize: 13, lineHeight: 1.5 }}>En validant votre commande, vous confirmez l'exactitude de vos coordonnées, acceptez que la disponibilité des articles soit confirmée par le vendeur et vous engagez à respecter les modalités de livraison et de paiement communiquées par NTV.</p>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 9, fontSize: 13 }}>
                  <input type="checkbox" required checked={termsAccepted} onChange={event => setTermsAccepted(event.target.checked)} style={{ marginTop: 3 }} />
                  <span>J'ai lu et j'accepte le règlement intérieur et les conditions de vente de NEWS TECHNOLOGY VILLAGE.</span>
                </label>
              </div>

              <div className="checkout-total">
                <span>Total indicatif</span>
                <b>{formatPrice(total)}</b>
              </div>

              <p className="payment-warning">
                Mobile Money et carte bancaire : cette sélection exprime
                votre préférence. Aucun paiement électronique n'est traité
                tant qu'un prestataire n'a pas été connecté.
              </p>

              <button className="primary-button full-button" type="submit" disabled={busy || !termsAccepted}>
                {busy ? "Préparation..." : "Envoyer ma demande sur WhatsApp"}
                <ArrowRight size={17} />
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}

function ProductGrid({
  products,
  addToCart,
  whatsappQuote,
  search,
  setSearch,
  setCategory
}) {
  return (
    <div className="product-grid">
      {products.map((product, index) => (
        <article className="product-card" key={product.id || product._id}>
          <div className={`product-art art-${index % 5}`}>
            {product.imageUrl ? (
              <img className="product-photo" src={product.imageUrl} alt={product.name} />
            ) : (
              <span className="product-emoji">{product.emoji || "📦"}</span>
            )}

            {product.badge && <span className="product-badge">{product.badge}</span>}

            <button
              className="quick-add"
              onClick={() => addToCart(product)}
              aria-label={`Ajouter ${product.name}`}
            >
              <Plus size={19} />
            </button>
          </div>

          <div className="product-info">
            <span className="product-category">{product.category}</span>
            {product.storeSlug && <a className="product-store-link" href={`/boutique/${encodeURIComponent(product.storeSlug)}`}><Store size={12}/> {product.vendorName || "Voir la boutique"}</a>}
            <h3>{product.name}</h3>
            <p>{product.description}</p>

            <div className="product-bottom">
              <strong>
                {product.priceType === "quote"
                  ? "Prix sur devis"
                  : formatPrice(product.price)}
              </strong>

              {product.priceType === "quote" ? (
                <a
                  className="quote-link"
                  href={whatsappQuote(product)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Demander un devis
                </a>
              ) : (
                <button onClick={() => addToCart(product)}>
                  Ajouter <Plus size={14} />
                </button>
              )}
            </div>

            <small className="price-note">
              Disponibilité et livraison à confirmer
            </small>
          </div>
        </article>
      ))}

      {products.length === 0 && (
        <div className="empty-results">
          <Search size={30} />
          <h3>Aucun produit trouvé</h3>
          <p>
            {search
              ? "Essayez un autre mot-clé ou choisissez une autre catégorie."
              : "Aucun produit n'est actuellement disponible dans cette boutique."}
          </p>
          <button
            onClick={() => {
              setSearch("");
              setCategory("Tout voir");
            }}
          >
            Réinitialiser
          </button>
        </div>
      )}
    </div>
  );
}

const route = window.location.pathname.replace(/\/$/, "") || "/";
const storeMatch = route.match(/^\/boutique\/([^/]+)$/);

createRoot(document.getElementById("root")).render(
  route === "/admin"
    ? <AdminDashboard />
    : route === "/admin/produits"
      ? <AdminApp />
      : route === "/admin/comptes"
        ? <AdminAccounts />
        : route === "/compte"
          ? <AccountApp />
          : storeMatch
            ? <App storeSlug={decodeURIComponent(storeMatch[1])} />
            : <App />
);
