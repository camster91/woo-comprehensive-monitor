/**
 * Database layer — better-sqlite3
 *
 * Replaces sql.js (WASM in-memory) which caused OOM crashes under load:
 *   - sql.js serialized the entire DB to a Buffer on every write (saveDB)
 *   - fs.writeFileSync blocked the Node.js event loop on every save
 *
 * better-sqlite3 fixes this:
 *   - Native C binding — no WASM overhead
 *   - WAL mode — incremental writes, concurrent reads without blocking
 *   - No full-DB serialization needed ever
 *   - Prepared statement cache — fast repeated queries
 */

const Database = require("better-sqlite3");
const fs = require("fs");
const path = require("path");

let _db = null;
const _stmtCache = new Map();

function initDB(dbPath) {
  const resolvedPath =
    dbPath ||
    process.env.DB_PATH ||
    path.join(__dirname, "../data/woo-monitor.db");

  // Ensure data directory exists
  const dir = path.dirname(resolvedPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  _db = new Database(resolvedPath);

  // WAL mode: writers don't block readers, much better concurrent performance
  _db.pragma("journal_mode = WAL");
  // NORMAL: flush on checkpoint, not every write — safe enough, much faster
  _db.pragma("synchronous = NORMAL");
  // 16 MB page cache
  _db.pragma("cache_size = -16384");
  // Keep temp tables in memory
  _db.pragma("temp_store = MEMORY");
  // Enable foreign key enforcement
  _db.pragma("foreign_keys = ON");
  // WAL auto-checkpoint at 1000 pages (~4 MB)
  _db.pragma("wal_autocheckpoint = 1000");

  // Run migrations (idempotent — uses CREATE TABLE IF NOT EXISTS)
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/001_initial.sql"),
    "utf8"
  );
  _db.exec(migration);

  // Graceful shutdown: flush WAL on exit
  process.on("exit", () => {
    try {
      if (_db && _db.open) {
        _db.pragma("wal_checkpoint(TRUNCATE)");
        _db.close();
      }
    } catch (_) {}
  });

  console.log(`[DB] Initialized (WAL mode) at ${resolvedPath}`);
  return _db;
}

function getDB() {
  if (!_db) throw new Error("Database not initialized. Call initDB() first.");
  return _db;
}

/**
 * Get or compile a prepared statement (cached for performance).
 * Repeated calls with the same SQL reuse the same Statement object,
 * avoiding repeated parse overhead on hot paths like touchStore / createAlert.
 */
function prepare(sql) {
  if (!_stmtCache.has(sql)) {
    _stmtCache.set(sql, getDB().prepare(sql));
  }
  return _stmtCache.get(sql);
}

/** Execute a write statement (no return value needed) */
function run(sql, params = []) {
  return prepare(sql).run(...params);
}

/** Get a single row (returns object or undefined) */
function get(sql, params = []) {
  return prepare(sql).get(...params) || null;
}

/** Get all rows */
function all(sql, params = []) {
  return prepare(sql).all(...params);
}

/** Insert a row and return the new row's id */
function insert(sql, params = []) {
  const info = prepare(sql).run(...params);
  return info.lastInsertRowid;
}

module.exports = { initDB, getDB, run, get, all, insert };
