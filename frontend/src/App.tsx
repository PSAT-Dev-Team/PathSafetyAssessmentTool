import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage/landingPage";
import Home from "./pages/Projects/projects";
import CodingPage from "./pages/CodingPage/codingPage"
import CreateProjectPage from "./pages/CreateProjectPage/createProjectPage"
import TreatmentPage from "./pages/TreatmentPage/treatmentPage"
import TreatmentDetailPage from "./pages/TreatmentPage/treatmentDetailPage"
import PathAnalysisPage from "./pages/PathAnalysisPage/pathAnalysisPage"
import GisLayersPage from "./pages/GisLayersPage/GisLayersPage"

import AppLayout from "./layouts/AppLayout";

export default function App() {
  return (
    <Routes>

      <Route path="/" element={<LandingPage />} />

      <Route element={<AppLayout />}>
        <Route path="/home" element={<Home />} />
        <Route path="/coding/:projectNames" element={<CodingPage />} />
        <Route path="/treatment" element={<TreatmentPage />} />
        <Route path="/treatment/:projectName" element={<TreatmentDetailPage />} />
        <Route path="/analysis/path" element={<PathAnalysisPage />} />
        <Route path="/projects/create" element={<CreateProjectPage />} />
        <Route path="/gis-layers" element={<GisLayersPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
