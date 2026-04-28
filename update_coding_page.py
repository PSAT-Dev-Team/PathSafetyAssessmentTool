import re

with open("frontend/src/pages/CodingPage/codingPage.tsx", "r") as f:
    content = f.read()

# Replace AnalysisPanel import with AnalysisSidebar and API imports
old_import = 'import { AnalysisPanel } from "../../components/visualization/AnalysisPanel";'
new_imports = """import { AnalysisSidebar } from "../../components/visualization/AnalysisSidebar";
import { fetchWidthVisualization, type WidthVisualizationResponse } from '../../api/widthVisualization';
import { fetchCurvatureVisualization, type CurvatureVisualizationResponse } from '../../api/curvatureVisualization';"""
content = content.replace(old_import, new_imports)

# Inject state and fetch logic for width and curvature
state_logic = """
  // === Analysis Data State ===
  const [widthData, setWidthData] = useState<WidthVisualizationResponse | null>(null);
  const [widthLoading, setWidthLoading] = useState(false);
  const [widthError, setWidthError] = useState<string | null>(null);

  const [curvData, setCurvData] = useState<CurvatureVisualizationResponse | null>(null);
  const [curvLoading, setCurvLoading] = useState(false);
  const [curvError, setCurvError] = useState<string | null>(null);

  const [isAnalysisSidebarOpen, setIsAnalysisSidebarOpen] = useState(false);
  const [showCurvatureOverlay, setShowCurvatureOverlay] = useState(false);

  // Fetch Width Data
  useEffect(() => {
    if (!currentProjectName || !currentFeature || currentFeature.geometry.type !== "LineString") return;
    const coords = currentFeature.geometry.coordinates as [number, number][];
    
    setWidthLoading(true);
    setWidthError(null);
    fetchWidthVisualization(currentProjectName, coords, currentIndex)
      .then(setWidthData)
      .catch(e => setWidthError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setWidthLoading(false));
  }, [currentProjectName, currentIndex, currentFeature]);

  // Fetch Curvature Data
  useEffect(() => {
    if (!currentProjectName || !currentFeature || currentFeature.geometry.type !== "LineString") return;
    const coords = currentFeature.geometry.coordinates as [number, number][];
    
    setCurvLoading(true);
    setCurvError(null);
    fetchCurvatureVisualization(currentProjectName, coords, currentIndex)
      .then(setCurvData)
      .catch(e => setCurvError(e instanceof Error ? e.message : 'Failed'))
      .finally(() => setCurvLoading(false));
  }, [currentProjectName, currentIndex, currentFeature]);
  // ============================
"""
# Find a place to inject it, right before `// --- Effect 1: Batch saving logic ---` or `// Effect to reset edits`
injection_target = "  // Reusable save function"
content = content.replace(injection_target, state_logic + "\n" + injection_target)

# Replace AnalysisPanel rendering and wrap GeoDataPanel
old_jsx = """        {currentFeature?.geometry?.type === "LineString" && (
          <GridItem colSpan={{ base: 1, md: 2 }}>
            <AnalysisPanel
              projectName={currentProjectName!}
              coordinates={(currentFeature.geometry as any).coordinates as [number, number][]}
              segmentIndex={currentIndex}
              grade={currentAttr?.["Grade"] as number | null}
              gradientPct={currentAttr?.["Gradient %"] as number | null}
            />
          </GridItem>
        )}

        <GridItem colSpan={{ base: 1, md: 2 }}>
          <GeoDataPanel
            projectName={currentProjectName!}
            feature={
              geoFeatures[currentIndex]?.geometry?.type === "LineString"
                ? (geoFeatures[currentIndex] as any)
                : null
            }
            index={currentIndex}
            onJump={(i) => gotoPage(i + 1)}
            scores={scores}
            onDataChange={refreshCurrentProject}
          />
        </GridItem>"""

new_jsx = """        <GridItem colSpan={{ base: 1, md: 2 }}>
          <Flex gap="4" w="100%" align="stretch" position="relative">
            {currentFeature?.geometry?.type === "LineString" && (
              <AnalysisSidebar
                isOpen={isAnalysisSidebarOpen}
                onToggle={() => setIsAnalysisSidebarOpen(v => !v)}
                widthData={widthData}
                widthLoading={widthLoading}
                widthError={widthError}
                curvData={curvData}
                curvLoading={curvLoading}
                curvError={curvError}
                grade={currentAttr?.["Grade"] as number | null}
                gradientPct={currentAttr?.["Gradient %"] as number | null}
              />
            )}
            
            <Box flex="1" minW="0" position="relative">
              <GeoDataPanel
                projectName={currentProjectName!}
                feature={
                  geoFeatures[currentIndex]?.geometry?.type === "LineString"
                    ? (geoFeatures[currentIndex] as any)
                    : null
                }
                index={currentIndex}
                onJump={(i) => gotoPage(i + 1)}
                scores={scores}
                onDataChange={refreshCurrentProject}
                curvData={curvData}
                showCurvatureOverlay={showCurvatureOverlay}
                onToggleCurvatureOverlay={() => setShowCurvatureOverlay(v => !v)}
              />
            </Box>
          </Flex>
        </GridItem>"""
content = content.replace(old_jsx, new_jsx)

with open("frontend/src/pages/CodingPage/codingPage.tsx", "w") as f:
    f.write(content)
