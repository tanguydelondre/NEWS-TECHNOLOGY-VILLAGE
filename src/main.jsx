import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Search, ShoppingBag, Menu, X, ArrowRight, Zap, Sun, House, Truck, ShieldCheck, MessageCircle, Plus, Minus, Trash2, ChevronDown } from "lucide-react";
import "./styles.css";

const formatPrice = value => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(value) + " FCFA";
const categories = [
  { name: "Tout voir", icon: "✦" },
  { name: "Motos et scooters électriques", icon: "🛵" },
  { name: "Panneaux et équipements solaires", icon: "☀️" },
  { name: "Électroménager et équipements électriques", icon: "⚡" },
  { name: "Matériel électrique", icon: "🔌" },
  { name: "Toiture et matériaux de construction", icon: "🏠" }
];

function App() {
  const [products, setProducts] = useState([]);
  const [config, setConfig] = useState({ whatsappNumber: "229014222197" });
  const [category, setCategory] = useState("Tout voir");
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState([]);
  const [quoteItems, setQuoteItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState("");
  const [customer, setCustomer] = useState({ name: "", phone: "", country: "Bénin", address: "" });
  const [paymentMethod, setPaymentMethod] = useState("Paiement à la livraison");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/products").then(r => r.json()).then(setProducts).catch(() => setProducts([]));
    fetch("/api/config").then(r => r.json()).then(setConfig).catch(() => {});
  }, []);

  const filtered = useMemo(() => products.filter(p =>
    (category === "Tout voir" || p.category === category) &&
    `${p.name} ${p.category} ${p.description}`.toLowerCase().includes(search.toLowerCase())
  ), [products, category, search]);

  const cartCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const quoteCount = quoteItems.reduce((sum, item) => sum + item.quantity, 0);
  const addToQuote = product => { setQuoteItems(current => { const existing = current.find(item => item.id === product.id); return existing ? current.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item) : [...current, { ...product, quantity: 1 }]; }); setToast("Produit ajouté à votre demande de devis"); setTimeout(() => setToast(""), 2200); };
  const sendQuote = () => { if (!quoteItems.length) { setToast("Ajoutez d'abord un produit à votre demande de devis."); setTimeout(() => setToast(""), 2500); return; } const lines = quoteItems.map(i => `• ${i.name} x${i.quantity}${i.price ? ` — prix indicatif : ${formatPrice(i.price * i.quantity)}` : " — prix sur devis"}`).join("\n"); const message = `Bonjour NEWS TECHNOLOGY VILLAGE, je souhaite recevoir un devis pour :\n\n${lines}\n\nMerci de me préciser le prix, la disponibilité et les frais de livraison.`; window.open(`https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer"); };
  const addToCart = product => {
    setCart(current => {
      const existing = current.find(item => item.id === product.id);
      return existing
        ? current.map(item => item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item)
        : [...current, { ...product, quantity: 1 }];
    });
    setToast("Produit ajouté au panier");
    setTimeout(() => setToast(""), 2200);
  };
  const changeQty = (id, amount) => setCart(current => current
    .map(item => item.id === id ? { ...item, quantity: item.quantity + amount } : item)
    .filter(item => item.quantity > 0));

  async function submitOrder(event) {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ customer, items: cart.map(({ id, quantity }) => ({ id, quantity })), paymentMethod })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "La commande n'a pas pu être envoyée.");
      const lines = cart.map(i => `• ${i.name} x${i.quantity} — ${formatPrice(i.price * i.quantity)}`).join("\n");
      const message = `Bonjour NEWS TECHNOLOGY VILLAGE, je souhaite confirmer la commande ${result.orderId}.\n\n${lines}\n\nTotal indicatif : ${formatPrice(total)}\nMode de paiement souhaité : ${paymentMethod}\n\nNom : ${customer.name}\nTéléphone : ${customer.phone}\nPays : ${customer.country}\nAdresse : ${customer.address}\n\nMerci de confirmer la disponibilité, le prix final et la livraison.`;
      window.open(`https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
      setToast(`Commande préparée : ${result.orderId}`);
      setCart([]);
      setCheckoutOpen(false);
      setCartOpen(false);
    } catch (error) {
      setToast(error.message);
      setTimeout(() => setToast(""), 4000);
    } finally { setBusy(false); }
  }

  return <div className="app">
    <div className="announcement"><Zap size={14} /> Votre partenaire en mobilité, énergie et équipements <span>•</span> Livraison selon destination</div>
    <header className="header">
      <a className="brand" href="#" aria-label="Accueil">
        <div className="brand-mark"><Zap size={28} fill="currentColor" /></div>
        <div><strong>NEWS <em>TECHNOLOGY</em></strong><small>V I L L A G E</small></div>
      </a>
      <div className="searchbar"><Search size={19}/><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un produit, une catégorie..." /><kbd>⌕</kbd></div>
      <div className="header-actions">
        <button className="icon-button mobile-menu-button" onClick={() => setMobileMenu(!mobileMenu)} aria-label="Menu">{mobileMenu ? <X/> : <Menu/>}</button>
        <button className="quote-header-button" onClick={sendQuote}><MessageCircle size={17}/><span>Devis</span><b>{quoteCount}</b></button><button className="cart-button" onClick={() => setCartOpen(true)}><ShoppingBag size={19}/><span>Panier</span><b>{cartCount}</b></button>
      </div>
    </header>

    <nav className={`nav ${mobileMenu ? "nav-open" : ""}`}>
      {categories.map(c => <button key={c.name} className={category === c.name ? "active" : ""} onClick={() => { setCategory(c.name); setMobileMenu(false); }}>{c.name}</button>)}
      <a href="#contact" className="nav-contact">Nous contacter <ArrowRight size={15}/></a>
    </nav>

    <main>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow"><span></span> BOUTIQUE OFFICIELLE · BÉNIN</div>
          <h1>La technologie<br/>qui fait <em>avancer</em><br/>votre quotidien.</h1>
          <p>Mobilité électrique, énergie solaire, électroménager et matériaux de construction : des solutions pour vos projets, au même endroit.</p>
          <div className="hero-buttons"><a className="primary-button" href="#catalogue">Découvrir la boutique <ArrowRight size={17}/></a><a className="secondary-button" href="#activites">Nos activités</a></div>
          <div className="hero-trust"><span><ShieldCheck size={16}/> Conseils personnalisés</span><span><Truck size={16}/> Livraison à confirmer</span></div>
        </div>
        <div className="hero-visual">
          <div className="hero-glow"></div>
          <div className="hero-card hero-card-main"><span className="visual-label">MOBILITÉ ÉLECTRIQUE</span><div className="scooter"><img src="https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=900&q=85" alt="Scooter et mobilité" /></div><strong>Roulez vers demain.</strong><small>Mobilité plus responsable</small></div>
          <div className="floating-card solar"><Sun size={22}/><div><b>Énergie solaire</b><small>Des solutions pour vos besoins</small></div></div>
          <div className="floating-card roof"><House size={22}/><div><b>Toiture & bâtiment</b><small>Des matériaux pour vos projets</small></div></div>
          <div className="hero-stamp"><Zap size={17}/> INNOVATION<br/>AU QUOTIDIEN</div>
        </div>
        <div className="hero-bottom"><span>01 / 03</span><div className="hero-progress"><i></i></div><span>Des solutions pour particuliers & professionnels</span></div>
      </section>

      <section className="benefits">
        <div><span className="benefit-icon"><ShieldCheck/></span><section><b>Conseils personnalisés</b><small>Choisissez avec plus de clarté</small></section></div>
        <div><span className="benefit-icon"><Truck/></span><section><b>Livraison à organiser</b><small>Selon votre localité</small></section></div>
        <div><span className="benefit-icon"><MessageCircle/></span><section><b>Contact direct</b><small>Échange avec notre équipe</small></section></div>
        <div><span className="benefit-icon"><Zap/></span><section><b>Trois univers</b><small>Vos besoins au même endroit</small></section></div>
      </section>

      <section className="section categories-section" id="activites">
        <div className="section-heading"><div><span className="section-kicker">EXPLOREZ NOS UNIVERS</span><h2>Une boutique. <em>Plusieurs expertises.</em></h2></div><p>Mobilité, énergie, électroménager et matériaux pour les particuliers comme les professionnels.</p></div>
        <div className="category-cards">
          <button className="category-card card-mobility" onClick={() => setCategory("Motos et scooters électriques")}><div className="category-photo"><img src="https://images.unsplash.com/photo-1558981806-ec527fa84c39?auto=format&fit=crop&w=800&q=85" alt="Scooter" /></div><span className="category-number">01 / MOBILITÉ</span><h3>Motos et scooters électriques</h3><p>Motos, scooters, batteries, casques et accessoires.</p><span className="category-link">Explorer <ArrowRight size={16}/></span></button>
          <button className="category-card card-solar" onClick={() => setCategory("Panneaux et équipements solaires")}><div className="category-photo"><img src="https://images.unsplash.com/photo-1509391366360-2e959784a276?auto=format&fit=crop&w=800&q=85" alt="Panneaux solaires" /></div><span className="category-number">02 / ÉNERGIE</span><h3>Panneaux et équipements solaires</h3><p>Panneaux, batteries, onduleurs et kits solaires.</p><span className="category-link">Explorer <ArrowRight size={16}/></span></button>
          <button className="category-card card-roof" onClick={() => setCategory("Toiture et matériaux de construction")}><div className="category-photo"><img src="https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=85" alt="Maison et toiture" /></div><span className="category-number">03 / BÂTIMENT</span><h3>Toiture et construction</h3><p>Tôles, métros tuiles, bacs, faîtières et accessoires.</p><span className="category-link">Explorer <ArrowRight size={16}/></span></button>
        </div>
      </section>

      <section className="section products-section" id="catalogue">
        <div className="section-heading product-heading"><div><span className="section-kicker">SÉLECTION DU MOMENT</span><h2>Nos produits <em>en vedette.</em></h2></div><div className="product-filters"><label>Catégorie <ChevronDown size={14}/><select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(c => <option key={c.name}>{c.name}</option>)}</select></label></div></div>
        <div className="product-grid">
          {filtered.map((p, index) => <article className="product-card" key={p.id}>
            <div className={`product-art art-${index % 5}`}><img className="product-photo" src={p.image} alt={p.name} loading="lazy" onError={e => { e.currentTarget.style.display = "none"; }} /><span className="product-emoji fallback-emoji">{p.emoji}</span>{p.badge && <span className="product-badge">{p.badge}</span>}{!p.quoteOnly && <button className="quick-add" onClick={() => addToCart(p)} aria-label={`Ajouter ${p.name}`}><Plus size={19}/></button>}</div>
            <div className="product-info"><span className="product-category">{p.category}</span><h3>{p.name}</h3><p>{p.description}</p><div className="product-bottom"><strong>{p.quoteOnly || p.price == null ? "Prix sur devis" : formatPrice(p.price)}</strong>{p.quoteOnly || p.price == null ? <button className="quote-product-button" onClick={() => addToQuote(p)}>Ajouter au devis <MessageCircle size={14}/></button> : <button onClick={() => addToCart(p)}>Ajouter <Plus size={14}/></button>}</div>{!p.quoteOnly && <small className="price-note">Prix indicatif — disponibilité à confirmer</small>}</div>
          </article>)}
          {filtered.length === 0 && <div className="empty-results"><Search size={30}/><h3>Aucun produit trouvé</h3><p>Essayez un autre mot-clé ou choisissez une autre catégorie.</p><button onClick={() => {setSearch(""); setCategory("Tout voir");}}>Réinitialiser</button></div>}
        </div>
        <p className="catalog-note">Catalogue de démonstration : les prix affichés sont indicatifs. Confirmez la disponibilité, le modèle, le prix final et la livraison auprès de notre équipe avant tout paiement.</p>
      </section>

      <section className="cta-band"><div className="cta-icon"><MessageCircle size={28}/></div><div><span>UN PROJET SPÉCIFIQUE ?</span><h2>Besoin d'un conseil ou d'un devis ?</h2><p>Parlons de votre besoin en équipement, énergie solaire ou toiture.</p></div><a href={`https://wa.me/${config.whatsappNumber}?text=${encodeURIComponent("Bonjour NEWS TECHNOLOGY VILLAGE, je souhaite obtenir des informations sur vos produits et services.")}`} target="_blank" rel="noreferrer">Écrire sur WhatsApp <ArrowRight size={17}/></a></section>
    </main>

    <footer id="contact" className="footer">
      <div className="footer-main"><div className="footer-brand"><a className="brand" href="#"><div className="brand-mark"><Zap size={27} fill="currentColor"/></div><div><strong>NEWS <em>TECHNOLOGY</em></strong><small>V I L L A G E</small></div></a><p>Des solutions pour la mobilité, l'énergie et l'habitat. Au service de vos projets au Bénin et dans les pays voisins.</p></div>
      <div><h4>Nos activités</h4><a href="#catalogue" onClick={() => setCategory("Motos et scooters électriques")}>Motos et scooters électriques</a><a href="#catalogue" onClick={() => setCategory("Panneaux et équipements solaires")}>Panneaux et équipements solaires</a><a href="#catalogue" onClick={() => setCategory("Électroménager et équipements électriques")}>Électroménager</a><a href="#catalogue" onClick={() => setCategory("Matériel électrique")}>Matériel électrique</a><a href="#catalogue" onClick={() => setCategory("Toiture et matériaux de construction")}>Toiture et construction</a></div>
      <div><h4>Informations</h4><a href="#contact">Contact & conseils</a><a href="#catalogue">Catalogue produits</a><a href="#activites">Nos expertises</a></div>
      <div className="footer-contact"><h4>Contact</h4><p>Abomey-Calavi, Bénin</p><a href={`https://wa.me/${config.whatsappNumber}`} target="_blank" rel="noreferrer"><MessageCircle size={16}/> +229 01 42 22 21 97</a><small>Livraison à confirmer selon destination.</small></div></div>
      <div className="footer-bottom"><span>© {new Date().getFullYear()} NEWS TECHNOLOGY VILLAGE. Tous droits réservés.</span><span>Boutique officielle · Bénin</span></div>
    </footer>

    {toast && <div className="toast">{toast}</div>}
    {cartOpen && <div className="overlay" onMouseDown={e => { if(e.target === e.currentTarget) setCartOpen(false); }}><aside className="drawer"><div className="drawer-head"><div><span className="section-kicker">VOTRE SÉLECTION</span><h2>Mon panier <small>({cartCount})</small></h2></div><button className="close-button" onClick={() => setCartOpen(false)} aria-label="Fermer"><X/></button></div>
      {cart.length === 0 ? <div className="cart-empty"><ShoppingBag size={44}/><h3>Votre panier est vide</h3><p>Ajoutez les produits qui vous intéressent pour préparer votre commande.</p><button className="primary-button" onClick={() => setCartOpen(false)}>Continuer mes achats</button></div> :
      <><div className="cart-items">{cart.map(item => <div className="cart-item" key={item.id}><div className="cart-item-emoji">{item.emoji}</div><div className="cart-item-info"><b>{item.name}</b><strong>{formatPrice(item.price)}</strong><div className="qty"><button onClick={() => changeQty(item.id, -1)} aria-label="Diminuer"><Minus size={13}/></button><span>{item.quantity}</span><button onClick={() => changeQty(item.id, 1)} aria-label="Augmenter"><Plus size={13}/></button><button className="remove-item" onClick={() => setCart(c => c.filter(i => i.id !== item.id))} aria-label="Supprimer"><Trash2 size={14}/></button></div></div></div>)}</div><div className="cart-summary"><div><span>Total indicatif</span><strong>{formatPrice(total)}</strong></div><small>Le prix final, la disponibilité et la livraison seront confirmés par notre équipe.</small><button className="primary-button full-button" onClick={() => {setCartOpen(false); setCheckoutOpen(true);}}>Passer la commande <ArrowRight size={17}/></button></div></>}
    </aside></div>}

    {checkoutOpen && <div className="overlay" onMouseDown={e => { if(e.target === e.currentTarget) setCheckoutOpen(false); }}><section className="checkout-modal"><div className="drawer-head"><div><span className="section-kicker">DERNIÈRE ÉTAPE</span><h2>Préparer ma commande</h2></div><button className="close-button" onClick={() => setCheckoutOpen(false)} aria-label="Fermer"><X/></button></div><p className="checkout-intro">Renseignez vos coordonnées. Votre demande sera préparée et envoyée sur WhatsApp pour confirmation.</p>
      <form onSubmit={submitOrder}><label>Nom complet<input required value={customer.name} onChange={e => setCustomer({...customer,name:e.target.value})} placeholder="Votre nom"/></label><label>Téléphone / WhatsApp<input required value={customer.phone} onChange={e => setCustomer({...customer,phone:e.target.value})} placeholder="+229 ..."/></label><label>Pays<select value={customer.country} onChange={e => setCustomer({...customer,country:e.target.value})}>{["Bénin","Togo","Nigeria","Burkina Faso","Niger","Côte d’Ivoire","Ghana","Autre"].map(c => <option key={c}>{c}</option>)}</select></label><label>Adresse ou ville de livraison<textarea required value={customer.address} onChange={e => setCustomer({...customer,address:e.target.value})} placeholder="Ville, quartier, précisions..."/></label><label>Mode de paiement souhaité<select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}><option>Paiement à la livraison</option><option>MTN Mobile Money</option><option>Moov Money</option><option value="Carte bancaire">Carte bancaire (Visa / Mastercard)</option><option>Virement bancaire</option></select></label><div className="checkout-total"><span>Total indicatif</span><b>{formatPrice(total)}</b></div><p className="payment-warning">Le choix du moyen de paiement exprime votre préférence. Le paiement électronique n’est pas encore traité directement sur ce site ; notre équipe confirmera la procédure de règlement.</p><button className="primary-button full-button" type="submit" disabled={busy}>{busy ? "Préparation..." : "Envoyer ma demande sur WhatsApp"} <ArrowRight size={17}/></button></form>
    </section></div>}
  </div>;
}

createRoot(document.getElementById("root")).render(<App/>);
