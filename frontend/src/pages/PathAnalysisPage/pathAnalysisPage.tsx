import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Text,
} from "@chakra-ui/react";
import { fetchProjectList } from "../../api";
import FilterPanel from "./components/FilterPanel";
import PathAnalysisMapView from "./components/PathAnalysisMapView";
import AttributeDistributionChart from "./components/AttributeDistributionChart";
import AggregatedScoreBandPanel from "./components/AggregatedScoreBandPanel";
import AggregatedTopContributorsPanel from "./components/AggregatedTopContributorsPanel";
import "./pathAnalysisPage.css";

const SESSION_KEY_PREFIX = "pathAnalysis_";

const DEFAULT_REPORT_CONFIG = {
  showTitle: true,
  showTitleText: true,
  showTitleDescription: true,
  showRiskBands: true,
  showRiskBandsOverall: true,
  showRiskBandsLegend: true,
  showRiskBandsCrashTypes: true,
  showRiskBandsVB: true,
  showRiskBandsBB: true,
  showRiskBandsSB: true,
  showRiskBandsBP: true,
  showFilters: true,
  showMap: true,
  showMapView: true,
  showCharts: true,
  showPieChart: true,
  showBarChart: true,
};

const loadState = <T,>(key: string, defaultVal: T): T => {
  try {
    const stored = sessionStorage.getItem(SESSION_KEY_PREFIX + key);
    return stored ? JSON.parse(stored) : defaultVal;
  } catch {
    return defaultVal;
  }
};

const getStoredLoadedProjects = (): string[] => {
  const loaded = loadState<string[]>("loadedProjects", []);
  if (loaded.length > 0) return loaded;
  return loadState<string[]>("selectedProjects", []);
};

export default function PathAnalysisPage() {
  const [loadedProjects, setLoadedProjects] = useState<string[]>(() =>
    getStoredLoadedProjects()
  );

  const [activeFilters, setActiveFilters] = useState<string[]>(() =>
    loadState("activeFilters", [])
  );

  const [hiddenProjects, setHiddenProjects] = useState<string[]>(() =>
    loadState("hiddenProjects", [])
  );

  const visibleProjects = useMemo(
    () => loadedProjects.filter((projectName) => !hiddenProjects.includes(projectName)),
    [loadedProjects, hiddenProjects]
  );

  const [chartData, setChartData] = useState<{
    categoryDistributionData: { category: string; count: number; color: string }[];
    primaryFocusAttribute: string | null;
    categoryStatus: {
      attribute: string;
      categories: {
        category: string;
        isActive: boolean;
        color: string;
        subcategories?: { name: string; isActive: boolean; color: string }[];
      }[];
      rangeFilter?: { min: number; max: number; currentMin: number; currentMax: number };
    }[];
    totalSegmentsLoaded: number;
    totalSegmentsViewed: number;
  }>({
    categoryDistributionData: [],
    primaryFocusAttribute: null,
    categoryStatus: [],
    totalSegmentsLoaded: 0,
    totalSegmentsViewed: 0,
  });

  const [reportConfig, setReportConfig] = useState(() => {
    try {
      const stored = sessionStorage.getItem("psat_report_config");
      if (stored) return JSON.parse(stored);
      return DEFAULT_REPORT_CONFIG;
    } catch {
      return DEFAULT_REPORT_CONFIG;
    }
  });

  useEffect(() => {
    const handleConfigChange = (event: CustomEvent) => {
      setReportConfig(event.detail);
    };

    window.addEventListener("psat:report:config-changed", handleConfigChange as EventListener);
    return () => {
      window.removeEventListener("psat:report:config-changed", handleConfigChange as EventListener);
    };
  }, []);

  useEffect(() => {
    if (loadedProjects.length > 0) return;
    fetchProjectList()
      .then((data) => {
        if (data?.projects) {
          const availableProjects = data.projects.map((project) => project.name);
          setLoadedProjects((prev) => {
            const restoredProjects = (prev.length > 0 ? prev : getStoredLoadedProjects())
              .filter((name) => availableProjects.includes(name));

            return restoredProjects.length > 0 ? restoredProjects : availableProjects;
          });
        }
      })
      .catch(() => {});
  }, [loadedProjects.length]);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY_PREFIX + "loadedProjects", JSON.stringify(loadedProjects));
    sessionStorage.setItem(SESSION_KEY_PREFIX + "activeFilters", JSON.stringify(activeFilters));
    sessionStorage.setItem(SESSION_KEY_PREFIX + "hiddenProjects", JSON.stringify(hiddenProjects));
  }, [activeFilters, loadedProjects, hiddenProjects]);

  useEffect(() => {
    setHiddenProjects((prev) => prev.filter((projectName) => loadedProjects.includes(projectName)));
  }, [loadedProjects]);

  return (
    <Box w="100%" h="100vh" overflowY="auto" p="6" className="path-analysis-container">
      {reportConfig.showTitle && (
        <Box mb="6" className="report-element report-title-box">
          {reportConfig.showTitleText !== false && (
            <Text fontSize="2xl" fontWeight="bold" mb="2">
              Path Analysis
            </Text>
          )}
          {reportConfig.showTitleDescription !== false && (
            <Text fontSize="sm" color="fg.muted">
              Analyze projects based on its attributes.
            </Text>
          )}
        </Box>
      )}

      {reportConfig.showRiskBands && visibleProjects.length > 0 && (
        <Box mb="6" className="report-element report-risk-bands">
          <AggregatedScoreBandPanel selectedProjects={visibleProjects} reportConfig={reportConfig} />
        </Box>
      )}

      {visibleProjects.length > 0 && (
        <Box mb="6" className="report-element report-top-contributors">
          <AggregatedTopContributorsPanel selectedProjects={visibleProjects} />
        </Box>
      )}

      <Box
        mb="6"
        className="report-element report-filters"
        display={reportConfig.showFilters ? "block" : "none"}
      >
        <FilterPanel
          activeFilters={activeFilters}
          onActiveFiltersChange={setActiveFilters}
        />
      </Box>

      <Box
        mb="6"
        className="report-element report-map"
        display={reportConfig.showMap && reportConfig.showMapView !== false ? "block" : "none"}
      >
        <PathAnalysisMapView
          selectedProjects={visibleProjects}
          selectedAttributes={activeFilters}
          onChartDataUpdate={setChartData}
          loadedProjects={loadedProjects}
          hiddenProjects={hiddenProjects}
          onHiddenProjectsChange={setHiddenProjects}
        />
      </Box>

      {reportConfig.showCharts &&
        (reportConfig.showPieChart !== false || reportConfig.showBarChart !== false) &&
        chartData.primaryFocusAttribute &&
        chartData.categoryDistributionData.length > 0 && (
          <Box
            borderWidth="1px"
            borderRadius="lg"
            p="6"
            bg="white"
            _dark={{ bg: "gray.800" }}
            className="report-element report-charts"
          >
            <AttributeDistributionChart
              categoryData={chartData.categoryDistributionData}
              selectedAttribute={chartData.primaryFocusAttribute}
              categoryStatus={chartData.categoryStatus}
              showPieChart={reportConfig.showPieChart}
              showBarChart={reportConfig.showBarChart}
              totalSegmentsLoaded={chartData.totalSegmentsLoaded}
              totalSegmentsViewed={chartData.totalSegmentsViewed}
            />
          </Box>
        )}
    </Box>
  );
}
