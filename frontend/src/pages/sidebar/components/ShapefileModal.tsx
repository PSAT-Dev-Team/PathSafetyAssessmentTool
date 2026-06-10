import { useState, useEffect, useRef, useMemo } from "react";
import { Box, Button, Text, Dialog, Portal, Input } from "@chakra-ui/react";
import { LuPlus, LuRefreshCw, LuUpload, LuFile, LuX, LuFolderInput, LuCheck } from "react-icons/lu";
import { toaster } from "../../../components/ui/toaster";
import * as api from "../../../api";
import "../../ShapefileManagement/shapefileManagement.css";
import { MapContainer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import ThemeAwareTileLayer from "../../../components/common/ThemeAwareTileLayer";
import { Spinner } from "@chakra-ui/react";

function FitBoundsGeoJSON({ data }: { data: any }) {
  const map = useMap();
  useEffect(() => {
    if (data) {
      try {
        const layer = L.geoJSON(data);
        const bounds = layer.getBounds();
        if (bounds.isValid()) map.fitBounds(bounds, { padding: [24, 24] });
      } catch (_) {}
    }
  }, [data, map]);
  return null;
}

interface ShapefileModalProps {
  open: boolean;
  onClose: () => void;
}

type WorkflowStep = "choice" | "add" | "replace" | "success";

export default function ShapefileModal({ open, onClose }: ShapefileModalProps) {
  const [step, setStep] = useState<WorkflowStep>("choice");
  const [categories, setCategories] = useState<api.ShapefileCategoryInfo[]>([]);
  const [allShapefiles, setAllShapefiles] = useState<api.ShapefileInfo[]>([]);

  // Add Shapefile State
  const [selectedCategory, setSelectedCategory] = useState("");
  const [newCategoryName, setNewCategoryName] = useState("");
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Replace Shapefile State
  const [replaceFiles, setReplaceFiles] = useState<File[]>([]);
  const [selectedReplaceCategory, setSelectedReplaceCategory] = useState<string>("");
  const [selectedTargetShapefile, setSelectedTargetShapefile] = useState<string>("");
  const [replacing, setReplacing] = useState(false);
  const [replaceDragActive, setReplaceDragActive] = useState(false);
  const replaceFileInputRef = useRef<HTMLInputElement>(null);
  const [replaceCategorySearch, setReplaceCategorySearch] = useState("");
  const [targetShapefileSearch, setTargetShapefileSearch] = useState("");
  const [isCategoryDropdownOpen, setIsCategoryDropdownOpen] = useState(false);
  const [isTargetDropdownOpen, setIsTargetDropdownOpen] = useState(false);
  const categorySearchRef = useRef<HTMLDivElement>(null);
  const targetSearchRef = useRef<HTMLDivElement>(null);
  const previewRequestIdRef = useRef(0);

  // Preview state (Add screen)
  const [previewGeoJSON, setPreviewGeoJSON] = useState<any>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  function resetPreviewState() {
    previewRequestIdRef.current += 1;
    setPreviewGeoJSON(null);
    setPreviewError(null);
    setPreviewLoading(false);
  }

  useEffect(() => {
    if (open) {
      loadCategories();
      loadAllShapefiles();
    }
  }, [open]);

  async function loadCategories() {
    try {
      const data = await api.listShapefileCategories();
      setCategories(data);
    } catch (error) {
    }
  }

  async function loadAllShapefiles() {
    try {
      const data = await api.listShapefiles();
      setAllShapefiles(data);
    } catch (error) {
    }
  }

  function resetState() {
    setStep("choice");
    setUploadFiles([]);
    setReplaceFiles([]);
    setSelectedCategory("__new__");
    setSelectedReplaceCategory("");
    setSelectedTargetShapefile("");
    setDragActive(false);
    resetPreviewState();
    setReplaceCategorySearch("");
    setTargetShapefileSearch("");
  }

  async function fetchPreview(files: File[]) {
    const hasShp = files.some(f => f.name.toLowerCase().endsWith(".shp"));
    if (!hasShp) {
      resetPreviewState();
      return;
    }

    const requestId = ++previewRequestIdRef.current;
    setPreviewLoading(true);
    setPreviewError(null);
    setPreviewGeoJSON(null);
    try {
      const geojson = await api.previewUploadedShapefiles(files);
      if (previewRequestIdRef.current !== requestId) {
        return;
      }
      if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features)) {
        throw new Error("Invalid preview response");
      }
      setPreviewGeoJSON(geojson);
    } catch (e: any) {
      if (previewRequestIdRef.current !== requestId) {
        return;
      }
      setPreviewError(e.message || "Preview failed");
    } finally {
      if (previewRequestIdRef.current === requestId) {
        setPreviewLoading(false);
      }
    }
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleChoiceSelect(choice: "add" | "replace") {
    setStep(choice);
    if (choice === "add") {
      setSelectedCategory("__new__");
    }
  }

  function handleBackToChoice() {
    setStep("choice");
    // Clear state
    setUploadFiles([]);
    setReplaceFiles([]);
    setSelectedReplaceCategory("");
    setSelectedTargetShapefile("");
    setReplaceCategorySearch("");
    setTargetShapefileSearch("");
    resetPreviewState();
  }

  // === Search & Filter Logic ===
  const filteredCategories = useMemo(() => {
    if (!replaceCategorySearch) return categories;
    const query = replaceCategorySearch.toLowerCase();
    return categories.filter(cat => cat.name.toLowerCase().includes(query));
  }, [categories, replaceCategorySearch]);

  const filteredTargetShapefiles = useMemo(() => {
    const gisLayerExtensions = ['.shp', '.geojson', '.kml', '.kmz', '.gml', '.gpx', '.json'];
    const baseList = allShapefiles.filter(shp => {
      if (shp.category !== selectedReplaceCategory) return false;
      const fileName = shp.name.toLowerCase();
      return gisLayerExtensions.some(ext => fileName.endsWith(ext));
    });

    if (!targetShapefileSearch) return baseList;
    const query = targetShapefileSearch.toLowerCase();
    return baseList.filter(shp => shp.name.toLowerCase().includes(query));
  }, [allShapefiles, selectedReplaceCategory, targetShapefileSearch]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (categorySearchRef.current && !categorySearchRef.current.contains(event.target as Node)) {
        setIsCategoryDropdownOpen(false);
      }
      if (targetSearchRef.current && !targetSearchRef.current.contains(event.target as Node)) {
        setIsTargetDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // === Add Shapefile Functions ===

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  }

  function addFiles(newFiles: File[]) {
    // Accept all GIS file types, but NO zip files
    const gisExtensions = ['.shp', '.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx',
      '.geojson', '.kml', '.kmz', '.gml', '.gpx', '.json'];

    const validFiles = newFiles.filter((f) => {
      const fileName = f.name.toLowerCase();
      // Reject zip files
      if (fileName.endsWith('.zip')) return false;
      // Accept any GIS file type
      return gisExtensions.some(ext => fileName.endsWith(ext));
    });

    if (validFiles.length === 0) {
      toaster.create({
        description: "Please upload GIS layer files (.shp, .geojson, .kml, .gpx, etc.). ZIP files are not accepted.",
        type: "warning",
      });
      return;
    }

    const merged = [...uploadFiles, ...validFiles];
    setUploadFiles(merged);
    fetchPreview(merged);
  }

  function removeFile(index: number) {
    const updated = uploadFiles.filter((_, i) => i !== index);
    setUploadFiles(updated);
    if (updated.length > 0) fetchPreview(updated);
    else resetPreviewState();
  }

  async function handleAddUpload() {
    let categoryToUse = selectedCategory === "__new__" ? newCategoryName : selectedCategory;
    if (!categoryToUse || categoryToUse.trim() === "") {
      categoryToUse = "uncategorised";
    }

    if (uploadFiles.length === 0) {
      toaster.create({
        description: "Please select files to upload",
        type: "warning",
      });
      return;
    }

    try {
      setUploading(true);
      const result = await api.uploadShapefiles(uploadFiles, categoryToUse);

      if (result.errors.length > 0) {
        toaster.create({
          description: `Uploaded ${result.count} file(s) with ${result.errors.length} error(s)`,
          type: "warning",
        });
      } else {
        toaster.create({
          description: `Successfully uploaded ${result.count} shapefile(s)`,
          type: "success",
        });
      }

      // Clear files and reload data
      setUploadFiles([]);
  resetPreviewState();
      await loadCategories();
      await loadAllShapefiles();
      setStep("success");
    } catch (error) {
      toaster.create({
        description: `Upload failed: ${error}`,
        type: "error",
      });
    } finally {
      setUploading(false);
    }
  }

  // === Replace Shapefile Functions ===

  function handleReplaceDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setReplaceDragActive(true);
  }

  function handleReplaceDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setReplaceDragActive(false);
  }

  function handleReplaceDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
  }

  function handleReplaceDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setReplaceDragActive(false);

    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      validateAndSetReplaceFiles(droppedFiles);
    }
  }

  function handleReplaceFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      validateAndSetReplaceFiles(selectedFiles);
    }
  }

  function validateAndSetReplaceFiles(files: File[]) {
    // Reject zip files
    const hasZip = files.some(f => f.name.toLowerCase().endsWith('.zip'));
    if (hasZip) {
      toaster.create({
        description: "ZIP files are not accepted. Please upload GIS layer files directly (all companion files for shapefiles).",
        type: "warning",
      });
      return;
    }

    // Validate all files are GIS files
    const gisExtensions = ['.shp', '.shx', '.dbf', '.prj', '.cpg', '.sbn', '.sbx',
      '.geojson', '.kml', '.kmz', '.gml', '.gpx', '.json'];

    const invalidFiles = files.filter(f => {
      const fileName = f.name.toLowerCase();
      return !gisExtensions.some(ext => fileName.endsWith(ext));
    });

    if (invalidFiles.length > 0) {
      toaster.create({
        description: `Invalid file(s): ${invalidFiles.map(f => f.name).join(', ')}. Please upload only GIS layer files.`,
        type: "warning",
      });
      return;
    }

    setReplaceFiles(files);
  }

  async function handleReplaceSubmit() {
    if (replaceFiles.length === 0) {
      toaster.create({
        description: "Please select file(s) to upload",
        type: "warning",
      });
      return;
    }

    if (!selectedReplaceCategory) {
      toaster.create({
        description: "Please select a category",
        type: "warning",
      });
      return;
    }

    if (!selectedTargetShapefile) {
      toaster.create({
        description: "Please select a GIS layer to replace",
        type: "warning",
      });
      return;
    }

    // Check if uploading shapefile and validate companion files
    const hasShpFile = replaceFiles.some(f => f.name.toLowerCase().endsWith('.shp'));
    if (hasShpFile) {
      // Find the base name of the .shp file
      const shpFile = replaceFiles.find(f => f.name.toLowerCase().endsWith('.shp'))!;
      const baseName = shpFile.name.slice(0, -4); // Remove .shp extension

      // Check for required companion files
      const requiredExtensions = ['.shp', '.shx', '.dbf'];
      const presentExtensions = replaceFiles.map(f => {
        const match = f.name.match(/^(.+)(\.[^.]+)$/);
        return match && match[1] === baseName ? match[2].toLowerCase() : null;
      }).filter(Boolean);

      const missingRequired = requiredExtensions.filter(ext => !presentExtensions.includes(ext));

      if (missingRequired.length > 0) {
        toaster.create({
          description: `Incomplete shapefile! Missing required files: ${missingRequired.join(', ')}. A valid shapefile requires .shp, .shx, and .dbf at minimum. Optional: .prj, .cpg, .sbn, .sbx`,
          type: "error",
          duration: 10000,
        });
        return;
      }
    }

    try {
      setReplacing(true);

      // Step 1: Upload all files to temp category
      const uploadResult = await api.uploadShapefiles(replaceFiles, "temp_replace");

      if (uploadResult.errors.length > 0 || uploadResult.count === 0) {
        toaster.create({
          description: `Upload failed: ${uploadResult.errors.join(", ")}`,
          type: "error",
        });
        return;
      }

      // Step 2: Validate compatibility before replacement
      const uploadedPath = uploadResult.uploaded[0].path;

      // Extract layer name from target path if possible (e.g., "area_type/file.shp" -> "area_type")
      const layerName = selectedTargetShapefile.split('/')[0];

      const validationResult = await api.validateShapefileReplacement(
        uploadedPath,
        selectedTargetShapefile,
        layerName
      );

      // Check for fatal errors
      if (validationResult.errors.length > 0) {
        toaster.create({
          title: "Compatibility Issues Found",
          description: `Cannot replace: ${validationResult.errors.join("; ")}`,
          type: "error",
          duration: 10000,
        });
        return;
      }

      // Check for warnings and ask user confirmation
      if (validationResult.warnings.length > 0) {
        const confirmed = window.confirm(
          `Warnings found:\n\n${validationResult.warnings.join("\n\n")}\n\nContinue with replacement?`
        );
        if (!confirmed) {
          return;
        }
      }

      // Step 3: Replace the target (now safe)
      const replaceResult = await api.replaceShapefiles([
        {
          uploaded_path: uploadedPath,
          target_path: selectedTargetShapefile,
        },
      ]);

      if (replaceResult.errors.length > 0) {
        toaster.create({
          description: `Replace failed: ${replaceResult.errors.join(", ")}`,
          type: "error",
        });
      } else {
        toaster.create({
          description: `Successfully replaced GIS layer!`,
          type: "success",
        });
      }

      // Clear and reload
      setReplaceFiles([]);
      setSelectedTargetShapefile("");
      resetPreviewState();
      await loadAllShapefiles();
      setStep("success");
    } catch (error) {
      toaster.create({
        description: `Replace failed: ${error}`,
        type: "error",
      });
    } finally {
      setReplacing(false);
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }
  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && handleClose()} size="xl">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {step === "choice" && "Update GIS Layers"}
                {step === "add" && "Add GIS Layer"}
                {step === "replace" && "Replace GIS Layer"}
                {step === "success" && "Success!"}
              </Dialog.Title>
              <Dialog.CloseTrigger />
            </Dialog.Header>

            <Dialog.Body>
              {/* Choice Screen */}
              {step === "choice" && (
                <Box>
                  <Text mb={4} color="fg.muted">
                    Choose an action:
                  </Text>
                  <div className="upload-choice-container">
                    <div
                      className="upload-choice-chip"
                      onClick={() => handleChoiceSelect("add")}
                    >
                      <div className="upload-choice-icon">
                        <LuPlus />
                      </div>
                      <div className="upload-choice-text">Add GIS Layer</div>
                      <Text fontSize="xs" color="fg.muted" textAlign="center" px={2} className="upload-choice-description">
                        Upload new GIS layers
                      </Text>
                    </div>

                    <div
                      className="upload-choice-chip"
                      onClick={() => handleChoiceSelect("replace")}
                    >
                      <div className="upload-choice-icon">
                        <LuRefreshCw />
                      </div>
                      <div className="upload-choice-text">Replace GIS Layer</div>
                      <Text fontSize="xs" color="fg.muted" textAlign="center" px={2} className="upload-choice-description">
                        Update existing layers
                      </Text>
                    </div>
                  </div>
                </Box>
              )}

              {/* Add Shapefile Screen */}
              {step === "add" && (
                <Box>
                  {/* New Category Name Input (Now always visible) */}
                  <Box mb={4}>
                    <Text fontWeight="600" mb={2}>New Category Name</Text>
                    <Box display="flex" alignItems="center" gap={2}>
                      <LuFolderInput />
                      <Input
                        placeholder="e.g., area_type, bus_stop"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                      />
                    </Box>
                  </Box>

                  {/* Dropzone */}
                  <div
                    className={`dropzone ${dragActive ? "drag-active" : ""}`}
                    onDragEnter={handleDragEnter}
                    onDragLeave={handleDragLeave}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <div className="dropzone-icon">
                      <LuUpload />
                    </div>
                    <Text fontWeight="600" mb={2}>
                      Drag and drop files here
                    </Text>
                    <Text fontSize="sm" color="fg.muted" mb={3}>
                      or click to browse
                    </Text>
                    <Text fontSize="xs" color="fg.muted">
                      Accepts GIS layer files (.shp, .geojson, .kml, .gpx, etc.)
                    </Text>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".shp,.shx,.dbf,.prj,.cpg,.sbn,.sbx,.geojson,.kml,.kmz,.gml,.gpx,.json"
                      style={{ display: "none" }}
                      onChange={handleFileSelect}
                    />
                  </div>

                  {/* File List */}
                  {uploadFiles.length > 0 && (
                    <div className="file-list">
                      <Text fontWeight="600" mb={2}>
                        Selected Files ({uploadFiles.length})
                      </Text>
                      {uploadFiles.map((file, index) => (
                        <div key={index} className="file-item">
                          <div className="file-info">
                            <div className="file-icon">
                              <LuFile />
                            </div>
                            <div className="file-details">
                              <div className="file-name">{file.name}</div>
                              <div className="file-size">{formatBytes(file.size)}</div>
                            </div>
                          </div>
                          <Button
                            size="xs"
                            variant="ghost"
                            colorPalette="red"
                            onClick={() => removeFile(index)}
                          >
                            <LuX />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Map Preview – always visible */}
                  <Box mt={4}>
                    <Text fontWeight="600" fontSize="sm" mb={2}>
                      Layer Preview
                      {!previewGeoJSON && !previewLoading && (
                        <Text as="span" fontWeight="400" color="gray.400" fontSize="xs" ml={2}>
                          (select a shapefile above to preview it)
                        </Text>
                      )}
                    </Text>
                    <Box h="280px" borderRadius="md" overflow="hidden" border="1px solid" borderColor="gray.200" position="relative">
                      {previewLoading && (
                        <Box position="absolute" inset="0" zIndex={500} bg="whiteAlpha.800"
                          display="flex" alignItems="center" justifyContent="center" flexDirection="column" gap={2}>
                          <Spinner size="lg" color="blue.500" />
                          <Text fontSize="sm" color="gray.600">Generating preview...</Text>
                        </Box>
                      )}
                      {previewError && !previewLoading && (
                        <Box position="absolute" bottom={2} left={2} right={2} zIndex={500}
                          bg="red.50" p={2} borderRadius="md" border="1px solid" borderColor="red.200">
                          <Text fontSize="xs" color="red.600">{previewError}</Text>
                        </Box>
                      )}
                      <MapContainer center={[1.3521, 103.8198]} zoom={11}
                        style={{ width: "100%", height: "100%" }} scrollWheelZoom>
                        <ThemeAwareTileLayer />
                        {previewGeoJSON && !previewLoading && (
                          <>
                            <FitBoundsGeoJSON data={previewGeoJSON} />
                            <GeoJSON data={previewGeoJSON}
                              style={{ color: "#2563eb", weight: 2, fillOpacity: 0.25 }} />
                          </>
                        )}
                      </MapContainer>
                    </Box>
                  </Box>

                  {uploading && (
                    <Box mt={4}>
                      <Text fontSize="sm" color="fg.muted" textAlign="center">
                        Uploading GIS layers...
                      </Text>
                    </Box>
                  )}
                </Box>
              )}

              {/* Replace Shapefile Screen */}
              {step === "replace" && (
                <Box>
                  <Text mb={4} color="fg.muted">
                    Upload updated GIS layer and select which one to replace
                  </Text>

                  {/* Dropzone for Replace */}
                  <div
                    className={`dropzone ${replaceDragActive ? "drag-active" : ""}`}
                    onDragEnter={handleReplaceDragEnter}
                    onDragLeave={handleReplaceDragLeave}
                    onDragOver={handleReplaceDragOver}
                    onDrop={handleReplaceDrop}
                    onClick={() => replaceFileInputRef.current?.click()}
                  >
                    <div className="dropzone-icon">
                      <LuUpload />
                    </div>
                    <Text fontWeight="600" mb={2}>
                      Drag and drop file here
                    </Text>
                    <Text fontSize="sm" color="fg.muted" mb={3}>
                      or click to browse
                    </Text>
                    <Text fontSize="xs" color="fg.muted">
                      Accepts GIS layer files (.shp, .geojson, .kml, .gpx, etc.)
                    </Text>
                    <Text fontSize="xs" color="orange.500" mt={1}>
                      For shapefiles: Upload ALL companion files (.shp, .shx, .dbf, .prj, etc.) together
                    </Text>
                    <input
                      ref={replaceFileInputRef}
                      type="file"
                      multiple
                      accept=".shp,.shx,.dbf,.prj,.cpg,.sbn,.sbx,.geojson,.kml,.kmz,.gml,.gpx,.json"
                      style={{ display: "none" }}
                      onChange={handleReplaceFileSelect}
                    />
                  </div>

                  {/* Selected Files Display */}
                  {replaceFiles.length > 0 && (
                    <div className="file-list">
                      <Text fontWeight="600" mb={2}>
                        Selected Files ({replaceFiles.length})
                      </Text>
                      {replaceFiles.map((file, index) => (
                        <div key={index} className="file-item">
                          <div className="file-info">
                            <div className="file-icon">
                              <LuFile />
                            </div>
                            <div className="file-details">
                              <div className="file-name">{file.name}</div>
                              <div className="file-size">{formatBytes(file.size)}</div>
                            </div>
                          </div>
                          <Button
                            size="xs"
                            variant="ghost"
                            colorPalette="red"
                            onClick={() => setReplaceFiles(prev => prev.filter((_, i) => i !== index))}
                          >
                            <LuX />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Select Folder (Searchable) */}
                  <Box mb={4} mt={6} position="relative" ref={categorySearchRef}>
                    <Text fontWeight="600" mb={2}>Select Folder</Text>
                    <Input
                      placeholder="Type to filter folders (e.g., bus, area)..."
                      value={replaceCategorySearch}
                      onChange={(e) => {
                        setReplaceCategorySearch(e.target.value);
                        setIsCategoryDropdownOpen(true);
                      }}
                      onFocus={() => setIsCategoryDropdownOpen(true)}
                    />
                    {isCategoryDropdownOpen && (
                      <Box
                        position="absolute"
                        top="100%"
                        left={0}
                        right={0}
                        zIndex={1000}
                        bg="white"
                        boxShadow="lg"
                        borderRadius="md"
                        mt={1}
                        maxH="200px"
                        overflowY="auto"
                        border="1px solid"
                        borderColor="gray.200"
                      >
                        {filteredCategories.length > 0 ? (
                          filteredCategories.map((cat) => (
                            <Box
                              key={cat.name}
                              px={3}
                              py={2}
                              cursor="pointer"
                              _hover={{ bg: "gray.100" }}
                              onClick={() => {
                                setSelectedReplaceCategory(cat.name);
                                setReplaceCategorySearch(cat.name);
                                setIsCategoryDropdownOpen(false);
                                setSelectedTargetShapefile("");
                                setTargetShapefileSearch("");
                              }}
                              display="flex"
                              alignItems="center"
                              justifyContent="space-between"
                            >
                              <Text fontSize="sm">{cat.name}</Text>
                              {selectedReplaceCategory === cat.name && (
                                <Box color="blue.500"><LuCheck /></Box>
                              )}
                            </Box>
                          ))
                        ) : (
                          <Box px={3} py={2} color="fg.muted" fontSize="sm">
                            No folders match your search
                          </Box>
                        )}
                      </Box>
                    )}
                  </Box>

                  {/* Select Target Shapefile (Searchable) - only show if category is selected */}
                  {selectedReplaceCategory && (
                    <Box mb={4} position="relative" ref={targetSearchRef}>
                      <Text fontWeight="600" mb={2}>Select GIS Layer to Replace</Text>
                      <Input
                        placeholder="Type to filter layers..."
                        value={targetShapefileSearch}
                        onChange={(e) => {
                          setTargetShapefileSearch(e.target.value);
                          setIsTargetDropdownOpen(true);
                        }}
                        onFocus={() => setIsTargetDropdownOpen(true)}
                      />
                      {isTargetDropdownOpen && (
                        <Box
                          position="absolute"
                          top="100%"
                          left={0}
                          right={0}
                          zIndex={1000}
                          bg="white"
                          boxShadow="lg"
                          borderRadius="md"
                          mt={1}
                          maxH="200px"
                          overflowY="auto"
                          border="1px solid"
                          borderColor="gray.200"
                        >
                          {filteredTargetShapefiles.length > 0 ? (
                            filteredTargetShapefiles.map((shp) => (
                              <Box
                                key={shp.path}
                                px={3}
                                py={2}
                                cursor="pointer"
                                _hover={{ bg: "gray.100" }}
                                onClick={() => {
                                  setSelectedTargetShapefile(shp.path);
                                  setTargetShapefileSearch(shp.name);
                                  setIsTargetDropdownOpen(false);
                                }}
                                display="flex"
                                alignItems="center"
                                justifyContent="space-between"
                              >
                                <Text fontSize="sm">{shp.name}</Text>
                                {selectedTargetShapefile === shp.path && (
                                  <Box color="blue.500"><LuCheck /></Box>
                                )}
                              </Box>
                            ))
                          ) : (
                            <Box px={3} py={2} color="fg.muted" fontSize="sm">
                              No layers match your search
                            </Box>
                          )}
                        </Box>
                      )}
                    </Box>
                  )}

                  {replacing && (
                    <Box mt={4}>
                      <Text fontSize="sm" color="fg.muted" textAlign="center">
                        Replacing GIS layer...
                      </Text>
                    </Box>
                  )}
                </Box>
              )}

              {/* Success Screen */}
              {step === "success" && (
                <Box textAlign="center" py={6}>
                  <Box fontSize="4xl" color="green.500" mb={4}>
                    <LuCheck />
                  </Box>
                  <Text fontSize="xl" fontWeight="600" mb={2}>
                    Operation Completed!
                  </Text>
                  <Text color="fg.muted" mb={6}>
                    What would you like to do next?
                  </Text>
                  <Box display="flex" flexDirection="column" gap={2}>
                    <Button onClick={() => setStep("add")} colorPalette="blue" variant="outline">
                      Add More GIS Layers
                    </Button>
                    <Button onClick={() => setStep("replace")} colorPalette="blue" variant="outline">
                      Replace More GIS Layers
                    </Button>
                    <Button onClick={handleClose} colorPalette="gray" variant="solid">
                      Done
                    </Button>
                  </Box>
                </Box>
              )}
            </Dialog.Body>

            {step !== "success" && (
              <Dialog.Footer>
                <Box display="flex" gap={3} width="100%" justifyContent="flex-end">
                  {step !== "choice" && (
                    <Button variant="outline" onClick={handleBackToChoice}>
                      Back
                    </Button>
                  )}
                  {step === "choice" && (
                    <Button variant="outline" onClick={handleClose}>
                      Cancel
                    </Button>
                  )}
                  {step === "add" && (
                    <Button
                      colorPalette="blue"
                      onClick={handleAddUpload}
                      disabled={uploadFiles.length === 0 || uploading}
                    >
                      Upload {uploadFiles.length > 0 && `(${uploadFiles.length})`}
                    </Button>
                  )}
                  {step === "replace" && (
                    <Button
                      colorPalette="blue"
                      onClick={handleReplaceSubmit}
                      disabled={replaceFiles.length === 0 || !selectedTargetShapefile || replacing}
                    >
                      Replace {replaceFiles.length > 0 && `(${replaceFiles.length} file${replaceFiles.length > 1 ? 's' : ''})`}
                    </Button>
                  )}
                </Box>
              </Dialog.Footer>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
