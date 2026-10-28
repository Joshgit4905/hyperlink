import express from "express";
import helmet from "helmet";
import cors from "cors";
import { createRepo, DbUnavailableError } from "./db.js";
import { createAuthMiddleware, AuthError } from "./auth.js";
import { CATALOG } from "./catalog.js";

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function audit(logger, event, data = {}) {
  logger.info(JSON.stringify({ ts: new Date().toISOString(), service: "orders", event, ...data }));
}

export function createApp({ db, config, keySet, logger = console }) {
  const repo = createRepo(db);
  const { requireAuth, requireRole } = createAuthMiddleware(config, keySet);

  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, methods: ["GET", "POST"], allowedHeaders: ["Authorization", "Content-Type"], maxAge: 600 }));
  app.use(express.json({ limit: "10kb" }));

  app.get("/health", (_req, res) => {
    try {
      repo.ping();
      res.json({ status: "ok", db: "ok" });
    } catch {
      res.status(503).json({ status: "degraded", db: "down" });
    }
  });

  // Public: the menu does not need authentication.
  app.get("/menu", (_req, res) => res.json({ items: [...CATALOG.values()] }));

  // Protected: the signed-in user's own orders.
  app.get("/orders", requireAuth, (req, res) => {
    res.set("Cache-Control", "no-store");
    res.json({ orders: repo.listForUser(req.user.sub).map(({ userSub, ...o }) => o) });
  });

  app.post("/orders", requireAuth, (req, res) => {
    const lines = Array.isArray(req.body?.items) ? req.body.items : null;
    if (!lines || lines.length === 0 || lines.length > 30) {
      throw new HttpError(400, "invalid_items", "Send between 1 and 30 items.");
    }
    const items = lines.map((line) => {
      const product = CATALOG.get(String(line?.id));
      const qty = Number(line?.qty);
      if (!product || !Number.isInteger(qty) || qty < 1 || qty > 20) {
        throw new HttpError(400, "invalid_items", "One of the items is not valid.");
      }
      return { id: product.id, name: product.name, price: product.price, qty };
    });
    const total = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
    const { userSub, ...order } = repo.create(req.user.sub, items, total);
    audit(logger, "order_created", { sub: req.user.sub, orderId: order.id, total });
    res.status(201).json({ order });
  });

  // Protected + role-based: only staff (role "admin") can see every order.
  app.get("/admin/orders", requireAuth, requireRole("admin"), (_req, res) => {
    res.json({ orders: repo.listAll() });
  });

  app.use(() => {
    throw new HttpError(404, "not_found", "Not found.");
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    if (err instanceof HttpError || err instanceof AuthError) {
      if (err.status === 401 || err.status === 403) audit(logger, "access_denied", { path: req.path, reason: err.code });
      if (err.status === 401) res.set("WWW-Authenticate", `Bearer error="${err.code}"`);
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
      return res.status(400).json({ error: "bad_request", message: "Malformed request body." });
    }
    if (err instanceof DbUnavailableError) {
      audit(logger, "db_unavailable", { message: err.cause?.message });
      return res.status(503).json({ error: "service_unavailable", message: "Orders are temporarily unavailable." });
    }
    audit(logger, "unhandled_error", { message: err.message });
    res.status(500).json({ error: "internal_error", message: "Something went wrong." });
  });

  return app;
}
