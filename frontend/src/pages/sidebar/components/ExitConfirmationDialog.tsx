import { Box, Button, Dialog, Portal, Text } from "@chakra-ui/react";
import { LuLogOut } from "react-icons/lu";

interface ExitConfirmationDialogProps {
  open: boolean;
  onSaveAndExit: () => void;
  onDiscardAndExit: () => void;
  onCancel: () => void;
  isSaving?: boolean;
}

export default function ExitConfirmationDialog({
  open,
  onSaveAndExit,
  onDiscardAndExit,
  onCancel,
  isSaving = false,
}: ExitConfirmationDialogProps) {
  return (
    <Dialog.Root open={open} onOpenChange={(e) => !e.open && onCancel()} size="md">
      <Portal>
        <Dialog.Backdrop />
        <Dialog.Positioner>
          <Dialog.Content>
            <Dialog.Header>
              <Dialog.Title>Exit Coding Page</Dialog.Title>
              <Dialog.CloseTrigger />
            </Dialog.Header>

            <Dialog.Body>
              <Box display="flex" gap={4}>
                <Box fontSize="2xl" color="orange.500" flexShrink={0}>
                  <LuLogOut />
                </Box>
                <Box>
                  <Text fontWeight="600" mb={2}>
                    Do you want to save your changes before exiting?
                  </Text>
                  <Text color="fg.muted" fontSize="sm">
                    If you exit without saving, any unsaved changes to this project will be lost.
                  </Text>
                </Box>
              </Box>
            </Dialog.Body>

            <Dialog.Footer>
              <Box display="flex" gap={3} width="100%" justifyContent="flex-end">
                <Button variant="outline" onClick={onCancel} disabled={isSaving}>
                  Cancel
                </Button>
                <Button
                  colorPalette="red"
                  variant="outline"
                  onClick={onDiscardAndExit}
                  disabled={isSaving}
                >
                  Discard Changes
                </Button>
                <Button
                  colorPalette="green"
                  onClick={onSaveAndExit}
                  loading={isSaving}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save and Exit"}
                </Button>
              </Box>
            </Dialog.Footer>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
