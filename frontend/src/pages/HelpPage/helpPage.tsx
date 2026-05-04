import { useState } from "react";
import { useNavigate } from "react-router-dom";
import DeveloperGuide from "./DeveloperGuide";
import "./helpPage.css";

export default function HelpPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<"user" | "developer" | "admin">("user");

  return (
<<<<<<< Updated upstream
    <div className="help-page-container">
      <div className="help-page-card">
        <header className="help-header">
          <h1>Documentation & Guides</h1>
          <button onClick={() => navigate(-1)} className="help-back-button">Go Back</button>
        </header>
=======
    <Box minH="100vh" bg="gray.100" _dark={{ bg: "gray.900" }} p="8" fontFamily="inherit">
      <Box
        maxW="1000px"
        mx="auto"
        bg="white"
        _dark={{ bg: "gray.800" }}
        borderRadius="xl"
        boxShadow="lg"
        p={{ base: "6", md: "10" }}
      >
        {/* Header */}
        <Flex
          justify="space-between"
          align="center"
          borderBottom="2px solid"
          borderColor="gray.200"
          _dark={{ borderColor: "gray.600" }}
          pb="4"
          mb="6"
          position="sticky"
          top="0"
          bg="white"
          _dark={{ bg: "gray.800" }}
          zIndex="10"
        >
          <Text fontSize="2xl" fontWeight="bold" color="gray.800" _dark={{ color: "gray.100" }}>
            Documentation & Guides
          </Text>
          <Button size="sm" colorPalette="blue" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </Flex>
>>>>>>> Stashed changes

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
              <h2>User Guide</h2>
              <p>Welcome to the Path Safety Assessment Tool (PSAT). This tool allows you to evaluate active mobility paths using the CycleRAP model.</p>
              
              <h3>1. Getting Started</h3>
              <ul>
                <li><strong>Start a Project:</strong> From the Home page, click "New Project" to import your shapefiles, mapping data, and street-level imagery.</li>
                <li><strong>Project Settings:</strong> Ensure your project name is correctly set. You can manage multiple projects simultaneously from the Projects listing.</li>
              </ul>
              
              <h3>2. Coding Page</h3>
              <ul>
                <li><strong>Auto-coding:</strong> Use the "Auto-code image" button to leverage AI models that automatically identify risk factors from the image.</li>
                <li><strong>GIS Coding:</strong> Our GIS backend automatically evaluates contextual data such as proximity to MRT exits, bus stops, and road intersections.</li>
                <li><strong>Manual Review:</strong> You can meticulously review and override the attributes predicted by the AI directly on the panel.</li>
              </ul>

              <h3>3. Map View & Analysis</h3>
              <ul>
                <li><strong>GIS Layers:</strong> Toggle the map layers to visualize Footpaths, Cycling Paths, and Road Crossings.</li>
                <li><strong>Risk Bands:</strong> Segments are color-coded based on overall risk logic.</li>
                <li><strong>Editing:</strong> You can add or delete segment points directly on the Map preview using the cursor tools.</li>
              </ul>
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

