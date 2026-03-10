const { Router } = require("express");
const authService = require("../services/auth-service");
const { sendEmail } = require("../services/email-service");

const router = Router();

router.post("/auth/request-code", async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "Email required" });

  const code = authService.createAuthCode(email);
  if (!code) return res.status(403).json({ error: "Email not authorized" });

  await sendEmail({
    to: email,
    subject: `WooMonitor Login Code: ${code}`,
    text: `Your 6-digit login code is: ${code}\n\nExpires in 10 minutes.`,
  });

  res.json({ success: true, message: "Code sent" });
});

router.post("/auth/verify-code", (req, res) => {
  const { email, code } = req.body;
  const result = authService.verifyCode(email, code);
  if (!result) return res.status(401).json({ error: "Invalid or expired code" });
  res.json(result);
});

router.get("/auth/me", (req, res) => {
  const token = req.headers["x-auth-token"] || req.query?.authToken;
  const auth = authService.validateToken(token);
  if (!auth) return res.status(401).json({ error: "Not authenticated" });
  res.json(auth);
});

router.post("/auth/logout", (req, res) => {
  const token = req.headers["x-auth-token"] || req.query?.authToken;
  if (token) authService.revokeToken(token);
  res.clearCookie("authToken");
  res.json({ success: true });
});

module.exports = router;
