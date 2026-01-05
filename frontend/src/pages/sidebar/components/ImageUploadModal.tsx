import { useState, useEffect, useRef } from "react";
import { Box, Button, Text, Dialog, Portal, Input } from "@chakra-ui/react";
import { LuUpload, LuFile, LuX, LuCheck, LuFolder } from "react-icons/lu";
import { toaster } from "../../../components/ui/toaster";
import * as api from "../../../api";
import "../../ShapefileManagement/shapefileManagement.css";

interface ImageUploadModalProps {
  open: boolean;
  onClose: () => void;
}

type WorkflowStep = "upload" | "success";

const FILES_PER_PAGE = 5;

export default function ImageUploadModal({ open, onClose }: ImageUploadModalProps) {
  const [step, setStep] = useState<WorkflowStep>("upload");
  const [folderName, setFolderName] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [displayedCount, setDisplayedCount] = useState(FILES_PER_PAGE);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  function resetState() {
    setStep("upload");
    setFolderName("");
    setUploadedFiles([]);
    setDragActive(false);
    setDisplayedCount(FILES_PER_PAGE);
  }

  function handleClose() {
    resetState();
    onClose();
  }

  // Drag and drop handlers
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

    const droppedItems = Array.from(e.dataTransfer.items);
    const droppedFiles: File[] = [];

    // Process dropped items recursively to handle folders
    const processEntries = async (entries: FileSystemEntry[]) => {
      for (const entry of entries) {
        if (entry.isFile) {
          const file = await new Promise<File>((resolve) => {
            (entry as FileSystemFileEntry).file(resolve);
          });
          droppedFiles.push(file);
        } else if (entry.isDirectory) {
          // Recursively process directory contents
          const dirReader = (entry as FileSystemDirectoryEntry).createReader();
          const subEntries = await new Promise<FileSystemEntry[]>((resolve) => {
            dirReader.readEntries(resolve);
          });
          await processEntries(subEntries);
        }
      }
    };

    // Convert DataTransferItem to FileSystemEntry
    const entries = droppedItems
      .map((item) => item.webkitGetAsEntry())
      .filter((entry) => entry !== null) as FileSystemEntry[];

    if (entries.length > 0) {
      processEntries(entries).then(() => {
        addFiles(droppedFiles);
      });
    } else {
      // Fallback for browsers that don't support webkitGetAsEntry
      droppedItems.forEach((item) => {
        if (item.kind === "file") {
          const file = item.getAsFile();
          if (file) {
            droppedFiles.push(file);
          }
        }
      });
      addFiles(droppedFiles);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      addFiles(selectedFiles);
    }
  }

  function addFiles(newFiles: File[]) {
    // Accept common image formats
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.tiff', '.tif'];

    const validFiles = newFiles.filter((f) => {
      const fileName = f.name.toLowerCase();
      return imageExtensions.some(ext => fileName.endsWith(ext));
    });

    if (validFiles.length === 0) {
      toaster.create({
        description: "Please upload image files (.jpg, .png, .gif, etc.)",
        type: "warning",
      });
      return;
    }

    setUploadedFiles((prev) => [...prev, ...validFiles]);
  }

  function removeFile(index: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleUpload() {
    if (!folderName.trim()) {
      toaster.create({
        description: "Please enter a folder name",
        type: "warning",
      });
      return;
    }

    if (uploadedFiles.length === 0) {
      toaster.create({
        description: "Please select image files to upload",
        type: "warning",
      });
      return;
    }

    try {
      setUploading(true);
      const result = await api.uploadImagesToSourceFolder(folderName, uploadedFiles);

      if (result.errors && result.errors.length > 0) {
        toaster.create({
          description: `Uploaded ${result.count} image(s) with ${result.errors.length} error(s)`,
          type: "warning",
        });
      } else {
        toaster.create({
          description: `Successfully uploaded ${result.count} image(s) to folder "${folderName}"`,
          type: "success",
        });
      }

      // Move to success
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
                {step === "upload" && "Upload Images"}
                {step === "success" && "Success!"}
              </Dialog.Title>
              <Dialog.CloseTrigger />
            </Dialog.Header>

            <Dialog.Body>
              {/* Upload Screen */}
              {step === "upload" && (
                <Box>
                  <Text mb={4} color="fg.muted">
                    Drag and drop a folder of images here, or click to select files. These will be added to a source folder you can use when creating a project.
                  </Text>

                  {/* Folder Name Input */}
                  <Box mb={4}>
                    <Text fontWeight="600" mb={2}>Folder Name</Text>
                    <Box display="flex" alignItems="center" gap={2}>
                      <LuFolder />
                      <Input
                        placeholder="e.g., FERNVALE ROAD, LORONG 8"
                        value={folderName}
                        onChange={(e) => setFolderName(e.target.value)}
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
                      Drag and drop folder here
                    </Text>
                    <Text fontSize="sm" color="fg.muted" mb={3}>
                      or click to browse
                    </Text>
                    <Text fontSize="xs" color="fg.muted">
                      Accepts image files (.jpg, .png, .gif, .webp, etc.)
                    </Text>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      accept=".jpg,.jpeg,.png,.gif,.bmp,.webp,.tiff,.tif"
                      style={{ display: "none" }}
                      onChange={handleFileSelect}
                      {...({ webkitdirectory: "true", mozdirectory: "true" } as any)}
                    />
                  </div>

                  {/* File List */}
                  {uploadedFiles.length > 0 && (
                    <div className="file-list">
                      <Text fontWeight="600" mb={2}>
                        Selected Files ({uploadedFiles.length})
                      </Text>
                      {uploadedFiles.slice(0, displayedCount).map((file, index) => (
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
                      <Box mt={3} display="flex" gap={2} justifyContent="center">
                        {displayedCount < uploadedFiles.length && (
                          <Button
                            size="sm"
                            variant="outline"
                            colorPalette="gray"
                            onClick={() => setDisplayedCount(displayedCount + FILES_PER_PAGE)}
                          >
                            View More ({uploadedFiles.length - displayedCount} remaining)
                          </Button>
                        )}
                        {displayedCount > FILES_PER_PAGE && (
                          <Button
                            size="sm"
                            variant="outline"
                            colorPalette="gray"
                            onClick={() => setDisplayedCount(FILES_PER_PAGE)}
                          >
                            View Less
                          </Button>
                        )}
                      </Box>
                    </div>
                  )}

                  {uploading && (
                    <Box mt={4}>
                      <Text fontSize="sm" color="fg.muted" textAlign="center">
                        Uploading images...
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
                    Upload Completed!
                  </Text>
                  <Text color="fg.muted" mb={6}>
                    Images have been successfully uploaded to the "{folderName}" folder. You can now select this folder when creating a new project.
                  </Text>
                </Box>
              )}
            </Dialog.Body>

            {step !== "success" && (
              <Dialog.Footer>
                <Box display="flex" gap={3} width="100%" justifyContent="flex-end">
                  <Button variant="outline" onClick={handleClose}>
                    Cancel
                  </Button>
                  <Button
                    colorPalette="blue"
                    onClick={handleUpload}
                    disabled={uploadedFiles.length === 0 || uploading || !folderName.trim()}
                  >
                    Upload {uploadedFiles.length > 0 && `(${uploadedFiles.length})`}
                  </Button>
                </Box>
              </Dialog.Footer>
            )}

            {step === "success" && (
              <Dialog.Footer>
                <Box display="flex" gap={3} width="100%" justifyContent="flex-end">
                  <Button colorPalette="blue" onClick={handleClose}>
                    Done
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
