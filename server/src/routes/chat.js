const { Router } = require("express");
const axios = require("axios");

const router = Router();

router.post("/chat/deepseek", async (req, res) => {
  const { question, storeData, chatHistory } = req.body;
  if (!question) return res.status(400).json({ error: "question required" });
  if (typeof question !== "string" || question.length > 4000) {
    return res.status(400).json({ error: "question must be a string under 4000 characters" });
  }

  const systemPrompt = `You are an expert WooCommerce store analyst. You help diagnose issues, suggest fixes, and explain store metrics. Be concise and actionable. Use markdown formatting.`;

  const messages = [{ role: "system", content: systemPrompt }];
  if (storeData) {
    messages.push({ role: "system", content: `Store context:\n${JSON.stringify(storeData, null, 2)}` });
  }
  if (chatHistory) {
    chatHistory.slice(-5).forEach(m => messages.push({ role: m.role, content: m.content }));
  }
  messages.push({ role: "user", content: question });

  if (!process.env.DEEPSEEK_API_KEY || process.env.USE_MOCK_AI === "true") {
    return res.json({ response: `**Mock AI Response**\n\nYou asked: "${question}"\n\nDeepSeek API key not configured. Set DEEPSEEK_API_KEY in .env to enable AI chat.` });
  }

  try {
    const { data } = await axios.post(
      "https://api.deepseek.com/chat/completions",
      { model: "deepseek-chat", messages, max_tokens: 2048 },
      { headers: { Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" } }
    );
    res.json({ response: data.choices[0].message.content });
  } catch (err) {
    res.status(502).json({ error: "AI service unavailable: " + err.message });
  }
});

module.exports = router;
