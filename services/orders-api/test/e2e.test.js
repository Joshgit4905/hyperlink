/**
 * End-to-end flow across the two microservices:
 *   browser (simulated with fetch) → auth-service (login) → orders-api (protected request)
 * Includes the failure scenarios described in docs/auth-report.md, section 5.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { SignJWT, generateKeyPair } from "jose";

import { loadConfig as loadAuthConfig } from "../../auth-service/src/config.js";
import { openDatabase as openAuthDb } from "../../auth-service/src/db.js";
import { loadOrCreateKeys } from "../../auth-service/src/keys.js";
import { createApp as createAuthApp } from "../../auth-service/src/app.js";

import { loadConfig as loadOrdersConfig } from "../src/config.js";
import { openDatabase as openOrdersDb } from "../src/db.js";
import { createApp as createOrdersApp } from "../src/app.js";

const silent = { info() {} };
const DEMO = { name: "Demo Customer", email: "demo@aroma.test", password: "Latte2026!" };
const STAFF = { name: "Demo Barista", email: "staff@aroma.test", password: "Espresso2026!" };

const listen = (app) => new Promise((resolve) => {
  const server = app.listen(0, () => resolve(server));
});
const stop = (server) => new Promise((resolve) => {
  server.closeAllConnections();
  server.close(resolve);
});
const url = (server) => `http://127.0.0.1:${server.address().port}`;

let authServer, ordersServer, AUTH, API, authDb, ordersDb, authKeys, authConfig, ordersConfig;

before(async () => {
  authConfig = { ...loadAuthConfig({}), bcryptCost: 4, cookieSecure: false };
  authDb = openAuthDb(":memory:");
  authKeys = await loadOrCreateKeys(null);
  authServer = await listen(createAuthApp({ db: authDb, keys: authKeys, config: authConfig, logger: silent }));
  AUTH = url(authServer);

  ordersConfig = { ...loadOrdersConfig({}), jwksUrl: `${AUTH}/.well-known/jwks.json` };
  ordersDb = openOrdersDb(":memory:");
  ordersServer = await listen(createOrdersApp({ db: ordersDb, config: ordersConfig, logger: silent }));
  API = url(ordersServer);
});

after(async () => {
  await stop(ordersServer);
  if (authServer.listening) await stop(authServer);
});

const json = (method, base, path, { body, token } = {}) =>
  fetch(base + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });

async function signUpAndLogin(user) {
  await json("POST", AUTH, "/auth/register", { body: user });
  const res = await json("POST", AUTH, "/auth/login", { body: { email: user.email, password: user.password } });
  return (await res.json()).accessToken;
}

let customerToken;

test("public menu is available without signing in", async () => {
  const res = await fetch(`${API}/menu`);
  assert.equal(res.status, 200);
  assert.ok((await res.json()).items.length > 10);
});

test("protected endpoint without a token answers 401 with WWW-Authenticate", async () => {
  const res = await fetch(`${API}/orders`);
  assert.equal(res.status, 401);
  assert.match(res.headers.get("www-authenticate"), /Bearer error="missing_token"/);
});

test("login at auth-service, then place an order at orders-api with the Bearer token", async () => {
  customerToken = await signUpAndLogin(DEMO);
  const res = await json("POST", API, "/orders", {
    token: customerToken,
    // The client tries to set its own price: the API must ignore it.
    body: { items: [{ id: "esp-04", qty: 2, price: 0.01 }, { id: "bak-01", qty: 1 }] }
  });
  assert.equal(res.status, 201);
  const { order } = await res.json();
  assert.equal(order.total, 14.25, "total is computed with server-side prices");
  assert.equal(order.userSub, undefined, "internal ids are not exposed");

  const list = await json("GET", API, "/orders", { token: customerToken });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).orders.length, 1);
});

test("a tampered token is rejected", async () => {
  const [h, p, s] = customerToken.split(".");
  const payload = JSON.parse(Buffer.from(p, "base64url").toString());
  payload.role = "admin"; // privilege escalation attempt
  const forged = [h, Buffer.from(JSON.stringify(payload)).toString("base64url"), s].join(".");
  const res = await json("GET", API, "/admin/orders", { token: forged });
  assert.equal(res.status, 401);
});

test("a token signed by someone else's key is rejected", async () => {
  const { privateKey } = await generateKeyPair("RS256");
  const fake = await new SignJWT({ role: "admin" })
    .setProtectedHeader({ alg: "RS256", kid: authKeys.kid })
    .setIssuer(authConfig.issuer).setAudience(authConfig.audience).setSubject("attacker")
    .setIssuedAt().setExpirationTime("5m").sign(privateKey);
  const res = await json("GET", API, "/orders", { token: fake });
  assert.equal(res.status, 401);
});

test("an expired token is rejected with token_expired", async () => {
  const expired = await new SignJWT({ role: "customer" })
    .setProtectedHeader({ alg: "RS256", kid: authKeys.kid })
    .setIssuer(authConfig.issuer).setAudience(authConfig.audience).setSubject("someone")
    .setIssuedAt(Math.floor(Date.now() / 1000) - 3600).setExpirationTime(Math.floor(Date.now() / 1000) - 60)
    .sign(authKeys.privateKey);
  const res = await json("GET", API, "/orders", { token: expired });
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, "token_expired");
});

test("a token for another audience is rejected", async () => {
  const other = await new SignJWT({ role: "customer" })
    .setProtectedHeader({ alg: "RS256", kid: authKeys.kid })
    .setIssuer(authConfig.issuer).setAudience("some-other-api").setSubject("someone")
    .setIssuedAt().setExpirationTime("5m").sign(authKeys.privateKey);
  const res = await json("GET", API, "/orders", { token: other });
  assert.equal(res.status, 401);
});

test("role-based access: customers get 403 on /admin/orders, staff get 200", async () => {
  const denied = await json("GET", API, "/admin/orders", { token: customerToken });
  assert.equal(denied.status, 403);

  await json("POST", AUTH, "/auth/register", { body: STAFF });
  authDb.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(STAFF.email); // promoted by an operator
  const login = await json("POST", AUTH, "/auth/login", { body: { email: STAFF.email, password: STAFF.password } });
  const staffToken = (await login.json()).accessToken;

  const allowed = await json("GET", API, "/admin/orders", { token: staffToken });
  assert.equal(allowed.status, 200);
  assert.equal((await allowed.json()).orders.length, 1);
});

test("FAILURE: auth-service goes down → existing tokens keep working, new logins fail", async () => {
  await stop(authServer);

  const stillWorks = await json("GET", API, "/orders", { token: customerToken });
  assert.equal(stillWorks.status, 200, "orders-api validates with its cached public key");

  await assert.rejects(
    json("POST", AUTH, "/auth/login", { body: { email: DEMO.email, password: DEMO.password } }),
    "nobody can sign in while auth-service is down"
  );
});

test("FAILURE: auth-service down and no cached keys → orders-api fails closed with 503", async () => {
  const coldServer = await listen(createOrdersApp({ db: openOrdersDb(":memory:"), config: ordersConfig, logger: silent }));
  try {
    const res = await json("GET", url(coldServer), "/orders", { token: customerToken });
    assert.equal(res.status, 503);
    assert.equal((await res.json()).error, "auth_unavailable");
  } finally {
    await stop(coldServer);
  }
});

test("FAILURE: orders database goes down → 503, no internal details", async () => {
  ordersDb.close();
  const health = await fetch(`${API}/health`);
  assert.equal(health.status, 503);
  const res = await json("GET", API, "/orders", { token: customerToken });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "service_unavailable");
  assert.equal(body.stack, undefined);
});
