/* Aroma Café — shared behaviour (nav, reveal, bag, toast) */
(function () {
  "use strict";

  const BAG_KEY = "aroma-bag";

  /* ---------- Safe storage ---------- */
  const store = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (_) {
        return fallback;
      }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) { /* storage unavailable */ }
    }
  };

  /* ---------- Mobile navigation ---------- */
  const toggle = document.querySelector(".nav-toggle");
  const links = document.getElementById("primary-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => {
      const open = links.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
      document.body.style.overflow = open ? "hidden" : "";
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && links.classList.contains("is-open")) toggle.click();
    });
  }

  /* ---------- Reveal on scroll ---------- */
  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    revealEls.forEach((el) => io.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  /* ---------- Toast ---------- */
  let toastEl;
  let toastTimer;
  function toast(message) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = message;
    requestAnimationFrame(() => toastEl.classList.add("is-shown"));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-shown"), 2600);
  }

  /* ---------- Bag ---------- */
  function getBag() { return store.get(BAG_KEY, []); }
  function renderBagCount() {
    const count = getBag().reduce((n, item) => n + item.qty, 0);
    document.querySelectorAll("[data-bag-count]").forEach((el) => {
      el.textContent = count > 0 ? String(count) : "";
    });
    document.querySelectorAll("[data-bag-label]").forEach((el) => {
      el.setAttribute("aria-label", count > 0 ? `Bag, ${count} item${count === 1 ? "" : "s"}` : "Bag, empty");
    });
  }
  function addToBag(item) {
    const bag = getBag();
    const existing = bag.find((b) => b.id === item.id);
    if (existing) existing.qty += 1;
    else bag.push({ id: item.id, name: item.name, price: item.price, qty: 1 });
    store.set(BAG_KEY, bag);
    renderBagCount();
    toast(`${item.name} added to your bag`);
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add-to-bag]");
    if (!btn) return;
    addToBag({
      id: btn.dataset.id,
      name: btn.dataset.name,
      price: Number(btn.dataset.price)
    });
  });

  renderBagCount();

  /* ---------- Footer year ---------- */
  document.querySelectorAll("[data-year]").forEach((el) => { el.textContent = new Date().getFullYear(); });

  window.Aroma = { store, toast, addToBag, getBag, renderBagCount };
})();
