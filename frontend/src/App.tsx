import { Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage/landingPage";
import Home from "./pages/Home/home";
import CodingPage from "./pages/CodingPage/codingPage"
import CreateProjectPage from "./pages/CreateProjectPage/createProjectPage"
import TreatmentPage from "./pages/TreatmentPage/treatmentPage"
import AttributeAnalysisPage from "./pages/AttributeAnalysisPage/attributeAnalysisPage"
import PreTreatmentAnalysisPage from "./pages/PreTreatmentAnalysisPage/preTreatmentAnalysisPage"
import PostTreatmentAnalysisPage from "./pages/PostTreatmentAnalysisPage/postTreatmentAnalysisPage"

import AppLayout from "./layouts/AppLayout";

export default function App() {
  return (
    <Routes>

      <Route path="/" element={<LandingPage />} />

      <Route element={<AppLayout />}>
        <Route path="/home" element={<Home />} />
        <Route path="/coding/:projectName" element={<CodingPage />} />
        <Route path="/treatment" element={<TreatmentPage />} />
        <Route path="/analysis/attribute" element={<AttributeAnalysisPage />} />
        <Route path="/analysis/pre-treatment" element={<PreTreatmentAnalysisPage />} />
        <Route path="/analysis/post-treatment" element={<PostTreatmentAnalysisPage />} />
        <Route path="/projects/create" element={<CreateProjectPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
