/* Aroma Café — Menu page: data, rendering, search and filters */
(function () {
  "use strict";

  const IMG = "assets/img/";
  const CATEGORIES = [
    { id: "espresso", title: "Espresso", note: "Double shot, 18 g in · 36 g out" },
    { id: "brewed", title: "Brewed", note: "Hand-poured, one cup at a time" },
    { id: "cold", title: "Cold", note: "Steeped 18 hours" },
    { id: "bakery", title: "Bakery", note: "Baked every morning at 4 a.m." },
    { id: "beans", title: "Beans", note: "Roasted Mondays · 340 g bags" }
  ];

  const ITEMS = [
    { id: "esp-01", cat: "espresso", name: "Espresso", desc: "Huila single origin. Dark chocolate, red apple.", price: 3.25, img: "espresso.svg" },
    { id: "esp-02", cat: "espresso", name: "Cortado", desc: "Equal parts espresso and steamed milk.", price: 4.0, img: "espresso.svg" },
    { id: "esp-03", cat: "espresso", name: "Flat White", desc: "Ristretto with silky micro-foam.", price: 4.5, img: "latte.svg" },
    { id: "esp-04", cat: "espresso", name: "Oat Latte", desc: "Double shot with house oat milk. Nutty, barely sweet.", price: 5.25, img: "latte.svg", badge: "Popular" },
    { id: "esp-05", cat: "espresso", name: "Maple Cinnamon Latte", desc: "Vermont maple, Ceylon cinnamon, whole milk.", price: 5.75, img: "latte.svg", badge: "New" },
    { id: "brw-01", cat: "brewed", name: "Pour-Over", desc: "Rotating single origin, brewed in a V60.", price: 5.0, img: "pourover.svg" },
    { id: "brw-02", cat: "brewed", name: "Batch Brew", desc: "Our daily house blend, always fresh.", price: 3.0, img: "pourover.svg" },
    { id: "brw-03", cat: "brewed", name: "Ethiopia Guji Pour-Over", desc: "Jasmine, bergamot, peach.", price: 6.25, img: "pourover.svg", badge: "Limited" },
    { id: "cld-01", cat: "cold", name: "Cold Brew", desc: "Chocolate-forward and smooth, over ice.", price: 4.75, img: "coldbrew.svg" },
    { id: "cld-02", cat: "cold", name: "Cold Brew Reserve", desc: "An 18-hour steep in a 250 ml bottle to go.", price: 6.5, img: "coldbrew.svg", badge: "New" },
    { id: "cld-03", cat: "cold", name: "Iced Oat Latte", desc: "Espresso over oat milk and ice.", price: 5.5, img: "latte.svg" },
    { id: "bak-01", cat: "bakery", name: "Butter Croissant", desc: "84 layers of French butter.", price: 3.75, img: "croissant.svg", badge: "Popular" },
    { id: "bak-02", cat: "bakery", name: "Almond Croissant", desc: "Twice baked with frangipane.", price: 4.5, img: "croissant.svg" },
    { id: "bak-03", cat: "bakery", name: "Pain au Chocolat", desc: "Two batons of 70% dark chocolate.", price: 4.25, img: "croissant.svg" },
    { id: "bea-01", cat: "beans", name: "Huila, Colombia", desc: "Medium roast. Caramel, red apple, cocoa.", price: 18.0, img: "beans.svg" },
    { id: "bea-02", cat: "beans", name: "Guji, Ethiopia", desc: "Light roast. Jasmine, bergamot, peach.", price: 21.0, img: "beans.svg" },
    { id: "bea-03", cat: "beans", name: "House Espresso Blend", desc: "Brazil and Colombia. Hazelnut, milk chocolate.", price: 16.5, img: "beans.svg" }
  ];

  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

  const sectionsEl = document.getElementById("menu-sections");
  const searchEl = document.getElementById("menu-search");
  const countEl = document.getElementById("menu-count");
  const emptyEl = document.getElementById("menu-empty");
  const chips = Array.from(document.querySelectorAll(".chip"));

  const state = { filter: "all", query: "" };

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function cardHTML(item, index) {
    return `
      <article class="menu-card" style="animation-delay:${Math.min(index, 8) * 40}ms">
        ${item.badge ? `<span class="menu-card__badge">${item.badge}</span>` : ""}
        <div class="menu-card__media"><img src="${IMG}${item.img}" alt="" loading="lazy" width="160" height="160"></div>
        <h3 class="menu-card__title">${escapeHTML(item.name)}</h3>
        <p class="menu-card__desc">${escapeHTML(item.desc)}</p>
        <div class="menu-card__foot">
          <span class="menu-card__price">${fmt.format(item.price)}</span>
          <button class="add-btn" type="button" aria-label="Add ${escapeHTML(item.name)} to bag"
            data-add-to-bag data-id="${item.id}" data-name="${escapeHTML(item.name)}" data-price="${item.price}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
      </article>`;
  }

  function matches(item) {
    if (state.filter !== "all" && item.cat !== state.filter) return false;
    if (!state.query) return true;
    const hay = `${item.name} ${item.desc} ${item.cat}`.toLowerCase();
    return state.query.split(/\s+/).every((word) => hay.includes(word));
  }

  function render() {
    const visible = ITEMS.filter(matches);
    const html = CATEGORIES.map((cat) => {
      const items = visible.filter((i) => i.cat === cat.id);
      if (!items.length) return "";
      return `
        <section class="menu-section" id="${cat.id}" aria-labelledby="h-${cat.id}">
          <div class="container">
            <div class="menu-section__head">
              <h2 id="h-${cat.id}" class="display-md">${cat.title}</h2>
              <p class="caption">${cat.note}</p>
            </div>
            <div class="menu-grid">${items.map(cardHTML).join("")}</div>
          </div>
        </section>`;
    }).join("");

    sectionsEl.innerHTML = html;
    emptyEl.hidden = visible.length > 0;
    countEl.textContent = `${visible.length} item${visible.length === 1 ? "" : "s"}`;
  }

  function setFilter(filter) {
    state.filter = filter;
    chips.forEach((c) => c.setAttribute("aria-pressed", String(c.dataset.filter === filter)));
    render();
  }

  chips.forEach((chip) => chip.addEventListener("click", () => setFilter(chip.dataset.filter)));

  let debounce;
  searchEl.addEventListener("input", () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      state.query = searchEl.value.trim().toLowerCase();
      render();
    }, 120);
  });

  document.getElementById("menu-reset").addEventListener("click", () => {
    searchEl.value = "";
    state.query = "";
    setFilter("all");
    searchEl.focus();
  });

  // Sub-nav anchors show every category, then scroll to it.
  document.querySelectorAll('.sub-nav__links a[href^="#"]').forEach((a) => {
    a.addEventListener("click", () => {
      if (state.filter !== "all" || state.query) {
        searchEl.value = "";
        state.query = "";
        setFilter("all");
      }
    });
  });

  render();

  if (location.hash === "#search") searchEl.focus();
  else if (location.hash) {
    const target = document.querySelector(location.hash);
    if (target) target.scrollIntoView();
  }
})();
