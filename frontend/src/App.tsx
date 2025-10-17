import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage/landingPage";
import Home from "./pages/Home/home";
import CodingPage from "./pages/CodingPage/codingPage"
import CreateProjectPage from "./pages/CreateProjectPage/createProjectPage"
import TreatmentPage from "./pages/TreatmentPage/treatmentPage"
import AnalysisPage from "./pages/AnalysisPage/analysisPage"

import AppLayout from "./layouts/AppLayout";

export default function App() {
  return (
    <Routes>

      <Route path="/" element={<LandingPage />} />

      <Route element={<AppLayout />}>
        <Route path="/home" element={<Home />} />
        <Route path="/coding/:projectName" element={<CodingPage />} />
        <Route path="/treatment" element={<TreatmentPage />} />
        <Route path="/analysis" element={<AnalysisPage />} />
        <Route path="/projects/create" element={<CreateProjectPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
