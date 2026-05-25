import { useState, useEffect } from "react";
import {
  Box,
  Text,
} from "@chakra-ui/react";
import { fetchProjectList } from "../../api";
import FilterPanel from "./components/FilterPanel";
import PathAnalysisMapView from "./components/PathAnalysisMapView";
import AttributeDistributionChart from "./components/AttributeDistributionChart";
import AggregatedScoreBandPanel from "./components/AggregatedScoreBandPanel";
import "./pathAnalysisPage.css";

const SESSION_KEY_PREFIX = "pathAnalysis_";

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

  // Chart data state
  const [chartData, setChartData] = useState<{
    categoryDistributionData: { category: string; count: number; color: string }[];
    primaryFocusAttribute: string | null;
    categoryStatus: { attribute: string; categories: { category: string; isActive: boolean; color: string }[] }[];
  }>({
    categoryDistributionData: [],
    primaryFocusAttribute: null,
    categoryStatus: [],
  });

  // Report options visibility configuration
  const [reportConfig, setReportConfig] = useState(() => {
    try {
      const stored = sessionStorage.getItem("psat_report_config");
      if (stored) return JSON.parse(stored);
      return {
        showTitle: true, showTitleText: true, showTitleDescription: true,
        showRiskBands: true, showRiskBandsOverall: true, showRiskBandsLegend: true,
        showRiskBandsCrashTypes: true, showRiskBandsVB: true, showRiskBandsBB: true,
        showRiskBandsSB: true, showRiskBandsBP: true,
        showFilters: true,
        showMap: true, showMapView: true,
        showCharts: true, showPieChart: true, showBarChart: true,
      };
    } catch {
      return {
        showTitle: true, showTitleText: true, showTitleDescription: true,
        showRiskBands: true, showRiskBandsOverall: true, showRiskBandsLegend: true,
        showRiskBandsCrashTypes: true, showRiskBandsVB: true, showRiskBandsBB: true,
        showRiskBandsSB: true, showRiskBandsBP: true,
        showFilters: true,
        showMap: true, showMapView: true,
        showCharts: true, showPieChart: true, showBarChart: true,
      };
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
          const availableProjects = data.projects.map((p) => p.name);
          setLoadedProjects((prev) => {
            const restoredProjects = (prev.length > 0 ? prev : getStoredLoadedProjects())
              .filter((name) => availableProjects.includes(name));

            return restoredProjects.length > 0 ? restoredProjects : availableProjects;
          });
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY_PREFIX + "loadedProjects", JSON.stringify(loadedProjects));
    sessionStorage.setItem(SESSION_KEY_PREFIX + "activeFilters", JSON.stringify(activeFilters));
  }, [activeFilters, loadedProjects]);

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

      {reportConfig.showRiskBands && loadedProjects.length > 0 && (
        <Box mb="6" className="report-element report-risk-bands">
          <AggregatedScoreBandPanel selectedProjects={loadedProjects} reportConfig={reportConfig} />
        </Box>
      )}

      {/* Maintain filter panel state but toggle visibility */}
      <Box mb="6" className="report-element report-filters" display={reportConfig.showFilters ? "block" : "none"}>
        <FilterPanel
          activeFilters={activeFilters}
          onActiveFiltersChange={setActiveFilters}
        />
      </Box>

      {/* Maintain map mount state for chart data pipeline using display toggling */}
      <Box mb="6" className="report-element report-map" display={reportConfig.showMap && reportConfig.showMapView !== false ? "block" : "none"}>
        <PathAnalysisMapView
          selectedProjects={loadedProjects}
          selectedAttributes={activeFilters}
          onChartDataUpdate={setChartData}
        />
      </Box>

      {reportConfig.showCharts && chartData.primaryFocusAttribute && chartData.categoryDistributionData.length > 0 && (
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
          />
        </Box>
      )}
    </Box>
  );
}
