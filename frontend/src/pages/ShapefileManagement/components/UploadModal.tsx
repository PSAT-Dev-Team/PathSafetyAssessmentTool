import { Box, Button, Text, Dialog, Portal } from "@chakra-ui/react";
import { LuPlus, LuRefreshCw } from "react-icons/lu";
import AddShapefileView from "./AddShapefileView";
import ReplaceShapefileView from "./ReplaceShapefileView";
import type { ShapefileInfo } from "../../../api";

interface UploadModalProps {
  open: boolean;
  onClose: () => void;
  selectedMode: "add" | "replace" | null;
  onModeSelect: (mode: "add" | "replace") => void;
  onUploadComplete: () => void;
  existingShapefiles: ShapefileInfo[];
}

export default function UploadModal({
  open,
  onClose,
  selectedMode,
  onModeSelect,
  onUploadComplete,
  existingShapefiles,
}: UploadModalProps) {
  function handleBack() {
    onModeSelect(null as any);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onClose()} size="xl">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>
                {!selectedMode && "Update Shapefile"}
                {selectedMode === "add" && "Add New Shapefile"}
                {selectedMode === "replace" && "Replace Existing Shapefile"}
              </Dialog.Title>
              <Dialog.CloseTrigger />
            </Dialog.Header>

            <Dialog.Body>
              {/* Choice Chips View */}
              {!selectedMode && (
                <Box>
                  <Text mb={4} color="fg.muted">
                    Choose how you want to update your shapefiles:
                  </Text>
                  <div className="upload-choice-container">
                    <div
                      className="upload-choice-chip"
                      onClick={() => onModeSelect("add")}
                    >
                      <div className="upload-choice-icon">
                        <LuPlus />
                      </div>
                      <div className="upload-choice-text">Add Shapefile</div>
                      <Text fontSize="xs" color="fg.muted" textAlign="center" px={2}>
                        Upload new shapefiles
                      </Text>
                    </div>

                    <div
                      className="upload-choice-chip"
                      onClick={() => onModeSelect("replace")}
                    >
                      <div className="upload-choice-icon">
                        <LuRefreshCw />
                      </div>
                      <div className="upload-choice-text">Replace Shapefile</div>
                      <Text fontSize="xs" color="fg.muted" textAlign="center" px={2}>
                        Update existing files
                      </Text>
                    </div>
                  </div>
                </Box>
              )}

              {/* Add Shapefile View */}
              {selectedMode === "add" && (
                <AddShapefileView
                  onComplete={onUploadComplete}
                  onBack={handleBack}
                />
              )}

              {/* Replace Shapefile View */}
              {selectedMode === "replace" && (
                <ReplaceShapefileView
                  existingShapefiles={existingShapefiles}
                  onComplete={onUploadComplete}
                  onBack={handleBack}
                />
              )}
            </Dialog.Body>

            {!selectedMode && (
              <Dialog.Footer>
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              </Dialog.Footer>
            )}
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
