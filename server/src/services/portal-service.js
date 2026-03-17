const crypto = require("crypto");
const { run, get, all, insert } = require("../db");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [salt, hash] = stored.split(":");
  const test = crypto.scryptSync(password, salt, 64).toString("hex");
  return test === hash;
}

function generateToken() {
  return crypto.randomBytes(32).toString("hex");
}

function createPortalUser({ storeId, email, name, password }) {
  const existing = get("SELECT id FROM portal_users WHERE email = ?", [email]);
  if (existing) throw new Error("Email already registered");

  const password_hash = hashPassword(password);
  const id = insert(
    "INSERT INTO portal_users (store_id, email, name, password_hash) VALUES (?, ?, ?, ?)",
    [storeId, email, name || null, password_hash]
  );
  return { id, email, storeId };
}

function authenticatePortal(email, password) {
  const user = get("SELECT * FROM portal_users WHERE email = ?", [email]);
  if (!user) return null;
  if (!verifyPassword(password, user.password_hash)) return null;

  const token = generateToken();
  const expires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days
  run("UPDATE portal_users SET token = ?, token_expires = ? WHERE id = ?", [token, expires, user.id]);

  return {
    token,
    user: { id: user.id, email: user.email, name: user.name, store_id: user.store_id },
  };
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

module.exports = { createPortalUser, authenticatePortal, getPortalUser, listPortalUsers, deletePortalUser, logoutPortal };
