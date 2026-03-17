import { useState, useRef } from "react";
import { Box, Button, Text, Input } from "@chakra-ui/react";
import { LuUpload, LuFile, LuX, LuFolderInput } from "react-icons/lu";
import { toaster } from "../../../components/ui/toaster";
import * as api from "../../../api";

interface AddShapefileViewProps {
  onComplete: () => void;
  onBack: () => void;
}

export default function AddShapefileView({ onComplete, onBack }: AddShapefileViewProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [category, setCategory] = useState("uploaded");
  const [uploading, setUploading] = useState(false);
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
    // Filter for ZIP files or shapefile components
    const validFiles = newFiles.filter(
      (f) => f.name.endsWith(".zip") ||
            f.name.endsWith(".shp") ||
            f.name.endsWith(".shx") ||
            f.name.endsWith(".dbf") ||
            f.name.endsWith(".prj") ||
            f.name.endsWith(".cpg")
    );

    if (validFiles.length === 0) {
      toaster.create({
        description: "Please upload .zip files or shapefile components (.shp, .shx, .dbf, etc.)",
        type: "warning",
      });
      return;
    }

    setFiles((prev) => [...prev, ...validFiles]);
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (files.length === 0) {
      toaster.create({
        description: "Please select files to upload",
        type: "warning",
      });
      return;
    }

    try {
      setUploading(true);
      const result = await api.uploadShapefiles(files, category);

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

      onComplete();
    } catch (error) {
      toaster.create({
        description: `Upload failed: ${error}`,
        type: "error",
      });
    } finally {
      setUploading(false);
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
    <Box>
      {/* Category Input */}
      <Box mb={4}>
        <Text fontWeight="600" mb={2}>Category</Text>
        <Box display="flex" alignItems="center" gap={2}>
          <LuFolderInput />
          <Input
            placeholder="e.g., area_type, bus_stop, etc."
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
        </Box>
        <Text fontSize="xs" color="fg.muted" mt={1}>
          Shapefiles will be organized in this subdirectory
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
          Drag and drop files here
        </Text>
        <Text fontSize="sm" color="fg.muted" mb={3}>
          or click to browse
        </Text>
        <Text fontSize="xs" color="fg.muted">
          Accepts .zip files containing shapefiles
        </Text>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".zip,.shp,.shx,.dbf,.prj,.cpg"
          style={{ display: "none" }}
          onChange={handleFileSelect}
        />
      </div>

      {/* File List */}
      {files.length > 0 && (
        <div className="file-list">
          <Text fontWeight="600" mb={2}>
            Selected Files ({files.length})
          </Text>
          {files.map((file, index) => (
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

      {/* Progress */}
      {uploading && (
        <Box mt={4}>
          <Text fontSize="sm" color="fg.muted" mt={2} textAlign="center">
            Uploading shapefiles...
          </Text>
        </Box>
      )}

      {/* Actions */}
      <Box mt={6} display="flex" gap={3} justifyContent="flex-end">
        <Button variant="outline" onClick={onBack} disabled={uploading}>
          Back
        </Button>
        <Button
          colorPalette="blue"
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
        >
          Upload {files.length > 0 && `(${files.length})`}
        </Button>
      </Box>
    </Box>
  );
}
