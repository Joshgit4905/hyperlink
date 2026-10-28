import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { decodeJwt, decodeProtectedHeader } from "jose";
import { loadConfig } from "../src/config.js";
import { openDatabase } from "../src/db.js";
import { loadOrCreateKeys } from "../src/keys.js";
import { createApp } from "../src/app.js";

// Demo data only: no real people, emails or passwords.
const DEMO = { name: "Demo Customer", email: "demo@aroma.test", password: "Latte2026!" };
const silent = { info() {} };

let server;
let base;
let db;

before(async () => {
  const config = { ...loadConfig({}), bcryptCost: 4, loginMaxAttempts: 3, cookieSecure: false };
  db = openDatabase(":memory:");
  const keys = await loadOrCreateKeys(null);
  const app = createApp({ db, keys, config, logger: silent });
  await new Promise((resolve) => { server = app.listen(0, resolve); });
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => server.close());

const post = (path, body, headers = {}) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body ?? {}) });
const cookieFrom = (res) => (res.headers.get("set-cookie") || "").split(";")[0];

let session = {};

test("register creates an account and returns a session", async () => {
  const res = await post("/auth/register", DEMO);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.user.email, DEMO.email);
  assert.equal(body.user.role, "customer");
  assert.equal(body.tokenType, "Bearer");
  assert.ok(body.accessToken.split(".").length === 3, "access token is a JWT");
  assert.match(res.headers.get("set-cookie"), /rt=.+HttpOnly.+SameSite=Strict/i);
});

test("register rejects a duplicate email with 409", async () => {
  const res = await post("/auth/register", DEMO);
  assert.equal(res.status, 409);
  assert.equal((await res.json()).error, "email_taken");
});

test("register rejects a weak password with 400", async () => {
  const res = await post("/auth/register", { name: "Weak", email: "weak@aroma.test", password: "short" });
  assert.equal(res.status, 400);
});

test("login with the right password returns a signed RS256 JWT with the expected claims", async () => {
  const res = await post("/auth/login", { email: DEMO.email, password: DEMO.password });
  assert.equal(res.status, 200);
  const body = await res.json();
  const header = decodeProtectedHeader(body.accessToken);
  const claims = decodeJwt(body.accessToken);
  assert.equal(header.alg, "RS256");
  assert.ok(header.kid);
  assert.equal(claims.iss, "http://localhost:4000");
  assert.equal(claims.aud, "aroma-api");
  assert.equal(claims.email, DEMO.email);
  assert.equal(claims.exp - claims.iat, 900, "access token lives 15 minutes");
  session = { access: body.accessToken, cookie: cookieFrom(res) };
});

test("login with a wrong password returns a generic 401", async () => {
  const res = await post("/auth/login", { email: DEMO.email, password: "WrongPass1" });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).message, "Invalid email or password.");
});

test("login for an unknown email returns the same generic 401", async () => {
  const res = await post("/auth/login", { email: "nobody@aroma.test", password: "Whatever1" });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).message, "Invalid email or password.");
});

test("GET /auth/me works with the bearer token and fails without it", async () => {
  const ok = await fetch(base + "/auth/me", { headers: { authorization: `Bearer ${session.access}` } });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).user.email, DEMO.email);

  const missing = await fetch(base + "/auth/me");
  assert.equal(missing.status, 401);

  const tampered = session.access.slice(0, -4) + "AAAA";
  const bad = await fetch(base + "/auth/me", { headers: { authorization: `Bearer ${tampered}` } });
  assert.equal(bad.status, 401);
});

test("JWKS exposes only the public key", async () => {
  const res = await fetch(base + "/.well-known/jwks.json");
  const { keys } = await res.json();
  assert.equal(keys.length, 1);
  assert.equal(keys[0].kty, "RSA");
  assert.equal(keys[0].d, undefined, "private exponent must never be published");
});

test("refresh rotates the refresh token, and reusing the old one revokes the session", async () => {
  const first = await post("/auth/refresh", {}, { cookie: session.cookie });
  assert.equal(first.status, 200);
  const rotated = cookieFrom(first);
  assert.notEqual(rotated, session.cookie, "a new refresh token is issued");
  assert.ok((await first.json()).accessToken);

  // Attacker replays the old (already used) token.
  const replay = await post("/auth/refresh", {}, { cookie: session.cookie });
  assert.equal(replay.status, 401);
  assert.equal((await replay.json()).error, "refresh_reused");

  // The whole family is revoked, so even the newest token stops working.
  const after = await post("/auth/refresh", {}, { cookie: rotated });
  assert.equal(after.status, 401);
});

test("logout revokes the refresh token", async () => {
  const login = await post("/auth/login", { email: DEMO.email, password: DEMO.password });
  const cookie = cookieFrom(login);
  const out = await post("/auth/logout", {}, { cookie });
  assert.equal(out.status, 204);
  const refresh = await post("/auth/refresh", {}, { cookie });
  assert.equal(refresh.status, 401);
});

test("login is rate limited after repeated failures", async () => {
  const creds = { email: "victim@aroma.test", password: "Nope12345" };
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await post("/auth/login", creds)).status);
  assert.deepEqual(statuses, [401, 401, 401, 429]);
});

test("when the database is down, health and login answer 503 without leaking details", async () => {
  db.close();
  const health = await fetch(base + "/health");
  assert.equal(health.status, 503);
  assert.deepEqual(await health.json(), { status: "degraded", db: "down" });

  const login = await post("/auth/login", { email: DEMO.email, password: DEMO.password });
  assert.equal(login.status, 503);
  const body = await login.json();
  assert.equal(body.error, "service_unavailable");
  assert.equal(body.stack, undefined);
});
