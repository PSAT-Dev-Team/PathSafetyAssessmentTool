import {
    Dialog,
    Button,
    VStack,
    Input,
    Text,
    Select,
    Field,
    Portal,
    createListCollection,
    Tabs,
    Box,
    Combobox,
} from "@chakra-ui/react";
import { useState, useEffect, type KeyboardEvent } from "react";
import { fetchProjectList, copySegments, checkCollisions } from "../../../api";
import { toaster } from "../../../components/ui/toaster";
import "../../Projects/components/EditProjectModal.css";

// Helper to generate consistent tag colors
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

interface AddSegmentsDialogProps {
    isOpen: boolean;
    onClose: () => void;
    sourceProject: string;
    indices: number[];
    onSuccess: () => void;
}

export function AddSegmentsDialog({
    isOpen,
    onClose,
    sourceProject,
    indices,
    onSuccess
}: AddSegmentsDialogProps) {
    const [projectMode, setProjectMode] = useState<"existing" | "new">("existing");
    const [newProjectName, setNewProjectName] = useState("");
    const [existingProject, setExistingProject] = useState("");
    const [projects, setProjects] = useState<string[]>([]);
    const [submitting, setSubmitting] = useState(false);

    // Tag States for New Project
    const [tags, setTags] = useState<string[]>([]);
    const [tagInput, setTagInput] = useState("");
    const [existingTags, setExistingTags] = useState<string[]>([]);
    const [tagComboboxOpen, setTagComboboxOpen] = useState(false);

    const [collisionConfirmOpen, setCollisionConfirmOpen] = useState(false);
    const [collisionCount, setCollisionCount] = useState(0);

    // Load available projects and tags
    useEffect(() => {
        if (isOpen) {
            fetchProjectList()
                .then((res) => {
                    // Projects list
                    const available = res.projects
                        .map(p => p.name)
                        .filter(n => n !== sourceProject);
                    setProjects(available);
                    if (available.length > 0) {
                        setExistingProject(available[0]);
                        setProjectMode("existing");
                    } else {
                        setProjectMode("new");
                    }

                    // Extract unique tags
                    const tagSet = new Set<string>();
                    res.projects.forEach(p => {
                        p.tags?.forEach(tag => tagSet.add(tag));
                    });
                    setExistingTags(Array.from(tagSet).sort());
                })
                .catch(console.error);
        }
    }, [isOpen, sourceProject]);

    // Tag Handlers
    const handleTagInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "," || e.key === "Enter") {
            e.preventDefault();
            const trimmedTag = tagInput.trim();
            if (trimmedTag && !tags.includes(trimmedTag)) {
                setTags([...tags, trimmedTag]);
            }
            setTagInput("");
        } else if (e.key === "Backspace" && tagInput === "" && tags.length > 0) {
            setTags(tags.slice(0, -1));
        }
    };

    const removeTag = (tagToRemove: string) => {
        setTags(tags.filter((t) => t !== tagToRemove));
    };

    const performCopy = async (replace: boolean) => {
        const isNew = projectMode === "new";
        const target = isNew ? newProjectName : existingProject;

        try {
            setSubmitting(true);
            await copySegments(
                sourceProject,
                target,
                indices,
                isNew,
                replace,
                isNew ? tags : [] // Pass tags only if new project
            );

            toaster.create({
                title: "Success",
                description: `Successfully copied ${indices.length} segments to ${target}.`,
                type: "success"
            });
            onSuccess();
            onClose();
            setCollisionConfirmOpen(false);
        } catch (e: any) {
            toaster.create({
                title: "Error",
                description: e.message || "Failed to copy segments.",
                type: "error"
            });
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmit = async () => {
        const target = projectMode === "new" ? newProjectName : existingProject;

        if (!target) {
            toaster.create({ title: "Validation Error", description: "Please specify a project name.", type: "error" });
            return;
        }

        if (projectMode === "new" && target.includes("_")) {
            toaster.create({ title: "Validation Error", description: "Project name cannot contain underscores (_).", type: "error" });
            return;
        }

        try {
            setSubmitting(true);

            // Check for collisions ONLY if copying to existing project
            if (projectMode === "existing") {
                const checkRes = await checkCollisions(sourceProject, target, indices);
                if (checkRes.collisions && checkRes.collisions.length > 0) {
                    setCollisionCount(checkRes.collisions.length);
                    setCollisionConfirmOpen(true);
                    setSubmitting(false); // Stop loading, wait for user confirmation
                    return;
                }
            }

            // No collisions or new project, proceed directly
            await performCopy(false);

        } catch (e: any) {
            toaster.create({
                title: "Error",
                description: e.message || "Failed to check for collisions.",
                type: "error"
            });
            setSubmitting(false);
        }
    };

    const handleConfirmReplace = async () => {
        await performCopy(true);
    };

    const projectCollection = createListCollection({ items: projects.map(p => ({ label: p, value: p })) });
    const tagCollection = createListCollection({ items: existingTags.map(t => ({ label: t, value: t })) });

    return (
        <>
            <Dialog.Root open={isOpen} onOpenChange={(e) => !e.open && onClose()}>
                <Portal>
                    <Dialog.Backdrop />
                    <Dialog.Positioner>
                        <Dialog.Content>
                            <Dialog.Header>
                                <Dialog.Title>Add Segments to Project</Dialog.Title>
                            </Dialog.Header>
                            <Dialog.Body>
                                <VStack gap="4" align="stretch">
                                    <Text fontSize="sm" color="gray.600">
                                        You are about to copy <b>{indices.length}</b> segments from <b>{sourceProject}</b>.
                                    </Text>

                                    <Tabs.Root
                                        value={projectMode}
                                        onValueChange={(e) => setProjectMode(e.value as "existing" | "new")}
                                        variant="line"
                                    >
                                        <Tabs.List>
                                            <Tabs.Trigger value="existing" disabled={projects.length === 0}>
                                                Existing Project
                                            </Tabs.Trigger>
                                            <Tabs.Trigger value="new">
                                                New Project
                                            </Tabs.Trigger>
                                        </Tabs.List>

                                        <Tabs.Content value="existing" pt="4">
                                            <Field.Root>
                                                <Field.Label>Select Project</Field.Label>
                                                <Select.Root
                                                    collection={projectCollection}
                                                    value={[existingProject]}
                                                    onValueChange={(e) => setExistingProject(e.value[0])}
                                                >
                                                    <Select.Trigger>
                                                        <Select.ValueText placeholder="Select project" />
                                                    </Select.Trigger>
                                                    <Select.Content>
                                                        {projectCollection.items.map((item) => (
                                                            <Select.Item item={item} key={item.value}>
                                                                {item.label}
                                                            </Select.Item>
                                                        ))}
                                                    </Select.Content>
                                                </Select.Root>
                                            </Field.Root>
                                        </Tabs.Content>

                                        <Tabs.Content value="new" pt="4">
                                            <VStack gap="4" align="stretch">
                                                <Field.Root>
                                                    <Field.Label>New Project Name</Field.Label>
                                                    <Input
                                                        placeholder="Enter new project name (no underscores)"
                                                        value={newProjectName}
                                                        onChange={(e) => setNewProjectName(e.target.value)}
                                                    />
                                                </Field.Root>

                                                <Field.Root>
                                                    <Field.Label>Tags (Optional)</Field.Label>
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
                                                            <Combobox.Root
                                                                collection={tagCollection}
                                                                inputValue={tagInput}
                                                                onInputValueChange={({ inputValue }) => setTagInput(inputValue)}
                                                                onValueChange={({ value }) => {
                                                                    if (value.length > 0) {
                                                                        const selectedTag = value[0];
                                                                        if (selectedTag && !tags.includes(selectedTag)) {
                                                                            setTags([...tags, selectedTag]);
                                                                            setTagInput("");
                                                                        }
                                                                    }
                                                                }}
                                                                open={tagComboboxOpen}
                                                                onOpenChange={(details) => {
                                                                    if (tagInput.length > 0) {
                                                                        setTagComboboxOpen(true);
                                                                    } else {
                                                                        setTagComboboxOpen(details.open);
                                                                    }
                                                                }}
                                                            >
                                                                <Combobox.Control onClick={() => setTagComboboxOpen(true)}>
                                                                    <Combobox.Input
                                                                        placeholder="Type tag and press comma or enter"
                                                                        className="tag-input-field"
                                                                        onKeyDown={handleTagInputKeyDown}
                                                                    />
                                                                </Combobox.Control>
                                                                <Portal>
                                                                    <Combobox.Positioner>
                                                                        <Combobox.Content zIndex={2000}>
                                                                            {existingTags
                                                                                .filter(t =>
                                                                                    t.toLowerCase().includes(tagInput.toLowerCase()) &&
                                                                                    !tags.includes(t)
                                                                                )
                                                                                .map(t => (
                                                                                    <Combobox.Item key={t} item={{ label: t, value: t }}>
                                                                                        {t}
                                                                                    </Combobox.Item>
                                                                                ))}
                                                                        </Combobox.Content>
                                                                    </Combobox.Positioner>
                                                                </Portal>
                                                            </Combobox.Root>
                                                        </Box>
                                                    </Box>
                                                    <Text color="gray.500" fontSize="xs" mt={1}>
                                                        Press comma (,) or Enter to add a tag.
                                                    </Text>
                                                </Field.Root>
                                            </VStack>
                                        </Tabs.Content>
                                    </Tabs.Root>

                                </VStack>
                            </Dialog.Body>
                            <Dialog.Footer>
                                <Button variant="outline" onClick={onClose} disabled={submitting}>
                                    Cancel
                                </Button>
                                <Button onClick={handleSubmit} loading={submitting}>
                                    {projectMode === "new" ? "Create & Copy" : "Copy Segments"}
                                </Button>
                            </Dialog.Footer>
                        </Dialog.Content>
                    </Dialog.Positioner>
                </Portal>
            </Dialog.Root>

            {/* Nested Confirmation Dialog for Collisions */}
            <Dialog.Root open={collisionConfirmOpen} onOpenChange={(e) => setCollisionConfirmOpen(e.open)}>
                <Portal>
                    <Dialog.Backdrop />
                    <Dialog.Positioner>
                        <Dialog.Content>
                            <Dialog.Header>
                                <Dialog.Title>Duplicate Segments Detected</Dialog.Title>
                            </Dialog.Header>
                            <Dialog.Body>
                                <Text>
                                    {collisionCount} segments already exist in "<b>{projectMode === "new" ? newProjectName : existingProject}</b>".
                                </Text>
                                <Text mt="4">
                                    Do you want to <b>REPLACE</b> them with the new segments? This action cannot be undone.
                                </Text>
                            </Dialog.Body>
                            <Dialog.Footer>
                                <Button variant="outline" onClick={() => setCollisionConfirmOpen(false)} disabled={submitting}>
                                    Cancel
                                </Button>
                                <Button
                                    colorPalette="red"
                                    onClick={handleConfirmReplace}
                                    loading={submitting}
                                >
                                    Replace Existing
                                </Button>
                            </Dialog.Footer>
                        </Dialog.Content>
                    </Dialog.Positioner>
                </Portal>
            </Dialog.Root>
        </>
    );
}
