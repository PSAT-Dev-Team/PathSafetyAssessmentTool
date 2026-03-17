import { Box, Button, Dialog, Portal, Text } from "@chakra-ui/react";
import { LuTrash } from "react-icons/lu";

interface ResetConfirmationDialogProps {
    open: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    isResetting?: boolean;
}

export default function ResetConfirmationDialog({
    open,
    onConfirm,
    onCancel,
    isResetting = false,
}: ResetConfirmationDialogProps) {
    return (
        <Dialog.Root open={open} onOpenChange={(e) => !e.open && onCancel()} size="md">
            <Portal>
                <Dialog.Backdrop />
                <Dialog.Positioner>
                    <Dialog.Content>
                        <Dialog.Header>
                            <Dialog.Title>Reset All Treatments</Dialog.Title>
                            <Dialog.CloseTrigger />
                        </Dialog.Header>

                        <Dialog.Body>
                            <Box display="flex" gap={4}>
                                <Box fontSize="2xl" color="red.500" flexShrink={0}>
                                    <LuTrash />
                                </Box>
                                <Box>
                                    <Text fontWeight="600" mb={2}>
                                        Are you sure you want to reset all applied treatments?
                                    </Text>
                                    <Text color="fg.muted" fontSize="sm">
                                        This action returns all segments to their original state and cannot be undone.
                                    </Text>
                                </Box>
                            </Box>
                        </Dialog.Body>

                        <Dialog.Footer>
                            <Box display="flex" gap={3} width="100%" justifyContent="flex-end">
                                <Button variant="outline" onClick={onCancel} disabled={isResetting}>
                                    Cancel
                                </Button>
                                <Button
                                    colorPalette="red"
                                    onClick={onConfirm}
                                    loading={isResetting}
                                    disabled={isResetting}
                                >
                                    {isResetting ? "Resetting..." : "Yes, Reset All"}
                                </Button>
                            </Box>
                        </Dialog.Footer>
                    </Dialog.Content>
                </Dialog.Positioner>
            </Portal>
        </Dialog.Root>
    );
}
