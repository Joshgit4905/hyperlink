import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import { createRepo, DbUnavailableError } from "./db.js";
import { signAccessToken, verifyAccessToken, newRefreshToken, hashToken } from "./tokens.js";
import { createLoginLimiter } from "./rateLimit.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const REFRESH_COOKIE = "rt";

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Structured security log line. Never logs passwords, tokens or full emails. */
function audit(logger, event, data = {}) {
  logger.info(JSON.stringify({ ts: new Date().toISOString(), service: "auth", event, ...data }));
}
const maskEmail = (e = "") => e.replace(/^(.).*(@.*)$/, "$1***$2");

/**
 * Builds the Express app. Dependencies are injected so tests can use an in-memory DB
 * and simulate failures (e.g. closing the DB).
 */
export function createApp({ db, keys, config, logger = console }) {
  const repo = createRepo(db);
  const limiter = createLoginLimiter({ max: config.loginMaxAttempts, windowMs: config.loginWindowMs });
  // Compared against when the email does not exist, so response time does not reveal valid accounts.
  const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", config.bcryptCost);

  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", "loopback");
  app.use(helmet());
  app.use(cors({ origin: config.corsOrigin, credentials: true, methods: ["GET", "POST"], maxAge: 600 }));
  app.use(express.json({ limit: "10kb" }));
  app.use(cookieParser());

  const refreshCookieOptions = {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: "strict",
    path: "/auth",
    maxAge: config.refreshTtlDays * 24 * 60 * 60 * 1000
  };

  const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name, role: u.role });

  /** Issues an access token + a new refresh token (same family when rotating). */
  async function issueSession(res, user, familyId = crypto.randomUUID(), rowId = crypto.randomUUID()) {
    const refreshToken = newRefreshToken();
    const now = Date.now();
    const row = {
      id: rowId,
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      familyId,
      createdAt: now,
      expiresAt: now + config.refreshTtlDays * 24 * 60 * 60 * 1000
    };
    repo.saveRefresh(row);
    const accessToken = await signAccessToken(user, keys, config);
    res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions);
    res.set("Cache-Control", "no-store");
    return { body: { accessToken, tokenType: "Bearer", expiresIn: config.accessTtl, user: publicUser(user) } };
  }

  function clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined });
  }

  /* ------------------------------------------------------------------ */
  /* Routes                                                              */
  /* ------------------------------------------------------------------ */

  app.get("/health", (_req, res) => {
    try {
      repo.ping();
      res.json({ status: "ok", db: "ok" });
    } catch {
      res.status(503).json({ status: "degraded", db: "down" });
    }
  });

  // Public keys for resource servers (orders-api) to verify JWT signatures.
  app.get("/.well-known/jwks.json", (_req, res) => {
    res.set("Cache-Control", "public, max-age=600");
    res.json(keys.jwks);
  });

  app.post("/auth/register", async (req, res) => {
    const name = String(req.body?.name ?? "").trim();
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");

    if (name.length < 2 || name.length > 80) throw new HttpError(400, "invalid_name", "Enter your full name.");
    if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, "invalid_email", "Enter a valid email address.");
    if (password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      throw new HttpError(400, "weak_password", "Use at least 8 characters with letters and numbers.");
    }
    if (repo.findUserByEmail(email)) throw new HttpError(409, "email_taken", "An account with this email already exists.");

    const user = { id: crypto.randomUUID(), email, name, role: "customer" };
    const passwordHash = await bcrypt.hash(password, config.bcryptCost);
    try {
      repo.createUser({ ...user, passwordHash });
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) throw new HttpError(409, "email_taken", "An account with this email already exists.");
      throw err;
    }
    audit(logger, "user_registered", { sub: user.id, email: maskEmail(email) });
    const { body } = await issueSession(res, user);
    res.status(201).json(body);
  });

  app.post("/auth/login", async (req, res) => {
    const email = String(req.body?.email ?? "").trim().toLowerCase();
    const password = String(req.body?.password ?? "");
    const limitKey = `${req.ip}|${email}`;

    const gate = limiter.check(limitKey);
    if (!gate.allowed) {
      audit(logger, "login_rate_limited", { ip: req.ip, email: maskEmail(email) });
      res.set("Retry-After", String(gate.retryAfter));
      throw new HttpError(429, "too_many_attempts", "Too many attempts. Try again in a minute.");
    }

    const user = email ? repo.findUserByEmail(email) : undefined;
    const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !ok) {
      audit(logger, "login_failed", { ip: req.ip, email: maskEmail(email) });
      throw new HttpError(401, "invalid_credentials", "Invalid email or password.");
    }

    limiter.reset(limitKey);
    audit(logger, "login_succeeded", { sub: user.id });
    const { body } = await issueSession(res, user);
    res.json(body);
  });

  app.post("/auth/refresh", async (req, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (!presented) throw new HttpError(401, "no_session", "Not signed in.");

    const row = repo.findRefresh(hashToken(presented));
    if (!row) {
      clearRefreshCookie(res);
      throw new HttpError(401, "invalid_refresh", "Session expired. Please sign in again.");
    }
    if (row.revoked_at) {
      // A token that was already rotated is being reused: likely stolen. Kill the whole family.
      repo.revokeFamily(row.family_id);
      clearRefreshCookie(res);
      audit(logger, "refresh_reuse_detected", { sub: row.user_id, family: row.family_id });
      throw new HttpError(401, "refresh_reused", "Session revoked. Please sign in again.");
    }
    if (row.expires_at <= Date.now()) {
      clearRefreshCookie(res);
      throw new HttpError(401, "refresh_expired", "Session expired. Please sign in again.");
    }

    const user = repo.findUserById(row.user_id);
    if (!user) {
      clearRefreshCookie(res);
      throw new HttpError(401, "invalid_refresh", "Session expired. Please sign in again.");
    }

    // Rotation: atomically revoke the presented token first. If another request already
    // rotated it (changes === 0), treat this as reuse. Then issue a new token in the same family.
    const nextId = crypto.randomUUID();
    const { changes } = repo.revokeRefresh(row.id, nextId);
    if (changes === 0) {
      repo.revokeFamily(row.family_id);
      clearRefreshCookie(res);
      audit(logger, "refresh_reuse_detected", { sub: row.user_id, family: row.family_id });
      throw new HttpError(401, "refresh_reused", "Session revoked. Please sign in again.");
    }
    const { body } = await issueSession(res, user, row.family_id, nextId);
    audit(logger, "token_refreshed", { sub: user.id });
    res.json(body);
  });

  app.post("/auth/logout", (req, res) => {
    const presented = req.cookies?.[REFRESH_COOKIE];
    if (presented) {
      const row = repo.findRefresh(hashToken(presented));
      if (row) {
        repo.revokeFamily(row.family_id);
        audit(logger, "logout", { sub: row.user_id });
      }
    }
    clearRefreshCookie(res);
    res.status(204).end();
  });

  app.get("/auth/me", async (req, res) => {
    const header = req.get("authorization") || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) throw new HttpError(401, "missing_token", "Missing bearer token.");
    let claims;
    try {
      claims = await verifyAccessToken(token, keys, config);
    } catch (err) {
      const code = err.code === "ERR_JWT_EXPIRED" ? "token_expired" : "invalid_token";
      throw new HttpError(401, code, "Invalid or expired token.");
    }
    const user = repo.findUserById(claims.sub);
    if (!user) throw new HttpError(401, "invalid_token", "Invalid or expired token.");
    res.json({ user: publicUser(user), tokenExpiresAt: claims.exp });
  });

  app.use((_req, _res) => {
    throw new HttpError(404, "not_found", "Not found.");
  });

  // Central error handler: clean JSON, no stack traces, DB failures become 503.
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    if (err.type === "entity.parse.failed" || err.type === "entity.too.large") {
      return res.status(400).json({ error: "bad_request", message: "Malformed request body." });
    }
    const dbDown = err instanceof DbUnavailableError;
    audit(logger, dbDown ? "db_unavailable" : "unhandled_error", { message: err.message });
    if (dbDown) {
      return res.status(503).json({ error: "service_unavailable", message: "Sign-in is temporarily unavailable." });
    }
    res.status(500).json({ error: "internal_error", message: "Something went wrong." });
  });

  return app;
}
