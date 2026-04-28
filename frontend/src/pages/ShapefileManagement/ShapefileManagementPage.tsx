import { useState, useEffect } from "react";
import { Box, Button, Card, Heading, Text, Table, Spinner, Grid } from "@chakra-ui/react";
import { LuUpload, LuRefreshCw, LuTrash2, LuFolder } from "react-icons/lu";
import { toaster } from "../../components/ui/toaster";
import * as api from "../../api";
import UploadModal from "./components/UploadModal";
import "./shapefileManagement.css";

export default function ShapefileManagementPage() {
  const [shapefiles, setShapefiles] = useState<api.ShapefileInfo[]>([]);
  const [categories, setCategories] = useState<api.ShapefileCategoryInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedMode, setSelectedMode] = useState<"add" | "replace" | null>(null);

  useEffect(() => {
    loadShapefiles();
    loadCategories();
  }, []);

  async function loadShapefiles() {
    try {
      setLoading(true);
      const data = await api.listShapefiles();
      setShapefiles(data);
    } catch (error) {
      toaster.create({
        description: `Failed to load shapefiles: ${error}`,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadCategories() {
    try {
      const data = await api.listShapefileCategories();
      setCategories(data);
    } catch (error) {
    }
  }

  function handleOpenModal() {
    setModalOpen(true);
    setSelectedMode(null);
  }

  function handleCloseModal() {
    setModalOpen(false);
    setSelectedMode(null);
  }

  function handleModeSelect(mode: "add" | "replace") {
    setSelectedMode(mode);
  }

  async function handleUploadComplete() {
    await loadShapefiles();
    await loadCategories();
    handleCloseModal();
  }

  async function handleDelete(shapefile: api.ShapefileInfo) {
    if (!confirm(`Delete ${shapefile.name}? This will remove all associated files.`)) {
      return;
    }

    try {
      await api.deleteShapefile(shapefile.path);
      toaster.create({
        description: `Deleted ${shapefile.name} successfully`,
        type: "success",
      });
      loadShapefiles();
      loadCategories();
    } catch (error) {
      toaster.create({
        description: `Failed to delete: ${error}`,
        type: "error",
      });
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
  }

  // Group shapefiles by category
  const groupedShapefiles = shapefiles.reduce((acc, shp) => {
    if (!acc[shp.category]) {
      acc[shp.category] = [];
    }
    acc[shp.category].push(shp);
    return acc;
  }, {} as Record<string, api.ShapefileInfo[]>);

  return (
    <div className="shapefile-management-page">
      <Box p={6}>
        {/* Header */}
        <Box mb={6} display="flex" justifyContent="space-between" alignItems="center">
          <Box>
            <Heading size="2xl" mb={2}>
              Shapefile Management
            </Heading>
            <Text color="fg.muted">
              Manage GIS shapefiles used for auto-coding road attributes
            </Text>
          </Box>
          <Box display="flex" gap={3}>
            <Button
              onClick={loadShapefiles}
              variant="outline"
              size="md"
              disabled={loading}
            >
              <LuRefreshCw />
              Refresh
            </Button>
            <Button
              onClick={handleOpenModal}
              colorPalette="blue"
              size="md"
            >
              <LuUpload />
              Update Shapefile
            </Button>
          </Box>
        </Box>

        {/* Category Summary */}
        <Card.Root mb={6}>
          <Card.Header>
            <Heading size="lg">Categories</Heading>
          </Card.Header>
          <Card.Body>
            <Grid templateColumns="repeat(auto-fill, minmax(200px, 1fr))" gap={4}>
              {categories.map((cat) => (
                <Card.Root key={cat.name} variant="outline">
                  <Card.Body p={4}>
                    <Box display="flex" alignItems="center" gap={2} mb={2}>
                      <LuFolder />
                      <Text fontWeight="bold">{cat.name}</Text>
                    </Box>
                    <Text fontSize="sm" color="fg.muted">
                      {cat.shapefile_count} shapefile{cat.shapefile_count !== 1 ? "s" : ""}
                    </Text>
                  </Card.Body>
                </Card.Root>
              ))}
            </Grid>
          </Card.Body>
        </Card.Root>

        {/* Shapefile List */}
        {loading ? (
          <Box display="flex" justifyContent="center" py={10}>
            <Spinner size="lg" />
          </Box>
        ) : (
          <Box>
            {Object.entries(groupedShapefiles).map(([category, shps]) => (
              <Card.Root key={category} mb={4}>
                <Card.Header>
                  <Heading size="md">{category}</Heading>
                </Card.Header>
                <Card.Body>
                  <Table.Root size="sm" variant="outline">
                    <Table.Header>
                      <Table.Row>
                        <Table.ColumnHeader>Name</Table.ColumnHeader>
                        <Table.ColumnHeader>Features</Table.ColumnHeader>
                        <Table.ColumnHeader>CRS</Table.ColumnHeader>
                        <Table.ColumnHeader>Size</Table.ColumnHeader>
                        <Table.ColumnHeader>Files</Table.ColumnHeader>
                        <Table.ColumnHeader>Actions</Table.ColumnHeader>
                      </Table.Row>
                    </Table.Header>
                    <Table.Body>
                      {shps.map((shp) => (
                        <Table.Row key={shp.path}>
                          <Table.Cell fontWeight="medium">{shp.name}</Table.Cell>
                          <Table.Cell>
                            {shp.metadata?.feature_count?.toLocaleString() || "N/A"}
                          </Table.Cell>
                          <Table.Cell fontSize="xs">{shp.metadata?.crs || "Unknown"}</Table.Cell>
                          <Table.Cell>{formatBytes(shp.size)}</Table.Cell>
                          <Table.Cell>
                            <Text fontSize="xs" color="fg.muted">
                              {(shp.files ?? [shp.filename]).join(", ")}
                            </Text>
                          </Table.Cell>
                          <Table.Cell>
                            <Button
                              size="xs"
                              variant="ghost"
                              colorPalette="red"
                              onClick={() => handleDelete(shp)}
                            >
                              <LuTrash2 />
                            </Button>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Root>
                </Card.Body>
              </Card.Root>
            ))}
          </Box>
        )}

        {/* Upload Modal */}
        <UploadModal
          open={modalOpen}
          onClose={handleCloseModal}
          selectedMode={selectedMode}
          onModeSelect={handleModeSelect}
          onUploadComplete={handleUploadComplete}
          existingShapefiles={shapefiles}
        />
      </Box>
    </div>
  );
}
