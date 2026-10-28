import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { generateKeyPair, exportPKCS8, exportSPKI, importPKCS8, importSPKI, exportJWK } from "jose";

const ALG = "RS256";

/**
 * Loads the RSA signing key pair from disk, or generates one on first run.
 * The private key never leaves this service; resource servers only get the public key via JWKS.
 * Pass keysDir = null to keep keys in memory only (tests).
 */
export async function loadOrCreateKeys(keysDir) {
  let privatePem;
  let publicPem;

  const privFile = keysDir && path.join(keysDir, "private.pem");
  const pubFile = keysDir && path.join(keysDir, "public.pem");

  if (keysDir && fs.existsSync(privFile) && fs.existsSync(pubFile)) {
    privatePem = fs.readFileSync(privFile, "utf8");
    publicPem = fs.readFileSync(pubFile, "utf8");
  } else {
    const pair = await generateKeyPair(ALG, { modulusLength: 2048, extractable: true });
    privatePem = await exportPKCS8(pair.privateKey);
    publicPem = await exportSPKI(pair.publicKey);
    if (keysDir) {
      fs.mkdirSync(keysDir, { recursive: true });
      fs.writeFileSync(privFile, privatePem, { mode: 0o600 });
      fs.writeFileSync(pubFile, publicPem);
    }
  }

  const privateKey = await importPKCS8(privatePem, ALG);
  const publicKey = await importSPKI(publicPem, ALG, { extractable: true });
  // Key id = short fingerprint of the public key, so resource servers can pick the right key after a rotation.
  const kid = crypto.createHash("sha256").update(publicPem).digest("base64url").slice(0, 16);
  const jwk = { ...(await exportJWK(publicKey)), kid, alg: ALG, use: "sig" };

  return { alg: ALG, kid, privateKey, publicKey, jwks: { keys: [jwk] } };
}
