/* Aroma Café — Visit page: live open/closed status, today's hours, contact form */
(function () {
  "use strict";

  /* ---------- Opening hours (24h, café local time) ---------- */
  const HOURS = {
    0: [8, 17], 1: [7, 19], 2: [7, 19], 3: [7, 19], 4: [7, 19], 5: [7, 19], 6: [8, 17]
  };
  const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

  function cafeNow() {
    // The café is in Portland (America/Los_Angeles). Fall back to local time if unsupported.
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Los_Angeles", weekday: "short", hour: "numeric", minute: "numeric", hour12: false
      }).formatToParts(new Date());
      const get = (t) => parts.find((p) => p.type === t).value;
      const day = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
      return { day, minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")) };
    } catch (_) {
      const d = new Date();
      return { day: d.getDay(), minutes: d.getHours() * 60 + d.getMinutes() };
    }
  }

  const fmtHour = (h) => `${h}:00`;

  function updateStatus() {
    const { day, minutes } = cafeNow();
    const [open, close] = HOURS[day];
    const pill = document.getElementById("open-status");
    const text = pill.querySelector(".status-pill__text");
    const isOpen = minutes >= open * 60 && minutes < close * 60;

    pill.classList.toggle("is-open", isOpen);
    pill.classList.toggle("is-closed", !isOpen);

    if (isOpen) {
      const left = close * 60 - minutes;
      text.textContent = left <= 60 ? `Open now · Closing in ${left} min` : `Open now · Until ${fmtHour(close)}`;
    } else if (minutes < open * 60) {
      text.textContent = `Closed · Opens today at ${fmtHour(open)}`;
    } else {
      const next = (day + 1) % 7;
      text.textContent = `Closed · Opens ${DAY_NAMES[next]} at ${fmtHour(HOURS[next][0])}`;
    }

    document.querySelectorAll("#hours tr").forEach((row) => {
      row.classList.toggle("is-today", Number(row.dataset.day) === day);
    });
  }

  updateStatus();
  setInterval(updateStatus, 60 * 1000);

  /* ---------- Contact form ---------- */
  const form = document.getElementById("contact-form");
  const status = document.getElementById("c-status");
  const message = document.getElementById("c-message");
  const count = document.getElementById("c-count");
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  const rules = {
    "c-name": (v) => (v.trim().length < 2 ? "Please tell us your name." : ""),
    "c-email": (v) => (!v.trim() ? "We need an email to reply." : !EMAIL_RE.test(v.trim()) ? "That email doesn't look right." : ""),
    "c-message": (v) => (v.trim().length < 10 ? "Write at least 10 characters." : "")
  };

  function validate(id) {
    const input = document.getElementById(id);
    const msg = rules[id](input.value);
    input.closest(".c-field").classList.toggle("is-invalid", Boolean(msg));
    input.setAttribute("aria-invalid", msg ? "true" : "false");
    document.getElementById(`${id}-error`).textContent = msg;
    return !msg;
  }

  Object.keys(rules).forEach((id) => {
    const input = document.getElementById(id);
    input.addEventListener("blur", () => { if (input.value) validate(id); });
    input.addEventListener("input", () => {
      if (input.closest(".c-field").classList.contains("is-invalid")) validate(id);
    });
  });

  message.addEventListener("input", () => {
    count.textContent = `${message.value.length} / ${message.maxLength}`;
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    status.className = "c-status";
    status.textContent = "";
    const ids = Object.keys(rules);
    const ok = ids.map(validate);
    if (ok.includes(false)) {
      document.getElementById(ids[ok.indexOf(false)]).focus();
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = "Sending…";

    // Demo only: no backend. Simulate a request.
    setTimeout(() => {
      const name = document.getElementById("c-name").value.trim().split(/\s+/)[0];
      const topic = form.querySelector('input[name="topic"]:checked').value;
      form.reset();
      count.textContent = `0 / ${message.maxLength}`;
      btn.disabled = false;
      btn.textContent = "Send message";
      status.classList.add("is-success");
      status.textContent = `Thanks, ${name}. Your ${topic} message is on its way. We'll reply within one business day.`;
      if (window.Aroma) window.Aroma.toast("Message sent");
    }, 900);
  });
})();
