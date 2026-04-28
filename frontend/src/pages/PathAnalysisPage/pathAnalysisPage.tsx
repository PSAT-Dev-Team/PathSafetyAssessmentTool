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

export default function PathAnalysisPage() {
  const [loadedProjects, setLoadedProjects] = useState<string[]>([]);

  // Active filter attributes (passed to FilterPanel for master toggles and MapView for filtering)
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

  // Fetch projects on mount and auto-load all of them
  useEffect(() => {
    fetchProjectList()
      .then((data) => {
        if (data?.projects) {
          setLoadedProjects(data.projects.map((p) => p.name));
        }
      })
      .catch(() => { });
  }, []);

  // Save active filters to session storage
  useEffect(() => {
    sessionStorage.setItem(SESSION_KEY_PREFIX + "activeFilters", JSON.stringify(activeFilters));
  }, [activeFilters]);

  return (
    <Box w="100%" h="100vh" overflowY="auto" p="6">
      {/* Header */}
      <Box mb="6">
        <Text fontSize="2xl" fontWeight="bold" mb="2">
          Path Analysis
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Analyze projects based on its attributes.
        </Text>
      </Box>

      {/* Aggregated Score Band Distribution Panel */}
      {loadedProjects.length > 0 && (
        <Box mb="6">
          <AggregatedScoreBandPanel selectedProjects={loadedProjects} />
        </Box>
      )}

      {/* Filter Panel */}
      <Box mb="6">
        <FilterPanel
          activeFilters={activeFilters}
          onActiveFiltersChange={setActiveFilters}
        />
      </Box>

      {/* Map/Table Section */}
      <Box mb="6">
        <PathAnalysisMapView
          selectedProjects={loadedProjects}
          selectedAttributes={activeFilters}
          onChartDataUpdate={setChartData}
        />
      </Box>

      {/* Charts Section - Displayed Below Map/Table */}
      {chartData.primaryFocusAttribute && chartData.categoryDistributionData.length > 0 && (
        <Box
          borderWidth="1px"
          borderRadius="lg"
          p="6"
          bg="white"
          _dark={{ bg: "gray.800" }}
        >
          <AttributeDistributionChart
            categoryData={chartData.categoryDistributionData}
            selectedAttribute={chartData.primaryFocusAttribute}
            categoryStatus={chartData.categoryStatus}
          />
        </Box>
      )}


    </Box>
  );
}
