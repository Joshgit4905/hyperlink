/** Reads configuration from environment variables with safe local defaults. */
export function loadConfig(env = process.env) {
  const num = (v, d) => (v === undefined || v === "" ? d : Number(v));
  return {
    port: num(env.PORT, 4000),
    issuer: env.AUTH_ISSUER || "http://localhost:4000",
    audience: env.AUTH_AUDIENCE || "aroma-api",
    corsOrigin: (env.CORS_ORIGIN || "http://localhost:5173").split(",").map((s) => s.trim()),
    dbPath: env.AUTH_DB_PATH || "./data/auth.db",
    keysDir: env.AUTH_KEYS_DIR || "./keys",
    accessTtl: num(env.ACCESS_TOKEN_TTL_SECONDS, 900),
    refreshTtlDays: num(env.REFRESH_TOKEN_TTL_DAYS, 7),
    bcryptCost: num(env.BCRYPT_COST, 12),
    cookieSecure: env.COOKIE_SECURE !== "false",
    loginMaxAttempts: num(env.LOGIN_MAX_ATTEMPTS, 5),
    loginWindowMs: num(env.LOGIN_WINDOW_MS, 60_000)
  };
}
