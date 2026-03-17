const { validateToken, REQUIRE_AUTH } = require("../services/auth-service");

function authMiddleware(req, res, next) {
  if (!REQUIRE_AUTH) return next();

  // Public endpoints (paths are relative to the /api mount point)
  const publicPaths = [
    "/health",
    "/track-woo-error",
    "/auth/request-code",
    "/auth/verify-code",
    "/portal/login",
    "/portal/logout",
  ];
  if (publicPaths.includes(req.path)) return next();
  if (req.path === "/stores" && req.method === "POST") return next();

  const token = req.headers["x-auth-token"] || req.cookies?.authToken || req.query?.authToken;
  const auth = validateToken(token);
  if (!auth) return res.status(401).json({ error: "Authentication required" });

  req.user = auth.email;
  next();
}

function apiKeyMiddleware(req, res, next) {
  // GET requests always allowed
  if (req.method === "GET") return next();

  // Plugin endpoints skip API key check (path relative to /api mount)
  if (req.path === "/track-woo-error") return next();

  // Dashboard auth token
  const authToken = req.headers["x-auth-token"] || req.query?.authToken;
  if (authToken && validateToken(authToken)) return next();

  // API key
  const apiKey = req.headers["x-api-key"] || req.query?.apiKey;
  const validApiKey = process.env.API_KEY;
  if (!validApiKey) return next();
  if (apiKey === validApiKey) return next();

  return res.status(401).json({ error: "Invalid or missing API key" });
}

module.exports = { authMiddleware, apiKeyMiddleware };
