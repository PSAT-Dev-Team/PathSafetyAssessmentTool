import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Box, Text, Flex, Button } from "@chakra-ui/react";
import { useColorMode } from "../../components/ui/color-mode";
import DeveloperGuide from "./DeveloperGuide";
import UserGuide from "./UserGuide";

export default function HelpPage() {
  const navigate = useNavigate();
  const { colorMode } = useColorMode();
  const dark = colorMode === "dark";
  const [activeTab, setActiveTab] = useState<"user" | "developer" | "admin">("user");

  return (
    <Box minH="100vh" bg="gray.100" _dark={{ bg: "gray.900" }} p="8" fontFamily="inherit">
      <Box
        maxW="1000px"
        mx="auto"
        bg="white"
        _dark={{ bg: "gray.800" }}
        borderRadius="xl"
        boxShadow="lg"
        p={{ base: "6", md: "10" }}
      >
        {/* Header */}
        <Flex
          justify="space-between"
          align="center"
          borderBottom="2px solid"
          borderColor="gray.200"
          _dark={{ borderColor: "gray.600", bg: "gray.800" }}
          pb="4"
          mb="6"
          position="sticky"
          top="0"
          bg="white"
          zIndex="10"
        >
          <Text fontSize="2xl" fontWeight="bold" color="gray.800" _dark={{ color: "gray.100" }}>
            Documentation & Guides
          </Text>
          <Button size="sm" colorPalette="blue" onClick={() => navigate(-1)}>
            Go Back
          </Button>
        </Flex>


        {/* Tabs */}
        <Flex gap="4" mb="8" borderBottom="2px solid" borderColor="gray.200" _dark={{ borderColor: "gray.600" }}>
          {(["user", "developer", "admin"] as const).map((tab) => {
            const isActive = activeTab === tab;
            return (
              <Box
                key={tab}
                as="button"
                px="4"
                py="2"
                fontSize="md"
                fontWeight="semibold"
                color={isActive
                  ? (dark ? "white" : "gray.900")
                  : (dark ? "gray.400" : "gray.500")
                }
                position="relative"
                cursor="pointer"
                bg="transparent"
                border="none"
                outline="none"
                onClick={() => setActiveTab(tab)}
              >
                {tab === "user" ? "User Guide" : tab === "developer" ? "Developer Guide" : "Admin Guide"}
                {isActive && (
                  <Box
                    position="absolute"
                    bottom="-2px"
                    left="0"
                    right="0"
                    h="3px"
                    bg="blue.500"
                    borderRadius="3px 3px 0 0"
                  />
                )}
              </Box>
            );
          })}
        </Flex>

        {/* Content */}
        <Box>
          {activeTab === "user" && <UserGuide />}
          {activeTab === "developer" && <DeveloperGuide />}
          {activeTab === "admin" && <AdminGuide />}
        </Box>
      </Box>
    </Box>
  );
}

function AdminGuide() {
  return (
    <Box>
      <Text fontSize="xl" fontWeight="bold" color="gray.800" _dark={{ color: "gray.100" }} mb="4">
        Administrator Guide
      </Text>
      <Text color="gray.600" _dark={{ color: "gray.400" }} lineHeight="1.7" mb="6">
        This section provides instructions for system administrators on how to deploy, manage, and update the Path Safety Assessment Tool (PSAT).
      </Text>

      {[
        {
          title: "1. Deployment & Infrastructure",
          items: [
            { label: "Starting the App:", body: <>The application is typically orchestrated via Docker Compose. Run <Code>docker compose up --build</Code> to start both the Flask backend and the React frontend. For direct local launching, you can use the <Code>Run-PSAT.bat</Code> script.</> },
            { label: "Data Persistence:", body: <>User-created projects, images, and results are stored in the <Code>data/</Code> directory, which is bind-mounted to the backend. Backing up this folder will backup all user work across the system.</> },
          ],
        },
        {
          title: "2. Managing Machine Learning Models",
          items: [
            { label: "YOLO Weights:", body: <>The computer-vision prediction models are stored in <Code>backend/models/</Code>. To deploy a newly trained model, replace the existing <Code>.pt</Code> files and restart the backend container.</> },
            { label: "Hardware Configuration:", body: "The backend loads PyTorch models into memory on initialization. Ensure the host machine has adequate RAM. For GPU acceleration, CUDA drivers must be properly configured." },
          ],
        },
        {
          title: "3. Managing GIS Data Layers",
          items: [
            { label: "Storage Location:", body: <>The CycleRAP contextual GIS infrastructure shapefiles are stored under <Code>backend/shapefiles/</Code>.</> },
            { label: "Updating via UI:", body: "Administrators can now use the 'Update GIS Layer' button in the sidebar to add or replace layers. This UI handles file validation and ensures that all mandatory companion files (.shx, .dbf, etc.) are present." },
            { label: "Replacement Safety:", body: "The 'Replace GIS Layer' workflow includes a search filter for quick navigation and a compatibility check that verifies the new file's column structure against the existing layer definition." },
            { label: "Column Mapping:", body: "Ensure that any new GIS data follows the required column indices documented in the 'Gis Layers' dashboard (e.g., column index 1 for LU_DESC)." },
          ],
        },
        {
          title: "4. Troubleshooting & Health",
          items: [
            { label: "Logs:", body: <>If auto-coding fails, check the server output via <Code>docker compose logs -f backend</Code> to view full Python stack traces.</> },
            { label: "Health Endpoints:", body: <>Query <Code>/api/health</Code> or <Code>/api/ping</Code> to verify the backend is responsive and CV models loaded correctly.</> },
          ],
        },
      ].map((section) => (
        <Box key={section.title}>
          <Text fontSize="lg" fontWeight="semibold" color="gray.700" _dark={{ color: "gray.200" }} mt="6" mb="3">
            {section.title}
          </Text>
          <Box as="ul" pl="6" color="gray.600" _dark={{ color: "gray.400" }} lineHeight="1.7">
            {section.items.map((item) => (
              <Box as="li" key={item.label} mb="2">
                <Text as="span" fontWeight="bold" color="gray.700" _dark={{ color: "gray.200" }}>{item.label}</Text>{" "}
                {item.body}
              </Box>
            ))}
          </Box>
        </Box>
      ))}
    </Box>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <Box
      as="code"
      bg="gray.100"
      _dark={{ bg: "gray.700", color: "red.300" }}
      px="1"
      py="0.5"
      borderRadius="sm"
      fontFamily="mono"
      fontSize="0.875em"
      color="red.600"
    >
      {children}
    </Box>
  );
}
