import crypto from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

/** Signs a short-lived access token (JWT, RS256). */
export async function signAccessToken(user, keys, config) {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: keys.alg, kid: keys.kid, typ: "JWT" })
    .setIssuer(config.issuer)
    .setAudience(config.audience)
    .setSubject(user.id)
    .setJti(crypto.randomUUID())
    .setIssuedAt()
    .setExpirationTime(`${config.accessTtl}s`)
    .sign(keys.privateKey);
}

/** Verifies an access token issued by this service (used by GET /auth/me). */
export async function verifyAccessToken(token, keys, config) {
  const { payload } = await jwtVerify(token, keys.publicKey, {
    issuer: config.issuer,
    audience: config.audience,
    algorithms: [keys.alg]
  });
  return payload;
}

/** A refresh token is an opaque 256-bit random string. Only its SHA-256 hash is stored. */
export function newRefreshToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
