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

  const [chartData, setChartData] = useState<{
    categoryDistributionData: { category: string; count: number; color: string }[];
    primaryFocusAttribute: string | null;
    categoryStatus: { attribute: string; categories: { category: string; isActive: boolean; color: string }[] }[];
  }>({
    categoryDistributionData: [],
    primaryFocusAttribute: null,
    categoryStatus: [],
  });

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
    <Box w="100%" h="100vh" overflowY="auto" p="6">
      <Box mb="6">
        <Text fontSize="2xl" fontWeight="bold" mb="2">
          Path Analysis
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Analyze projects based on its attributes.
        </Text>
      </Box>

      {loadedProjects.length > 0 && (
        <Box mb="6">
          <AggregatedScoreBandPanel selectedProjects={loadedProjects} />
        </Box>
      )}

      <Box mb="6">
        <FilterPanel
          activeFilters={activeFilters}
          onActiveFiltersChange={setActiveFilters}
        />
      </Box>

      <Box mb="6">
        <PathAnalysisMapView
          selectedProjects={loadedProjects}
          selectedAttributes={activeFilters}
          onChartDataUpdate={setChartData}
        />
      </Box>

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
