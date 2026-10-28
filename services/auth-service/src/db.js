import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * Opens (or creates) the auth database.
 * Tables:
 *  - users           one row per account; only a bcrypt hash of the password is stored
 *  - refresh_tokens  one row per issued refresh token; only a SHA-256 hash of the token is stored
 */
export function openDatabase(dbPath) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      token_hash  TEXT NOT NULL UNIQUE,
      family_id   TEXT NOT NULL,
      expires_at  INTEGER NOT NULL,
      created_at  INTEGER NOT NULL,
      revoked_at  INTEGER,
      replaced_by TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
  `);
  return db;
}

/** Raised when the database cannot be reached (closed, locked, disk error...). Mapped to HTTP 503. */
export class DbUnavailableError extends Error {
  constructor(cause) {
    super("Database unavailable", { cause });
    this.code = "DB_UNAVAILABLE";
  }
}

/** Wraps a query: constraint violations pass through, anything else means the DB is unavailable. */
const guard = (fn) => (...args) => {
  try {
    return fn(...args);
  } catch (err) {
    if (/constraint/i.test(err.message)) throw err;
    throw new DbUnavailableError(err);
  }
};

/** Small repository layer. Every query uses bound parameters (no string concatenation). */
export function createRepo(db) {
  const q = {
    insertUser: db.prepare("INSERT INTO users (id, email, name, password_hash, role) VALUES (?, ?, ?, ?, ?)"),
    userByEmail: db.prepare("SELECT * FROM users WHERE email = ?"),
    userById: db.prepare("SELECT id, email, name, role, created_at FROM users WHERE id = ?"),
    insertRefresh: db.prepare(
      "INSERT INTO refresh_tokens (id, user_id, token_hash, family_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    ),
    refreshByHash: db.prepare("SELECT * FROM refresh_tokens WHERE token_hash = ?"),
    revokeRefresh: db.prepare("UPDATE refresh_tokens SET revoked_at = ?, replaced_by = ? WHERE id = ? AND revoked_at IS NULL"),
    revokeFamily: db.prepare("UPDATE refresh_tokens SET revoked_at = ? WHERE family_id = ? AND revoked_at IS NULL"),
    ping: db.prepare("SELECT 1 AS ok")
  };

  return {
    createUser: guard((u) => q.insertUser.run(u.id, u.email, u.name, u.passwordHash, u.role || "customer")),
    findUserByEmail: guard((email) => q.userByEmail.get(email)),
    findUserById: guard((id) => q.userById.get(id)),
    saveRefresh: guard((t) => q.insertRefresh.run(t.id, t.userId, t.tokenHash, t.familyId, t.expiresAt, t.createdAt)),
    findRefresh: guard((hash) => q.refreshByHash.get(hash)),
    revokeRefresh: guard((id, replacedBy = null) => q.revokeRefresh.run(Date.now(), replacedBy, id)),
    revokeFamily: guard((familyId) => q.revokeFamily.run(Date.now(), familyId)),
    ping: guard(() => q.ping.get())
  };
}
