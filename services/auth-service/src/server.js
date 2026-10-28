import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { loadOrCreateKeys } from "./keys.js";
import { createApp } from "./app.js";

const config = loadConfig();
const db = openDatabase(config.dbPath);
const keys = await loadOrCreateKeys(config.keysDir);
const app = createApp({ db, keys, config });

const server = app.listen(config.port, () => {
  console.log(`[auth-service] listening on http://localhost:${config.port} (kid=${keys.kid})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
