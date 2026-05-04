import { useEffect, useMemo, useState } from "react";
import {
  Box,
  Button,
  Combobox,
  createListCollection,
  Dialog,
  Input,
  Portal,
  Text,
} from "@chakra-ui/react";
import { LuCheck, LuFolderSearch, LuImport, LuSearch } from "react-icons/lu";
import { toaster } from "../../../components/ui/toaster";
import * as api from "../../../api";

interface ImageUploadModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess?: (details: { folderName: string }) => void;
}

type WorkflowStep = "upload" | "success";

export default function ImageUploadModal({ open, onClose, onSuccess }: ImageUploadModalProps) {
  const [step, setStep] = useState<WorkflowStep>("upload");
  const [sourcePath, setSourcePath] = useState("");
  const [folderName, setFolderName] = useState("");
  const [folderInputValue, setFolderInputValue] = useState("");
  const [folderComboboxOpen, setFolderComboboxOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<api.SourceFolderSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const [loadedSuggestions, setLoadedSuggestions] = useState(false);
  const [browsing, setBrowsing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [renamedFrom, setRenamedFrom] = useState<string | null>(null);
  const [importPreview, setImportPreview] = useState<api.SourceFolderPreview | null>(null);

  const filteredSuggestions = useMemo(
    () => suggestions.filter((item) => item.name.toLowerCase().includes(folderInputValue.toLowerCase())),
    [folderInputValue, suggestions],
  );
  const exactSuggestion = useMemo(
    () => suggestions.find((item) => item.name.toLowerCase() === folderName.trim().toLowerCase()),
    [folderName, suggestions],
  );

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  function resetState() {
    setStep("upload");
    setSourcePath("");
    setFolderName("");
    setFolderInputValue("");
    setFolderComboboxOpen(false);
    setSuggestions([]);
    setLoadedSuggestions(false);
    setLoadingSuggestions(false);
    setBrowsing(false);
    setUploading(false);
    setRenamedFrom(null);
    setImportPreview(null);
  }

  async function ensureSuggestionsLoaded() {
    if (loadedSuggestions || loadingSuggestions) {
      return;
    }

    try {
      setLoadingSuggestions(true);
      const items = await api.listSourceFolderSuggestions();
      setSuggestions(items);
      setLoadedSuggestions(true);
    } catch (error) {
      toaster.create({
        description: `Failed to load folder suggestions: ${error}`,
        type: "error",
      });
    } finally {
      setLoadingSuggestions(false);
    }
  }

  function handleClose() {
    if (step === "success" && onSuccess) {
      onSuccess({ folderName });
    }
    resetState();
    onClose();
  }

  async function handleBrowse() {
    try {
      setBrowsing(true);
      const result = await api.pickLocalSourceFolder();
      if (!result.path) {
        return;
      }

      setSourcePath(result.path);
      if (!folderName.trim() && result.suggested_folder_name) {
        setFolderName(result.suggested_folder_name);
        setFolderInputValue(result.suggested_folder_name);
      }
    } catch (error) {
      toaster.create({
        description: `Browse failed: ${error}`,
        type: "error",
      });
    } finally {
      setBrowsing(false);
    }
  }

  async function handleUpload() {
    if (!sourcePath.trim()) {
      toaster.create({
        description: "Please choose or paste a local folder path",
        type: "warning",
      });
      return;
    }

    if (!folderName.trim()) {
      toaster.create({
        description: "Please choose a destination folder name",
        type: "warning",
      });
      return;
    }

    try {
      setUploading(true);
      const result = await api.copyLocalImagesToSourceFolder(sourcePath.trim(), folderName.trim());
      const renamedDescription = result.renamed_from
        ? ` Renamed to "${result.folder_name}" using the detected survey quarter.`
        : "";

      if (result.errors.length > 0) {
        toaster.create({
          description: `Imported ${result.count} image(s) with ${result.errors.length} error(s).${renamedDescription}`,
          type: "warning",
        });
      } else {
        toaster.create({
          description: `Copied ${result.count} image(s) into folder "${result.folder_name}".${renamedDescription}`,
          type: "success",
        });
      }

      setFolderName(result.folder_name);
      setFolderInputValue(result.folder_name);
      setRenamedFrom(result.renamed_from);
      setImportPreview(result.preview);
      setStep("success");
    } catch (error) {
      toaster.create({
        description: `Import failed: ${error}`,
        type: "error",
      });
    } finally {
      setUploading(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(details) => !details.open && handleClose()} size="xl">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {step === "upload" ? "Import Source Folder" : "Success!"}
              </Dialog.Title>
              <Dialog.CloseTrigger />
            </Dialog.Header>

            <Dialog.Body>
              {step === "upload" && (
                <Box display="grid" gap={5}>
                  <Text color="fg.muted">
                    Copy images directly from a local folder on this machine into in/. This avoids slow browser uploads and keeps the import as one source folder instead of hundreds of individual files.
                  </Text>

                  <Box>
                    <Text fontWeight="600" mb={2}>Local Folder Path</Text>
                    <Box display="flex" gap={2} alignItems="center">
                      <LuFolderSearch />
                      <Input
                        placeholder="e.g., C:\\path\\to\\ANG MO KIO AVENUE 1"
                        value={sourcePath}
                        onChange={(e) => setSourcePath(e.target.value)}
                      />
                      <Button
                        variant="outline"
                        onClick={handleBrowse}
                        loading={browsing}
                        disabled={uploading}
                      >
                        Browse
                      </Button>
                    </Box>
                    <Text fontSize="xs" color="fg.muted" mt={1}>
                      Local folder browsing works only when the backend is running on this same machine.
                    </Text>
                  </Box>

                  <Box>
                    <Text fontWeight="600" mb={2}>Destination Source Folder</Text>
                    <Box display="flex" alignItems="center" gap={2}>
                      <LuSearch />
                      <Box flex={1}>
                        <Combobox.Root
                          collection={createListCollection({
                            items: filteredSuggestions.map((item) => ({
                              label: item.exists ? `${item.name} (existing)` : item.name,
                              value: item.name,
                            })),
                          })}
                          inputValue={folderInputValue}
                          onInputValueChange={({ inputValue }) => {
                            setFolderInputValue(inputValue);
                            setFolderName(inputValue);
                          }}
                          onValueChange={({ value }) => {
                            if (value.length > 0) {
                              setFolderName(value[0]);
                              setFolderInputValue(value[0]);
                              setFolderComboboxOpen(false);
                            }
                          }}
                          open={folderComboboxOpen}
                          onOpenChange={(details) => {
                            setFolderComboboxOpen(details.open);
                            if (details.open) {
                              void ensureSuggestionsLoaded();
                            }
                          }}
                          disabled={uploading}
                        >
                          <Combobox.Control onClick={() => {
                            setFolderComboboxOpen(true);
                            void ensureSuggestionsLoaded();
                          }}>
                            <Combobox.Input placeholder={loadingSuggestions ? "Loading roads and folders..." : "Search road or source folder"} />
                          </Combobox.Control>
                          <Combobox.Positioner zIndex={2000}>
                            <Combobox.Content>
                              {loadingSuggestions && filteredSuggestions.length === 0 && (
                                <Box px={3} py={2}>
                                  <Text fontSize="sm" color="gray.500">Loading roads and folders...</Text>
                                </Box>
                              )}
                              {!loadingSuggestions && filteredSuggestions.length === 0 && folderInputValue.trim() !== "" && (
                                <Box px={3} py={2}>
                                  <Text fontSize="sm" color="gray.500">No matching roads or folders.</Text>
                                </Box>
                              )}
                              {filteredSuggestions.map((item) => (
                                <Combobox.Item
                                  key={item.name}
                                  item={{
                                    label: item.exists ? `${item.name} (existing)` : item.name,
                                    value: item.name,
                                  }}
                                >
                                  <Box display="flex" justifyContent="space-between" width="100%" gap={3}>
                                    <span>{item.name}</span>
                                    <Text fontSize="xs" color={item.exists ? "green.600" : "gray.500"}>
                                      {item.exists ? "existing" : "new"}
                                    </Text>
                                  </Box>
                                </Combobox.Item>
                              ))}
                            </Combobox.Content>
                          </Combobox.Positioner>
                        </Combobox.Root>
                      </Box>
                    </Box>
                    <Text fontSize="xs" color="fg.muted" mt={1}>
                      Search an existing source folder or road name. You can still type a new folder name if needed.
                    </Text>
                    {folderName.trim() && (
                      <Text fontSize="xs" color={exactSuggestion?.exists ? "green.600" : "gray.600"} mt={2}>
                        {exactSuggestion?.exists
                          ? "Images will be copied into an existing source folder."
                          : "A new source folder will be created under in/."}
                      </Text>
                    )}
                  </Box>

                  <Box borderWidth="1px" borderRadius="md" p={4} bg="bg.subtle">
                    <Text fontWeight="600" mb={2}>What this does</Text>
                    <Text fontSize="sm" color="fg.muted">
                      The backend copies image files directly from the selected folder into the destination source folder. Nested folders are flattened automatically so project creation can read the images cleanly.
                    </Text>
                  </Box>

                  {uploading && (
                    <Box>
                      <Text fontSize="sm" color="fg.muted" textAlign="center">
                        Copying images into the source folder...
                      </Text>
                    </Box>
                  )}
                </Box>
              )}

              {step === "success" && (
                <Box textAlign="center" py={6}>
                  <Box fontSize="4xl" color="green.500" mb={4}>
                    <LuCheck />
                  </Box>
                  <Text fontSize="xl" fontWeight="600" mb={2}>
                    Import Completed!
                  </Text>
                  <Text color="fg.muted" mb={6}>
                    The destination folder <strong>{folderName}</strong> is ready to use in project creation.
                  </Text>

                  {renamedFrom && (
                    <Text fontSize="sm" color="blue.600" mb={4}>
                      Renamed from <strong>{renamedFrom}</strong> to include the detected survey quarter.
                    </Text>
                  )}

                  <Text fontSize="sm" color="fg.muted" mb={4}>
                    A folder summary metadata file was generated so the next load can reuse the cached segment and quarter summary.
                  </Text>

                  {importPreview && (
                    <Box borderWidth="1px" borderRadius="md" p={4} bg="bg.subtle" textAlign="left">
                      <Text fontWeight="600" mb={3}>Imported Folder Summary</Text>
                      <Text fontSize="sm" color="fg.muted">
                        Segments: {importPreview.segment_count}
                      </Text>
                      <Text fontSize="sm" color="fg.muted">
                        Survey Quarter: {importPreview.survey_quarter ?? (importPreview.survey_quarters.length > 0 ? importPreview.survey_quarters.join(", ") : "Unknown")}
                      </Text>
                      <Text fontSize="sm" color="fg.muted">
                        Source Images: {importPreview.image_count} ({importPreview.geotagged_image_count} geotagged)
                      </Text>
                      {importPreview.mixed_quarters && (
                        <Text fontSize="sm" color="orange.600" mt={3}>
                          This folder spans multiple quarters. Keep quarter batches separated where possible.
                        </Text>
                      )}
                    </Box>
                  )}
                </Box>
              )}
            </Dialog.Body>

            {step !== "success" && (
              <Dialog.Footer>
                <Box display="flex" gap={3} width="100%" justifyContent="flex-end">
                  <Button variant="outline" onClick={handleClose} disabled={uploading || browsing}>
                    Cancel
                  </Button>
                  <Button
                    colorPalette="blue"
                    onClick={handleUpload}
                    disabled={!sourcePath.trim() || !folderName.trim() || uploading || browsing}
                    loading={uploading}
                  >
                    <LuImport />
                    Import Folder
                  </Button>
                </Box>
              </Dialog.Footer>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
