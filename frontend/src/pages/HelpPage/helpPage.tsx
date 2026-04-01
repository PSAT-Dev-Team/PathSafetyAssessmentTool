import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DeveloperGuide from "./DeveloperGuide";
import UserGuide from "./UserGuide";
import "./helpPage.css";

export default function HelpPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"user" | "developer" | "admin">("user");

  return (
    <div className="help-page-container">
      <div className="help-page-card">
        <header className="help-header">
          <h1>Documentation & Guides</h1>
          <button onClick={() => navigate(-1)} className="help-back-button">Go Back</button>
        </header>

        <div className="help-tabs">
          <button 
            className={`help-tab ${activeTab === "user" ? "active" : ""}`}
            onClick={() => setActiveTab("user")}
          >
            User Guide
          </button>
          <button 
            className={`help-tab ${activeTab === "developer" ? "active" : ""}`}
            onClick={() => setActiveTab("developer")}
          >
            Developer Guide
          </button>
          <button 
            className={`help-tab ${activeTab === "admin" ? "active" : ""}`}
            onClick={() => setActiveTab("admin")}
          >
            Admin Guide
          </button>
        </div>

        <div className="help-content">
          {activeTab === "user" && (
            <div className="guide-section">
              <UserGuide />
            </div>
          )}

          {activeTab === "developer" && (
            <div className="guide-section">
              <DeveloperGuide />
            </div>
          )}


          {activeTab === "admin" && (
            <div className="guide-section">
              <h2>Administrator Guide</h2>
              <p>This section provides instructions for system administrators on how to deploy, manage, and update the Path Safety Assessment Tool (PSAT).</p>

              <h3>1. Deployment & Infrastructure</h3>
              <ul>
                <li><strong>Starting the App:</strong> The application is typically orchestrated via Docker Compose. Run <code>docker compose up --build</code> to start both the Flask backend and the React frontend. For direct local launching, you can use the <code>Run-PSAT.bat</code> script.</li>
                <li><strong>Data Persistence:</strong> User-created projects, images, and results are stored in the <code>data/</code> directory, which is bind-mounted to the backend. Backing up this folder will backup all user work across the system.</li>
              </ul>

              <h3>2. Managing Machine Learning Models</h3>
              <ul>
                <li><strong>YOLO Weights:</strong> The computer-vision prediction models are stored in <code>backend/models/</code>. To deploy a newly trained model, replace the existing <code>.pt</code> files (e.g., <code>path_seg.pt</code>) in this directory and restart the backend container.</li>
                <li><strong>Hardware Configuration:</strong> The backend loads PyTorch models into memory on initialization. Ensure the host machine has adequate RAM. For GPU acceleration, CUDA drivers must be properly configured.</li>
              </ul>

              <h3>3. Updating GIS Shapefiles</h3>
              <ul>
                <li><strong>Location:</strong> The CycleRAP contextual GIS infrastructure shapefiles (e.g., road crossings, MRT exits, cycling networks) are stored under <code>backend/shapefiles/</code>.</li>
                <li><strong>Updating Layers:</strong> To update the GIS data, replace the files within their respective category subdirectories (e.g., <code>backend/shapefiles/path/CyclingpathCentreline.shp</code>). The Flask application automatically rescans and loads to its bounding boxes when the server is restarted.</li>
              </ul>
              
              <h3>4. Troubleshooting & Health</h3>
              <ul>
                <li><strong>Logs:</strong> If auto-coding fails, check the server output via `docker compose logs -f backend` or the terminal running the bat script to view full Python stack traces.</li>
                <li><strong>Health Endpoints:</strong> You can query <code>/api/health</code> or <code>/api/ping</code> to verify that the backend API server is responsive and that the CV models loaded correctly.</li>
              </ul>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

