/* Aroma Café — Sign in / Create account: mode switch, validation, demo session */
(function () {
  "use strict";

  const USER_KEY = "aroma-user";
  const store = window.Aroma ? window.Aroma.store : { get: (_, f) => f, set() {} };

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
      if (mode === "create" && scorePassword(v) < 2) return "Add a number, a symbol or an uppercase letter.";
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
  form.addEventListener("submit", (e) => {
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

    // Demo only: no real backend. Simulate a short network request.
    setTimeout(() => {
      submit.classList.remove("is-loading");
      submit.disabled = false;
      const email = fields.email.value.trim();
      const name = mode === "create" ? fields.name.value.trim() : email.split("@")[0];
      store.set(USER_KEY, { name, email });
      showSuccess(name, mode === "create");
    }, 900);
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
  }

  document.getElementById("sign-out").addEventListener("click", () => {
    try { localStorage.removeItem(USER_KEY); } catch (_) { /* ignore */ }
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
  const saved = store.get(USER_KEY, null);
  if (saved && saved.name) showSuccess(saved.name, false);
  panel.classList.add("is-ready");
})();
