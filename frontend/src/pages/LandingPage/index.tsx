import { useNavigate } from "react-router-dom";
import "./style.css";

import psatLogo2 from "./assets/PSAT Logo 2.png";
import psatName from "./assets/PSAT NAME.png";
import psatDesc2 from "./assets/PSAT Description 2.png";
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
        <img
          src={psatName}
          alt="PSAT wordmark"
          className="psat-logo name"
          loading="eager"
          decoding="async"
          draggable={false}
        />
      </aside>

      {/* 说明图片（按钮上方） */}
      <img
        src={psatDesc2}
        alt="PSAT description"
        className="psat-description"
        loading="eager"
        decoding="async"
        draggable={false}
      />

      {/* START 按钮 */}
      <button
        type="button"
        className="start-btn"
        onClick={startPSAT}
        aria-label="Start PSAT"
      >
        START
      </button>

      {/* 底部：版本 + CycleRAP 标识 */}
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
