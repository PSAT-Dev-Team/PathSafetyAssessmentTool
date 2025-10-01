import { useNavigate } from "react-router-dom";
import "./landingPage.css";

import psatLogo2 from "./assets/PSAT Logo 2.png";
import cyclerapLogo from "./assets/CycleRAP-logo.png";
import { APP_META } from "../../appMeta";

export default function LandingPage() {
  const navigate = useNavigate();
  const startPSAT = () => navigate("/home");

  return (
    <main className="landing-root" role="main">
      {/* 右侧品牌区：logo + 文字 */}
      <aside className="right-rail" aria-label="PSAT branding">
        <img
          src={psatLogo2}
          alt="PSAT logo"
          className="psat-logo"
          loading="eager"
          decoding="async"
          draggable={false}
        />

        <h1 className="psat-logo name">path safety assessmenty tool</h1>

        <p className="psat-logo description">an evidence-based risk evaluation model for active mobility users</p>

        <button
          type="button"
          className="start-btn"
          onClick={startPSAT}
          aria-label="Start PSAT"
        >
          START
        </button>
      </aside>


      <footer className="landing-footer">
        <span className="version-info">v{APP_META.version} ({APP_META.buildDate})</span>
        <img
          src={cyclerapLogo}
          alt="CycleRAP logo"
          className="cyclerap-logo-bottom"
          loading="lazy"
          decoding="async"
          draggable={false}
        />
      </footer>
    </main>
  );
}
