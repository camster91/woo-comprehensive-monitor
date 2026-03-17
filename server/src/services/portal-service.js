const crypto = require("crypto");
const { run, get, all, insert } = require("../db");

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function createPortalUser({ storeId, email, name }) {
  const existing = get("SELECT id FROM portal_users WHERE email = ?", [email]);
  if (existing) throw new Error("Email already registered");

  const id = insert(
    "INSERT INTO portal_users (store_id, email, name, password_hash) VALUES (?, ?, ?, ?)",
    [storeId, email, name || null, "magic-code-auth"]
  );
  return { id, email, storeId };
}

function requestPortalCode(email) {
  const user = get("SELECT * FROM portal_users WHERE email = ?", [email]);
  if (!user) return null;

  const code = generateCode();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  // Store code in password_hash field temporarily (repurposed)
  run("UPDATE portal_users SET password_hash = ? WHERE id = ?", [`code:${code}:${expires}`, user.id]);

  return { code, user: { id: user.id, email: user.email, name: user.name, store_id: user.store_id, store_name: null } };
}

function verifyPortalCode(email, code) {
  const user = get("SELECT * FROM portal_users WHERE email = ?", [email]);
  if (!user) return null;

  // Check if password_hash contains a valid code
  const stored = user.password_hash || "";
  if (!stored.startsWith("code:")) return null;

  const parts = stored.split(":");
  const storedCode = parts[1];
  const expires = parts[2];

  if (storedCode !== code) return null;
  if (new Date(expires) < new Date()) return null;

  // Code valid — issue token
  const token = generateToken();
  const tokenExpires = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  run("UPDATE portal_users SET token = ?, token_expires = ?, password_hash = 'magic-code-auth' WHERE id = ?", [token, tokenExpires, user.id]);

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, store_id: user.store_id },
  };
}

// Legacy password auth — keep for backward compat but also accept magic codes
function authenticatePortal(email, password) {
  // Try magic code first
  const codeResult = verifyPortalCode(email, password);
  if (codeResult) return codeResult;

  return null;
}

function getPortalUser(token) {
  if (!token) return null;
  const user = get(
    "SELECT pu.*, s.name as store_name, s.url as store_url FROM portal_users pu LEFT JOIN stores s ON pu.store_id = s.id WHERE pu.token = ? AND pu.token_expires > datetime('now')",
    [token]
  );
  if (!user) return null;
  return { id: user.id, email: user.email, name: user.name, store_id: user.store_id, store_name: user.store_name, store_url: user.store_url };
}

function listPortalUsers() {
  return all(
    "SELECT pu.id, pu.email, pu.name, pu.store_id, pu.created_at, s.name as store_name FROM portal_users pu LEFT JOIN stores s ON pu.store_id = s.id ORDER BY pu.created_at DESC",
    []
  );
}

function deletePortalUser(id) {
  run("DELETE FROM portal_users WHERE id = ?", [id]);
}

function logoutPortal(token) {
  run("UPDATE portal_users SET token = NULL, token_expires = NULL WHERE token = ?", [token]);
}

module.exports = { createPortalUser, requestPortalCode, verifyPortalCode, authenticatePortal, getPortalUser, listPortalUsers, deletePortalUser, logoutPortal };
