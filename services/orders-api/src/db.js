import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

export class DbUnavailableError extends Error {
  constructor(cause) {
    super("Database unavailable", { cause });
    this.code = "DB_UNAVAILABLE";
  }
}

const guard = (fn) => (...args) => {
  try {
    return fn(...args);
  } catch (err) {
    throw new DbUnavailableError(err);
  }
};

/**
 * The orders database is separate from the auth database (one database per service).
 * Orders reference users only by the JWT "sub" claim; there is no cross-service join.
 */
export function openDatabase(dbPath) {
  if (dbPath !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS orders (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_sub   TEXT NOT NULL,
      items_json TEXT NOT NULL,
      total      REAL NOT NULL,
      status     TEXT NOT NULL DEFAULT 'received',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_sub);
  `);
  return db;
}

export function createRepo(db) {
  const q = {
    insert: db.prepare("INSERT INTO orders (user_sub, items_json, total) VALUES (?, ?, ?)"),
    byId: db.prepare("SELECT * FROM orders WHERE id = ?"),
    byUser: db.prepare("SELECT * FROM orders WHERE user_sub = ? ORDER BY id DESC LIMIT 20"),
    all: db.prepare("SELECT * FROM orders ORDER BY id DESC LIMIT 100"),
    ping: db.prepare("SELECT 1 AS ok")
  };
  const toOrder = (r) => r && ({
    id: r.id, items: JSON.parse(r.items_json), total: r.total, status: r.status, createdAt: r.created_at, userSub: r.user_sub
  });
  return {
    create: guard((sub, items, total) => toOrder(q.byId.get(q.insert.run(sub, JSON.stringify(items), total).lastInsertRowid))),
    listForUser: guard((sub) => q.byUser.all(sub).map(toOrder)),
    listAll: guard(() => q.all.all().map(toOrder)),
    ping: guard(() => q.ping.get())
  };
}
