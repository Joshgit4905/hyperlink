/* Aroma Café — Sign in / Create account: mode switch, client-side validation, real auth via auth-service */
(function () {
  "use strict";

  const auth = window.AromaAuth;
  // Legacy fake session from v1.0 (localStorage). Remove it: tokens are never stored in web storage now.
  try { localStorage.removeItem("aroma-user"); } catch (_) { /* ignore */ }

  const form = document.getElementById("auth-form");
  const panel = document.querySelector(".auth__panel");
  const segmented = document.querySelector(".segmented");
  const tabs = Array.from(document.querySelectorAll(".segmented__btn"));
  const title = document.getElementById("auth-title");
  const sub = document.querySelector(".auth__sub");
  const submit = form.querySelector(".auth__submit");
  const submitLabel = form.querySelector(".auth__submit-label");
  const status = document.getElementById("form-status");
  const success = document.getElementById("auth-success");
  const strength = document.querySelector(".strength");

  const fields = {
    name: document.getElementById("name"),
    email: document.getElementById("email"),
    password: document.getElementById("password"),
    confirm: document.getElementById("confirm"),
    terms: document.getElementById("terms")
  };

  let mode = "signin";
  const touched = new Set();

  /* ---------- Mode switch ---------- */
  function setMode(next, focus) {
    mode = next;
    segmented.dataset.mode = next;
    tabs.forEach((t) => {
      const active = t.dataset.mode === next;
      t.setAttribute("aria-selected", String(active));
      t.tabIndex = active ? 0 : -1;
      if (active) form.setAttribute("aria-labelledby", t.id);
    });
    form.querySelectorAll("[data-only]").forEach((el) => { el.hidden = el.dataset.only !== next; });
    title.textContent = title.dataset[next === "create" ? "titleCreate" : "titleSignin"];
    sub.textContent = sub.dataset[next === "create" ? "subCreate" : "subSignin"];
    submitLabel.textContent = next === "create" ? "Create account" : "Sign in";
    fields.password.autocomplete = next === "create" ? "new-password" : "current-password";
    touched.clear();
    clearErrors();
    status.textContent = "";
    if (focus) (next === "create" ? fields.name : fields.email).focus();
  }

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => setMode(tab.dataset.mode, true));
    tab.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const other = tabs.find((t) => t !== tab);
      other.focus();
      setMode(other.dataset.mode, false);
    });
  });

  /* ---------- Show / hide password ---------- */
  const toggle = form.querySelector(".field__toggle");
  toggle.addEventListener("click", () => {
    const show = fields.password.type === "password";
    fields.password.type = show ? "text" : "password";
    toggle.textContent = show ? "Hide" : "Show";
    toggle.setAttribute("aria-pressed", String(show));
    toggle.setAttribute("aria-label", show ? "Hide password" : "Show password");
  });

  /* ---------- Validation rules ---------- */
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function scorePassword(pw) {
    let score = 0;
    if (pw.length >= 8) score++;
    if (pw.length >= 12) score++;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
    if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
    return pw ? Math.max(1, score) : 0;
  }

  const rules = {
    name: (v) => (mode !== "create" ? "" : v.trim().length < 2 ? "Enter your full name." : ""),
    email: (v) => (!v.trim() ? "Enter your email address." : !EMAIL_RE.test(v.trim()) ? "Enter a valid email, like name@example.com." : ""),
    password: (v) => {
      if (!v) return "Enter your password.";
      if (v.length < 8) return "Your password must be at least 8 characters.";
      if (mode === "create" && !(/[A-Za-z]/.test(v) && /\d/.test(v))) return "Use letters and at least one number.";
      return "";
    },
    confirm: (v) => (mode !== "create" ? "" : !v ? "Confirm your password." : v !== fields.password.value ? "Passwords don't match." : ""),
    terms: () => (mode === "create" && !fields.terms.checked ? "Please accept the terms to continue." : "")
  };

  function showError(name, message) {
    const input = fields[name];
    const err = document.getElementById(`${name}-error`);
    const wrap = input.closest(".field");
    if (err) err.textContent = message;
    input.setAttribute("aria-invalid", message ? "true" : "false");
    if (wrap) {
      wrap.classList.toggle("is-invalid", Boolean(message));
      wrap.classList.toggle("is-valid", !message && input.value !== "");
    }
  }

  function clearErrors() {
    Object.keys(fields).forEach((n) => showError(n, ""));
  }

  function validate(name) {
    const message = rules[name](fields[name].value);
    showError(name, message);
    return !message;
  }

  function activeFields() {
    return mode === "create" ? ["name", "email", "password", "confirm", "terms"] : ["email", "password"];
  }

  /* Validate on blur, re-validate on input once touched */
  ["name", "email", "password", "confirm"].forEach((name) => {
    fields[name].addEventListener("blur", () => {
      if (!fields[name].value && !touched.has(name)) return;
      touched.add(name);
      validate(name);
    });
    fields[name].addEventListener("input", () => {
      if (touched.has(name)) validate(name);
      if (name === "password" && touched.has("confirm")) validate("confirm");
    });
  });
  fields.terms.addEventListener("change", () => validate("terms"));

  /* Strength meter */
  const hint = document.getElementById("password-hint");
  const LABELS = ["Use 8 or more characters with a mix of letters, numbers and symbols.", "Weak password.", "Fair password.", "Good password.", "Strong password."];
  fields.password.addEventListener("input", () => {
    const s = scorePassword(fields.password.value);
    strength.dataset.score = String(s);
    hint.textContent = LABELS[s];
  });

  /* ---------- Submit ---------- */
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    status.textContent = "";
    const names = activeFields();
    names.forEach((n) => touched.add(n));
    const results = names.map(validate);
    if (results.includes(false)) {
      const firstBad = names[results.indexOf(false)];
      fields[firstBad].focus();
      return;
    }

    submit.classList.add("is-loading");
    submit.disabled = true;

    const email = fields.email.value.trim();
    const password = fields.password.value;
    const isNew = mode === "create";
    try {
      const user = isNew
        ? await auth.register(fields.name.value.trim(), email, password)
        : await auth.login(email, password);
      form.reset();
      showSuccess(user.name, isNew);
    } catch (err) {
      // Server messages are already user-safe and generic (e.g. "Invalid email or password.").
      status.textContent = err.message;
      if (err.code === "email_taken") showError("email", err.message);
      fields.password.value = "";
      fields.password.focus();
    } finally {
      submit.classList.remove("is-loading");
      submit.disabled = false;
    }
  });

  function showSuccess(name, isNew) {
    const first = name.split(/\s+/)[0];
    document.getElementById("success-title").textContent = isNew ? `Welcome to Aroma, ${first}.` : `Welcome back, ${first}.`;
    document.getElementById("success-text").textContent = isNew
      ? "Your account is ready. Your first star is already waiting."
      : "You're signed in. Your usual is one tap away.";
    form.hidden = true;
    segmented.hidden = true;
    title.hidden = true;
    sub.hidden = true;
    success.hidden = false;
    success.focus();
    loadOrders();
  }

  /* Protected request: GET /orders on orders-api with the Bearer access token. */
  const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
  async function loadOrders() {
    const list = document.getElementById("orders-list");
    const note = document.getElementById("orders-note");
    list.innerHTML = "";
    note.textContent = "Loading your orders…";
    try {
      const { orders } = await auth.apiFetch("/orders");
      note.textContent = orders.length ? "" : "No orders yet. Your first one is a tap away.";
      orders.slice(0, 5).forEach((o) => {
        const li = document.createElement("li");
        const items = o.items.map((i) => `${i.qty} × ${i.name}`).join(", ");
        li.innerHTML = `<strong></strong><span class="total"></span><span></span><span></span>`;
        const [n, t, d, when] = li.children;
        n.textContent = `Order #${o.id}`;
        t.textContent = fmt.format(o.total);
        d.textContent = items;
        when.textContent = new Date(o.createdAt.replace(" ", "T") + "Z").toLocaleString();
        list.appendChild(li);
      });
    } catch (err) {
      note.textContent = err.status === 401 ? "Your session expired. Please sign in again." : "Orders are unavailable right now.";
    }
  }

  document.getElementById("sign-out").addEventListener("click", async () => {
    await auth.logout();
    form.reset();
    success.hidden = true;
    form.hidden = false;
    segmented.hidden = false;
    title.hidden = false;
    sub.hidden = false;
    setMode("signin", true);
    if (window.Aroma) window.Aroma.toast("You've been signed out.");
  });

  /* ---------- Init ---------- */
  setMode(location.hash === "#create" ? "create" : "signin", false);
  // Silent session restore: auth-client already called /auth/refresh with the HttpOnly cookie.
  auth.ready.then(() => { if (auth.user) showSuccess(auth.user.name, false); });
  panel.classList.add("is-ready");
})();
