import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "..");
const migrationsDir = path.resolve(backendDir, "migrations");

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
db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    name TEXT PRIMARY KEY,
    applied_at TEXT NOT NULL
  )
`);

const appliedMigrations = new Set(
  db.prepare("SELECT name FROM _migrations").all().map((row) => row.name)
);

const migrationFiles = fs.readdirSync(migrationsDir)
  .filter((name) => /^\d+.*\.sql$/i.test(name))
  .sort((left, right) => left.localeCompare(right));

for (const migrationFile of migrationFiles) {
  if (appliedMigrations.has(migrationFile)) continue;

  const migrationSql = fs.readFileSync(path.resolve(migrationsDir, migrationFile), "utf8");
  const applyMigration = db.transaction(() => {
    db.exec(migrationSql);
    db.prepare(`
      INSERT INTO _migrations (name, applied_at)
      VALUES (?, ?)
    `).run(migrationFile, new Date().toISOString());
  });

  applyMigration();
}

export { db, dbFile };
