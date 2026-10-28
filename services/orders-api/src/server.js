import { loadConfig } from "./config.js";
import { openDatabase } from "./db.js";
import { createApp } from "./app.js";

const config = loadConfig();
const db = openDatabase(config.dbPath);
const app = createApp({ db, config });

const server = app.listen(config.port, () => {
  console.log(`[orders-api] listening on http://localhost:${config.port} (trusting ${config.jwksUrl})`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
