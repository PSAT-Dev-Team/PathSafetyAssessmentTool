import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage/landingPage";
import Home from "./pages/Projects/projects";
import CodingPage from "./pages/CodingPage/codingPage"
import CreateProjectPage from "./pages/CreateProjectPage/createProjectPage"
import TreatmentPage from "./pages/TreatmentPage/treatmentPage"
import TreatmentDetailPage from "./pages/TreatmentPage/treatmentDetailPage"
import PathAnalysisPage from "./pages/PathAnalysisPage/pathAnalysisPage"
import ReportBuilderPage from "./pages/ReportBuilderPage/reportBuilderPage"
import GisLayersPage from "./pages/GisLayersPage/GisLayersPage"
import AdminDashboard from "./pages/AdminDashboard/adminDashboard"

import AppLayout from "./layouts/AppLayout";
import HelpButton from "./components/common/HelpButton";
import HelpPage from "./pages/HelpPage/helpPage";
import RequireProfile from "./features/profile/RequireProfile";

export default function App() {
  return (
    <>
      <HelpButton />
      <Routes>

        <Route path="/" element={<LandingPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/admin" element={<AdminDashboard />} />

        <Route element={<RequireProfile><AppLayout /></RequireProfile>}>
          <Route path="/home" element={<Home />} />
          <Route path="/coding/:projectNames" element={<CodingPage />} />
          <Route path="/treatment" element={<TreatmentPage />} />
          <Route path="/treatment/:projectName" element={<TreatmentDetailPage />} />
          <Route path="/analysis/path" element={<PathAnalysisPage />} />
          <Route path="/analysis/report" element={<ReportBuilderPage />} />
          <Route path="/projects/create" element={<CreateProjectPage />} />
          <Route path="/gis-layers" element={<GisLayersPage />} />
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Route>
      </Routes>
    </>
  );
}
