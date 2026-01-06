import { useState, useEffect, useRef } from "react";
import { Box, Button, Text, Dialog, Portal, Input, SelectRoot, SelectTrigger, SelectValueText, SelectContent, SelectItem, createListCollection } from "@chakra-ui/react";
import { LuPlus, LuRefreshCw, LuUpload, LuFile, LuX, LuFolderInput, LuCheck } from "react-icons/lu";
import { toaster } from "../../../components/ui/toaster";
import * as api from "../../../api";
import "../../ShapefileManagement/shapefileManagement.css";

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
      console.error("Failed to load categories:", error);
    }
  }

  async function loadAllShapefiles() {
    try {
      const data = await api.listShapefiles();
      setAllShapefiles(data);
    } catch (error) {
      console.error("Failed to load shapefiles:", error);
    }
  }

  function resetState() {
    setStep("choice");
    setSelectedCategory("");
    setNewCategoryName("");
    setUploadFiles([]);
    setReplaceFiles([]);
    setSelectedReplaceCategory("");
    setSelectedTargetShapefile("");
    setDragActive(false);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  function handleChoiceSelect(choice: "add" | "replace") {
    setStep(choice);
  }

  function handleBackToChoice() {
    setStep("choice");
    // Clear state
    setUploadFiles([]);
    setReplaceFiles([]);
    setSelectedReplaceCategory("");
    setSelectedTargetShapefile("");
  }

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

    setUploadFiles((prev) => [...prev, ...validFiles]);
  }

  function removeFile(index: number) {
    setUploadFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleAddUpload() {
    const categoryToUse = selectedCategory === "__new__" ? newCategoryName : selectedCategory;

    if (!categoryToUse) {
      toaster.create({
        description: "Please select or enter a category",
        type: "warning",
      });
      return;
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
      console.log('[Replace] Step 1: Uploading files to temp_replace:', replaceFiles.map(f => f.name));
      const uploadResult = await api.uploadShapefiles(replaceFiles, "temp_replace");
      console.log('[Replace] Upload result:', uploadResult);

      if (uploadResult.errors.length > 0 || uploadResult.count === 0) {
        toaster.create({
          description: `Upload failed: ${uploadResult.errors.join(", ")}`,
          type: "error",
        });
        return;
      }

      // Step 2: Validate compatibility before replacement
      const uploadedPath = uploadResult.uploaded[0].path;
      console.log('[Replace] Step 2: Validating compatibility');

      // Extract layer name from target path if possible (e.g., "area_type/file.shp" -> "area_type")
      const layerName = selectedTargetShapefile.split('/')[0];

      const validationResult = await api.validateShapefileReplacement(
        uploadedPath,
        selectedTargetShapefile,
        layerName
      );

      console.log('[Replace] Validation result:', validationResult);

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
          console.log('[Replace] User cancelled due to warnings');
          return;
        }
      }

      // Step 3: Replace the target (now safe)
      console.log('[Replace] Step 3: Replacing', selectedTargetShapefile, 'with', uploadedPath);

      const replaceResult = await api.replaceShapefiles([
        {
          uploaded_path: uploadedPath,
          target_path: selectedTargetShapefile,
        },
      ]);
      console.log('[Replace] Replace result:', replaceResult);

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

  // Create collection for category select
  const categoryItems = [
    ...categories.map((cat) => ({
      label: cat.name,
      value: cat.name,
    })),
    { label: "➕ New Category", value: "__new__" },
  ];
  const categoryCollection = createListCollection({ items: categoryItems });

  // Create collection for shapefile select (grouped by category)
  // const shapefilesByCategory = allShapefiles.reduce((acc, shp) => {
  //   if (!acc[shp.category]) {
  //     acc[shp.category] = [];
  //   }
  //   acc[shp.category].push(shp);
  //   return acc;
  // }, {} as Record<string, api.ShapefileInfo[]>);

  // const shapefileItems = allShapefiles.map((shp) => ({
  //   label: `${shp.category} / ${shp.name}`,
  //   value: shp.path,
  // }));
  // const shapefileCollection = createListCollection({ items: shapefileItems });

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
                  {/* Category Selection */}
                  <Box mb={4}>
                    <Text fontWeight="600" mb={2}>Select Folder</Text>
                    <SelectRoot
                      collection={categoryCollection}
                      value={selectedCategory ? [selectedCategory] : []}
                      onValueChange={(details) => setSelectedCategory(details.value[0])}
                    >
                      <SelectTrigger>
                        <SelectValueText placeholder="Choose a category folder" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryItems.map((item) => (
                          <SelectItem key={item.value} item={item.value}>
                            {item.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SelectRoot>
                  </Box>

                  {/* New Category Name Input */}
                  {selectedCategory === "__new__" && (
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
                  )}

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

                  {/* Select Folder */}
                  <Box mb={4} mt={6}>
                    <Text fontWeight="600" mb={2}>Select Folder</Text>
                    <SelectRoot
                      collection={categoryCollection}
                      value={selectedReplaceCategory ? [selectedReplaceCategory] : []}
                      onValueChange={(details) => {
                        setSelectedReplaceCategory(details.value[0]);
                        setSelectedTargetShapefile(""); // Clear file selection when category changes
                      }}
                    >
                      <SelectTrigger>
                        <SelectValueText placeholder="Choose a category folder" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map((cat) => (
                          <SelectItem key={cat.name} item={cat.name}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </SelectRoot>
                  </Box>

                  {/* Select Target Shapefile - only show if category is selected */}
                  {selectedReplaceCategory && (
                    <Box mb={4}>
                      <Text fontWeight="600" mb={2}>Select GIS Layer to Replace</Text>
                      <SelectRoot
                        collection={createListCollection({
                          items: allShapefiles
                            .filter((shp) => {
                              // Filter by category
                              if (shp.category !== selectedReplaceCategory) return false;

                              // Only include actual GIS layer files (not shapefile companion files)
                              const gisLayerExtensions = ['.shp', '.geojson', '.kml', '.kmz', '.gml', '.gpx', '.json'];
                              const fileName = shp.name.toLowerCase();
                              return gisLayerExtensions.some(ext => fileName.endsWith(ext));
                            })
                            .map((shp) => ({
                              label: shp.name,
                              value: shp.path,
                            })),
                        })}
                        value={selectedTargetShapefile ? [selectedTargetShapefile] : []}
                        onValueChange={(details) => setSelectedTargetShapefile(details.value[0])}
                      >
                        <SelectTrigger>
                          <SelectValueText placeholder="Choose a GIS layer to replace" />
                        </SelectTrigger>
                        <SelectContent>
                          {allShapefiles
                            .filter((shp) => {
                              // Filter by category
                              if (shp.category !== selectedReplaceCategory) return false;

                              // Only include actual GIS layer files (not shapefile companion files)
                              const gisLayerExtensions = ['.shp', '.geojson', '.kml', '.kmz', '.gml', '.gpx', '.json'];
                              const fileName = shp.name.toLowerCase();
                              return gisLayerExtensions.some(ext => fileName.endsWith(ext));
                            })
                            .map((shp) => (
                              <SelectItem key={shp.path} item={shp.path}>
                                {shp.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </SelectRoot>
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
                      disabled={uploadFiles.length === 0 || uploading || !selectedCategory || (selectedCategory === "__new__" && !newCategoryName)}
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
