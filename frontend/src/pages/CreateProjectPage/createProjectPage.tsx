import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  Box,
  Button,
  Card,
  CardHeader,
  CardBody,
  Heading,
  Input,
  Text,
  Portal,
  Combobox,
  createListCollection,
  Separator,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { listSourceFolders, createProjectFromFolder, fetchProjectList } from "../../api";
import ImageUploadModal from "../sidebar/components/ImageUploadModal";
import SelectRoadsMap, { type SelectedRoad } from "./SelectRoadsMap";
import "../Projects/components/EditProjectModal.css";

// Generate a consistent, bright, varied color for each unique tag (same as EditProjectModal)
function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hash2 = Math.abs(hash >> 16);
  const hash3 = Math.abs(hash << 3);

  let hue = Math.abs(hash % 360);
  if (hue >= 40 && hue <= 60) hue = (hue + 30) % 360;
  if (hue >= 160 && hue <= 180) hue = (hue + 30) % 360;

  const saturation = 75 + (hash2 % 21);
  const lightness = 65 + (hash3 % 16);

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export default function CreateProjectPage() {
  const nav = useNavigate();
  const [folders, setFolders] = useState<string[]>([]);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [folderComboboxOpen, setFolderComboboxOpen] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [tagComboboxOpen, setTagComboboxOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [imageUploadModalOpen, setImageUploadModalOpen] = useState(false);
  const [selectedRoads, setSelectedRoads] = useState<SelectedRoad[]>([]);
  const [selectedPolygon, setSelectedPolygon] = useState<[number, number][]>([]);

  const selectedRoadFolders = useMemo(
    () => selectedRoads.filter((road) => road.selected),
    [selectedRoads]
  );
  const unavailableSelectedRoads = useMemo(
    () => selectedRoadFolders.filter((road) => !road.exists),
    [selectedRoadFolders]
  );
  const usingRoadSelection = selectedRoadFolders.length > 0;

  const loadFolders = async (ctrl?: AbortController) => {
    try {
      setLoadingFolders(true);
      setErr(null);
      const [foldersData, projectsData] = await Promise.all([
        listSourceFolders({ signal: ctrl?.signal }),
        fetchProjectList()
      ]);
      setFolders(foldersData);

      // Extract all unique tags from existing projects
      const tagSet = new Set<string>();
      projectsData.projects.forEach(p => {
        p.tags?.forEach(tag => tagSet.add(tag));
      });
      setExistingTags(Array.from(tagSet).sort());
    } catch (e: any) {
      if (e?.name !== "AbortError") setErr(e?.message ?? "Failed to load folders");
    } finally {
      setLoadingFolders(false);
    }
  };

  useEffect(() => {
    const ctrl = new AbortController();
    loadFolders(ctrl);
    return () => ctrl.abort();
  }, []);

  const handleRoadSelectionChange = (roads: SelectedRoad[]) => {
    setSelectedRoads(roads);
  };

  const handlePolygonChange = (polygon: [number, number][]) => {
    setSelectedPolygon(polygon);
  };

  const canCreate = useMemo(() => {
    if (!name.trim()) return false;
    if (name.includes("_")) return false;
    if (usingRoadSelection) {
      return unavailableSelectedRoads.length === 0;
    }
    if (!folder) return false;
    return true;
  }, [name, folder, unavailableSelectedRoads.length, usingRoadSelection]);

  const handleTagInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const trimmedTag = tagInput.trim();
      if (trimmedTag && !tags.includes(trimmedTag)) {
        setTags([...tags, trimmedTag]);
      }
      setTagInput("");
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      // Remove last tag on backspace if input is empty
      setTags(tags.slice(0, -1));
    }
  };

  const removeTag = (tagToRemove: string) => {
    setTags(tags.filter((t) => t !== tagToRemove));
  };

  const onCreate = async () => {
    if (!canCreate) return;
    try {
      setCreating(true);
      setErr(null);
      const sourceSelection = usingRoadSelection
        ? selectedRoadFolders.map((road) => road.name)
        : folder;
      const data = await createProjectFromFolder(
        name.trim(),
        sourceSelection,
        tags,
        usingRoadSelection ? selectedPolygon : undefined
      );
      const proj = data?.name ?? name.trim();
      nav(`/coding/${encodeURIComponent(proj)}`);
    } catch (e: any) {
      setErr(e?.message ?? "Create failed");
    } finally {
      setCreating(false);
    }
  };


  return (
    <Box p={4} maxW="900px" mx="auto">
      <Card.Root>
        <CardHeader>
          <Heading size="md">Create Project from Folder</Heading>
          <Text mt="1" color="gray.500" fontSize="sm">
            Use either a single source folder or a polygon-selected set of roads to create a project.
          </Text>
        </CardHeader>
        <CardBody display="grid" gap={4}>
          <Box>
            <Text fontSize="sm" mb={1}>
              Project Name
            </Text>
            <Input
              placeholder="No underscore _"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            {name.includes("_") && (
              <Text color="red.600" fontSize="xs" mt={1}>
                Project name cannot contain underscores (_)
              </Text>
            )}
          </Box>

          <Box>
            <Text fontSize="sm" mb={1}>
              Tags (optional)
            </Text>
            <Box className="tag-input-container">
              <Box className="tag-input-wrapper">
                {tags.map((tag) => (
                  <Box
                    key={tag}
                    className="tag-chip"
                    style={{
                      backgroundColor: getTagColor(tag),
                    }}
                  >
                    <span className="tag-chip-text">{tag}</span>
                    <button
                      className="tag-chip-remove"
                      onClick={() => removeTag(tag)}
                      aria-label={`Remove ${tag}`}
                    >
                      ×
                    </button>
                  </Box>
                ))}
                <Combobox.Root
                  collection={createListCollection({
                    items: existingTags.map(t => ({ label: t, value: t }))
                  })}
                  inputValue={tagInput}
                  onInputValueChange={({ inputValue }) => setTagInput(inputValue)}
                  onValueChange={({ value }) => {
                    if (value.length > 0) {
                      const selectedTag = value[0];
                      if (selectedTag && !tags.includes(selectedTag)) {
                        setTags([...tags, selectedTag]);
                        setTagInput("");
                      }
                    }
                  }}
                  open={tagComboboxOpen}
                  onOpenChange={(details) => {
                    // Keep dropdown open if there's text in the field
                    if (tagInput.length > 0) {
                      setTagComboboxOpen(true);
                    } else {
                      setTagComboboxOpen(details.open);
                    }
                  }}
                >
                  <Combobox.Control onClick={() => setTagComboboxOpen(true)}>
                    <Combobox.Input
                      placeholder="Type tag and press comma or enter"
                      className="tag-input-field"
                      onKeyDown={handleTagInputKeyDown}
                    />
                  </Combobox.Control>
                  <Portal>
                    <Combobox.Positioner>
                      <Combobox.Content>
                        {existingTags
                          .filter(t =>
                            t.toLowerCase().includes(tagInput.toLowerCase()) &&
                            !tags.includes(t)
                          )
                          .map(t => (
                            <Combobox.Item key={t} item={{ label: t, value: t }}>
                              {t}
                            </Combobox.Item>
                          ))}
                      </Combobox.Content>
                    </Combobox.Positioner>
                  </Portal>
                </Combobox.Root>
              </Box>
            </Box>
            <Text color="gray.500" fontSize="xs" mt={1}>
              Press comma (,) or Enter to add a tag. Click a suggestion or type to select existing tags.
            </Text>
          </Box>

          <Box>
            <Text fontSize="sm" mb={1}>
              Source Folder
            </Text>

            <Box display="flex" gap={2} alignItems="flex-end">
              <Box flex={1}>
                <Combobox.Root
                  collection={createListCollection({
                    items: folders.map(f => ({ label: f, value: f }))
                  })}
                  inputValue={folder}
                  onInputValueChange={({ inputValue }) => setFolder(inputValue)}
                  onValueChange={({ value }) => {
                    if (value.length > 0) {
                      setFolder(value[0]);
                      setFolderComboboxOpen(false);
                    }
                  }}
                  disabled={loadingFolders}
                  open={folderComboboxOpen}
                  onOpenChange={(details) => setFolderComboboxOpen(details.open)}
                >
                  <Combobox.Control onClick={() => setFolderComboboxOpen(true)}>
                    <Combobox.Input
                      placeholder={loadingFolders ? "Loading..." : "Select a folder"}
                    />
                  </Combobox.Control>
                  <Portal>
                    <Combobox.Positioner>
                      <Combobox.Content>
                        {folders
                          .filter(f => f.toLowerCase().includes(folder.toLowerCase()))
                          .map(f => (
                            <Combobox.Item key={f} item={{ label: f, value: f }}>
                              {f}
                            </Combobox.Item>
                          ))}
                      </Combobox.Content>
                    </Combobox.Positioner>
                  </Portal>
                </Combobox.Root>
              </Box>
              <Button
                colorPalette="green"
                variant="surface"
                size="sm"
                onClick={() => setImageUploadModalOpen(true)}
              >
                Upload Images
              </Button>
            </Box>

            {err && (
              <Text color="red.600" fontSize="xs" mt={1}>
                {err}
              </Text>
            )}

            {!usingRoadSelection && (
              <Text color="gray.500" fontSize="xs" mt={1}>
                This is used when no roads are selected from the polygon map.
              </Text>
            )}
          </Box>

          <Separator />

          <Box>
            <Text fontSize="sm" fontWeight="medium" mb={2}>
              Select Roads
            </Text>
            <Text color="gray.500" fontSize="xs" mb={3}>
              Draw a polygon or click a planning area to select multiple roads. Project creation uses only nodes inside the selected boundary.
            </Text>
            <SelectRoadsMap onSelectionChange={handleRoadSelectionChange} onPolygonChange={handlePolygonChange} />

            {usingRoadSelection && unavailableSelectedRoads.length > 0 && (
              <Text color="orange.600" fontSize="xs" mt={3}>
                Deselect unavailable roads to create the project. {unavailableSelectedRoads.length} selected road{unavailableSelectedRoads.length === 1 ? " is" : "s are"} missing local files.
              </Text>
            )}

            {usingRoadSelection && unavailableSelectedRoads.length === 0 && (
              <Text color="green.600" fontSize="xs" mt={3}>
                Project will be created from nodes inside the boundary across {selectedRoadFolders.length} selected road{selectedRoadFolders.length === 1 ? "" : "s"}.
              </Text>
            )}
          </Box>

          <Box display="flex" gap={3}>
            <Button
              variant="solid"
              onClick={onCreate}
              disabled={!canCreate || creating}
              loading={creating}
            >
              Create
            </Button>
            <Button variant="ghost" onClick={() => nav(-1)}>
              Cancel
            </Button>
          </Box>
        </CardBody>
      </Card.Root>

      <ImageUploadModal
        open={imageUploadModalOpen}
        onClose={() => setImageUploadModalOpen(false)}
        onSuccess={() => loadFolders()}
      />
    </Box>
  );
}
