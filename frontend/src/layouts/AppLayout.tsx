import { Outlet } from "react-router-dom";
import Sidebar from "../pages/sidebar/Sidebar";
import "./app-layout.css";

export default function AppLayout() {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-main" role="main">
        <Outlet />
      </main>
    </div>
  );
}
