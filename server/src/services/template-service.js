const { run, get, all, insert } = require("../db");

function getTemplates({ reason } = {}) {
  if (reason) {
    return all("SELECT * FROM dispute_templates WHERE reason = ? ORDER BY is_default DESC, name ASC", [reason]);
  }
  return all("SELECT * FROM dispute_templates ORDER BY reason ASC, is_default DESC, name ASC");
}

function getTemplate(id) {
  return get("SELECT * FROM dispute_templates WHERE id = ?", [id]);
}

function createTemplate({ name, reason, evidenceText }) {
  return insert(
    "INSERT INTO dispute_templates (name, reason, evidence_text) VALUES (?, ?, ?)",
    [name, reason, evidenceText]
  );
}

function updateTemplate(id, { name, reason, evidenceText }) {
  const fields = [];
  const params = [];
  if (name !== undefined) { fields.push("name = ?"); params.push(name); }
  if (reason !== undefined) { fields.push("reason = ?"); params.push(reason); }
  if (evidenceText !== undefined) { fields.push("evidence_text = ?"); params.push(evidenceText); }
  fields.push("updated_at = datetime('now')");
  params.push(id);
  run(`UPDATE dispute_templates SET ${fields.join(", ")} WHERE id = ?`, params);
}

function deleteTemplate(id) {
  run("DELETE FROM dispute_templates WHERE id = ?", [id]);
}

module.exports = { getTemplates, getTemplate, createTemplate, updateTemplate, deleteTemplate };
