const crypto = require("crypto");
const { run, get } = require("../db");

const ALLOWED_EMAILS = process.env.ALLOWED_EMAILS
  ? process.env.ALLOWED_EMAILS.split(",").map(e => e.trim())
  : ["cameron@ashbi.ca"];
const REQUIRE_AUTH = process.env.REQUIRE_AUTH !== "false";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function generateToken() {
  return crypto.randomBytes(48).toString("hex");
}

function createAuthCode(email) {
  if (!ALLOWED_EMAILS.includes(email)) return null;
  const code = generateCode();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  run("INSERT OR REPLACE INTO auth_codes (email, code, expires) VALUES (?, ?, ?)", [email, code, expires]);
  return code;
}

function verifyCode(email, code) {
  const row = get("SELECT * FROM auth_codes WHERE email = ? AND code = ?", [email, code]);
  if (!row || new Date(row.expires) < new Date()) return null;

  run("DELETE FROM auth_codes WHERE email = ?", [email]);

  const token = generateToken();
  const expires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  run("INSERT INTO auth_tokens (token, email, expires) VALUES (?, ?, ?)", [token, email, expires]);
  return { token, email, expires };
}

function validateToken(token) {
  if (!token) return null;
  const row = get("SELECT * FROM auth_tokens WHERE token = ?", [token]);
  if (!row || new Date(row.expires) < new Date()) {
    if (row) run("DELETE FROM auth_tokens WHERE token = ?", [token]);
    return null;
  }
  return { email: row.email, expires: row.expires };
}

function revokeToken(token) {
  run("DELETE FROM auth_tokens WHERE token = ?", [token]);
}

function cleanupExpired() {
  run("DELETE FROM auth_tokens WHERE expires < datetime('now')");
  run("DELETE FROM auth_codes WHERE expires < datetime('now')");
}

module.exports = {
  ALLOWED_EMAILS,
  REQUIRE_AUTH,
  createAuthCode,
  verifyCode,
  validateToken,
  revokeToken,
  cleanupExpired,
};
