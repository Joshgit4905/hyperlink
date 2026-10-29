import { createRemoteJWKSet, jwtVerify } from "jose";

export class AuthError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// jose error codes that mean "the token itself is bad" (as opposed to "we could not reach auth-service").
const TOKEN_ERRORS = new Set([
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWS_INVALID",
  "ERR_JWT_INVALID",
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JOSE_NOT_SUPPORTED",
  "ERR_JWKS_NO_MATCHING_KEY",
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS"
]);

/**
 * Express middleware factory. Verifies the Bearer JWT locally:
 *  - signature with auth-service's public key (downloaded from JWKS and cached),
 *  - issuer, audience, expiry and algorithm (RS256 only).
 * It never calls auth-service per request, so a short auth-service outage does not
 * break requests that carry a still-valid token.
 * If the keys cannot be fetched and none are cached, it fails closed with 503.
 */
export function createAuthMiddleware(config, keySet) {
  const jwks = keySet || createRemoteJWKSet(new URL(config.jwksUrl), {
    cacheMaxAge: config.jwksCacheMaxAge,
    cooldownDuration: 30_000,
    timeoutDuration: 3_000
  });

  async function requireAuth(req, _res, next) {
    const header = req.get("authorization") || "";
    const [scheme, token] = header.split(" ");
    if (scheme !== "Bearer" || !token) return next(new AuthError(401, "missing_token", "Sign in to continue."));
    try {
      const { payload } = await jwtVerify(token, jwks, {
        issuer: config.issuer,
        audience: config.audience,
        algorithms: ["RS256"]
      });
      req.user = { sub: payload.sub, email: payload.email, name: payload.name, role: payload.role };
      next();
    } catch (err) {
      if (err.code === "ERR_JWT_EXPIRED") return next(new AuthError(401, "token_expired", "Your session expired."));
      if (TOKEN_ERRORS.has(err.code)) return next(new AuthError(401, "invalid_token", "Invalid token."));
      // Network error / timeout while fetching JWKS: we cannot verify, so we refuse (fail closed).
      next(new AuthError(503, "auth_unavailable", "Sign-in service is unavailable. Try again shortly."));
    }
  }

  const requireRole = (role) => (req, _res, next) =>
    req.user?.role === role ? next() : next(new AuthError(403, "forbidden", "You don't have access to this resource."));

  return { requireAuth, requireRole };
}
