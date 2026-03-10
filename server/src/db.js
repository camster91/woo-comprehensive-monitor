const initSqlJs = require("sql.js");
const fs = require("fs");
const path = require("path");

let _db = null;
let _dbPath = null;
let _saveTimer = null;

async function initDB(dbPath) {
  _dbPath = dbPath || process.env.DB_PATH || path.join(__dirname, "../data/woo-monitor.db");

  // Ensure directory exists
  const dir = path.dirname(_dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();

  // Load existing database or create new one
  if (fs.existsSync(_dbPath)) {
    const buffer = fs.readFileSync(_dbPath);
    _db = new SQL.Database(buffer);
  } else {
    _db = new SQL.Database();
  }

  // Run migrations
  const migration = fs.readFileSync(
    path.join(__dirname, "../migrations/001_initial.sql"),
    "utf8"
  );
  _db.run(migration);

  // Save after migration
  saveDB();

  console.log(`Database initialized at ${_dbPath}`);
  return _db;
}

function getDB() {
  if (!_db) throw new Error("Database not initialized. Call initDB() first.");
  return _db;
}

// Persist database to disk (debounced)
function saveDB() {
  if (!_db || !_dbPath) return;
  const data = _db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(_dbPath, buffer);
}

// Schedule a save (coalesces frequent writes)
function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveDB, 500);
}

// Helper: run a statement and save
function run(sql, params = []) {
  const db = getDB();
  db.run(sql, params);
  scheduleSave();
}

// Helper: get one row
function get(sql, params = []) {
  const db = getDB();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  let row = null;
  if (stmt.step()) {
    row = stmt.getAsObject();
  }
  stmt.free();
  return row;
}

// Helper: get all rows
function all(sql, params = []) {
  const db = getDB();
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: run INSERT and return lastID
function insert(sql, params = []) {
  const db = getDB();
  db.run(sql, params);
  const lastId = db.exec("SELECT last_insert_rowid() as id")[0].values[0][0];
  scheduleSave();
  return lastId;
}

module.exports = { initDB, getDB, run, get, all, insert, saveDB };
