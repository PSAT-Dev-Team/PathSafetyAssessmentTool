import { useState, useRef } from "react";
import { Box, Button, Text, createListCollection, SelectRoot, SelectTrigger, SelectValueText, SelectContent, SelectItem } from "@chakra-ui/react";
import { LuUpload, LuFile, LuX, LuArrowRight } from "react-icons/lu";
import { toaster } from "../../../components/ui/toaster";
import * as api from "../../../api";
import type { ShapefileInfo } from "../../../api";

interface ReplaceShapefileViewProps {
  existingShapefiles: ShapefileInfo[];
  onComplete: () => void;
  onBack: () => void;
}

interface UploadedFile {
  file: File;
  targetPath: string | null;
}

export default function ReplaceShapefileView({
  existingShapefiles,
  onComplete,
  onBack,
}: ReplaceShapefileViewProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    // Filter for ZIP files only (easier to handle complete shapefiles)
    const zipFiles = newFiles.filter((f) => f.name.endsWith(".zip"));

    if (zipFiles.length === 0) {
      toaster.create({
        description: "Please upload .zip files containing shapefiles",
        type: "warning",
      });
      return;
    }

    const newUploaded = zipFiles.map((file) => ({
      file,
      targetPath: null,
    }));

    setUploadedFiles((prev) => [...prev, ...newUploaded]);
  }

  function removeFile(index: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function updateTargetPath(index: number, path: string) {
    setUploadedFiles((prev) =>
      prev.map((item, i) => (i === index ? { ...item, targetPath: path } : item))
    );
  }

  async function handleReplace() {
    // First, upload files to temp location
    const filesWithoutTarget = uploadedFiles.filter((f) => !f.targetPath);
    if (filesWithoutTarget.length > 0) {
      toaster.create({
        description: "Please select a target shapefile for all uploaded files",
        type: "warning",
      });
      return;
    }

    try {
      setUploading(true);

      // Step 1: Upload files to temporary category
      const uploadResult = await api.uploadShapefiles(
        uploadedFiles.map((uf) => uf.file),
        "temp_replace"
      );

      if (uploadResult.errors.length > 0) {
        toaster.create({
          description: `Upload failed: ${uploadResult.errors.join(", ")}`,
          type: "error",
        });
        return;
      }

      setUploading(false);
      setReplacing(true);

      // Step 2: Perform replacements
      const replacements = uploadedFiles.map((uf, idx) => {
        // Find the uploaded file path from result
        const uploaded = uploadResult.uploaded[idx];
        return {
          uploaded_path: `temp_replace/${uploaded.name}`,
          target_path: uf.targetPath!,
        };
      });

      const replaceResult = await api.replaceShapefiles(replacements);

      if (replaceResult.errors.length > 0) {
        toaster.create({
          description: `Replaced ${replaceResult.count} with ${replaceResult.errors.length} error(s)`,
          type: "warning",
        });
      } else {
        toaster.create({
          description: `Successfully replaced ${replaceResult.count} shapefile(s)`,
          type: "success",
        });
      }

      onComplete();
    } catch (error) {
      toaster.create({
        description: `Replace failed: ${error}`,
        type: "error",
      });
    } finally {
      setUploading(false);
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

  // Group existing shapefiles by category for easier selection
  const shapefilesByCategory = existingShapefiles.reduce((acc, shp) => {
    if (!acc[shp.category]) {
      acc[shp.category] = [];
    }
    acc[shp.category].push(shp);
    return acc;
  }, {} as Record<string, ShapefileInfo[]>);

  const isProcessing = uploading || replacing;

  return (
    <Box>
      {/* Step indicator */}
      <Box mb={4}>
        <Text fontSize="sm" color="fg.muted">
          Step 1: Upload new shapefiles → Step 2: Select which files to replace
        </Text>
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
          Drag and drop ZIP files here
        </Text>
        <Text fontSize="sm" color="fg.muted" mb={3}>
          or click to browse
        </Text>
        <Text fontSize="xs" color="fg.muted">
          Upload ZIP files containing complete shapefiles
        </Text>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".zip"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
      </div>

      {/* Replacement Mapping Interface */}
      {uploadedFiles.length > 0 && (
        <div className="replace-interface">
          <Text fontWeight="600" mb={3}>
            Map Uploaded Files to Replace ({uploadedFiles.length})
          </Text>

          {uploadedFiles.map((uploaded, index) => {
            // Create collection for select
            const items = existingShapefiles.map((shp) => ({
              label: `${shp.category} / ${shp.name}`,
              value: shp.path,
            }));
            const collection = createListCollection({ items });

            return (
              <div key={index} className="replace-mapping">
                {/* Uploaded file */}
                <div className="replace-mapping-uploaded">
                  <div className="file-info">
                    <div className="file-icon">
                      <LuFile />
                    </div>
                    <div className="file-details">
                      <div className="file-name">{uploaded.file.name}</div>
                      <div className="file-size">{formatBytes(uploaded.file.size)}</div>
                    </div>
                  </div>
                </div>

                {/* Arrow */}
                <div className="replace-mapping-arrow">
                  <LuArrowRight />
                </div>

                {/* Target selection */}
                <div className="replace-mapping-select">
                  <SelectRoot
                    collection={collection}
                    value={uploaded.targetPath ? [uploaded.targetPath] : []}
                    onValueChange={(details) => updateTargetPath(index, details.value[0])}
                  >
                    <SelectTrigger>
                      <SelectValueText placeholder="Select shapefile to replace" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(shapefilesByCategory).map(([category, shps]) => (
                        <Box key={category}>
                          <Text
                            fontSize="xs"
                            fontWeight="bold"
                            px={3}
                            py={1}
                            color="fg.muted"
                            bg="bg.subtle"
                          >
                            {category}
                          </Text>
                          {shps.map((shp) => (
                            <SelectItem key={shp.path} item={shp.path}>
                              {shp.name}
                            </SelectItem>
                          ))}
                        </Box>
                      ))}
                    </SelectContent>
                  </SelectRoot>
                </div>

                {/* Remove button */}
                <Button
                  size="xs"
                  variant="ghost"
                  colorPalette="red"
                  onClick={() => removeFile(index)}
                  disabled={isProcessing}
                >
                  <LuX />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {/* Progress */}
      {isProcessing && (
        <Box mt={4}>
          <Text fontSize="sm" color="fg.muted" mt={2} textAlign="center">
            {uploading && "Uploading files..."}
            {replacing && "Replacing shapefiles..."}
          </Text>
        </Box>
      )}

      {/* Actions */}
      <Box mt={6} display="flex" gap={3} justifyContent="flex-end">
        <Button variant="outline" onClick={onBack} disabled={isProcessing}>
          Back
        </Button>
        <Button
          colorPalette="blue"
          onClick={handleReplace}
          disabled={uploadedFiles.length === 0 || isProcessing}
        >
          Replace {uploadedFiles.length > 0 && `(${uploadedFiles.length})`}
        </Button>
      </Box>
    </Box>
  );
}
