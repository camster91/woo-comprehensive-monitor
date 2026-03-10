import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Layout from "./components/Layout";
import Overview from "./pages/Overview";
import Stores from "./pages/Stores";
import Alerts from "./pages/Alerts";
import Chat from "./pages/Chat";
import System from "./pages/System";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/dashboard" element={<Layout />}>
          <Route index element={<Overview />} />
          <Route path="stores" element={<Stores />} />
          <Route path="alerts" element={<Alerts />} />
          <Route path="chat" element={<Chat />} />
          <Route path="system" element={<System />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  );
}
