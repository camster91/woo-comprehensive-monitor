const axios = require("axios");
const { run, get, all, insert } = require("../db");

function getWebhooks() {
  return all("SELECT * FROM webhook_configs ORDER BY created_at DESC").map(w => ({
    ...w,
    events: JSON.parse(w.events || "[]"),
  }));
}

function getWebhook(id) {
  const w = get("SELECT * FROM webhook_configs WHERE id = ?", [id]);
  if (w) w.events = JSON.parse(w.events || "[]");
  return w;
}

function createWebhook({ name, url, platform = "slack", events = [] }) {
  return insert(
    "INSERT INTO webhook_configs (name, url, platform, events) VALUES (?, ?, ?, ?)",
    [name, url, platform, JSON.stringify(events)]
  );
}

function updateWebhook(id, { name, url, platform, events, enabled }) {
  const fields = [];
  const params = [];
  if (name !== undefined) { fields.push("name = ?"); params.push(name); }
  if (url !== undefined) { fields.push("url = ?"); params.push(url); }
  if (platform !== undefined) { fields.push("platform = ?"); params.push(platform); }
  if (events !== undefined) { fields.push("events = ?"); params.push(JSON.stringify(events)); }
  if (enabled !== undefined) { fields.push("enabled = ?"); params.push(enabled ? 1 : 0); }
  params.push(id);
  run(`UPDATE webhook_configs SET ${fields.join(", ")} WHERE id = ?`, params);
}

function deleteWebhook(id) {
  run("DELETE FROM webhook_configs WHERE id = ?", [id]);
}

// Fire webhook for an event
async function fireWebhooks(eventType, payload) {
  const webhooks = all(
    "SELECT * FROM webhook_configs WHERE enabled = 1",
    []
  );

  for (const wh of webhooks) {
    const events = JSON.parse(wh.events || "[]");
    if (events.length > 0 && !events.includes(eventType)) continue;

    try {
      if (wh.platform === "slack") {
        await axios.post(wh.url, {
          text: `*[${eventType.toUpperCase()}]* ${payload.title}`,
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*${payload.title}*\n${payload.message || ""}`,
              },
            },
          ],
        }, { timeout: 5000 });
      } else if (wh.platform === "discord") {
        await axios.post(wh.url, {
          content: `**[${eventType.toUpperCase()}]** ${payload.title}`,
          embeds: [{
            description: payload.message || "",
            color: payload.color || 0x6366f1,
          }],
        }, { timeout: 5000 });
      } else {
        // Custom webhook - send raw JSON
        await axios.post(wh.url, { event: eventType, ...payload }, { timeout: 5000 });
      }
    } catch (err) {
      console.error(`[Webhook] Failed to send to ${wh.name}: ${err.message}`);
    }
  }
}

module.exports = { getWebhooks, getWebhook, createWebhook, updateWebhook, deleteWebhook, fireWebhooks };
