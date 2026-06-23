import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const migrationsPath = path.resolve(backendDir, "migrations", "0001_init.sql");

const configuredDbFile = (process.env.DB_FILE || "").trim();
const defaultDbFile = path.resolve(backendDir, "data", "lock-memory.db");
const dbFile = configuredDbFile === ":memory:"
  ? ":memory:"
  : path.resolve(configuredDbFile || defaultDbFile);

if (dbFile !== ":memory:") {
  fs.mkdirSync(path.dirname(dbFile), { recursive: true });
}

const db = new Database(dbFile);
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");
db.pragma(`journal_mode = ${dbFile === ":memory:" ? "MEMORY" : "WAL"}`);
db.pragma("synchronous = NORMAL");
db.exec(fs.readFileSync(migrationsPath, "utf8"));

export { db, dbFile };
