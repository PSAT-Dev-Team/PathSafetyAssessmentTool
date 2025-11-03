import { useEffect, useMemo, useState } from "react";
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
} from "@chakra-ui/react";
import { useNavigate } from "react-router-dom";
import { listSourceFolders, createProjectFromFolder } from "../../api";

export default function CreateProjectPage() {
  const nav = useNavigate();
  const [folders, setFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [name, setName] = useState("");
  const [folder, setFolder] = useState("");
  const [tags, setTags] = useState<string>("");
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

  const onCreate = async () => {
    if (!canCreate) return;
    try {
      setCreating(true);
      setErr(null);
      // Parse tags from comma-separated string
      const tagArray = tags
        .split(",")
        .map(t => t.trim())
        .filter(t => t.length > 0);
      const data = await createProjectFromFolder(name.trim(), folder, tagArray);
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
            <Text fontSize="sm" mb={1}>
              Tags (optional)
            </Text>
            <Input
              placeholder="Enter tags separated by commas (e.g., Urban, High Priority)"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
            />
            <Text color="gray.500" fontSize="xs" mt={1}>
              Tags help you organize and filter projects
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
