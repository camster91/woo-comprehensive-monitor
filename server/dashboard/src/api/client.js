const BASE = "";

function getAuthToken() {
  return localStorage.getItem("authToken") || null;
}

export async function apiFetch(url, options = {}) {
  const token = getAuthToken();
  const headers = { ...options.headers };
  if (token) headers["x-auth-token"] = token;

  const res = await fetch(`${BASE}${url}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("portalToken");
    localStorage.removeItem("role");
    localStorage.removeItem("userData");
    window.dispatchEvent(new Event("woo:401"));
    throw new Error("Authentication required");
  }
  return res;
}

export async function api(url, options) {
  const res = await apiFetch(url, options);
  return res.json();
}

export async function apiPost(url, body) {
  return api(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiPatch(url, body) {
  return api(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function apiDelete(url) {
  return api(url, { method: "DELETE" });
}
