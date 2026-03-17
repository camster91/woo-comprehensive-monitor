import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ToastProvider } from "./components/Toast";
import Layout from "./components/Layout";
import PortalLayout from "./components/PortalLayout";
import Overview from "./pages/Overview";
import Stores from "./pages/Stores";
import Alerts from "./pages/Alerts";
import Chat from "./pages/Chat";
import Disputes from "./pages/Disputes";
import System from "./pages/System";
import Login from "./pages/Login";
import Revenue from "./pages/Revenue";
import Uptime from "./pages/Uptime";
import Inventory from "./pages/Inventory";
import Manage from "./pages/Manage";
import PortalUsers from "./pages/PortalUsers";
import Tickets from "./pages/Tickets";
import Insights from "./pages/Insights";
import Settings from "./pages/Settings";
import PortalOverview from "./pages/portal/PortalOverview";
import PortalTickets from "./pages/portal/PortalTickets";
import PortalRevenue from "./pages/portal/PortalRevenue";
import PortalOrders from "./pages/portal/PortalOrders";
import PortalAlerts from "./pages/portal/PortalAlerts";

export default function App() {
  const [role, setRole] = useState(() => localStorage.getItem("role") || null); // "admin" or "client"
  const [token, setToken] = useState(() => localStorage.getItem("authToken") || localStorage.getItem("portalToken") || null);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("userData")); } catch { return null; }
  });

  function loginAdmin(newToken) {
    localStorage.setItem("authToken", newToken);
    localStorage.setItem("role", "admin");
    localStorage.removeItem("portalToken");
    setToken(newToken);
    setRole("admin");
    setUser(null);
  }

  function loginClient(newToken, userData) {
    localStorage.setItem("portalToken", newToken);
    localStorage.setItem("role", "client");
    localStorage.setItem("userData", JSON.stringify(userData));
    localStorage.removeItem("authToken");
    setToken(newToken);
    setRole("client");
    setUser(userData);
  }

  function logout() {
    if (role === "client") {
      fetch("/api/portal/logout", { method: "POST", headers: { "x-portal-token": token } }).catch(() => {});
    } else {
      fetch("/api/auth/logout", { method: "POST", headers: { "x-auth-token": token } }).catch(() => {});
    }
    localStorage.removeItem("authToken");
    localStorage.removeItem("portalToken");
    localStorage.removeItem("role");
    localStorage.removeItem("userData");
    setToken(null);
    setRole(null);
    setUser(null);
  }

  // Listen for 401 events
  useEffect(() => {
    function onUnauth() { logout(); }
    window.addEventListener("woo:401", onUnauth);
    return () => window.removeEventListener("woo:401", onUnauth);
  }, []);

  // Validate saved token on mount
  const [checking, setChecking] = useState(!!token);
  useEffect(() => {
    if (!token || !role) { setChecking(false); return; }
    if (role === "admin") {
      fetch("/api/auth/me", { headers: { "x-auth-token": token } })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(() => setChecking(false))
        .catch(() => { logout(); setChecking(false); });
    } else {
      fetch("/api/portal/dashboard", { headers: { "x-portal-token": token } })
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(data => { setUser(data.user || user); setChecking(false); })
        .catch(() => { logout(); setChecking(false); });
    }
  }, []);

  // Show nothing while validating token
  if (checking) return null;

  // Not logged in — show unified login
  if (!token || !role) {
    return (
      <ToastProvider>
        <Login onAdminLogin={loginAdmin} onClientLogin={loginClient} />
      </ToastProvider>
    );
  }

  // Client role — portal view with expanded pages
  if (role === "client") {
    return (
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<PortalLayout user={user} onLogout={logout} token={token} />}>
              <Route index element={<PortalOverview token={token} user={user} />} />
              <Route path="tickets" element={<PortalTickets token={token} />} />
              <Route path="revenue" element={<PortalRevenue token={token} />} />
              <Route path="orders" element={<PortalOrders token={token} />} />
              <Route path="alerts" element={<PortalAlerts token={token} />} />
            </Route>
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    );
  }

  // Admin role — full dashboard
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout onLogout={logout} />}>
            <Route index element={<Overview />} />
            <Route path="revenue" element={<Revenue />} />
            <Route path="stores" element={<Stores />} />
            <Route path="alerts" element={<Alerts />} />
            <Route path="disputes" element={<Disputes />} />
            <Route path="uptime" element={<Uptime />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="manage" element={<Manage />} />
            <Route path="portal-users" element={<PortalUsers />} />
            <Route path="tickets" element={<Tickets />} />
            <Route path="insights" element={<Insights />} />
            <Route path="chat" element={<Chat />} />
            <Route path="settings" element={<Settings />} />
            <Route path="system" element={<System onLogout={logout} />} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
