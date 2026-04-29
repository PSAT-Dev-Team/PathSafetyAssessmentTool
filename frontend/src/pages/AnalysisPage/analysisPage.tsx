import { useState, useEffect, useMemo } from "react";
import {
  Box,
  Flex,
  Text,
  Button,
  Tabs,
} from "@chakra-ui/react";
import { fetchProjectList, type FileResponse, type ProjectListItem } from "../../api";
import { matchesProjectSearch } from "../../utils/projectSearch";
import "../Home/home.css"; // Reuse home page styles

type TreatmentPhase = "pre" | "post";

export default function AnalysisPage() {
  // Tab state - switches between Pre-Treatment and Post-Treatment
  const [phase, setPhase] = useState<TreatmentPhase>("pre");

  // Project list state
  const [projectList, setProjectList] = useState<FileResponse | null>(null);
  const [postTreatmentList, setPostTreatmentList] = useState<FileResponse | null>(null);

  // Filter and selection states
  const [nameQuery, setNameQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  // Fetch projects on mount and when phase changes
  useEffect(() => {
    if (phase === "pre") {
      // Fetch from Pre-Treatment folder (current default)
      fetchProjectList()
        .then((data) => setProjectList(data))
        .catch((e) => console.error("Failed to fetch pre-treatment projects:", e));
    } else {
      // TODO: Fetch from Post-Treatment folder
      // For now, using placeholder - you'll need to create an API endpoint for this
      // fetchPostTreatmentList()
      //   .then((data) => setPostTreatmentList(data))
      //   .catch((e) => console.error("Failed to fetch post-treatment projects:", e));

      // Placeholder: Empty list for post-treatment
      setPostTreatmentList({ projects: [] });
    }
  }, [phase]);

  // Process projects based on current phase
  const projects: ProjectListItem[] = useMemo(() => {
    const list = phase === "pre" ? projectList : postTreatmentList;
    if (!list?.projects) return [];
    return list.projects
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [projectList, postTreatmentList, phase]);

  // Apply filters
  const filtered = useMemo(() => {
    let list = projects;
    if (nameQuery.trim()) list = list.filter((p) => matchesProjectSearch(p, nameQuery));
    return list;
  }, [projects, nameQuery]);

  const onRowClick = (name: string) => setSelected(name);

  const analyzeProject = async () => {
    if (!selected) return;
    console.log(`Analyzing ${phase}-treatment project:`, selected);
    // TODO: Navigate to analysis view or show analysis dashboard
    alert(`Analyzing ${phase}-treatment project: ${selected}`);
  };

  const compareProjects = async () => {
    if (!selected) return;
    console.log(`Comparing project:`, selected);
    // TODO: Open comparison view
    alert(`Feature coming soon: Compare pre/post treatment for ${selected}`);
  };

  return (
    <Box className="home-root">
      {/* Header */}
      <Box mb="6">
        <Text fontSize="2xl" fontWeight="bold" mb="2">
          Analysis Dashboard
        </Text>
        <Text fontSize="sm" color="fg.muted">
          Select a project to analyze pre-treatment or post-treatment data
        </Text>
      </Box>

      {/* Phase Tabs */}
      <Tabs.Root
        value={phase}
        onValueChange={(e) => {
          setPhase(e.value as TreatmentPhase);
          setSelected(null); // Clear selection when switching tabs
          setNameQuery(""); // Clear search when switching tabs
        }}
        variant="enclosed"
        mb="6"
      >
        <Tabs.List>
          <Tabs.Trigger value="pre">
            Pre-Treatment
          </Tabs.Trigger>
          <Tabs.Trigger value="post">
            Post-Treatment
          </Tabs.Trigger>
        </Tabs.List>
      </Tabs.Root>

      {/* Info banner for current phase */}
      <Box
        p="4"
        mb="4"
        borderRadius="lg"
        bg={phase === "pre" ? "orange.subtle" : "green.subtle"}
        borderWidth="1px"
        borderColor={phase === "pre" ? "orange.emphasized" : "green.emphasized"}
      >
        <Flex align="center" gap="2">
          <Text fontWeight="semibold" fontSize="sm">
            {phase === "pre" ? "🈲 Pre-Treatment Projects" : "✅ Post-Treatment Projects"}
          </Text>
          <Text fontSize="sm" color="fg.muted">
            {phase === "pre"
              ? "Viewing projects prior to treatment implementation"
              : "Viewing projects after treatment implementation"}
          </Text>
        </Flex>
      </Box>

      {/* Search Panel */}
      <div className="search-panel">
        <div className="search-row">
          <div className="search-item">
            <label htmlFor="nameQuery">Search by project or road</label>
            <input
              id="nameQuery"
              type="text"
              placeholder="Type project name or road…"
              value={nameQuery}
              onChange={(e) => setNameQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Project Table */}
      <div className="table-wrap">
        <table className="project-table">
          <thead>
            <tr>
              <th style={{ width: 48 }}></th>
              <th>Project Name</th>
              <th style={{ width: 120 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={3} className="empty">
                  {phase === "post"
                    ? "No post-treatment projects available yet. Implement treatments and re-assess to see data here."
                    : "No projects found"}
                </td>
              </tr>
            ) : (
              filtered.map((p) => {
                const isSelected = selected === p.name;
                return (
                  <tr
                    key={p.name}
                    className={isSelected ? "row selected" : "row"}
                    onClick={() => onRowClick(p.name)}
                  >
                    <td>
                      <input
                        type="radio"
                        name="projectSelect"
                        checked={isSelected}
                        onChange={() => onRowClick(p.name)}
                        aria-label={`Select ${p.name}`}
                      />
                    </td>
                    <td title={p.name}>{p.name}</td>
                    <td>
                      <Box
                        as="span"
                        px="2"
                        py="1"
                        borderRadius="md"
                        fontSize="xs"
                        fontWeight="semibold"
                        bg={phase === "pre" ? "orange.subtle" : "green.subtle"}
                        color={phase === "pre" ? "orange.fg" : "green.fg"}
                      >
                        {phase === "pre" ? "Pre" : "Post"}
                      </Box>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Action Buttons */}
      <div className="actions-panel">
        <div className="buttons">
          <Button
            onClick={analyzeProject}
            colorPalette="blue"
            disabled={!selected}
          >
            Analyze Project
          </Button>
          <Button
            onClick={compareProjects}
            colorPalette="purple"
            disabled={!selected}
          >
            Compare Pre/Post
          </Button>
        </div>
      </div>
    </Box>
  );
}
