const { run, get, all } = require("../db");

function getSetting(key, defaultValue = null) {
  const row = get("SELECT value FROM app_settings WHERE key = ?", [key]);
  return row ? row.value : defaultValue;
}

function setSetting(key, value) {
  run(
    "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = datetime('now')",
    [key, String(value), String(value)]
  );
}

function getAllSettings() {
  const rows = all("SELECT key, value FROM app_settings");
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  return settings;
}

function deleteSetting(key) {
  run("DELETE FROM app_settings WHERE key = ?", [key]);
}

module.exports = { getSetting, setSetting, getAllSettings, deleteSetting };
