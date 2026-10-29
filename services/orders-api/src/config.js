export function loadConfig(env = process.env) {
  const num = (v, d) => (v === undefined || v === "" ? d : Number(v));
  return {
    port: num(env.PORT, 5000),
    jwksUrl: env.AUTH_JWKS_URL || "http://localhost:4000/.well-known/jwks.json",
    issuer: env.AUTH_ISSUER || "http://localhost:4000",
    audience: env.AUTH_AUDIENCE || "aroma-api",
    jwksCacheMaxAge: num(env.JWKS_CACHE_MAX_AGE_MS, 600_000),
    corsOrigin: (env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()),
    dbPath: env.ORDERS_DB_PATH || "./data/orders.db"
  };
}
