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

export default function App() {
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
            <Route path="chat" element={<Chat />} />
            <Route path="system" element={<System onLogout={logout} />} />
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
