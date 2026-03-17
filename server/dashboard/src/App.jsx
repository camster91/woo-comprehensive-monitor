import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { ToastProvider } from "./components/Toast";
import Layout from "./components/Layout";
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
import PortalLogin from "./pages/portal/PortalLogin";
import PortalOverview from "./pages/portal/PortalOverview";
import PortalTickets from "./pages/portal/PortalTickets";
import PortalLayout from "./components/PortalLayout";

function useAuth() {
  const [token, setToken] = useState(() => localStorage.getItem("authToken") || null);

  function login(newToken) {
    localStorage.setItem("authToken", newToken);
    setToken(newToken);
  }

  function logout() {
    localStorage.removeItem("authToken");
    setToken(null);
  }

  // Listen for 401 events dispatched by the API client so any component can
  // trigger a logout without prop-drilling.
  useEffect(() => {
    function onUnauth() { logout(); }
    window.addEventListener("woo:401", onUnauth);
    return () => window.removeEventListener("woo:401", onUnauth);
  }, []);

  return { token, login, logout };
}

function PortalApp() {
  const [token, setToken] = useState(() => localStorage.getItem("portalToken") || null);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("portalUser")); } catch { return null; }
  });

  function login(newToken, userData) {
    localStorage.setItem("portalToken", newToken);
    localStorage.setItem("portalUser", JSON.stringify(userData));
    setToken(newToken);
    setUser(userData);
  }

  function logout() {
    fetch("/api/portal/logout", { method: "POST", headers: { "x-portal-token": token } }).catch(() => {});
    localStorage.removeItem("portalToken");
    localStorage.removeItem("portalUser");
    setToken(null);
    setUser(null);
  }

  if (!token) return <PortalLogin onLogin={login} />;

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/portal" element={<PortalLayout user={user} onLogout={logout} />}>
          <Route index element={<PortalOverview token={token} user={user} />} />
          <Route path="tickets" element={<PortalTickets token={token} />} />
        </Route>
        <Route path="*" element={<Navigate to="/portal" />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  if (window.location.pathname.startsWith("/portal")) {
    return <ToastProvider><PortalApp /></ToastProvider>;
  }

  const { token, login, logout } = useAuth();

  if (!token) {
    return (
      <ToastProvider>
        <Login onLogin={login} />
      </ToastProvider>
    );
  }

  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/dashboard" element={<Layout onLogout={logout} />}>
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
            <Route path="chat" element={<Chat />} />
            <Route path="system" element={<System onLogout={logout} />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
