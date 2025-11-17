import { useState, useEffect, type KeyboardEvent } from "react";
import {
  Box,
  Button,
  Dialog,
  Portal,
  Input,
  Text,
  CloseButton,
} from "@chakra-ui/react";
import { toaster } from "../../../components/ui/toaster";
import * as api from "../../../api";
import "./editProjectModal.css";

interface EditProjectModalProps {
  open: boolean;
  onClose: () => void;
  projectName: string;
  projectTags: string[];
  onSuccess: (newName: string, newTags: string[]) => void;
}

// Generate a consistent, bright, varied color for each unique tag (same as home.tsx)
function getTagColor(tag: string): string {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hash2 = Math.abs(hash >> 16);
  const hash3 = Math.abs(hash << 3);

  let hue = Math.abs(hash % 360);
  if (hue >= 40 && hue <= 60) hue = (hue + 30) % 360;
  if (hue >= 160 && hue <= 180) hue = (hue + 30) % 360;

  const saturation = 75 + (hash2 % 21);
  const lightness = 65 + (hash3 % 16);

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

export default function EditProjectModal({
  open,
  onClose,
  projectName,
  projectTags,
  onSuccess,
}: EditProjectModalProps) {
  const [newName, setNewName] = useState(projectName);
  const [tags, setTags] = useState<string[]>(projectTags);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setNewName(projectName);
      setTags(projectTags);
      setTagInput("");
    }
  }, [open, projectName, projectTags]);

  function handleClose() {
    setNewName(projectName);
    setTags(projectTags);
    setTagInput("");
    onClose();
  }

  function handleTagInputKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "," || e.key === "Enter") {
      e.preventDefault();
      const trimmedTag = tagInput.trim();
      if (trimmedTag && !tags.includes(trimmedTag)) {
        setTags([...tags, trimmedTag]);
      }
      setTagInput("");
    } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
      // Remove last tag on backspace if input is empty
      setTags(tags.slice(0, -1));
    }
  }

  function removeTag(tagToRemove: string) {
    setTags(tags.filter((t) => t !== tagToRemove));
  }

  async function handleSave() {
    if (!newName.trim()) {
      toaster.create({
        title: "Validation Error",
        description: "Project name cannot be empty",
        type: "error",
      });
      return;
    }

    try {
      setSaving(true);
      const updates: { new_name?: string; tags?: string[] } = {};

      // Only send changed fields
      if (newName !== projectName) {
        updates.new_name = newName;
      }
      if (JSON.stringify(tags) !== JSON.stringify(projectTags)) {
        updates.tags = tags;
      }

      if (Object.keys(updates).length === 0) {
        toaster.create({
          title: "No Changes",
          description: "No changes to save",
          type: "info",
        });
        handleClose();
        return;
      }

      const result = await api.updateProject(projectName, updates);

      toaster.create({
        title: "Success",
        description: "Project updated successfully",
        type: "success",
      });

      onSuccess(result.name || newName, result.tags || tags);
      handleClose();
    } catch (error: any) {
      toaster.create({
        title: "Update Failed",
        description: error?.message || "Failed to update project",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog.Root open={open} onOpenChange={(d) => !d.open && handleClose()}>
      <Portal>
        <Dialog.Backdrop className="edit-modal-backdrop" />
        <Dialog.Positioner>
          <Dialog.Content className="edit-modal-content">
            <Dialog.Header>
              <Dialog.Title>Edit Project</Dialog.Title>
            </Dialog.Header>

            <Dialog.Body className="edit-modal-body">
              <Box className="edit-form-group">
                <Text className="edit-form-label">Project Name</Text>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Enter project name"
                  className="edit-input"
                />
              </Box>

              <Box className="edit-form-group">
                <Text className="edit-form-label">Tags</Text>
                <Box className="tag-input-container">
                  <Box className="tag-input-wrapper">
                    {tags.map((tag) => (
                      <Box
                        key={tag}
                        className="tag-chip"
                        style={{ backgroundColor: getTagColor(tag) }}
                      >
                        <span className="tag-chip-text">{tag}</span>
                        <button
                          className="tag-chip-remove"
                          onClick={() => removeTag(tag)}
                          aria-label={`Remove ${tag}`}
                        >
                          ×
                        </button>
                      </Box>
                    ))}
                    <Input
                      value={tagInput}
                      onChange={(e) => setTagInput(e.target.value)}
                      onKeyDown={handleTagInputKeyDown}
                      placeholder="Type tag and press comma or enter"
                      className="tag-input-field"
                    />
                  </Box>
                </Box>
                <Text className="edit-form-hint">
                  Press comma (,) or Enter to add a tag
                </Text>
              </Box>
            </Dialog.Body>

            <Dialog.Footer className="edit-modal-footer">
              <Dialog.ActionTrigger asChild>
                <Button
                  variant="outline"
                  disabled={saving}
                  className="edit-btn edit-btn-cancel"
                >
                  Cancel
                </Button>
              </Dialog.ActionTrigger>
              <Button
                colorPalette="blue"
                onClick={handleSave}
                loading={saving}
                className="edit-btn edit-btn-save"
              >
                Save Changes
              </Button>
            </Dialog.Footer>

            <Dialog.CloseTrigger asChild>
              <CloseButton size="sm" className="edit-close-btn" />
            </Dialog.CloseTrigger>
          </Dialog.Content>
        </Dialog.Positioner>
      </Portal>
    </Dialog.Root>
  );
}
