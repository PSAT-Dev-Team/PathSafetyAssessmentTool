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
  Select,
  Portal,
  createListCollection,
  Flex,
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { listSourceFolders, createProjectFromFolder } from "../../api";
import { Switch } from "../../components/ui/switch";
import "../Home/components/editProjectModal.css";

// Get border color for Pre/Post tags
function getTagBorderColor(tag: string): string {
  if (tag === "Pre") return "#fb923c"; // orange.emphasized
  if (tag === "Post") return "#22c55e"; // green.emphasized
  return "rgba(0, 0, 0, 0.1)";
}

// Generate a consistent, bright, varied color for each unique tag (same as EditProjectModal)
function getTagColor(tag: string): string {
  // Fixed colors for Pre/Post - matching the analysis pages (orange.subtle and green.subtle)
  if (tag === "Pre") return "#fed7aa"; // orange.subtle
  if (tag === "Post") return "#bbf7d0"; // green.subtle

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
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [phase, setPhase] = useState<"Pre" | "Post">("Pre");
  const [creating, setCreating] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        setLoadingFolders(true);
        setErr(null);
        const items = await listSourceFolders({ signal: ctrl.signal });
        setFolders(items);
      } catch (e: any) {
        if (e?.name !== "AbortError") setErr(e?.message ?? "Failed to load folders");
      } finally {
        setLoadingFolders(false);
      }
    })();
    return () => ctrl.abort();
  }, []);

  const canCreate = useMemo(() => {
    if (!name.trim()) return false;
    if (name.includes("_")) return false;
    if (!folder) return false;
    return true;
  }, [name, folder]);

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
      // Combine user tags with the compulsory phase tag
      const allTags = [...tags];
      // Always ensure the phase tag is included
      if (!allTags.includes(phase)) {
        allTags.push(phase);
      }
      const data = await createProjectFromFolder(name.trim(), folder, allTags);
      const proj = data?.name ?? name.trim();
      nav(`/coding/${encodeURIComponent(proj)}`);
    } catch (e: any) {
      setErr(e?.message ?? "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const collection = useMemo(
    () =>
      createListCollection({
        items: folders.map((f) => ({ label: f, value: f })),
      }),
    [folders]
  );

  return (
    <Box p={4} maxW="700px" mx="auto">
      <Card.Root>
        <CardHeader>
          <Heading size="md">Create Project from Folder</Heading>
          <Text mt="1" color="gray.500" fontSize="sm">
            Choose a source folder under backend input path, then create a new project.
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
            <Text fontSize="sm" mb={2}>
              Project Phase
            </Text>
            <Flex align="center" gap={3}>
              <Text
                fontSize="sm"
                fontWeight={phase === "Pre" ? "semibold" : "normal"}
                color={phase === "Pre" ? "orange.600" : "gray.500"}
              >
                Pre-Treatment
              </Text>
              <Switch
                checked={phase === "Post"}
                onCheckedChange={(e) => setPhase(e.checked ? "Post" : "Pre")}
                colorPalette={phase === "Post" ? "green" : "orange"}
              />
              <Text
                fontSize="sm"
                fontWeight={phase === "Post" ? "semibold" : "normal"}
                color={phase === "Post" ? "green.600" : "gray.500"}
              >
                Post-Treatment
              </Text>
            </Flex>
            <Text color="gray.500" fontSize="xs" mt={1}>
              This tag will be automatically added to the project
            </Text>
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
                      borderColor: getTagBorderColor(tag),
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
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagInputKeyDown}
                  placeholder="Type tag and press comma or enter"
                  className="tag-input-field"
                />
              </Box>
            </Box>
            <Text color="gray.500" fontSize="xs" mt={1}>
              Press comma (,) or Enter to add a tag
            </Text>
          </Box>

          <Box>
            <Text fontSize="sm" mb={1}>
              Source Folder
            </Text>

            <Select.Root
              collection={collection}
              size="sm"
              width="100%"
              value={folder ? [folder] : []}
              onValueChange={({ value }) => setFolder(value[0] ?? "")}
              disabled={loadingFolders}
            >
              <Select.HiddenSelect name="source-folder" />
              <Select.Control>
                <Select.Trigger>
                  <Select.ValueText
                    placeholder={loadingFolders ? "Loading..." : "Select a folder"}
                  />
                </Select.Trigger>
                <Select.IndicatorGroup>
                  <Select.Indicator />
                </Select.IndicatorGroup>
              </Select.Control>

              <Portal>
                <Select.Positioner>
                  <Select.Content>
                    {collection.items.map((item) => (
                      <Select.Item item={item} key={item.value}>
                        {item.label}
                        <Select.ItemIndicator />
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Positioner>
              </Portal>
            </Select.Root>

            {err && (
              <Text color="red.600" fontSize="xs" mt={1}>
                {err}
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
    </Box>
  );
}
