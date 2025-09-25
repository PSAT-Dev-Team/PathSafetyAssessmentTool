import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import Home from "./pages/Home";               // 你已有的 Home 页面
import AppLayout from "./layouts/AppLayout";   // 新建的布局

// Temp pages
function Coding() { return <h2>CODING PAGE</h2>; }
function Analysis() { return <h2>ANALYSIS PAGE</h2>; }
function NewProject() { return <h2>Create Project Wizard (TODO)</h2>; }

export default function App() {
  return (
    <Routes>

      <Route path="/" element={<LandingPage />} />

      <Route element={<AppLayout />}>
        <Route path="/home" element={<Home />} />
        <Route path="/coding" element={<Coding />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/projects/create" element={<NewProject />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
